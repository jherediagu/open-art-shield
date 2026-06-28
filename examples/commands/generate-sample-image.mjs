// Generates examples/images/sample-original.png: a deterministic, procedurally
// drawn image with enough texture (gradients, shapes, film-like grain) to be a
// realistic watermarking subject. It is CC0 / self-owned - no third-party art.
//
// Requires a prior `pnpm build` (it imports the built packages). Run from the
// repo root:
//
//   node examples/commands/generate-sample-image.mjs
//
// Importing the dist via relative paths means `sharp` resolves under
// packages/node, so this works without any root-level dependency on sharp.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPixelImage } from "../../packages/core/dist/index.js";
import { writeImage } from "../../packages/node/dist/index.js";

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
  const rng = makeRng(20240607);
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 3);

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 3;
      const u = x / WIDTH;
      const v = y / HEIGHT;

      // Warm-to-cool diagonal gradient base.
      let r = 60 + 150 * u;
      let g = 80 + 120 * v;
      let b = 150 - 80 * u + 40 * v;

      // A soft "sun" glow in the upper-left third.
      const dx = x - WIDTH * 0.32;
      const dy = y - HEIGHT * 0.3;
      const glow = Math.exp(-(dx * dx + dy * dy) / (2 * 120 * 120));
      r += 90 * glow;
      g += 70 * glow;
      b += 30 * glow;

      // Gentle diagonal banding for mid-frequency structure.
      const band = Math.sin((x + y) / 18) * 10 + Math.sin((x - y) / 31) * 6;
      r += band;
      g += band;
      b += band;

      // A darker rounded rectangle "subject" lower-right.
      if (x > WIDTH * 0.55 && x < WIDTH * 0.9 && y > HEIGHT * 0.58 && y < HEIGHT * 0.88) {
        r *= 0.6;
        g *= 0.62;
        b *= 0.7;
      }

      // Film grain.
      const grain = (rng() - 0.5) * 22;

      data[i] = clamp8(r + grain);
      data[i + 1] = clamp8(g + grain);
      data[i + 2] = clamp8(b + grain);
    }
  }

  return createPixelImage(WIDTH, HEIGHT, 3, data);
}

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "images", "sample-original.png");
await writeImage(build(), out);
console.log(`Wrote ${out} (${WIDTH}x${HEIGHT})`);
