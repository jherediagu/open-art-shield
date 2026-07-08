# Experiment: does the cloak transfer across models?

The single most important open question about the experimental cloak is
transferability: a perturbation that only moves the embedding of the model it was
optimized against is much weaker evidence than one whose drift appears on models
that never saw the optimization.

This directory contains a complete, reproducible run of that experiment with real
CLIP models. Every number below was produced by the real `oas` CLI - nothing is
hand-edited. The result is published as-is, including the part that did not go
the way one might hope.

```
examples/cloak-transfer/
  images/
    cloaked-single.png     # cloak A: optimized against clip-vit-base-patch32 only
    cloaked-multi.png      # cloak B: optimized against base-patch32 + base-patch16
  reports/
    cloak-single.json/.html    # cloak A search report
    cloak-multi.json/.html     # cloak B search report
    transfer-single.json/.html # cloak A measured on all three models
    transfer-multi.json/.html  # cloak B measured on all three models
  commands/
    run-transfer-experiment.sh # regenerates everything
```

The source image is the self-owned, procedurally generated original from the
[cloak-eot example](../cloak-eot/README.md) (CC0; no third-party artwork).

## Design

Three CLIP variants, one of them held out:

| Model                           | Role                                       |
| ------------------------------- | ------------------------------------------ |
| `Xenova/clip-vit-base-patch32`  | primary: both cloaks optimized against it  |
| `Xenova/clip-vit-base-patch16`  | second scoring model: seen only by cloak B |
| `Xenova/clip-vit-large-patch14` | held out: seen by neither cloak            |

Both cloaks use the same parameters (`--strength 4 --steps 12 --eot standard`,
default seed) and pass the same PSNR/SSIM guardrails. Cloak B adds
`--score-model` so candidates are selected on the average drift across both
scoring models. Both cloaked images are then measured with
`oas ai-audit --compare-model` on all three models.

The held-out model is the honest test: drift there cannot come from optimizing
against it.

## Results

Visual quality is equivalent for both cloaks (PSNR 40.7 dB, SSIM 0.982).

Drift of each cloaked image vs. the original, per model (from
[`transfer-single.json`](reports/transfer-single.json) and
[`transfer-multi.json`](reports/transfer-multi.json)):

| Measured on                      | Cloak A (single) | Cloak B (multi) | Seen by A | Seen by B |
| -------------------------------- | ---------------: | --------------: | --------- | --------- |
| base-patch32 (primary)           |           0.0735 |          0.0814 | yes       | yes       |
| base-patch16                     |           0.0862 |          0.0953 | no        | yes       |
| large-patch14 (held out)         |       **0.1036** |      **0.0902** | no        | no        |
| Transfer ratio to held-out       |             1.41 |            1.11 |           |           |
| Mean drift after transform suite |           0.0638 |          0.0605 |           |           |
| Embedding evaluations in search  |              146 |             279 |           |           |

## Honest reading

**Finding 1 - the drift transfers.** Both cloaks produce _more_ drift on the
models they never saw than on the model they were optimized against (transfer
ratios above 1 everywhere). This makes sense for this search: bounded random
noise selected by a black-box criterion is not finely tuned to one model's
gradients, so whatever moves one CLIP variant tends to move its relatives too.
Transfer across the CLIP family is a necessary condition for any real effect,
and in this run it holds.

**Finding 2 - multi-model scoring did not improve held-out transfer here.**
Cloak B scored higher on both models it was optimized against, but _lower_ on
the held-out model (0.0902 vs. 0.1036), at roughly twice the embedding cost
(279 vs. 146 evaluations). In this run, selecting for two seen models did not
buy generalization to a third.

**Why that second finding deserves caution.** Both searches use the same seed,
so they choose from the _same twelve candidate perturbations_ - only the
selection criterion differs. With a pool that small, the held-out difference
(0.09 vs. 0.10) may simply be selection noise rather than a property of
multi-model scoring. A proper answer needs more candidates, more seeds, and more
images. What this run does establish is that multi-model scoring is not
automatically better on held-out models, which is exactly why we measure instead
of assuming.

## Limitations

- One image, one seed, twelve candidates: this is a first data point, not a
  study.
- All three models are CLIP-family; transfer within a family says little about
  diffusion models, other architectures, or training pipelines.
- Absolute drift values are small. For scale, a clearly different image drifts
  about 0.14 on this backend; these cloaks reach 0.07-0.10 while staying
  visually indistinguishable.
- Drift is a measurement, not protection. Nothing here shows that AI training or
  style mimicry is prevented or even meaningfully degraded.
- This is not Glaze, Nightshade, or a reproduction of any published system.

## How to reproduce

From the repository root, after `pnpm install`:

```bash
pnpm build

# The CLIP backend is an optional dependency (not required for CI/tests).
pnpm add @huggingface/transformers

bash examples/cloak-transfer/commands/run-transfer-experiment.sh
```

The first run downloads the three models from the Hugging Face hub (the
large-patch14 weights are the big one) and caches them locally; nothing is
committed. Numbers depend on model weights and the ONNX runtime, so they are
approximately - not byte-for-byte - reproducible across machines and versions.

## What follows from this

The natural next questions, in order of value:

1. More seeds and images: is finding 2 selection noise or real?
2. A stronger search (more candidates or a smarter optimizer) so multi-model
   selection has room to matter.
3. A non-CLIP evaluation model, to test transfer beyond the family.
