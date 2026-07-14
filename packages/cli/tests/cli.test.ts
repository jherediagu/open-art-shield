import { access, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { messageByteLength } from "@openartshield/core";
import { defaultTransforms, writeImage } from "@openartshield/node";
import { runEmbed } from "../src/commands/embed.js";
import { runAiAudit } from "../src/commands/ai-audit.js";
import { runCloakCommand } from "../src/commands/cloak.js";
import { runExtract } from "../src/commands/extract.js";
import { runAuditCommand } from "../src/commands/audit.js";
import { runCapacity } from "../src/commands/capacity.js";
import { runProtect, runProtectWorkflow } from "../src/commands/protect.js";
import { runVerify } from "../src/commands/verify.js";
import { getVersion, versionCommand } from "../src/commands/version.js";
import { buildCli } from "../src/index.js";
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

  it("parses a repeatable --compare-model option", () => {
    const cli = buildCli();
    cli.parse(
      [
        "node",
        "oas",
        "ai-audit",
        "a.png",
        "b.png",
        "--backend",
        "clip",
        "--compare-model",
        "model-a",
        "--compare-model",
        "model-b",
      ],
      { run: false },
    );
    expect(cli.options.compareModel).toEqual(["model-a", "model-b"]);
  });

  it("rejects --compare-model when the backend is not clip", async () => {
    await expect(
      runAiAudit({
        original: inputPath,
        candidate: inputPath,
        backend: "mock",
        compareModels: ["Xenova/clip-vit-base-patch16"],
      }),
    ).rejects.toThrow(/--compare-model requires --backend clip/);
  });

  it("fails clearly when --compare-model needs the missing optional dependency", async () => {
    await expect(
      runAiAudit({
        original: inputPath,
        candidate: inputPath,
        backend: "clip",
        compareModels: ["Xenova/clip-vit-base-patch16"],
      }),
    ).rejects.toThrow(/@huggingface\/transformers/);
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

describe("oas protect profiles", () => {
  it("fails clearly on an unknown profile", async () => {
    await expect(
      runProtectWorkflow({
        input: inputPath,
        message,
        seed: 1,
        out: join(dir, "x-profile.png"),
        profile: "balanced",
      }),
    ).rejects.toThrow(/Unknown protection profile "balanced"/);
  });

  it("defaults to creator-balanced with no cloak or ai-audit reports", async () => {
    const out = join(dir, "profile-default.png");
    const r = await runProtectWorkflow({
      input: inputPath,
      message,
      seed: 123,
      repetitions: 5,
      out,
      now: "2026-07-06T00:00:00.000Z",
    });
    expect(r.profile.name).toBe("creator-balanced");
    expect(r.cloak).toBeUndefined();
    expect(r.aiAudit).toBeUndefined();
    expect(r.verification).toBeUndefined();
    expect(await exists(out)).toBe(true);
    expect(await exists(join(dir, "profile-default.cloak.json"))).toBe(false);
    expect(await exists(join(dir, "profile-default.ai-audit.json"))).toBe(false);
  });

  it("trace-only verifies the output and generates no model reports", async () => {
    const out = join(dir, "profile-trace.png");
    const r = await runProtectWorkflow({
      input: inputPath,
      message,
      seed: 123,
      repetitions: 5,
      out,
      profile: "trace-only",
      now: "2026-07-06T00:00:00.000Z",
    });
    expect(r.profile.name).toBe("trace-only");
    expect(r.verification).toBeDefined();
    expect(r.verification?.checksumValid).toBe(true);
    expect(r.verification?.recoveredMessage).toBe(message);
    expect(r.cloak).toBeUndefined();
    expect(r.aiAudit).toBeUndefined();
    // Deterministic default bundle paths.
    expect(r.protect.jsonPath).toBe(join(dir, "profile-trace.audit.json"));
    expect(r.protect.sidecarPath).toBe(join(dir, "profile-trace.openartshield.json"));
    expect(await exists(join(dir, "profile-trace.cloak.json"))).toBe(false);
    expect(await exists(join(dir, "profile-trace.ai-audit.json"))).toBe(false);
  });

  it("creator-experimental orchestrates cloak + ai-audit and keeps the watermark verifiable", async () => {
    const out = join(dir, "profile-exp.png");
    const r = await runProtectWorkflow({
      input: inputPath,
      message,
      seed: 123,
      repetitions: 5,
      out,
      profile: "creator-experimental",
      backend: "mock",
      scoreModels: ["variant-a"],
      cloakStrength: 8,
      steps: 4,
      now: "2026-07-06T00:00:00.000Z",
    });

    expect(r.profile.name).toBe("creator-experimental");
    expect(r.cloak).toBeDefined();
    expect(r.cloak?.jsonPath).toBe(join(dir, "profile-exp.cloak.json"));
    expect(await exists(r.cloak!.jsonPath)).toBe(true);
    expect(r.cloak?.report.scoring.mode).toBe("multi-model");

    expect(r.aiAudit).toBeDefined();
    expect(r.aiAudit?.jsonPath).toBe(join(dir, "profile-exp.ai-audit.json"));
    expect(await exists(r.aiAudit!.jsonPath)).toBe(true);
    // Under the mock backend a near-invisible perturbation can round to ~0 drift;
    // the point here is that the measure layer ran and produced a real report.
    expect(r.aiAudit?.report.backend).toBe("mock");
    expect(r.aiAudit?.report.embedding.drift).toBeGreaterThanOrEqual(0);

    // The watermark is embedded after the cloak, so it must still verify.
    const v = await runVerify({ input: out, sidecar: r.protect.sidecarPath });
    expect(v.checksumValid).toBe(true);
    expect(v.recoveredMessage).toBe(message);
  });

  it("writes default HTML report paths when --html is boolean true", async () => {
    const out = join(dir, "profile-exp-html.png");
    const r = await runProtectWorkflow({
      input: inputPath,
      message,
      seed: 123,
      repetitions: 5,
      out,
      profile: "creator-experimental",
      backend: "mock",
      cloakStrength: 8,
      steps: 3,
      html: true,
      now: "2026-07-06T00:00:00.000Z",
    });
    expect(r.protect.htmlPath).toBe(join(dir, "profile-exp-html.audit.html"));
    expect(r.cloak?.htmlPath).toBe(join(dir, "profile-exp-html.cloak.html"));
    expect(r.aiAudit?.htmlPath).toBe(join(dir, "profile-exp-html.ai-audit.html"));
    expect(await exists(r.protect.htmlPath!)).toBe(true);
    expect(await exists(r.cloak!.htmlPath!)).toBe(true);
    expect(await exists(r.aiAudit!.htmlPath!)).toBe(true);
  });

  it("fails clearly when creator-experimental requests clip without the optional dependency", async () => {
    await expect(
      runProtectWorkflow({
        input: inputPath,
        message,
        seed: 1,
        out: join(dir, "x-clip.png"),
        profile: "creator-experimental",
        backend: "clip",
        steps: 1,
      }),
    ).rejects.toThrow(/@huggingface\/transformers/);
  });

  it("parses --profile, repeatable model flags, and boolean --html", () => {
    const cli = buildCli();
    cli.parse(
      [
        "node",
        "oas",
        "protect",
        "a.png",
        "--profile",
        "creator-experimental",
        "--message",
        "m",
        "--seed",
        "1",
        "--out",
        "b.png",
        "--score-model",
        "model-a",
        "--compare-model",
        "model-b",
        "--html",
      ],
      { run: false },
    );
    expect(cli.options.profile).toBe("creator-experimental");
    expect(cli.options.scoreModel).toBe("model-a");
    expect(cli.options.compareModel).toBe("model-b");
    expect(cli.options.html).toBe(true);
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

describe("oas cloak", () => {
  it("writes a cloaked image + report when a candidate improves (mock backend)", async () => {
    const out = join(dir, "cloaked.png");
    const reportPath = join(dir, "cloak.json");
    const htmlPath = join(dir, "cloak.html");
    const { report, wroteImage } = await runCloakCommand({
      input: inputPath,
      out,
      backend: "mock",
      strength: 8,
      steps: 8,
      minPsnr: 20,
      maxSsimDrop: 0.5,
      report: reportPath,
      html: htmlPath,
    });

    expect(wroteImage).toBe(true);
    expect(report.result.improved).toBe(true);
    expect(await exists(out)).toBe(true);

    const onDisk = JSON.parse(await readFile(reportPath, "utf-8"));
    expect(onDisk.version).toBe("0.4.0");
    expect(Array.isArray(onDisk.limitations)).toBe(true);
    // Default run uses EOT mode "none" (clean-only scoring).
    expect(onDisk.eot.mode).toBe("none");
    // And single-model scoring (no --score-model given).
    expect(onDisk.scoring.mode).toBe("single-model");
    expect(onDisk.scoring.scoreModels).toEqual([]);
    expect(onDisk.eot.transforms).toEqual(["clean"]);
    expect((await readFile(htmlPath, "utf-8")).startsWith("<!doctype html>")).toBe(true);
  });

  it("eot mild scores candidates through the expected transforms", async () => {
    const { report } = await runCloakCommand({
      input: inputPath,
      out: join(dir, "cloaked-mild.png"),
      backend: "mock",
      strength: 8,
      steps: 3,
      minPsnr: 20,
      maxSsimDrop: 0.5,
      eot: "mild",
    });
    expect(report.eot.mode).toBe("mild");
    expect(report.eot.transforms).toEqual([
      "clean",
      "jpeg_quality_95",
      "jpeg_quality_85",
      "brightness_0_9",
      "brightness_1_1",
      "gaussian_blur_0_75",
    ]);
    expect(report.eot.embeddingEvaluations).toBeGreaterThan(0);
  });

  it("eot standard scores candidates through the expected transforms", async () => {
    const { report } = await runCloakCommand({
      input: inputPath,
      out: join(dir, "cloaked-standard.png"),
      backend: "mock",
      strength: 8,
      steps: 2,
      minPsnr: 20,
      maxSsimDrop: 0.5,
      eot: "standard",
    });
    expect(report.eot.mode).toBe("standard");
    expect(report.eot.transforms).toEqual([
      "clean",
      "jpeg_quality_95",
      "jpeg_quality_85",
      "jpeg_quality_70",
      "resize_75",
      "brightness_0_9",
      "brightness_1_1",
      "contrast_0_9",
      "contrast_1_1",
      "gaussian_blur_0_75",
      "screenshot_simulation",
    ]);
  });

  it("runs the greedy optimizer and records it in the report", async () => {
    const { report } = await runCloakCommand({
      input: inputPath,
      out: join(dir, "cloaked-greedy.png"),
      backend: "mock",
      optimizer: "greedy",
      strength: 8,
      steps: 6,
      minPsnr: 20,
      maxSsimDrop: 0.5,
    });
    expect(report.parameters.optimizer).toBe("greedy");
    expect(report.result.acceptedImprovements).toBeGreaterThanOrEqual(1);
  });

  it("fails clearly on an unknown optimizer", async () => {
    await expect(
      runCloakCommand({
        input: inputPath,
        out: join(dir, "cloaked-bad-opt.png"),
        backend: "mock",
        optimizer: "annealing",
        steps: 1,
      }),
    ).rejects.toThrow(/Unknown cloak optimizer "annealing"/);
  });

  it("fails clearly on an unknown eot mode", async () => {
    await expect(
      runCloakCommand({
        input: inputPath,
        out: join(dir, "cloaked-bad-eot.png"),
        backend: "mock",
        steps: 1,
        eot: "wild",
      }),
    ).rejects.toThrow(/Unknown EOT mode "wild"/);
  });

  it("does not write an image when nothing improves, but still writes the report", async () => {
    const out = join(dir, "cloaked-noimprove.png");
    const reportPath = join(dir, "cloak-noimprove.json");
    const { report, wroteImage } = await runCloakCommand({
      input: inputPath,
      out,
      backend: "mock",
      strength: 0, // identical candidates => no drift improvement
      steps: 3,
      report: reportPath,
    });

    expect(wroteImage).toBe(false);
    expect(report.result.improved).toBe(false);
    expect(await exists(out)).toBe(false);
    expect(await exists(reportPath)).toBe(true);
  });

  it("fails clearly when --backend clip is selected but the optional dep is missing", async () => {
    await expect(
      runCloakCommand({ input: inputPath, out: join(dir, "x.png"), backend: "clip", steps: 1 }),
    ).rejects.toThrow(/@huggingface\/transformers/);
  });

  it("parses a repeatable --score-model option", () => {
    const cli = buildCli();
    cli.parse(
      [
        "node",
        "oas",
        "cloak",
        "a.png",
        "--out",
        "b.png",
        "--score-model",
        "model-a",
        "--score-model",
        "model-b",
      ],
      { run: false },
    );
    expect(cli.options.scoreModel).toEqual(["model-a", "model-b"]);
  });

  it("scores across deterministic mock variants with --score-model (mock backend)", async () => {
    const out = join(dir, "cloaked-multimodel.png");
    const reportPath = join(dir, "cloak-multimodel.json");
    const { report, wroteImage } = await runCloakCommand({
      input: inputPath,
      out,
      backend: "mock",
      scoreModels: ["variant-a", "variant-b"],
      strength: 8,
      steps: 4,
      minPsnr: 20,
      maxSsimDrop: 0.5,
      report: reportPath,
    });

    expect(wroteImage).toBe(true);
    expect(report.scoring.mode).toBe("multi-model");
    expect(report.scoring.primaryModel).toBe("mock");
    // Mock variants keep their mock: prefix so they are never mistaken for real models.
    expect(report.scoring.scoreModels).toEqual(["mock:variant-a", "mock:variant-b"]);
    expect(report.scoring.models).toHaveLength(3);
    expect(report.scoring.aggregateAverageDrift).toBeGreaterThan(0);
    expect(report.scoring.aggregateMinModelDrift).toBeGreaterThan(0);
    expect(report.scoring.aggregateMinModelDrift).toBeLessThanOrEqual(
      report.scoring.aggregateAverageDrift,
    );

    const onDisk = JSON.parse(await readFile(reportPath, "utf-8"));
    expect(onDisk.scoring.mode).toBe("multi-model");
  });

  it("does not write an image when multi-model scoring finds no improvement", async () => {
    const out = join(dir, "cloaked-multimodel-noimprove.png");
    const { report, wroteImage } = await runCloakCommand({
      input: inputPath,
      out,
      backend: "mock",
      scoreModels: ["variant-a"],
      strength: 0, // identical candidates => zero drift on every model
      steps: 3,
    });
    expect(wroteImage).toBe(false);
    expect(report.result.improved).toBe(false);
    expect(await exists(out)).toBe(false);
  });

  it("fails clearly when --score-model needs the missing optional dependency (clip)", async () => {
    await expect(
      runCloakCommand({
        input: inputPath,
        out: join(dir, "x2.png"),
        backend: "clip",
        scoreModels: ["Xenova/clip-vit-base-patch16"],
        steps: 1,
      }),
    ).rejects.toThrow(/@huggingface\/transformers/);
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
