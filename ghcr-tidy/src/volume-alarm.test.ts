import { describe, expect, it } from "vitest";
import { checkVolumeAlarm, DEFAULT_VOLUME_ALARM_MULTIPLE } from "./volume-alarm.js";

describe("checkVolumeAlarm", () => {
  it("allows a planned count at or below baseline * multiple", () => {
    const decision = checkVolumeAlarm(30, { baseline: 10, multiple: 3 });
    expect(decision.allowed).toBe(true);
    expect(decision.threshold).toBe(30);
  });

  it("refuses a planned count above baseline * multiple", () => {
    const decision = checkVolumeAlarm(31, { baseline: 10, multiple: 3 });
    expect(decision.allowed).toBe(false);
    expect(decision.threshold).toBe(30);
    expect(decision.reason).toContain("exceed");
  });

  it("uses DEFAULT_VOLUME_ALARM_MULTIPLE when no multiple is supplied", () => {
    const decision = checkVolumeAlarm(10 * DEFAULT_VOLUME_ALARM_MULTIPLE + 1, { baseline: 10 });
    expect(decision.allowed).toBe(false);
    expect(decision.multiple).toBe(DEFAULT_VOLUME_ALARM_MULTIPLE);
  });

  it("proceeds when no baseline is supplied — a deliberate, documented default, not an oversight", () => {
    const decision = checkVolumeAlarm(1_000_000, {});
    expect(decision.allowed).toBe(true);
    expect(decision.baseline).toBeUndefined();
    expect(decision.threshold).toBeUndefined();
    expect(decision.reason).toContain("no trailing baseline supplied");
  });
});
