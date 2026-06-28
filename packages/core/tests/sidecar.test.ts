import { describe, expect, it } from "vitest";
import { buildSidecar, parseSidecar, serializeSidecar } from "../src/sidecar.js";

const base = {
  version: "0.1.0",
  seed: 123,
  messageLength: 34,
  repetitions: 5,
  strength: 8,
  createdAt: "2026-06-28T00:00:00.000Z",
  originalFile: "input.png",
  protectedFile: "protected.png",
};

describe("sidecar", () => {
  it("does not store the message by default", () => {
    const s = buildSidecar(base);
    expect(s.message).toBeUndefined();
    expect(s.algorithm).toBe("dct-basic");
    expect(s.seed).toBe(123);
    expect(s.messageLength).toBe(34);
  });

  it("stores the message only when explicitly provided", () => {
    const s = buildSidecar({ ...base, message: "secret" });
    expect(s.message).toBe("secret");
  });

  it("round-trips through serialize/parse", () => {
    const s = buildSidecar(base);
    const parsed = parseSidecar(serializeSidecar(s));
    expect(parsed).toEqual(s);
  });

  it("rejects non-JSON", () => {
    expect(() => parseSidecar("not json")).toThrow();
  });

  it("rejects a sidecar missing required fields", () => {
    expect(() => parseSidecar(JSON.stringify({ seed: 1 }))).toThrow();
    expect(() =>
      parseSidecar(JSON.stringify({ seed: 1, messageLength: 0, repetitions: 5 })),
    ).toThrow();
    expect(() =>
      parseSidecar(JSON.stringify({ seed: 1, messageLength: 10, repetitions: 0 })),
    ).toThrow();
  });
});
