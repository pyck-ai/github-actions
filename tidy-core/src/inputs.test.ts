import { describe, expect, it } from "vitest";
import {
  InputError,
  optionalString,
  parseBoolean,
  parseWholeNumber,
  rawInput,
  requiredString,
} from "./inputs.js";

describe("rawInput", () => {
  it("reads INPUT_<NAME> upper-cased with the dash kept", () => {
    expect(rawInput({ "INPUT_RETAIN-DAYS": "7" }, "retain-days")).toBe("7");
    expect(rawInput({}, "retain-days")).toBeUndefined();
  });
});

describe("requiredString", () => {
  it("returns the trimmed value", () => {
    expect(requiredString({ INPUT_TOKEN: "  t0ken \n" }, "token")).toBe("t0ken");
  });

  it.each([{}, { INPUT_TOKEN: "" }, { INPUT_TOKEN: "   " }])(
    "throws an InputError naming the input for %j",
    (env) => {
      expect(() => requiredString(env, "token")).toThrow(InputError);
      expect(() => requiredString(env, "token")).toThrow("token is required, got an empty value");
    },
  );
});

describe("optionalString", () => {
  it("returns the value as set, even when empty or padded", () => {
    expect(optionalString({ INPUT_NAMES: " a, b " }, "names", "x")).toBe(" a, b ");
    expect(optionalString({ INPUT_NAMES: "" }, "names", "x")).toBe("");
  });

  it("falls back when the input is not set", () => {
    expect(optionalString({}, "names", "x")).toBe("x");
  });
});

describe("parseBoolean", () => {
  it("accepts true and false, ignoring surrounding whitespace", () => {
    expect(parseBoolean({ "INPUT_DRY-RUN": "true" }, "dry-run", false)).toBe(true);
    expect(parseBoolean({ "INPUT_DRY-RUN": " false " }, "dry-run", true)).toBe(false);
  });

  it("falls back when the input is not set", () => {
    expect(parseBoolean({}, "dry-run", true)).toBe(true);
    expect(parseBoolean({}, "dry-run", false)).toBe(false);
  });

  it.each(["", "TRUE", "yes", "1", "True"])("rejects %j and names input and value", (raw) => {
    expect(() => parseBoolean({ "INPUT_DRY-RUN": raw }, "dry-run", true)).toThrow(
      `dry-run must be "true" or "false", got ${JSON.stringify(raw)}`,
    );
  });
});

describe("parseWholeNumber", () => {
  it("accepts a whole number at or above the minimum, ignoring surrounding whitespace", () => {
    expect(parseWholeNumber({ "INPUT_RETAIN-DAYS": " 10 " }, "retain-days", 1)).toBe(10);
    expect(parseWholeNumber({ INPUT_N: "0" }, "n", 0)).toBe(0);
  });

  it.each(["", "0", "-1", "1.5", "1e3", "abc", "99999999999999999999"])(
    "rejects %j and names input, minimum and value",
    (raw) => {
      expect(() => parseWholeNumber({ "INPUT_RETAIN-DAYS": raw }, "retain-days", 1)).toThrow(
        new InputError(`retain-days must be a whole number >= 1, got ${JSON.stringify(raw)}`),
      );
    },
  );

  it("rejects a missing input with an empty value in the message", () => {
    expect(() => parseWholeNumber({}, "retain-days", 1)).toThrow(
      'retain-days must be a whole number >= 1, got ""',
    );
  });
});
