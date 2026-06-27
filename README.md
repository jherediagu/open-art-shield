# OpenArtShield

> An experimental TypeScript SDK for measuring practical image protection techniques under real-world transformations.

OpenArtShield is a TypeScript-first, open-source SDK and CLI for experimenting with practical image protection workflows: invisible watermarking, robustness benchmarking, and reproducible image-transformation audits. It is built to help you **measure** how a protection technique survives realistic degradations - JPEG compression, resizing, cropping, blur, color changes, and screenshot-like re-uploads - rather than to make grand claims about defeating AI.

**OpenArtShield does not make images AI-proof.**

**v0.1 is focused on invisible watermarking and robustness audits.**

**All results should be interpreted as experimental.**

> **Status:** early/experimental (v0.1). I started this because most "protect your
> art from AI" tooling either overpromises or gives you no way to actually check
> whether it works. So this leans the other way: small, honest, and measurable.
> Expect rough edges and breaking changes between 0.x releases.

---

## What this project is

- A **composable SDK** for embedding and extracting invisible, DCT-based watermarks.
- A **robustness harness** that applies deterministic image transformations and measures how well a watermark survives them.
- A **reproducible audit tool** that produces machine-readable JSON reports.
- A clean, **TypeScript-first** monorepo with a pure core, a Node image-IO layer, and a CLI.

## What this project is _not_

- It is **not** a tool that prevents AI models from understanding, copying, or training on images.
- It does **not** implement Glaze, Nightshade, C2PA signing, CLIP evaluation, diffusion-model attacks, or adversarial perturbation baselines.
- It does **not** guarantee that a watermark survives any particular transformation - measuring that is precisely the point.
- It makes **no security or legal guarantees**. A watermark is a signal, not a lock.

---

## Research context

OpenArtShield is inspired by ongoing research and debate around artist protection, adversarial perturbations, data poisoning, content provenance, and robust watermarking. If you are exploring this space, these works and areas are essential reading:

- **Glaze: Protecting Artists from Style Mimicry by Text-to-Image Models** - style-cloaking via adversarial perturbations.
- **Nightshade: Prompt-Specific Poisoning Attacks on Text-to-Image Generative Models** - poisoning the training signal itself.
- **Adversarial Perturbations Cannot Reliably Protect Artists From Generative AI** - a sobering analysis of the limits of perturbation-based protection.
- **C2PA / Content Credentials** - cryptographically signed provenance metadata for media.
- Classical robust watermarking literature using **DCT**, **DWT**, and **SVD** techniques.

This research informs OpenArtShield's _honest framing_: perturbation- and watermark-based protections are an arms race, and their value lies in being measured, not assumed.

**Important:** OpenArtShield v0.1 does **not** implement any of the above. v0.1 only provides the foundation:

- DCT-based invisible watermarking,
- attack/transform simulation,
- recovery metrics,
- quality metrics,
- JSON audit reports,
- a TypeScript SDK,
- Node image IO,
- an npm CLI,
- tests and CI.

**Future versions may explore CLIP/OpenCLIP embedding drift, adversarial perturbation baselines, C2PA provenance, and diffusion-model evaluation.**

---

## Installation

OpenArtShield is a pnpm monorepo. To work on it locally:

```bash
git clone https://github.com/jherediagu/open-art-shield.git
cd open-art-shield
pnpm install
pnpm build
```

The published packages (once released) will be installable individually:

```bash
# SDK only (pure, no image IO)
npm install @openartshield/core

# SDK + Node image IO and transforms
npm install @openartshield/node

# CLI
npm install -g @openartshield/cli
```

