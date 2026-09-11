import type { DockerCli } from "./cli.js";

/**
 * `docker export`'s tar stream, parsed for the path listing `imageFile`
 * needs — a from-scratch tar reader rather than `tar -tf -` piped through
 * a shell, because that pipe is exactly what makes the bash predecessor's
 * `check_image_file` unreliable (see the SIGPIPE note below) and because
 * scratch images have no shell to pipe through in the first place.
 *
 * Fixes two bugs the bash `check_image_file` has, both confirmed against
 * real images:
 *
 * 1. SIGPIPE false-missing: `echo "$files" | grep -qE ...` under
 *    `set -o pipefail` can report a file that EXISTS as missing, because
 *    `grep -q` exits on its first match and closes the pipe before `echo`
 *    has finished writing a large listing, and the `SIGPIPE`d `echo`'s
 *    141 exit code fails the pipeline. This module reads the whole tar
 *    into an array first and matches in-memory — no pipe, no SIGPIPE.
 * 2. Runtime-injected paths: `docker create` + `docker export` bakes in
 *    `.dockerenv`, `etc/hosts`, `etc/hostname`, `etc/resolv.conf`,
 *    `etc/mtab`, and the `dev/`, `proc/`, `sys/` trees, none of which the
 *    image itself contains. A path check against a raw export can pass
 *    for a path the image doesn't actually ship. Those entries are
 *    filtered out of {@link listImageFiles}'s result before any matching
 *    happens.
 */

/** Paths (and, for the three directories, everything under them) injected by `docker create`/`export`, not present in the image itself. */
const RUNTIME_INJECTED_FILES = new Set([
  ".dockerenv",
  "etc/hosts",
  "etc/hostname",
  "etc/resolv.conf",
  "etc/mtab",
]);
const RUNTIME_INJECTED_DIRS = ["dev", "proc", "sys"];

/** Strips a leading `./`, and any leading/trailing `/`, for comparison purposes. */
function normalizeEntry(path: string): string {
  return path.replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/+$/, "");
}

function isRuntimeInjected(normalized: string): boolean {
  if (RUNTIME_INJECTED_FILES.has(normalized)) {
    return true;
  }
  return RUNTIME_INJECTED_DIRS.some(
    (dir) => normalized === dir || normalized.startsWith(`${dir}/`),
  );
}

const BLOCK_SIZE = 512;

/**
 * Parses a USTAR/GNU/PAX tar archive (as produced by `docker export`) and
 * returns every entry's path, in archive order, exactly as tar itself
 * would report it (`tar -tf`'s output — directories keep their trailing
 * `/`). Handles GNU long-name (`typeflag 'L'`) and PAX extended header
 * (`typeflag 'x'`, the `path` key) entries, both of which real multi-layer
 * images use for paths longer than the 100-byte USTAR `name` field.
 */
export function parseTarEntries(buffer: Buffer): string[] {
  const entries: string[] = [];
  let offset = 0;
  let pendingLongName: string | undefined;

  while (offset + BLOCK_SIZE <= buffer.length) {
    const header = buffer.subarray(offset, offset + BLOCK_SIZE);

    // Two consecutive zero-filled blocks mark the end of the archive.
    if (header.every((b) => b === 0)) {
      break;
    }

    const typeflag = String.fromCharCode(header[156] ?? 0);
    const sizeOctal = header.subarray(124, 136).toString("ascii").replace(/\0/g, "").trim();
    const size = sizeOctal.length > 0 ? parseInt(sizeOctal, 8) : 0;
    const dataBlocks = Math.ceil(size / BLOCK_SIZE);
    const dataStart = offset + BLOCK_SIZE;
    const dataEnd = dataStart + size;

    if (typeflag === "L") {
      // GNU long-name: the data block holds the real name of the NEXT entry.
      pendingLongName = buffer.subarray(dataStart, dataEnd).toString("utf8").replace(/\0+$/, "");
    } else if (typeflag === "x" || typeflag === "g") {
      // PAX extended header: "<len> <key>=<value>\n" records; we only need "path".
      const text = buffer.subarray(dataStart, dataEnd).toString("utf8");
      const match = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(text);
      if (match?.[1] !== undefined) {
        pendingLongName = match[1];
      }
    } else {
      const nameField = header.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
      const prefixField = header.subarray(345, 500).toString("utf8").replace(/\0.*$/s, "");
      const name =
        pendingLongName ?? (prefixField.length > 0 ? `${prefixField}/${nameField}` : nameField);
      pendingLongName = undefined;
      if (name.length > 0) {
        entries.push(name);
      }
    }

    offset = dataStart + dataBlocks * BLOCK_SIZE;
  }

  return entries;
}

/**
 * Whether `wantPath` is present among `entries` (as returned by
 * {@link parseTarEntries}), after runtime-injected entries have been
 * filtered out. Comparison ignores a leading `./`, and leading/trailing
 * `/`, matching the bash predecessor's `^\.?${f#/}/?$` intent without its
 * SIGPIPE hazard.
 */
export function tarContainsPath(entries: readonly string[], wantPath: string): boolean {
  const wantNormalized = normalizeEntry(wantPath);
  for (const entry of entries) {
    const normalized = normalizeEntry(entry);
    if (isRuntimeInjected(normalized)) {
      continue;
    }
    if (normalized === wantNormalized) {
      return true;
    }
  }
  return false;
}

/**
 * `docker create` (with a dummy trailing command so scratch images, which
 * have no `CMD`/`ENTRYPOINT`, don't refuse the create) + `docker export`,
 * parsed into a path listing, with the created container always removed
 * afterwards — including when `export` throws.
 */
export async function listImageFiles(cli: DockerCli, image: string): Promise<string[]> {
  const containerId = await cli.create({ image, cmd: ["true"] });
  try {
    const tar = await cli.export(containerId);
    return parseTarEntries(tar);
  } finally {
    await cli.rm(containerId, { force: true }).catch(() => {
      // Best-effort cleanup: a failure to remove the (already-exported,
      // never-started) container must not mask the real check result.
    });
  }
}
