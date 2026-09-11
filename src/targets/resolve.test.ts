import { describe, expect, it, vi } from "vitest";
import { makeFakeCli } from "../checks/test-helpers.js";
import type { BakeTarget } from "./bake.js";
import {
  ResolveError,
  deriveRepoFromTag,
  pickLocalTag,
  resolveDigestTarget,
  resolveLocalTarget,
} from "./resolve.js";

function target(overrides: Partial<BakeTarget> = {}): BakeTarget {
  return { name: "agent-alpine", tags: [], context: "docker/agent", ...overrides };
}

describe("pickLocalTag", () => {
  it("prefers a tag whose :suffix equals the target's variant", () => {
    const t = target({
      name: "agent-alpine",
      tags: ["ghcr.io/pyck-ai/agent:latest", "ghcr.io/pyck-ai/agent:alpine"],
    });
    expect(pickLocalTag(t)).toBe("ghcr.io/pyck-ai/agent:alpine");
  });

  it("falls back to :latest when no tag matches the variant suffix", () => {
    const t = target({
      name: "rover-debian",
      tags: ["ghcr.io/pyck-ai/rover:latest", "ghcr.io/pyck-ai/rover:0.41.0"],
    });
    expect(pickLocalTag(t)).toBe("ghcr.io/pyck-ai/rover:latest");
  });

  it("falls back to the first tag when neither variant suffix nor :latest is present", () => {
    const t = target({
      name: "agent-alpine",
      tags: ["ghcr.io/pyck-ai/agent:claude-2.1.268", "ghcr.io/pyck-ai/agent:claude-2.1"],
    });
    expect(pickLocalTag(t)).toBe("ghcr.io/pyck-ai/agent:claude-2.1.268");
  });

  it("treats a target name with no '-' as its own variant (falls through to :latest)", () => {
    const t = target({ name: "static", tags: ["ghcr.io/pyck-ai/static:latest"] });
    expect(pickLocalTag(t)).toBe("ghcr.io/pyck-ai/static:latest");
  });

  it("throws ResolveError when the target has no tags", () => {
    expect(() => pickLocalTag(target({ tags: [] }))).toThrow(ResolveError);
  });
});

describe("deriveRepoFromTag", () => {
  it("strips a plain trailing tag", () => {
    expect(deriveRepoFromTag("ghcr.io/pyck-ai/agent:latest")).toBe("ghcr.io/pyck-ai/agent");
  });

  it("does not truncate at a registry port's ':' — only the trailing tag separator", () => {
    expect(deriveRepoFromTag("host:5000/img:tag")).toBe("host:5000/img");
  });

  it("handles a tag with dots and dashes", () => {
    expect(deriveRepoFromTag("ghcr.io/pyck-ai/agent:claude-2.1.268")).toBe(
      "ghcr.io/pyck-ai/agent",
    );
  });
});

describe("resolveLocalTarget", () => {
  it("inspects the picked tag and returns the resolved ref + architecture", async () => {
    const cli = makeFakeCli({
      inspect: async () => [{ Architecture: "amd64", Config: {} }],
    });
    const t = target({ tags: ["ghcr.io/pyck-ai/agent:alpine"] });
    const resolved = await resolveLocalTarget(cli, t);
    expect(resolved).toEqual({
      target: "agent-alpine",
      ref: "ghcr.io/pyck-ai/agent:alpine",
      architecture: "amd64",
    });
  });

  it("throws ResolveError telling the operator to build first when inspect fails", async () => {
    const cli = makeFakeCli({
      inspect: async () => {
        throw new Error("No such object: agent:alpine");
      },
    });
    const t = target({ tags: ["ghcr.io/pyck-ai/agent:alpine"] });
    await expect(resolveLocalTarget(cli, t)).rejects.toThrow(ResolveError);
    await expect(resolveLocalTarget(cli, t)).rejects.toThrow(/build it first/);
  });

  it("reports architecture as unknown when inspect's shape is unexpected", async () => {
    const cli = makeFakeCli({ inspect: async () => [] });
    const t = target({ tags: ["ghcr.io/pyck-ai/agent:alpine"] });
    const resolved = await resolveLocalTarget(cli, t);
    expect(resolved.architecture).toBe("unknown");
  });
});

describe("resolveDigestTarget", () => {
  it("derives the repo from the first tag, pulls repo@digest, and inspects it", async () => {
    const pull = vi.fn(async () => undefined);
    const cli = makeFakeCli({
      pull,
      inspect: async () => [{ Architecture: "amd64" }],
    });
    const t = target({ tags: ["ghcr.io/pyck-ai/agent:latest", "ghcr.io/pyck-ai/agent:alpine"] });
    const resolved = await resolveDigestTarget(cli, t, { "agent-alpine": "sha256:abc" });
    expect(resolved).toEqual({
      target: "agent-alpine",
      ref: "ghcr.io/pyck-ai/agent@sha256:abc",
      architecture: "amd64",
    });
    expect(pull).toHaveBeenCalledWith("ghcr.io/pyck-ai/agent@sha256:abc");
  });

  it("handles a registry with a port when deriving the repo", async () => {
    const cli = makeFakeCli({ inspect: async () => [{ Architecture: "amd64" }] });
    const t = target({ name: "img", tags: ["host:5000/img:latest"] });
    const resolved = await resolveDigestTarget(cli, t, { img: "sha256:def" });
    expect(resolved.ref).toBe("host:5000/img@sha256:def");
  });

  it("throws ResolveError when the target has no tags", async () => {
    const cli = makeFakeCli();
    const t = target({ tags: [] });
    await expect(resolveDigestTarget(cli, t, {})).rejects.toThrow(ResolveError);
  });

  it("throws ResolveError when no digest was recorded for the target", async () => {
    const cli = makeFakeCli();
    const t = target({ tags: ["ghcr.io/pyck-ai/agent:latest"] });
    await expect(resolveDigestTarget(cli, t, {})).rejects.toThrow(/no digest recorded/);
  });

  it("throws ResolveError when docker pull fails", async () => {
    const cli = makeFakeCli({
      pull: async () => {
        throw new Error("manifest unknown");
      },
    });
    const t = target({ tags: ["ghcr.io/pyck-ai/agent:latest"] });
    await expect(resolveDigestTarget(cli, t, { "agent-alpine": "sha256:abc" })).rejects.toThrow(
      ResolveError,
    );
  });

  it("resolves with architecture 'unknown' if the post-pull inspect fails (non-fatal)", async () => {
    const cli = makeFakeCli({
      inspect: async () => {
        throw new Error("nope");
      },
    });
    const t = target({ tags: ["ghcr.io/pyck-ai/agent:latest"] });
    const resolved = await resolveDigestTarget(cli, t, { "agent-alpine": "sha256:abc" });
    expect(resolved.architecture).toBe("unknown");
  });
});
