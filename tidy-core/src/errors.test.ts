import { describe, expect, it } from "vitest";
import { describeError, statusOf } from "./errors.js";

describe("statusOf", () => {
  it("returns a numeric status", () => {
    expect(statusOf({ status: 404 })).toBe(404);
  });

  it.each([null, undefined, "x", 404, {}, { status: "404" }, new Error("x")])(
    "returns undefined for %j",
    (err) => {
      expect(statusOf(err)).toBeUndefined();
    },
  );
});

describe("describeError", () => {
  it("prefixes the HTTP status when the error has one", () => {
    expect(describeError(Object.assign(new Error("Not Found"), { status: 404 }))).toBe(
      "HTTP 404: Not Found",
    );
  });

  it("uses the message alone without a status and stringifies non-errors", () => {
    expect(describeError(new Error("boom"))).toBe("boom");
    expect(describeError("plain")).toBe("plain");
  });
});
