import { describe, expect, it, vi } from "vitest";
import {
  DOCKER_MANIFEST_LIST,
  DOCKER_MANIFEST_V2,
  OCI_INDEX,
  OCI_MANIFEST,
  isAttestationChild,
  parseManifestBody,
  resolveManifest,
  type ManifestChild,
} from "./manifest.js";

describe("parseManifestBody — media-type dispatch", () => {
  it("extracts children from an OCI index", () => {
    const body = JSON.stringify({
      mediaType: OCI_INDEX,
      manifests: [
        {
          digest: "sha256:aaa",
          mediaType: OCI_MANIFEST,
          platform: { os: "linux", architecture: "amd64" },
        },
        {
          digest: "sha256:bbb",
          mediaType: OCI_MANIFEST,
          platform: { os: "linux", architecture: "arm64" },
        },
      ],
    });

    const parsed = parseManifestBody(body);

    expect(parsed.mediaType).toBe(OCI_INDEX);
    expect(parsed.children).toHaveLength(2);
    expect(parsed.children[0]).toMatchObject({
      digest: "sha256:aaa",
      platform: { architecture: "amd64" },
    });
  });

  it("extracts children from a Docker manifest list", () => {
    const body = JSON.stringify({
      mediaType: DOCKER_MANIFEST_LIST,
      manifests: [{ digest: "sha256:ccc", platform: { os: "linux", architecture: "amd64" } }],
    });

    const parsed = parseManifestBody(body);

    expect(parsed.mediaType).toBe(DOCKER_MANIFEST_LIST);
    expect(parsed.children).toHaveLength(1);
  });

  it("returns no children for a flat OCI manifest", () => {
    const body = JSON.stringify({ mediaType: OCI_MANIFEST, config: {}, layers: [] });

    const parsed = parseManifestBody(body);

    expect(parsed.mediaType).toBe(OCI_MANIFEST);
    expect(parsed.children).toEqual([]);
  });

  it("returns no children for a flat Docker v2 manifest", () => {
    const body = JSON.stringify({ mediaType: DOCKER_MANIFEST_V2, config: {}, layers: [] });

    const parsed = parseManifestBody(body);

    expect(parsed.mediaType).toBe(DOCKER_MANIFEST_V2);
    expect(parsed.children).toEqual([]);
  });

  it("falls back to the header media type when the body omits mediaType", () => {
    const body = JSON.stringify({ config: {}, layers: [] });

    const parsed = parseManifestBody(body, OCI_MANIFEST);

    expect(parsed.mediaType).toBe(OCI_MANIFEST);
    expect(parsed.children).toEqual([]);
  });

  it("returns mediaType 'unknown' with no children for unparsable bodies", () => {
    const parsed = parseManifestBody("not json");

    expect(parsed.mediaType).toBe("unknown");
    expect(parsed.children).toEqual([]);
  });

  it("preserves attestation-manifest annotations on index children", () => {
    const body = JSON.stringify({
      mediaType: OCI_INDEX,
      manifests: [
        { digest: "sha256:img", platform: { os: "linux", architecture: "amd64" } },
        {
          digest: "sha256:att",
          mediaType: OCI_MANIFEST,
          annotations: {
            "vnd.docker.reference.type": "attestation-manifest",
            "vnd.docker.reference.digest": "sha256:img",
          },
        },
      ],
    });

    const parsed = parseManifestBody(body);

    expect(parsed.children).toHaveLength(2);
    const [image, attestation] = parsed.children as [ManifestChild, ManifestChild];
    expect(isAttestationChild(image)).toBe(false);
    expect(isAttestationChild(attestation)).toBe(true);
  });

  it("does not misclassify a plain platform child as an attestation", () => {
    const child: ManifestChild = {
      digest: "sha256:x",
      platform: { os: "linux", architecture: "amd64" },
    };
    expect(isAttestationChild(child)).toBe(false);
  });
});

describe("resolveManifest — status classification", () => {
  function fakeResponse(status: number, body = "", headers: Record<string, string> = {}): Response {
    return new Response(body, { status, headers });
  }

  it("returns success with digest and children for a 200 index response", async () => {
    const body = JSON.stringify({
      mediaType: OCI_INDEX,
      manifests: [{ digest: "sha256:child", platform: { os: "linux", architecture: "amd64" } }],
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(fakeResponse(200, body, { "docker-content-digest": "sha256:root" }));

    const result = await resolveManifest("owner/pkg", "tok", "latest", {
      fetchImpl,
      sleep: vi.fn(),
    });

    expect(result).toMatchObject({
      status: "success",
      httpStatus: 200,
      digest: "sha256:root",
      mediaType: OCI_INDEX,
    });
    if (result.status === "success") {
      expect(result.children).toHaveLength(1);
    }
  });

  it("returns not-found for a 404 (permanent, no retry)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(404));

    const result = await resolveManifest("owner/pkg", "tok", "sha256:dead", {
      fetchImpl,
      sleep: vi.fn(),
    });

    expect(result).toEqual({ status: "not-found", httpStatus: 404 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns transient-error after retries are exhausted on 429/5xx", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => fakeResponse(503));

    const result = await resolveManifest("owner/pkg", "tok", "sha256:flaky", {
      fetchImpl,
      sleep: vi.fn(),
      attempts: 3,
    });

    expect(result).toEqual({ status: "transient-error", httpStatus: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("returns client-error for a 401/403", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(403));

    const result = await resolveManifest("owner/pkg", "tok", "latest", {
      fetchImpl,
      sleep: vi.fn(),
    });

    expect(result).toEqual({ status: "client-error", httpStatus: 403 });
  });

  it("returns network-error when fetch fails at every attempt", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));

    const result = await resolveManifest("owner/pkg", "tok", "latest", {
      fetchImpl,
      sleep: vi.fn(),
      attempts: 2,
    });

    expect(result).toEqual({ status: "network-error" });
  });

  it("falls back to the requested reference as digest when no Docker-Content-Digest header is present", async () => {
    const body = JSON.stringify({ mediaType: OCI_MANIFEST, config: {}, layers: [] });
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, body));

    const result = await resolveManifest("owner/pkg", "tok", "sha256:known", {
      fetchImpl,
      sleep: vi.fn(),
    });

    expect(result).toMatchObject({ status: "success", digest: "sha256:known", children: [] });
  });
});
