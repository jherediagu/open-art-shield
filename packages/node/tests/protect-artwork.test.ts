import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aiAuditArtwork, protectArtwork, verifyArtwork, writeImage } from "../src/index.js";
import { createSyntheticImage } from "./helpers.js";

const message = "artist=demo;license=no-ai-training";
let dir: string;
let inputPath: string;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "oas-sdk-"));
  inputPath = join(dir, "input.png");
  await writeImage(createSyntheticImage(384, 384, 3), inputPath);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("protectArtwork (SDK)", () => {
  it("runs the default creator-balanced bundle end to end", async () => {
    const outputPath = join(dir, "sdk-default.png");
    const r = await protectArtwork(inputPath, {
      message,
      seed: 123,
      repetitions: 5,
      outputPath,
      now: "2026-07-09T00:00:00.000Z",
    });

    expect(r.profile.name).toBe("creator-balanced");
    expect(r.protect.outputPath).toBe(outputPath);
    expect(await exists(outputPath)).toBe(true);
    expect(r.protect.jsonPath).toBe(join(dir, "sdk-default.audit.json"));
    expect(r.protect.sidecarPath).toBe(join(dir, "sdk-default.openartshield.json"));
    expect(r.protect.report.summary.totalTransforms).toBeGreaterThan(1);
    expect(r.cloak).toBeUndefined();
    expect(r.aiAudit).toBeUndefined();

    // The sidecar round-trips through verifyArtwork.
    const v = await verifyArtwork(outputPath);
    expect(v.checksumValid).toBe(true);
    expect(v.recoveredMessage).toBe(message);
  });

  it("trace-only verifies the output and writes no model reports", async () => {
    const outputPath = join(dir, "sdk-trace.png");
    const r = await protectArtwork(inputPath, {
      profile: "trace-only",
      message,
      seed: 123,
      repetitions: 5,
      outputPath,
      now: "2026-07-09T00:00:00.000Z",
    });
    expect(r.verification?.checksumValid).toBe(true);
    expect(r.verification?.recoveredMessage).toBe(message);
    expect(r.cloak).toBeUndefined();
    expect(r.aiAudit).toBeUndefined();
    expect(await exists(join(dir, "sdk-trace.cloak.json"))).toBe(false);
    expect(await exists(join(dir, "sdk-trace.ai-audit.json"))).toBe(false);
  });

  it("creator-experimental orchestrates cloak + ai-audit with mock variants", async () => {
    const outputPath = join(dir, "sdk-exp.png");
    const r = await protectArtwork(inputPath, {
      profile: "creator-experimental",
      message,
      seed: 123,
      repetitions: 5,
      outputPath,
      backend: "mock",
      scoreModels: ["variant-a"],
      steps: 3,
      html: true,
      now: "2026-07-09T00:00:00.000Z",
    });

    expect(r.cloak).toBeDefined();
    expect(r.cloak?.report.scoring.mode).toBe("multi-model");
    expect(await exists(r.cloak!.jsonPath)).toBe(true);
    expect(await exists(r.cloak!.htmlPath!)).toBe(true);

    expect(r.aiAudit).toBeDefined();
    expect(await exists(r.aiAudit!.jsonPath)).toBe(true);
    expect(await exists(r.aiAudit!.htmlPath!)).toBe(true);

    const onDisk = JSON.parse(await readFile(r.aiAudit!.jsonPath, "utf-8"));
    expect(onDisk.backend).toBe("mock");

    // Watermark embedded after the cloak stays verifiable.
    const v = await verifyArtwork(outputPath);
    expect(v.checksumValid).toBe(true);
  });

  it("fails clearly on an unknown profile and on an unknown backend", async () => {
    await expect(
      protectArtwork(inputPath, {
        profile: "balanced",
        message,
        seed: 1,
        outputPath: join(dir, "x1.png"),
      }),
    ).rejects.toThrow(/Unknown protection profile "balanced"/);

    await expect(
      protectArtwork(inputPath, {
        profile: "creator-experimental",
        message,
        seed: 1,
        outputPath: join(dir, "x2.png"),
        backend: "gpt",
      }),
    ).rejects.toThrow(/Unknown backend "gpt"/);
  });

  it("rejects an empty message before writing anything", async () => {
    const outputPath = join(dir, "x3.png");
    await expect(protectArtwork(inputPath, { message: "", seed: 1, outputPath })).rejects.toThrow(
      /non-empty message/,
    );
    expect(await exists(outputPath)).toBe(false);
  });
});

describe("verifyArtwork / aiAuditArtwork (SDK)", () => {
  it("fails clearly when the sidecar is missing", async () => {
    await expect(verifyArtwork(inputPath)).rejects.toThrow(/Could not read sidecar/);
  });

  it("aiAuditArtwork measures drift and rejects compareModels on mock", async () => {
    const report = await aiAuditArtwork(inputPath, inputPath, { backend: "mock" });
    expect(report.embedding.drift).toBeCloseTo(0, 6);

    await expect(
      aiAuditArtwork(inputPath, inputPath, {
        backend: "mock",
        compareModels: ["Xenova/clip-vit-base-patch16"],
      }),
    ).rejects.toThrow(/compareModels requires a real backend/);
  });
});
