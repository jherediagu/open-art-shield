// Generates examples/cloak-eot/images/original.png: a deterministic, procedurally
// drawn image used as the subject for the experimental cloak EOT demo. It is
// CC0 / self-owned - no third-party or copyrighted artwork. We never cloak art we
// don't own; demoing "do not train on this" on someone else's work would be
// contradictory.
//
// Requires a prior `pnpm build` (it imports the built packages). Run from the
// repo root:
//
//   node examples/cloak-eot/commands/generate-original.mjs
//
// Importing the dist via relative paths means `sharp` resolves under
// packages/node, so this works without any root-level dependency on sharp.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPixelImage } from "../../../packages/core/dist/index.js";
import { writeImage } from "../../../packages/node/dist/index.js";

const WIDTH = 512;
const HEIGHT = 512;

// Same Mulberry32 the SDK uses, so the grain is reproducible.
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp8(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function build() {
  const rng = makeRng(20260630);
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 3);

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 3;
      const u = x / WIDTH;
      const v = y / HEIGHT;

      // Cool-to-warm vertical gradient base (a different look from the watermark
      // example, so the two demos are visually distinct).
      let r = 40 + 120 * v + 40 * u;
      let g = 70 + 90 * v;
      let b = 170 - 90 * v + 30 * u;

      // Two soft radial glows for low-frequency structure.
      const dx1 = x - WIDTH * 0.66;
      const dy1 = y - HEIGHT * 0.28;
      const glow1 = Math.exp(-(dx1 * dx1 + dy1 * dy1) / (2 * 110 * 110));
      const dx2 = x - WIDTH * 0.3;
      const dy2 = y - HEIGHT * 0.72;
      const glow2 = Math.exp(-(dx2 * dx2 + dy2 * dy2) / (2 * 90 * 90));
      r += 110 * glow1 + 30 * glow2;
      g += 80 * glow1 + 70 * glow2;
      b += 20 * glow1 + 90 * glow2;

      // Concentric ring banding for mid-frequency detail (good watermark subject).
      const cx = x - WIDTH * 0.5;
      const cy = y - HEIGHT * 0.5;
      const radius = Math.sqrt(cx * cx + cy * cy);
      const rings = Math.sin(radius / 14) * 12 + Math.sin((x + y) / 23) * 6;
      r += rings;
      g += rings;
      b += rings;

      // A lighter tilted "subject" band across the middle.
      const tilt = y - (0.5 * x + HEIGHT * 0.18);
      if (tilt > 0 && tilt < HEIGHT * 0.16) {
        r = r * 0.85 + 60;
        g = g * 0.85 + 55;
        b = b * 0.85 + 40;
      }

      // Film grain.
      const grain = (rng() - 0.5) * 20;

      data[i] = clamp8(r + grain);
      data[i + 1] = clamp8(g + grain);
      data[i + 2] = clamp8(b + grain);
    }
  }

  return createPixelImage(WIDTH, HEIGHT, 3, data);
}

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "images", "original.png");
await writeImage(build(), out);
console.log(`Wrote ${out} (${WIDTH}x${HEIGHT})`);
