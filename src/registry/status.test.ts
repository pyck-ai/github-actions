import { describe, expect, it } from "vitest";
import { classifyStatus, shouldRetryStatus } from "./status.js";

describe("classifyStatus", () => {
  it("classifies 404 as not-found", () => {
    expect(classifyStatus(404)).toBe("not-found");
  });

  it("classifies 429 as transient", () => {
    expect(classifyStatus(429)).toBe("transient");
  });

  it.each([500, 502, 503, 599])("classifies %i as transient", (status) => {
    expect(classifyStatus(status)).toBe("transient");
  });

  it.each([200, 204, 299])("classifies %i as success", (status) => {
    expect(classifyStatus(status)).toBe("success");
  });

  it.each([400, 401, 403])("classifies %i as client-error", (status) => {
    expect(classifyStatus(status)).toBe("client-error");
  });

  it("does not classify 600 as transient (out of 5xx range)", () => {
    expect(classifyStatus(600)).toBe("client-error");
  });
});

describe("shouldRetryStatus", () => {
  it("retries on 429 and 5xx", () => {
    expect(shouldRetryStatus(429)).toBe(true);
    expect(shouldRetryStatus(503)).toBe(true);
  });

  it("does not retry on 404 (permanent)", () => {
    expect(shouldRetryStatus(404)).toBe(false);
  });

  it("does not retry on success", () => {
    expect(shouldRetryStatus(200)).toBe(false);
  });
});
