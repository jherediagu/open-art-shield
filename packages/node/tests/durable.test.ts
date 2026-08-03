import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDeclareManifest } from "@openartshield/core";
import {
  DURABLE_ID_BITS,
  durableIdFromBits,
  durableIdFromRecord,
  durableIdToBits,
  serializeDurableRecord,
  type DurableRecord,
} from "../src/index.js";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "oas-durable-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const record: DurableRecord = {
  version: "1",
  createdAt: "2026-08-03T00:00:00.000Z",
  manifest: buildDeclareManifest({
    title: "artwork.png",
    format: "image/png",
    claimGenerator: "openartshield-test/0.0.0",
    creatorName: "Demo Artist",
  }),
};

describe("durable record identity", () => {
  it("derives a stable 15-hex-char ID from the serialized record", () => {
    const serialized = serializeDurableRecord(record);
    const id = durableIdFromRecord(serialized);
    expect(id).toMatch(/^[0-9a-f]{15}$/);
    expect(durableIdFromRecord(serialized)).toBe(id);
  });

  it("changes the ID when the record changes", () => {
    const a = durableIdFromRecord(serializeDurableRecord(record));
    const b = durableIdFromRecord(
      serializeDurableRecord({ ...record, createdAt: "2026-08-04T00:00:00.000Z" }),
    );
    expect(a).not.toBe(b);
  });

  it("round-trips IDs through bits", () => {
    const id = durableIdFromRecord(serializeDurableRecord(record));
    const bits = durableIdToBits(id);
    expect(bits).toHaveLength(DURABLE_ID_BITS);
    expect(durableIdFromBits(bits)).toBe(id);
  });

  it("rejects malformed IDs and bitstrings", () => {
    expect(() => durableIdToBits("XYZ")).toThrow(/hex/);
    expect(() => durableIdToBits("a".repeat(16))).toThrow(/hex/);
    expect(() => durableIdFromBits("01")).toThrow(/60 bits/);
  });

  it("integrity-checks stored bytes against the ID", async () => {
    const serialized = serializeDurableRecord(record);
    const id = durableIdFromRecord(serialized);
    const path = join(dir, `${id}.json`);
    await writeFile(path, serialized, "utf8");

    expect(durableIdFromRecord(await readFile(path, "utf8"))).toBe(id);

    // Any tampering breaks the binding.
    await writeFile(path, serialized.replace("Demo Artist", "Someone Else"), "utf8");
    expect(durableIdFromRecord(await readFile(path, "utf8"))).not.toBe(id);
  });
});
