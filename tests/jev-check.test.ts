import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// Runs jev-check/run.sh with a stub `docker` on PATH that records its
// arguments, so the docker command line (what `ps` and `docker inspect` could
// leak) is checked without a docker daemon.

const script = join(__dirname, "..", "jev-check", "run.sh");
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function runJevCheck(extraEnv: Record<string, string>, args: string[] = ["check"]) {
  const dir = mkdtempSync(join(tmpdir(), "jev-check-tests-"));
  dirs.push(dir);
  const bin = join(dir, "bin");
  const input = join(dir, "in");
  const output = join(dir, "out");
  const log = join(dir, "docker.log");
  mkdirSync(bin);
  mkdirSync(input);
  writeFileSync(join(input, "a.json"), "{}");
  writeFileSync(
    join(bin, "docker"),
    `#!/usr/bin/env bash\nif [ "$1" = "run" ]; then printf '%s\\n' "$*" >>"${log}"; if [ -n "$STUB_FAIL" ] && [[ "$*" == *"$STUB_FAIL"* ]]; then echo boom >&2; exit 3; fi; fi\necho '{}'\n`,
  );
  chmodSync(join(bin, "docker"), 0o755);
  const env: Record<string, string> = {
    PATH: `${bin}:${process.env["PATH"] ?? ""}`,
    ...extraEnv,
  };
  const r = spawnSync("bash", [script, input, output, "or-secret", "img:test", ...args], {
    env,
    encoding: "utf8",
  });
  let docker = "";
  try {
    docker = readFileSync(log, "utf8");
  } catch {
    // docker never ran
  }
  return {
    status: r.status,
    stderr: r.stderr,
    docker,
    output,
    has: (n: string) => existsSync(join(output, n)),
  };
}

describe("jev-check run.sh", () => {
  it("without a proxy key passes only the OpenRouter key", () => {
    const r = runJevCheck({ JEV_CLI_ROUTE: "auto", PYCKLLM_BASE_URL: "https://llm.pyck.dev" });
    expect(r.status).toBe(0);
    expect(r.docker).toContain("-e OPENROUTER_API_KEY img:test check -j - -o json");
    expect(r.docker).not.toContain("PYCKLLM");
    expect(r.docker).not.toContain("JEV_CLI_ROUTE");
  });

  it("with a proxy key passes the proxy variables by name only", () => {
    const r = runJevCheck({
      PYCKLLM_API_KEY: "sk-proxy-secret",
      PYCKLLM_BASE_URL: "https://llm.pyck.dev",
      JEV_CLI_ROUTE: "proxy",
    });
    expect(r.status).toBe(0);
    expect(r.docker).toContain(
      "-e OPENROUTER_API_KEY -e PYCKLLM_API_KEY -e JEV_CLI_ROUTE -e PYCKLLM_BASE_URL img:test",
    );
    expect(r.docker).not.toContain("sk-proxy-secret");
    expect(r.docker).not.toContain("or-secret");
    expect(r.docker).not.toContain("llm.pyck.dev");
  });

  it("defaults the route to auto and omits an empty base URL", () => {
    const r = runJevCheck({ PYCKLLM_API_KEY: "sk-proxy-secret", PYCKLLM_BASE_URL: "" });
    expect(r.status).toBe(0);
    expect(r.docker).toContain(
      "-e OPENROUTER_API_KEY -e PYCKLLM_API_KEY -e JEV_CLI_ROUTE img:test",
    );
    expect(r.docker).not.toContain("PYCKLLM_BASE_URL");
  });

  it("exits 2 on a bad route before touching docker", () => {
    const r = runJevCheck({ PYCKLLM_API_KEY: "k", JEV_CLI_ROUTE: "sideways" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("route must be");
    expect(r.docker).toBe("");
  });

  it("exits 2 for route proxy without a proxy key", () => {
    const r = runJevCheck({ JEV_CLI_ROUTE: "proxy" });
    expect(r.status).toBe(2);
    expect(r.docker).toBe("");
  });

  it("without models runs once per file with plain output names", () => {
    const r = runJevCheck({ JEV_MODELS: "" });
    expect(r.status).toBe(0);
    expect(r.docker.trim().split("\n")).toHaveLength(1);
    expect(r.docker).toContain("img:test check -j - -o json");
    expect(r.docker).not.toContain("--model");
    expect(r.has("a.json")).toBe(true);
  });

  it("with two models runs each file per model, --model before the command", () => {
    const r = runJevCheck({
      JEV_MODELS: "typesafe/jev-1.14\n  liquid/d1-ultra ~anthropic/claude-sonnet:latest",
    });
    expect(r.status).toBe(0);
    const lines = r.docker.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("img:test --model typesafe/jev-1.14 check -j - -o json");
    expect(lines[1]).toContain("img:test --model liquid/d1-ultra check -j - -o json");
    expect(lines[2]).toContain(
      "img:test --model ~anthropic/claude-sonnet:latest check -j - -o json",
    );
    expect(r.has("a@typesafe_jev-1.14.json")).toBe(true);
    expect(r.has("a@liquid_d1-ultra.json")).toBe(true);
    expect(r.has("a@_anthropic_claude-sonnet_latest.json")).toBe(true);
    expect(r.has("a.json")).toBe(false);
  });

  it("exits 2 on a bad model slug before touching docker", () => {
    for (const bad of ["nomodel", "typesafe/jev-1.14 a/b;rm", "a/b/c", "/x"]) {
      const r = runJevCheck({ JEV_MODELS: bad });
      expect(r.status).toBe(2);
      expect(r.stderr).toContain("not a valid slug");
      expect(r.docker).toBe("");
    }
  });

  it("writes .error for the failing model only and exits 1", () => {
    const r = runJevCheck({
      JEV_MODELS: "typesafe/jev-1.14 liquid/d1-ultra",
      STUB_FAIL: "liquid/d1-ultra",
    });
    expect(r.status).toBe(1);
    expect(r.has("a@typesafe_jev-1.14.json")).toBe(true);
    expect(r.has("a@typesafe_jev-1.14.error")).toBe(false);
    expect(r.has("a@liquid_d1-ultra.error")).toBe(true);
    expect(r.has("a@liquid_d1-ultra.json")).toBe(false);
    expect(readFileSync(join(r.output, "a@liquid_d1-ultra.error"), "utf8")).toContain("boom");
    expect(r.stderr).toContain("a.json with liquid/d1-ultra failed");
  });
});
