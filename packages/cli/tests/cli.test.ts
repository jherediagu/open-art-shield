import { access, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { messageByteLength } from "@openartshield/core";
import { defaultTransforms, writeImage } from "@openartshield/node";
import { runEmbed } from "../src/commands/embed.js";
import { runAiAudit } from "../src/commands/ai-audit.js";
import { runExtract } from "../src/commands/extract.js";
import { runAuditCommand } from "../src/commands/audit.js";
import { runCapacity } from "../src/commands/capacity.js";
import { runProtect } from "../src/commands/protect.js";
import { runVerify } from "../src/commands/verify.js";
import { getVersion, versionCommand } from "../src/commands/version.js";
import { CLI_VERSION } from "../src/utils/output.js";
import { createSyntheticImage } from "./helpers.js";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

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

  it("writes a standalone HTML report with --html", async () => {
    const jsonPath = join(dir, "report2.json");
    const htmlPath = join(dir, "report2.html");
    await runAuditCommand({
      input: inputPath,
      message,
      seed: 123,
      strength: 16,
      repetitions: 5,
      out: jsonPath,
      html: htmlPath,
    });

    const html = await readFile(htmlPath, "utf-8");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain(message);
    expect(html).toContain("identity");
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

describe("oas ai-audit", () => {
  it("measures embedding drift and writes JSON + HTML (mock backend)", async () => {
    // A clearly different candidate (inverted) so drift is non-trivial.
    const candidate = createSyntheticImage(384, 384, 3);
    for (let i = 0; i < candidate.data.length; i++) candidate.data[i] = 255 - candidate.data[i];
    const candPath = join(dir, "ai-candidate.png");
    await writeImage(candidate, candPath);

    const jsonPath = join(dir, "ai-audit.json");
    const htmlPath = join(dir, "ai-audit.html");
    const report = await runAiAudit({
      original: inputPath,
      candidate: candPath,
      prompt: "an illustration",
      out: jsonPath,
      html: htmlPath,
    });

    expect(report.backend).toBe("mock");
    expect(report.embedding.dimensions).toBe(64);
    expect(report.embedding.drift).toBeGreaterThan(0);
    expect(report.transforms).toHaveLength(defaultTransforms.length);
    expect(report.prompt?.text).toBe("an illustration");

    const onDisk = JSON.parse(await readFile(jsonPath, "utf-8"));
    expect(onDisk.backend).toBe("mock");
    expect(typeof onDisk.limitations).toBe("string");
    expect((await readFile(htmlPath, "utf-8")).startsWith("<!doctype html>")).toBe(true);
  });

  it("reports ~0 drift for an image against itself", async () => {
    const report = await runAiAudit({ original: inputPath, candidate: inputPath });
    expect(report.embedding.drift).toBeCloseTo(0, 6);
  });

  it("rejects an unknown backend", async () => {
    await expect(
      runAiAudit({ original: inputPath, candidate: inputPath, backend: "gpt" }),
    ).rejects.toThrow(/backend/i);
  });
});

describe("oas protect", () => {
  it("embeds, audits, and writes report + sidecar with default paths", async () => {
    await mkdir(join(dir, "out"), { recursive: true });
    const out = join(dir, "out", "protected.png");

    const r = await runProtect({
      input: inputPath,
      message,
      seed: 123,
      strength: 16,
      repetitions: 5,
      out,
      now: "2026-06-28T00:00:00.000Z",
    });

    expect(r.outPath).toBe(out);
    expect(r.jsonPath).toBe(join(dir, "out", "protected.audit.json"));
    expect(r.sidecarPath).toBe(join(dir, "out", "protected.openartshield.json"));
    expect(await exists(out)).toBe(true);
    expect(await exists(r.jsonPath)).toBe(true);
    expect(await exists(r.sidecarPath!)).toBe(true);

    // Sidecar must NOT contain the message by default.
    const sidecar = JSON.parse(await readFile(r.sidecarPath!, "utf-8"));
    expect(sidecar.message).toBeUndefined();
    expect(sidecar.messageLength).toBe(messageByteLength(message));
    expect(sidecar.seed).toBe(123);
    expect(sidecar.createdAt).toBe("2026-06-28T00:00:00.000Z");

    // Report is real and has the identity baseline recovered.
    expect(r.report.summary.totalTransforms).toBeGreaterThan(1);
    const identity = r.report.results.find((x) => x.transform === "identity");
    expect(identity?.messageRecovered).toBe(true);
  });

  it("writes an HTML report when requested and stores the message on opt-in", async () => {
    const out = join(dir, "protected2.png");
    const html = join(dir, "protected2.audit.html");
    const r = await runProtect({
      input: inputPath,
      message,
      seed: 7,
      repetitions: 5,
      out,
      html,
      storeMessage: true,
      now: "2026-06-28T00:00:00.000Z",
    });
    expect(r.htmlPath).toBe(html);
    expect((await readFile(html, "utf-8")).startsWith("<!doctype html>")).toBe(true);
    const sidecar = JSON.parse(await readFile(r.sidecarPath!, "utf-8"));
    expect(sidecar.message).toBe(message);
  });

  it("can skip the sidecar", async () => {
    const out = join(dir, "protected3.png");
    const r = await runProtect({
      input: inputPath,
      message,
      seed: 1,
      repetitions: 5,
      out,
      noSidecar: true,
    });
    expect(r.sidecarPath).toBeUndefined();
  });

  it("fails before embedding when the message does not fit", async () => {
    const smallPath = join(dir, "small.png");
    await writeImage(createSyntheticImage(64, 64, 3), smallPath);
    const out = join(dir, "small-protected.png");

    await expect(
      runProtect({ input: smallPath, message, seed: 1, repetitions: 5, out }),
    ).rejects.toThrow(/does not fit/i);

    // No protected image should have been written.
    expect(await exists(out)).toBe(false);
  });
});

describe("oas verify", () => {
  it("recovers the message via the sidecar produced by protect", async () => {
    const out = join(dir, "verify-me.png");
    const r = await runProtect({
      input: inputPath,
      message,
      seed: 123,
      repetitions: 5,
      out,
      now: "2026-06-28T00:00:00.000Z",
    });

    const v = await runVerify({ input: out, sidecar: r.sidecarPath });
    expect(v.checksumValid).toBe(true);
    expect(v.recoveredMessage).toBe(message);
    expect(v.sidecar.algorithm).toBe("dct-basic");
  });

  it("defaults the sidecar path from the image path", async () => {
    const out = join(dir, "verify-default.png");
    await runProtect({ input: inputPath, message, seed: 5, repetitions: 5, out });
    const v = await runVerify({ input: out }); // no --sidecar
    expect(v.recoveredMessage).toBe(message);
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
