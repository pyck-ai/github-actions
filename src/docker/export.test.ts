import { describe, expect, it, vi } from "vitest";
import { listImageFiles, parseTarEntries, tarContainsPath } from "./export.js";
import type { DockerCli } from "./cli.js";

// --- minimal tar-fixture builder, header fields the parser reads only ---

function tarHeader(name: string, size: number, typeflag = "0", prefix = ""): Buffer {
  const header = Buffer.alloc(512);
  header.write(name.slice(0, 100), 0, "ascii");
  header.write("0000644\0", 100, "ascii");
  header.write("0000000\0", 108, "ascii");
  header.write("0000000\0", 116, "ascii");
  header.write(`${size.toString(8).padStart(11, "0")}\0`, 124, "ascii");
  header.write("00000000000\0", 136, "ascii");
  header.write("        ", 148, "ascii");
  header.write(typeflag, 156, "ascii");
  header.write("ustar\0", 257, "ascii");
  header.write("00", 263, "ascii");
  if (prefix.length > 0) {
    header.write(prefix.slice(0, 155), 345, "ascii");
  }
  return header;
}

function buildEntry(name: string, content = "", typeflag = "0"): Buffer {
  const data = Buffer.from(content, "utf8");
  const header = tarHeader(name, data.length, typeflag);
  const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512);
  data.copy(padded);
  return Buffer.concat([header, padded]);
}

function buildArchive(...entries: Buffer[]): Buffer {
  return Buffer.concat([...entries, Buffer.alloc(1024)]);
}

/** PAX extended-header record: `"<len> key=value\n"`, self-referentially length-prefixed per the PAX spec. */
function paxRecord(key: string, value: string): string {
  const suffix = ` ${key}=${value}\n`;
  let digits = 1;
  let total = suffix.length + digits;
  while (String(total).length !== digits) {
    digits = String(total).length;
    total = suffix.length + digits;
  }
  return `${total}${suffix}`;
}

describe("parseTarEntries", () => {
  it("returns plain USTAR entry names", () => {
    const archive = buildArchive(
      buildEntry("etc/passwd", "root:x:0:0"),
      buildEntry("usr/bin/git", "binary"),
    );
    expect(parseTarEntries(archive)).toEqual(["etc/passwd", "usr/bin/git"]);
  });

  it("stops at the two-zero-block end marker without reading past it", () => {
    const archive = buildArchive(buildEntry("a"));
    expect(parseTarEntries(archive)).toEqual(["a"]);
  });

  it("combines the ustar prefix and name fields for a long path", () => {
    const header = tarHeader("bin/git", 0, "0", "usr/local");
    const archive = buildArchive(Buffer.concat([header, Buffer.alloc(0)]));
    expect(parseTarEntries(archive)).toEqual(["usr/local/bin/git"]);
  });

  it("resolves a GNU long-name (typeflag 'L') entry", () => {
    const longName =
      "a/very/deeply/nested/path/that/exceeds/the/hundred/byte/ustar/name/field/limit/file.txt";
    const longNameEntry = buildEntry("././@LongLink", `${longName}\0`, "L");
    const realEntry = buildEntry("truncated-placeholder", "content");
    const archive = buildArchive(longNameEntry, realEntry);
    expect(parseTarEntries(archive)).toEqual([longName]);
  });

  it("resolves a PAX extended header (typeflag 'x') entry's path", () => {
    const longPath = "another/long/path/from/a/pax/extended/header.txt";
    const paxData = paxRecord("path", longPath);
    const paxEntry = buildEntry("PaxHeaders/entry", paxData, "x");
    const realEntry = buildEntry("truncated-placeholder", "content");
    const archive = buildArchive(paxEntry, realEntry);
    expect(parseTarEntries(archive)).toEqual([longPath]);
  });
});

