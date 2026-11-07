import { afterEach, describe, expect, it, vi } from "vitest";
import { createOutput, escapeCommandData } from "./output.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("escapeCommandData", () => {
  it("escapes percent, carriage return and newline", () => {
    expect(escapeCommandData("50%\r\nnext")).toBe("50%25%0D%0Anext");
  });

  it("escapes percent first so it does not double-escape", () => {
    expect(escapeCommandData("%0A")).toBe("%250A");
  });
});

describe("createOutput", () => {
  it("sends plain lines unchanged and workflow commands escaped to the sink", () => {
    const lines: string[] = [];
    const out = createOutput((line) => lines.push(line));
    out.log("plain 100%");
    out.notice("a\nb");
    out.warning("w%");
    out.error("e\r");
    expect(lines).toEqual(["plain 100%", "::notice::a%0Ab", "::warning::w%25", "::error::e%0D"]);
  });

  it("writes to stdout, one line each, without a sink", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    createOutput().error("boom");
    expect(write).toHaveBeenCalledWith("::error::boom\n");
  });
});
