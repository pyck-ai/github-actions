import { describe, expect, it, vi } from "vitest";
import {
  deletePackage,
  deletePackageVersion,
  listPackageVersions,
  toPackageVersion,
  type Paginatable,
  type RawPackageVersion,
  type Requestable,
} from "./packages.js";
import { packageName } from "./package-name.js";

describe("toPackageVersion", () => {
  it("maps id, digest (from .name), createdAt, and tags", () => {
    const raw: RawPackageVersion = {
      id: 42,
      name: "sha256:deadbeef",
      created_at: "2026-01-01T00:00:00Z",
      metadata: { container: { tags: ["v1", "latest"] } },
    };

    expect(toPackageVersion(raw)).toEqual({
      id: 42,
      digest: "sha256:deadbeef",
      createdAt: "2026-01-01T00:00:00Z",
      tags: ["v1", "latest"],
    });
  });

  it("defaults tags to [] when metadata is absent (untagged version)", () => {
    const raw: RawPackageVersion = {
      id: 1,
      name: "sha256:abc",
      created_at: "2026-01-01T00:00:00Z",
    };

    expect(toPackageVersion(raw).tags).toEqual([]);
  });

  it("defaults tags to [] when metadata.container.tags is absent", () => {
    const raw: RawPackageVersion = {
      id: 1,
      name: "sha256:abc",
      created_at: "2026-01-01T00:00:00Z",
      metadata: { container: {} },
    };

    expect(toPackageVersion(raw).tags).toEqual([]);
  });
});

describe("listPackageVersions — pagination assembly", () => {
  it("requests the correct route and params, and maps every returned raw version", async () => {
    const raws: RawPackageVersion[] = [
      {
        id: 1,
        name: "sha256:a",
        created_at: "2026-01-01T00:00:00Z",
        metadata: { container: { tags: ["v1"] } },
      },
      { id: 2, name: "sha256:b", created_at: "2026-01-02T00:00:00Z" },
      {
        id: 3,
        name: "sha256:c",
        created_at: "2026-01-03T00:00:00Z",
        metadata: { container: { tags: [] } },
      },
    ];
    const paginate = vi.fn().mockResolvedValue(raws);
    const octokit: Paginatable = { paginate };

    const versions = await listPackageVersions(
      octokit,
      "pyck-ai",
      packageName("baseimages/golang"),
    );

    expect(paginate).toHaveBeenCalledWith(
      "GET /orgs/{org}/packages/{package_type}/{package_name}/versions",
      expect.objectContaining({
        org: "pyck-ai",
        package_type: "container",
        package_name: "baseimages/golang",
      }),
    );
    expect(versions).toEqual([
      { id: 1, digest: "sha256:a", createdAt: "2026-01-01T00:00:00Z", tags: ["v1"] },
      { id: 2, digest: "sha256:b", createdAt: "2026-01-02T00:00:00Z", tags: [] },
      { id: 3, digest: "sha256:c", createdAt: "2026-01-03T00:00:00Z", tags: [] },
    ]);
  });

  it("returns an empty array when the package has no versions", async () => {
    const paginate = vi.fn().mockResolvedValue([]);
    const octokit: Paginatable = { paginate };

    const versions = await listPackageVersions(octokit, "pyck-ai", packageName("empty-pkg"));

    expect(versions).toEqual([]);
  });
});

describe("deletePackageVersion", () => {
  function octokitReturning(status: number): Requestable {
    return { request: vi.fn().mockResolvedValue({ status }) };
  }

  function octokitThrowing(status: number): Requestable {
    const err = Object.assign(new Error(`HTTP ${status}`), { status });
    return { request: vi.fn().mockRejectedValue(err) };
  }

  it("returns 'deleted' on 204", async () => {
    const result = await deletePackageVersion(
      octokitReturning(204),
      "pyck-ai",
      packageName("baseimages/golang"),
      1,
    );
    expect(result).toBe("deleted");
  });

  it("returns 'already-gone' on 404", async () => {
    const result = await deletePackageVersion(
      octokitReturning(404),
      "pyck-ai",
      packageName("baseimages/golang"),
      1,
    );
    expect(result).toBe("already-gone");
  });

  it("returns 'last-version-conflict' on 400 (last remaining version)", async () => {
    const result = await deletePackageVersion(
      octokitReturning(400),
      "pyck-ai",
      packageName("baseimages/golang"),
      1,
    );
    expect(result).toBe("last-version-conflict");
  });

  it("classifies a thrown RequestError the same way as a returned status", async () => {
    const result = await deletePackageVersion(
      octokitThrowing(400),
      "pyck-ai",
      packageName("baseimages/golang"),
      1,
    );
    expect(result).toBe("last-version-conflict");
  });

  it("rethrows unexpected statuses", async () => {
    await expect(
      deletePackageVersion(octokitReturning(500), "pyck-ai", packageName("baseimages/golang"), 1),
    ).rejects.toThrow(/500/);
  });

  it("rethrows non-status errors untouched", async () => {
    const octokit: Requestable = { request: vi.fn().mockRejectedValue(new Error("network boom")) };
    await expect(
      deletePackageVersion(octokit, "pyck-ai", packageName("baseimages/golang"), 1),
    ).rejects.toThrow("network boom");
  });
});

describe("deletePackage", () => {
  function octokitReturning(status: number): Requestable {
    return { request: vi.fn().mockResolvedValue({ status }) };
  }

  it("returns 'deleted' on 204 even though versions remain (whole-package delete)", async () => {
    const result = await deletePackage(
      octokitReturning(204),
      "pyck-ai",
      packageName("baseimages/golang"),
    );
    expect(result).toBe("deleted");
  });

  it("returns 'already-gone' on 404", async () => {
    const result = await deletePackage(
      octokitReturning(404),
      "pyck-ai",
      packageName("baseimages/golang"),
    );
    expect(result).toBe("already-gone");
  });

  it("rethrows unexpected statuses", async () => {
    await expect(
      deletePackage(octokitReturning(403), "pyck-ai", packageName("baseimages/golang")),
    ).rejects.toThrow(/403/);
  });
});