describe("tarContainsPath", () => {
  it("matches ignoring a leading './' and leading/trailing '/'", () => {
    const entries = ["./etc/passwd", "usr/bin/git/"];
    expect(tarContainsPath(entries, "/etc/passwd")).toBe(true);
    expect(tarContainsPath(entries, "usr/bin/git")).toBe(true);
    expect(tarContainsPath(entries, "/usr/bin/bogus")).toBe(false);
  });

  // Bash bug #1 fixed: SIGPIPE false-missing. The bash's `echo "$files" | grep -qE`
  // can report a file that EXISTS as missing on a large listing, because `grep -q`
  // exits on its first match and SIGPIPEs `echo` before it finishes writing —
  // proven on a 5362-entry listing. This implementation never pipes: the whole
  // archive is parsed into an array first, so a match near the START of a large
  // (>64KB) archive is found reliably, every time.
  it("finds a match near the start of a >64KB archive (the SIGPIPE regression case)", () => {
    const wanted = buildEntry("etc/passwd", "root:x:0:0:root:/root:/bin/sh");
    const filler: Buffer[] = [];
    let size = wanted.length;
    let i = 0;
    while (size < 70_000) {
      const entry = buildEntry(`usr/share/doc/package-${String(i)}/filler.txt`, "x".repeat(200));
      filler.push(entry);
      size += entry.length;
      i++;
    }
    const archive = buildArchive(wanted, ...filler);
    expect(archive.length).toBeGreaterThan(64 * 1024);

    const entries = parseTarEntries(archive);
    expect(tarContainsPath(entries, "/etc/passwd")).toBe(true);
  });

  // Bash bug #2 fixed: runtime-injected paths. `docker create` + `docker export`
  // bakes in `.dockerenv`, `etc/hosts`, `etc/hostname`, `etc/resolv.conf`,
  // `etc/mtab`, and the `dev/`, `proc/`, `sys/` trees — none of which the image
  // itself ships. tarContainsPath must report these as absent even though the
  // raw tar contains them, and must still find a real file alongside them.
  it("excludes runtime-injected paths, even though they're literally present in the tar", () => {
    const archive = buildArchive(
      buildEntry(".dockerenv"),
      buildEntry("etc/hosts", "127.0.0.1 localhost"),
      buildEntry("etc/hostname", "abc123"),
      buildEntry("etc/resolv.conf", "nameserver 8.8.8.8"),
      buildEntry("etc/mtab", "overlay / overlay rw 0 0"),
      buildEntry("dev/", "", "5"),
      buildEntry("dev/null"),
      buildEntry("proc/1/status"),
      buildEntry("sys/kernel/hostname"),
      buildEntry("etc/passwd", "root:x:0:0"),
    );
    const entries = parseTarEntries(archive);

    expect(tarContainsPath(entries, ".dockerenv")).toBe(false);
    expect(tarContainsPath(entries, "/etc/hosts")).toBe(false);
    expect(tarContainsPath(entries, "/etc/hostname")).toBe(false);
    expect(tarContainsPath(entries, "/etc/resolv.conf")).toBe(false);
    expect(tarContainsPath(entries, "/etc/mtab")).toBe(false);
    expect(tarContainsPath(entries, "/dev/null")).toBe(false);
    expect(tarContainsPath(entries, "/proc/1/status")).toBe(false);
    expect(tarContainsPath(entries, "/sys/kernel/hostname")).toBe(false);
    expect(tarContainsPath(entries, "/etc/passwd")).toBe(true);
  });
});

describe("listImageFiles", () => {
  function fakeCli(overrides: Partial<DockerCli> = {}): DockerCli {
    return {
      inspect: vi.fn(),
      run: vi.fn(),
      create: vi.fn(async () => "container123"),
      export: vi.fn(async () => buildArchive(buildEntry("etc/passwd"))),
      pull: vi.fn(),
      port: vi.fn(),
      start: vi.fn(),
      rm: vi.fn(async () => undefined),
      ...overrides,
    } as unknown as DockerCli;
  }

  it("creates with a dummy trailing command (for scratch images), exports, parses, and always removes the container", async () => {
    const create = vi.fn(async () => "container123");
    const rm = vi.fn(async () => undefined);
    const cli = fakeCli({ create, rm });

    const files = await listImageFiles(cli, "scratch-image:latest");

    expect(create).toHaveBeenCalledWith({ image: "scratch-image:latest", cmd: ["true"] });
    expect(files).toEqual(["etc/passwd"]);
    expect(rm).toHaveBeenCalledWith("container123", { force: true });
  });

  it("still removes the container when export throws", async () => {
    const rm = vi.fn(async () => undefined);
    const cli = fakeCli({
      export: vi.fn(async () => {
        throw new Error("export failed");
      }),
      rm,
    });
    await expect(listImageFiles(cli, "img")).rejects.toThrow(/export failed/);
    expect(rm).toHaveBeenCalledWith("container123", { force: true });
  });

  it("does not let a failed removal mask the real export result", async () => {
    const cli = fakeCli({
      rm: vi.fn(async () => {
        throw new Error("rm failed");
      }),
    });
    await expect(listImageFiles(cli, "img")).resolves.toEqual(["etc/passwd"]);
  });
});
