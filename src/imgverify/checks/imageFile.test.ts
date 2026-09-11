import { describe, expect, it, vi } from "vitest";
import type { ImageFileCheck } from "../manifest/schema.js";
import { executeImageFileCheck } from "./imageFile.js";
import { makeContext, makeFakeCli } from "./test-helpers.js";
import * as exportModule from "../docker/export.js";

describe("executeImageFileCheck", () => {
  it("passes when every path is present in the export", async () => {
    vi.spyOn(exportModule, "listImageFiles").mockResolvedValue(["etc/passwd", "usr/bin/git"]);
    const check: ImageFileCheck = { kind: "imageFile", paths: ["/etc/passwd"] };
    const result = await executeImageFileCheck(check, 0, makeContext());
    expect(result.verdict).toBe("pass");
    vi.restoreAllMocks();
  });

  it("fails and lists missing paths", async () => {
    vi.spyOn(exportModule, "listImageFiles").mockResolvedValue(["etc/passwd"]);
    const check: ImageFileCheck = { kind: "imageFile", paths: ["/etc/passwd", "/usr/bin/bogus"] };
    const result = await executeImageFileCheck(check, 0, makeContext());
    expect(result.verdict).toBe("fail");
    expect(result.detail).toBe("missing: /usr/bin/bogus");
    vi.restoreAllMocks();
  });

  it("fails (not a hard error) when the image cannot be created/exported", async () => {
    vi.spyOn(exportModule, "listImageFiles").mockRejectedValue(new Error("docker create failed"));
    const check: ImageFileCheck = { kind: "imageFile", paths: ["/etc/passwd"] };
    const result = await executeImageFileCheck(check, 0, makeContext());
    expect(result.verdict).toBe("fail");
    expect(result.detail).toBe("could not export image");
    vi.restoreAllMocks();
  });

  it("does not exercise the injected DockerCli directly — listImageFiles owns create/export/rm", async () => {
    const listSpy = vi.spyOn(exportModule, "listImageFiles").mockResolvedValue([]);
    const cli = makeFakeCli();
    const check: ImageFileCheck = { kind: "imageFile", paths: ["/x"] };
    await executeImageFileCheck(check, 0, makeContext({ cli }));
    expect(listSpy).toHaveBeenCalledWith(cli, "test-image:latest");
    vi.restoreAllMocks();
  });
});
