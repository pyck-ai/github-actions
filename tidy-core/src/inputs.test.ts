import { describe, expect, it } from "vitest";
import {
  InputError,
  parseBoolean,
  parseWholeNumber,
  requiredInput,
  requiredString,
} from "./inputs.js";

describe("requiredInput", () => {
  it("reads INPUT_<NAME> upper-cased with the dash kept, as set", () => {
    expect(requiredInput({ "INPUT_RETAIN-DAYS": " 7 " }, "retain-days")).toBe(" 7 ");
    expect(requiredInput({ INPUT_NAMES: "" }, "names")).toBe("");
  });

  it("throws an InputError naming the input when it is not set", () => {
    expect(() => requiredInput({}, "retain-days")).toThrow(InputError);
    expect(() => requiredInput({}, "retain-days")).toThrow("retain-days is required, got no value");
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

describe("parseBoolean", () => {
  it("accepts true and false, ignoring surrounding whitespace", () => {
    expect(parseBoolean({ "INPUT_DRY-RUN": "true" }, "dry-run")).toBe(true);
    expect(parseBoolean({ "INPUT_DRY-RUN": " false " }, "dry-run")).toBe(false);
  });

  it("rejects a missing input, naming it", () => {
    expect(() => parseBoolean({}, "dry-run")).toThrow(InputError);
    expect(() => parseBoolean({}, "dry-run")).toThrow("dry-run is required, got no value");
  });

  it.each(["", "TRUE", "yes", "1", "True"])("rejects %j and names input and value", (raw) => {
    expect(() => parseBoolean({ "INPUT_DRY-RUN": raw }, "dry-run")).toThrow(
      `dry-run must be "true" or "false", got ${JSON.stringify(raw)}`,
    );
  });
});

describe("parseWholeNumber", () => {
  it("accepts a whole number from min to max, ignoring surrounding whitespace", () => {
    expect(parseWholeNumber({ "INPUT_RETAIN-DAYS": " 10 " }, "retain-days", 1, 36500)).toBe(10);
    expect(parseWholeNumber({ INPUT_N: "0" }, "n", 0, 5)).toBe(0);
    expect(parseWholeNumber({ INPUT_N: "5" }, "n", 0, 5)).toBe(5);
  });

  it.each(["", "0", "-1", "1.5", "1e3", "abc", "36501", "99999999999999999999"])(
    "rejects %j and names input, range and value",
    (raw) => {
      expect(() => parseWholeNumber({ "INPUT_RETAIN-DAYS": raw }, "retain-days", 1, 36500)).toThrow(
        new InputError(
          `retain-days must be a whole number from 1 to 36500, got ${JSON.stringify(raw)}`,
        ),
      );
    },
  );

  it("rejects a missing input, naming it", () => {
    expect(() => parseWholeNumber({}, "retain-days", 1, 36500)).toThrow(
      "retain-days is required, got no value",
    );
  });
});
