#!/usr/bin/env node
// Reproducible protection benchmark: protections x conditions x metrics.
//
// This is the CopyrightMeter-style posture from roadmap.md v1.0, scoped to
// what the repo ships: each protection embeds a fixed payload into a fixed,
// seeded synthetic image set, every transform/attack in the suites runs over
// it, and we report what survived. Deterministic by construction - same
// inputs, same numbers - so the output is a citable, regenerable table
// instead of a marketing claim.
//
// Usage:  node scripts/benchmark.mjs [--out-dir docs/benchmarks]
//
// TrustMark rows need the optional 'onnxruntime-node' dependency (the CI
// benchmark workflow installs it); without it the script benchmarks the DCT
// baseline only and says so in the output.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

const core = await import("../packages/core/dist/index.js");
const node = await import("../packages/node/dist/index.js");

const { values: args } = parseArgs({
  options: {
    "out-dir": { type: "string", default: "docs/benchmarks" },
  },
});

const MESSAGE = "oas-demo";
const WIDTH = 512;
const HEIGHT = 384;
const SEED = 123;

// --- Fixed image set --------------------------------------------------------
// Three textures chosen to expose content dependence: classical schemes love
// noise and hate smooth gradients; learned schemes care much less.

function mulberry(seedValue) {
  let state = seedValue >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function naturalImage() {
  const rand = mulberry(1234567);
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const base = (y * WIDTH + x) * 3;
      const gradient = ((x + y) / (WIDTH + HEIGHT)) * 200 + 20;
      const noise = (rand() - 0.5) * 30;
      let r = gradient + noise;
      let g = gradient * 0.8 + noise + 30;
      let b = gradient * 0.6 + noise + 60;
      if ((x - WIDTH / 3) ** 2 + (y - HEIGHT / 3) ** 2 < (WIDTH / 6) ** 2) {
        r += 40;
        g -= 20;
      }
      if (x > WIDTH * 0.6 && x < WIDTH * 0.85 && y > HEIGHT * 0.55 && y < HEIGHT * 0.8) {
        b += 50;
        r -= 10;
      }
      data[base] = r;
      data[base + 1] = g;
      data[base + 2] = b;
    }
  }
  return { width: WIDTH, height: HEIGHT, channels: 3, data };
}

function noisyImage() {
  const rand = mulberry(4242);
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 3);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.floor(((i / 3) % 191) * 0.55 + rand() * 128);
  }
  return { width: WIDTH, height: HEIGHT, channels: 3, data };
}

function smoothImage() {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const base = (y * WIDTH + x) * 3;
      data[base] = 30 + (x / WIDTH) * 180;
      data[base + 1] = 60 + (y / HEIGHT) * 140;
      data[base + 2] = 120 + ((x + y) / (WIDTH + HEIGHT)) * 90;
    }
  }
  return { width: WIDTH, height: HEIGHT, channels: 3, data };
}

const IMAGES = [
  { name: "natural-like", image: naturalImage() },
  { name: "high-noise", image: noisyImage() },
  { name: "smooth-gradient", image: smoothImage() },
];

// --- Protections ------------------------------------------------------------

function dctProtection(strength) {
  return {
    name: `dct-s${strength}`,
    kind: "classical DCT",
    async embed(image) {
      const { image: protectedImage } = core.embedWatermark(image, {
        message: MESSAGE,
        seed: SEED,
        strength,
        repetitions: 5,
      });
      return protectedImage;
    },
    async recovered(image) {
      const result = core.extractWatermark(image, {
        seed: SEED,
        messageLength: core.messageByteLength(MESSAGE),
        repetitions: 5,
      });
      return result.checksumValid === true && result.recoveredMessage === MESSAGE;
    },
  };
}

function trustmarkProtection() {
  const tm = node.createTrustmark();
  return {
    name: "trustmark-Q",
    kind: "learned (TrustMark, BCH_5)",
    async embed(image) {
      return tm.embedText(image, MESSAGE);
    },
    async recovered(image) {
      const decoded = await tm.decodeText(image);
      return decoded !== null && decoded.text === MESSAGE;
    },
  };
}

