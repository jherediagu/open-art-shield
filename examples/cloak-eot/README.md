# Example: experimental cloak with EOT robustness

This directory contains a complete, reproducible run of the **experimental**
`oas cloak` flow against a real CLIP backend, with EOT (Expectation Over
Transformation) robustness scoring enabled. Every number below was produced by
the real `oas` CLI - nothing here is hand-edited.

```
examples/cloak-eot/
  images/
    original.png            # procedurally generated source image (CC0 / self-owned)
    cloaked.png             # original + a visually-bounded, CLIP-drifting perturbation
  reports/
    cloak-eot-report.json   # machine-readable cloak report (schema v0.2.0, with EOT block)
    cloak-eot-report.html   # standalone HTML version of the same report
    ai-audit-report.json    # independent embedding-drift measurement (original vs cloaked)
    ai-audit-report.html    # standalone HTML version of the audit
  commands/
    generate-original.mjs   # regenerates original.png
    run-cloak-eot.sh        # regenerates cloaked.png + all four reports
```

> **This is not AI-proof protection.** It does not prevent training, it is not
> Glaze or Nightshade, and it is not a guarantee. A cloak here only means a
> candidate perturbation was found that increases the image's embedding drift
> **under one proxy model (CLIP)**, measured against a fixed set of
> transformations. CLIP is only one model; these numbers do not generalize to all
> AI systems.

## The image

`original.png` is **procedurally generated** by
[`commands/generate-original.mjs`](commands/generate-original.mjs) - a 512x512
image built from gradients, two soft glows, concentric ring banding, and film
grain. It is CC0 / self-owned: no third-party or copyrighted artwork is used. We
deliberately never cloak art we don't own - demoing a "do not train on this"
perturbation on someone else's work would be contradictory.

| Original                         | Cloaked                        |
| -------------------------------- | ------------------------------ |
| ![Original](images/original.png) | ![Cloaked](images/cloaked.png) |

The two images should look essentially identical - the perturbation is bounded
by the PSNR/SSIM guardrails below.

## What the flow does

1. **Cloak** (`oas cloak ... --backend clip --eot standard`) searches for a
   bounded-noise perturbation that increases the CLIP embedding drift between the
   original and the candidate. With `--eot standard`, each candidate is scored by
   its **average** drift across the clean image plus 10 deterministic transforms,
   so the search favors perturbations that survive everyday image handling rather
   than ones that only move the pristine pixels. Candidates that break the
   PSNR/SSIM quality limits are rejected **before** any EOT scoring.
2. **AI-audit** (`oas ai-audit`) then measures the embedding drift between the
   original and the cloaked image independently, including how it holds up under
   the transform suite.

## Real results

From [`reports/cloak-eot-report.json`](reports/cloak-eot-report.json) (CLIP
backend `Xenova/clip-vit-base-patch32`, `--strength 4 --steps 12 --eot standard`):

| Metric                          |                           Value |
| ------------------------------- | ------------------------------: |
| Backend                         |  `Xenova/clip-vit-base-patch32` |
| EOT mode                        | `standard` (11 scored variants) |
| Clean drift                     |                          0.0735 |
| Average EOT drift               |                          0.0680 |
| Minimum EOT drift               |                          0.0416 |
| PSNR (cloaked vs. original)     |                        40.73 dB |
| SSIM (cloaked vs. original)     |                          0.9821 |
| Candidates rejected (guardrail) |                               0 |
| Embedding evaluations           |                             146 |

And from [`reports/ai-audit-report.json`](reports/ai-audit-report.json), the
independent measurement of original vs. cloaked:

| Metric                           |  Value |
| -------------------------------- | -----: |
| Embedding dimensions             |    512 |
| Cosine similarity                | 0.9265 |
| Drift (1 - cosine)               | 0.0735 |
| Mean drift after transforms (13) | 0.0638 |

How to read this: even this naive random search moved CLIP's view of the image
from `0` (identical) to about `0.07` drift while keeping the change essentially
invisible (PSNR around 40.7 dB, SSIM around 0.98), and about `0.06` of that drift
still survived the transform suite. The minimum EOT drift (about `0.042`) is the
worst single transformed variant - the honest floor, not the headline number.

Note the two similar-sounding averages in the JSON: `eot.averageDrift` is the
score optimized during candidate search; `robustness.averageDriftAfterTransforms`
is an independent post-hoc check over the full transform suite.

## How to reproduce

From the repository root, after `pnpm install`:

```bash
pnpm build

# The CLIP backend is an optional dependency (not required for CI/tests).
pnpm add @huggingface/transformers

# (optional) regenerate the self-owned source image
node examples/cloak-eot/commands/generate-original.mjs

# run the cloak + ai-audit and write all four reports
bash examples/cloak-eot/commands/run-cloak-eot.sh
```

Unlike the pure-DCT [watermark example](../README.md), these numbers depend on
the CLIP model weights and the ONNX runtime, so they are **approximately**, not
byte-for-byte, reproducible across machines and library versions.

## Limitations (carried verbatim in the report)

- This is an experimental embedding-space perturbation.
- It does not prevent AI training.
- It does not guarantee style protection.
- It is not Glaze, Nightshade, or a reproduction of those papers.
- CLIP is only one proxy model; results do not generalize to all systems.
- A higher embedding drift score is a measurement, not a guarantee.
