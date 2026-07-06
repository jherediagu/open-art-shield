import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROTECTION_PROFILE,
  PROTECTION_PROFILE_NAMES,
  PROTECTION_PROFILES,
  isProtectionProfileName,
  resolveProtectionProfile,
} from "../src/profiles.js";

describe("protection profiles", () => {
  it("defines exactly the three launch profiles", () => {
    expect(PROTECTION_PROFILE_NAMES).toEqual([
      "trace-only",
      "creator-balanced",
      "creator-experimental",
    ]);
    expect(Object.keys(PROTECTION_PROFILES).sort()).toEqual([...PROTECTION_PROFILE_NAMES].sort());
  });

  it("defaults to creator-balanced (classic protect behavior)", () => {
    expect(DEFAULT_PROTECTION_PROFILE).toBe("creator-balanced");
  });

  it("trace-only enables trace, verify, and audit only", () => {
    const p = resolveProtectionProfile("trace-only");
    expect(p.layers).toEqual({
      trace: true,
      verify: true,
      audit: true,
      cloak: false,
      measure: false,
    });
  });

  it("creator-balanced enables trace and audit without models", () => {
    const p = resolveProtectionProfile("creator-balanced");
    expect(p.layers).toEqual({
      trace: true,
      verify: false,
      audit: true,
      cloak: false,
      measure: false,
    });
  });

  it("creator-experimental enables cloak and measure", () => {
    const p = resolveProtectionProfile("creator-experimental");
    expect(p.layers).toEqual({
      trace: true,
      verify: false,
      audit: true,
      cloak: true,
      measure: true,
    });
  });

  it("fails clearly on an unknown profile", () => {
    expect(isProtectionProfileName("balanced")).toBe(false);
    expect(() => resolveProtectionProfile("balanced")).toThrow(
      /Unknown protection profile "balanced"/,
    );
    expect(() => resolveProtectionProfile("balanced")).toThrow(
      /trace-only, creator-balanced, creator-experimental/,
    );
  });

  it("keeps descriptions honest (no guarantees language)", () => {
    for (const name of PROTECTION_PROFILE_NAMES) {
      const description = PROTECTION_PROFILES[name].description.toLowerCase();
      expect(description).not.toContain("ai-proof");
      expect(description).not.toContain("guarantee");
      expect(description).not.toContain("prevents");
    }
  });
});