async function trustmarkAvailable() {
  try {
    await node.createTrustmark().decodeBits(IMAGES[0].image);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("onnxruntime-node")) return false;
    throw error;
  }
}

// --- Run --------------------------------------------------------------------

const protections = [dctProtection(8), dctProtection(16)];
const hasTrustmark = await trustmarkAvailable();
if (hasTrustmark) {
  protections.push(trustmarkProtection());
} else {
  process.stderr.write(
    "note: 'onnxruntime-node' not installed - benchmarking the DCT baseline only.\n",
  );
}

const conditions = [
  { name: "identity", apply: async (image) => image },
  ...node.defaultTransforms,
  ...node.defaultAttacks,
];

const rows = [];
for (const protection of protections) {
  for (const { name: imageName, image } of IMAGES) {
    const stamped = await protection.embed(image);
    const quality = {
      psnr: Number(core.psnr(image, stamped).toFixed(2)),
      ssim: Number(core.ssim(image, stamped).toFixed(4)),
    };
    const conditionResults = {};
    for (const condition of conditions) {
      const transformed = await condition.apply(stamped);
      conditionResults[condition.name] = await protection.recovered(transformed);
    }
    rows.push({
      protection: protection.name,
      kind: protection.kind,
      image: imageName,
      quality,
      conditions: conditionResults,
    });
    process.stderr.write(`${protection.name} / ${imageName} done\n`);
  }
}

// --- Report -----------------------------------------------------------------

const conditionNames = conditions.map((c) => c.name);

function survivalCount(row) {
  return conditionNames.filter((name) => row.conditions[name]).length;
}

const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  method: {
    message: MESSAGE,
    seed: SEED,
    imageSize: `${WIDTH}x${HEIGHT}`,
    images: IMAGES.map((i) => i.name),
    conditions: conditionNames,
    note:
      "Deterministic synthetic images (seeds in scripts/benchmark.mjs). " +
      "Survival = exact payload recovery after the condition. " +
      "This measures robustness to common transforms and published removal attacks, " +
      "NOT resistance to a dedicated adversary (WAVES-class attacks remove any watermark).",
  },
  trustmarkIncluded: hasTrustmark,
  rows,
};

let md = "# Protection benchmark\n\n";
md += `Generated by \`node scripts/benchmark.mjs\` - deterministic inputs, regenerable output.\n`;
md += `Survival = exact payload recovery. **This is robustness to common transforms and\n`;
md += `published removal attacks, not resistance to a dedicated adversary.**\n\n`;
md += "## Summary\n\n";
md += "| Protection | Image | PSNR (dB) | SSIM | Survived |\n|---|---|---:|---:|---:|\n";
for (const row of rows) {
  md += `| ${row.protection} | ${row.image} | ${row.quality.psnr} | ${row.quality.ssim} | ${survivalCount(row)}/${conditionNames.length} |\n`;
}
md += "\n## Per-condition results\n\n";
md += `| Condition | ${rows.map((r) => `${r.protection}<br>${r.image}`).join(" | ")} |\n`;
md += `|---|${rows.map(() => "---").join("|")}|\n`;
for (const name of conditionNames) {
  md += `| ${name} | ${rows.map((r) => (r.conditions[name] ? "yes" : "**no**")).join(" | ")} |\n`;
}
if (!hasTrustmark) {
  md += "\n> TrustMark rows are missing: 'onnxruntime-node' was not installed for this run.\n";
}

const outDir = args["out-dir"];
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(join(outDir, "latest.md"), md, "utf8");
process.stderr.write(`written: ${join(outDir, "latest.json")}, ${join(outDir, "latest.md")}\n`);
// Print the markdown on stdout so CI can pipe it into the job summary.
process.stdout.write(md);
