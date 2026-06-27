import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { messageByteLength } from "@openartshield/core";
import { writeImage } from "@openartshield/node";
import { runEmbed } from "../src/commands/embed.js";
import { runExtract } from "../src/commands/extract.js";
import { runAuditCommand } from "../src/commands/audit.js";
import { runCapacity } from "../src/commands/capacity.js";
import { getVersion, versionCommand } from "../src/commands/version.js";
import { CLI_VERSION } from "../src/utils/output.js";
import { createSyntheticImage } from "./helpers.js";

const message = "artist=demo;license=no-ai-training";
let dir: string;
let inputPath: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "oas-cli-"));
  inputPath = join(dir, "input.png");
  await writeImage(createSyntheticImage(384, 384, 3), inputPath);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("oas embed", () => {
  it("creates a protected output file", async () => {
    const out = join(dir, "protected.png");
    const result = await runEmbed({
      input: inputPath,
      message,
      seed: 123,
      strength: 16,
      repetitions: 5,
      out,
    });
    expect(result.outPath).toBe(out);
    expect(result.bitsEmbedded).toBeGreaterThan(0);
    const stats = await stat(out);
    expect(stats.size).toBeGreaterThan(0);
  });

  it("rejects an empty message", async () => {
    await expect(
      runEmbed({ input: inputPath, message: "", seed: 1, out: join(dir, "x.png") }),
    ).rejects.toThrow();
  });
});

describe("oas extract", () => {
  it("recovers the embedded message", async () => {
    const out = join(dir, "protected-extract.png");
    await runEmbed({ input: inputPath, message, seed: 123, strength: 16, repetitions: 5, out });

    const result = await runExtract({
      input: out,
      seed: 123,
      messageLength: messageByteLength(message),
      repetitions: 5,
    });
    expect(result.checksumValid).toBe(true);
    expect(result.recoveredMessage).toBe(message);
  });
});

describe("oas audit", () => {
  it("creates a valid JSON report file", async () => {
    const reportPath = join(dir, "report.json");
    const report = await runAuditCommand({
      input: inputPath,
      message,
      seed: 123,
      strength: 16,
      repetitions: 5,
      out: reportPath,
    });

    expect(report.version).toBe("0.1.0");

    const onDisk = JSON.parse(await readFile(reportPath, "utf-8"));
    expect(onDisk.version).toBe("0.1.0");
    expect(onDisk.watermark.expectedMessage).toBe(message);
    expect(Array.isArray(onDisk.results)).toBe(true);
    expect(onDisk.results.length).toBeGreaterThan(1);
    expect(onDisk.summary.totalTransforms).toBe(onDisk.results.length);

    const identity = onDisk.results.find((r: { transform: string }) => r.transform === "identity");
    expect(identity.messageRecovered).toBe(true);
  });
});

describe("oas capacity", () => {
  it("reports capacity for the input image", async () => {
    const c = await runCapacity({ input: inputPath, message, repetitions: 5 });
    expect(c.width).toBe(384);
    expect(c.height).toBe(384);
    expect(c.availableBlocks).toBe(2304);
    expect(c.messageBytes).toBe(messageByteLength(message));
    expect(c.fits).toBe(true);
  });

  it("rejects an empty message", async () => {
    await expect(runCapacity({ input: inputPath, message: "" })).rejects.toThrow();
  });
});

describe("oas version", () => {
  it("returns the package version", () => {
    expect(getVersion()).toBe("0.1.0");
    expect(CLI_VERSION).toBe("0.1.0");
  });

  it("prints the version to stdout", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    versionCommand();
    expect(spy).toHaveBeenCalledWith("0.1.0");
    spy.mockRestore();
  });
});
