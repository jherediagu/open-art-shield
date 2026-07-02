# Architecture overview

OpenArtShield is a small pnpm monorepo with three packages and strict, one-way
dependencies. The design goal is that the interesting logic stays **pure and
testable**, image IO and heavy/optional dependencies stay at the edges, and the
CLI is a thin wiring layer.

## Package diagram

```txt
CLI
 │
 ├── protect / verify / audit / ai-audit / cloak / embed / extract / capacity
 │
@openartshield/node
 │
 ├── image IO (PNG/JPEG/WebP via sharp)
 ├── transforms (JPEG, resize, crop, blur, brightness/contrast, screenshot)
 └── optional CLIP backend (transformers.js)
 │
@openartshield/core
 ├── watermarking (DCT embed/extract)
 ├── payload encoding (UTF-8 + CRC-32 + repetition coding)
 ├── metrics (PSNR / SSIM / bit accuracy)
 ├── embedding audit (cosine / drift)
 ├── cloak runner (search + EOT scoring)
 └── report rendering (JSON + HTML)
```

Dependencies flow one way only: `cli → node → core`. `core` depends on nothing in
the workspace and has no Node or `sharp` dependency.

## Data flows

### `oas protect`

One-shot Trace + Audit. Everything except read/write is pure.

```txt
input image ──(node: readImage)──► PixelImage
   │
   ├─ core: capacity check (does the message fit?)
   ├─ core: embed watermark (DCT on luminance blocks)
   ├─ node: run transform suite ─► core: extract + metrics per transform
   │
   └─ outputs:
        protected.png            (node: writeImage)
        protected.audit.json     (core: serializeReport)
        protected.audit.html     (core: renderHtmlReport)   [--html]
        protected.openartshield.json  (core: buildSidecar)  [sidecar]
```

### `oas ai-audit`

Measure how a model's view of two images differs, and whether that difference
survives transforms.

```txt
original, candidate ──(node: readImage ×2)──► PixelImage ×2
   │
   ├─ backend.embedImage(original), backend.embedImage(candidate)
   ├─ core: cosineSimilarity / drift between the two embeddings
   ├─ node: transform candidate ─► backend.embedImage ─► core: drift  (per transform)
   │
   └─ outputs: ai-audit.json / ai-audit.html
```

The `backend` is either the deterministic `mock` (in `core`) or the optional CLIP
backend (in `node`). The runner only depends on the `EmbeddingBackend` interface.

### `oas cloak`

Experimental embedding-space perturbation with optional EOT scoring.

```txt
input image ──(node: readImage)──► PixelImage
   │
   ├─ backend.embedImage(original)                         (baseline embedding)
   │
   ├─ for each step:
   │     core: bounded-noise candidate (seeded, deterministic)
   │     core: PSNR/SSIM guardrail ── reject if too damaging (before any embedding)
   │     score = mean embedding drift over [clean, ...EOT transforms of candidate]
   │     keep candidate if its score beats the best so far
   │
   ├─ post-hoc: measure the winner's drift across the full transform suite
   │
   └─ outputs (only writes an image if a candidate actually improved):
        cloaked.png
        cloak-report.json / cloak-report.html   (includes the EOT summary)
```

EOT transforms come from `node` (they need real codecs); the runner in `core`
receives them behind the same `ImageTransform` interface used by the audit, so
`core` never imports `sharp`.

## Design decisions

### Why `core` stays pure

- No filesystem, no Node APIs, no `sharp`. It operates on raw `PixelImage`
  buffers, so it is deterministic and unit-testable in isolation, and it could run
  in a browser or worker unchanged.
- IO and codecs are injected from `node` (image read/write, transforms) or passed
  in as interfaces (`EmbeddingBackend`, `ImageTransform`). The algorithms never
  reach out to the world.

### Why CLIP is optional

- The real CLIP backend pulls in `@huggingface/transformers` and ONNX runtime plus
  model weights — heavy, and unnecessary for most of the pipeline.
- It is loaded via a lazy dynamic `import()` inside `node`, and is **not** a
  declared dependency. If it is missing, the CLI fails with a clear message only
  when you actually ask for `--backend clip`.
- A deterministic `mock` backend implements the same interface, so tests and CI
  run the full pipeline without any model download or network access.

### Why reports are JSON + HTML

- **JSON** is the source of truth: machine-readable, diffable, and easy to assert
  against in tests. Every number in the docs comes from a real JSON report.
- **HTML** is a standalone, self-contained view of the same data for humans — no
  server, no assets, just open the file. The JSON and HTML are rendered from the
  same report object, so they never drift apart.

## Future extension points

The interfaces are the seams where new work plugs in without touching callers:

- **`WatermarkAlgorithm`-style baselines** — additional watermarking schemes
  (DWT/SVD, spread-spectrum) behind a shared interface, compared with the same
  audit harness.
- **`EmbeddingBackend`** — other perceptual models (OpenCLIP, DINO, etc.) drop in
  behind the same two methods the `mock` and CLIP backends already implement.
- **`ImageTransform`** — new attack simulations extend both the audit suite and
  the cloak EOT sets.
- **Declare layer** — provenance / license metadata built on the existing sidecar,
  and later C2PA experiments.
- **Cloak optimizer** — the current seeded random search can be replaced with a
  real optimizer behind the same `runCloak` surface.