> The Node and CLI packages depend on [`sharp`](https://sharp.pixelplumbing.com/) for image decoding/encoding and transformations.

---

## CLI usage

The CLI binary is `oas`.

### Embed a watermark

```bash
oas embed input.png \
  --message "artist=demo;license=no-ai-training" \
  --seed 123 \
  --strength 8 \
  --repetitions 5 \
  --out protected.png
```

### Extract a watermark

`--message-length` is the **UTF-8 byte length** of the original message.

```bash
oas extract protected.png \
  --seed 123 \
  --message-length 34 \
  --repetitions 5
```

### Audit robustness

Embeds the watermark, then runs the full transform suite and writes a JSON report:

```bash
oas audit input.png \
  --message "artist=demo;license=no-ai-training" \
  --seed 123 \
  --strength 8 \
  --repetitions 5 \
  --out report.json
```

### Estimate capacity

The watermark stores one bit per 8x8 block, so capacity is `blocks / repetitions`.
Check whether a message fits before embedding:

```bash
oas capacity input.png \
  --message "artist=demo;license=no-ai-training" \
  --repetitions 5
```

```txt
Image: 384x384
Blocks: 2304
Message bytes: 34
Checksum bytes: 4
Payload bits: 304
Repetitions: 5
Required blocks: 1520
Available blocks: 2304
Capacity: OK
Max message bytes (at 5x repetitions): 53
```

### Print the version

```bash
oas version
```

Run `oas <command> --help` for the full option list.

---

## SDK usage

### Pure core (`@openartshield/core`)

```ts
import {
  embedWatermark,
  extractWatermark,
  type WatermarkConfig,
  type PixelImage,
} from "@openartshield/core";

const config: WatermarkConfig = {
  message: "artist=demo;license=no-ai-training",
  seed: 123,
  strength: 8,
  repetitions: 5,
};

// `image` is a raw PixelImage you supply (e.g. from @openartshield/node).
const { image: protectedImage } = embedWatermark(image, config);

const extraction = extractWatermark(protectedImage, {
  seed: 123,
  messageLength: config.message.length, // UTF-8 byte length
  repetitions: 5,
});

console.log(extraction.recoveredMessage); // "artist=demo;license=no-ai-training"
console.log(extraction.checksumValid); // true
```

### With Node image IO (`@openartshield/node`)

```ts
import { embedWatermark } from "@openartshield/core";
import { readImage, writeImage } from "@openartshield/node";

const image = await readImage("input.png");

const { image: protectedImage } = embedWatermark(image, {
  message: "artist=demo;license=no-ai-training",
  seed: 123,
  strength: 8,
  repetitions: 5,
});

await writeImage(protectedImage, "protected.png");
```

### Running an audit programmatically

```ts
import { readImage, embedAndAudit } from "@openartshield/node";
import { serializeReport } from "@openartshield/core";

const image = await readImage("input.png");
const { report } = await embedAndAudit(image, {
  message: "artist=demo;license=no-ai-training",
  seed: 123,
  strength: 8,
  repetitions: 5,
});

console.log(serializeReport(report));
```

---

## Example audit report

A report produced by `oas audit` on a 384x384 textured image (truncated for brevity). Note the honest mix of successes and failures - that is the signal this tool exists to surface.

```json
{
  "version": "0.1.0",
  "image": {
    "path": "input.png",
    "width": 384,
    "height": 384,
    "channels": 3
  },
  "watermark": {
    "expectedMessage": "artist=demo;license=no-ai-training",
    "seed": 123,
    "strength": 8,
    "repetitions": 5
  },
  "results": [
    {
      "transform": "identity",
      "recoveredMessage": "artist=demo;license=no-ai-training",
      "messageRecovered": true,
      "checksumValid": true,
      "bitAccuracy": 1,
      "psnr": null,
      "ssim": 1
    },
    {
      "transform": "jpeg_quality_85",
      "recoveredMessage": "artist=demo;license=no-ai-training",
      "messageRecovered": true,
      "checksumValid": true,
      "bitAccuracy": 0.99,
      "psnr": 41.7,
      "ssim": 0.99
    },
    {
      "transform": "resize_50",
      "recoveredMessage": null,
      "messageRecovered": false,
      "checksumValid": false,
      "bitAccuracy": 0.74,
      "psnr": 30.2,
      "ssim": 0.95
    }
  ],
  "summary": {
    "totalTransforms": 14,
    "successfulRecoveries": 8,
    "averageBitAccuracy": 0.94
  }
}
```

---

## Architecture

OpenArtShield separates **pure SDK logic** from **Node-specific image IO** and **CLI logic**:

```
@openartshield/core   ->  pure TypeScript: watermarking, payload, metrics, audit primitives
        ^
        | consumes
@openartshield/node   ->  sharp-based image IO + real-world transforms
        ^
        | consumes
@openartshield/cli    ->  the `oas` binary
```

- The **core** package has no filesystem access, no Node-specific APIs, and no `sharp` dependency. It operates on raw `PixelImage` data and is fully deterministic and testable in isolation.
- The **node** package converts image files to/from `PixelImage`, and implements deterministic transformation simulations.
- The **cli** package wires the two together behind a clean command-line interface.

### The watermark (v0.1)

A simple, readable DCT-based invisible watermark:

1. Convert RGB to a **luminance** plane (Rec. 601).
2. Split luminance into **8x8 blocks**.
3. Select blocks with a **deterministic seeded PRNG**.
4. Encode each bit by adjusting the **relative magnitude of two mid-frequency DCT coefficients**.
5. Decode by comparing those same coefficients.
6. Apply **repetition coding with majority vote** for basic error correction.
7. Include a **CRC-32 checksum** to detect corrupted extractions.

The payload pipeline:

```
message -> UTF-8 bytes -> + CRC-32 checksum -> bits -> repetition coding -> DCT embedding
```

and in reverse on extraction:

```
DCT coefficient comparison -> repeated bits -> majority vote -> bytes -> checksum validation -> message
```

> **Capacity note:** the watermark stores one payload bit per 8x8 block, so capacity is `blocks / repetitions`. A 34-byte message with a 4-byte checksum at 5x repetition needs 1,520 blocks (~312x312 px minimum). Larger images and shorter messages give comfortable headroom.

---

## Package overview

| Package                                | Description                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [`@openartshield/core`](packages/core) | Pure SDK: `PixelImage`, DCT, payload encoding, watermark embed/extract, PSNR/SSIM, audit primitives. No IO. |
| [`@openartshield/node`](packages/node) | Node image IO (PNG/JPEG/WebP via `sharp`) and deterministic transform simulations.                          |
| [`@openartshield/cli`](packages/cli)   | The `oas` command-line interface: `embed`, `extract`, `audit`, `version`.                                   |

### Built-in transforms

`jpeg_quality_95`, `jpeg_quality_85`, `jpeg_quality_70`, `resize_75`, `resize_50`, `center_crop_90`, `gaussian_blur_0_75`, `gaussian_blur_1_25`, `brightness_0_9`, `brightness_1_1`, `contrast_0_9`, `contrast_1_1`, `screenshot_simulation` (plus an automatic `identity` baseline).

---

## Roadmap

### v0.1

- TypeScript SDK
- DCT invisible watermarking
- payload encoding with checksum
- repetition coding
- attack simulation pipeline
- JSON audit reports
- npm CLI
- tests and CI

### v0.2

- HTML visual reports
- stronger DWT/DCT/SVD watermarking baselines
- perceptual difference maps
- configurable attack pipelines

### v0.3

- CLIP/OpenCLIP embedding drift metrics
- image-text similarity tests
- semantic robustness evaluation

### v0.4

- C2PA / Content Credentials experimental module
- signed provenance metadata
- machine-readable license assertions

### v0.5

- adversarial perturbation baselines inspired by Glaze/Mist-style research
- diffusion-model evaluation harness
- benchmark datasets

---

## Limitations

- The v0.1 watermark is a **classical, intentionally simple** DCT scheme. It is robust to mild JPEG and color changes but is **not** designed to survive heavy resizing, cropping, or aggressive re-encoding - and the audit will show you exactly where it breaks.
- Capacity is limited (one bit per 8x8 block before repetition coding).
- PSNR/SSIM are computed only when a transform preserves dimensions.
- Nothing here resists a motivated adversary, removal tools, or generative models. **It is a measurement tool, not a defense.**
- All results are experimental and depend heavily on image content, size, and parameters.

---

## Contributing

Contributions are welcome. To get started:

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm format:check
```

Please keep the core package pure (no filesystem or Node-specific APIs), add tests for new behavior, and run the full check suite before opening a pull request. Discussions about new watermarking baselines, transforms, and metrics are especially welcome - but please keep claims honest and grounded in measurement.

---

## License

[Apache-2.0](LICENSE) (c) OpenArtShield contributors.
