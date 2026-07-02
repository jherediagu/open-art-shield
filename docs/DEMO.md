# OpenArtShield Demo Guide

A short, hands-on tour of what the project does and how to run it. Everything
below uses the default `mock` backend, so no model weights or network access are
required - you can follow it end to end after a single `pnpm build`.

## 1. Problem

Artists and designers have limited practical tooling to understand whether
image-protection techniques actually help against unauthorized AI use, style
mimicry, scraping, or training.

Most tools either overclaim ("AI-proof", "blocks training") or give you no
measurable evidence at all.

OpenArtShield takes the opposite approach: **measurable, reproducible, honest
protection experiments.**

## 2. Core idea

OpenArtShield is **not** a magic AI-proof tool.

It is a TypeScript SDK and CLI for experimenting with layered protection
workflows:

- **Trace** — watermark, sidecar, verify.
- **Measure** — AI-facing embedding audit (CLIP drift).
- **Cloak** — experimental embedding-space perturbation (with EOT scoring).
- **Audit** — robustness against realistic transformations.
- **Declare** — future provenance / license layer.
- **Poison** — future research-only layer.

Each layer is a separate, measurable concern. None is a guarantee — the value is
being able to measure each one.

## 3. Architecture

Three packages, strict one-way boundaries (see [ARCHITECTURE.md](./ARCHITECTURE.md)
for data flows and design decisions):

- `@openartshield/core` — pure TypeScript algorithms, metrics, reports. No IO.
- `@openartshield/node` — image IO, transforms, optional CLIP backend.
- `@openartshield/cli` — the user-facing `oas` commands.

## 4. Demo flow

Set up once:

```bash
pnpm install
pnpm build
pnpm test
```

The `oas` binary lives at `packages/cli/dist/index.js` after `pnpm build`; either
add it to your PATH or run `node packages/cli/dist/index.js <command>`.

**Trace** — embed an invisible watermark, run an audit, and write a sidecar:

```bash
oas protect examples/images/sample-original.png \
  --message "artist=demo;license=no-ai-training" \
  --out protected.png \
  --html protected.audit.html
```

This writes `protected.png`, `protected.audit.json` (+ the HTML above), and a
`protected.openartshield.json` sidecar.

**Verify** — confirm the watermark straight from its sidecar:

```bash
oas verify protected.png \
  --sidecar protected.openartshield.json
```

**Measure** — quantify how the model "sees" the original vs. the protected image:

```bash
oas ai-audit examples/images/sample-original.png protected.png \
  --backend mock \
  --out ai-audit.json \
  --html ai-audit.html
```

**Experimental cloak** — search for a visually-bounded perturbation that increases
embedding drift, scored across transformations (EOT):

```bash
oas cloak examples/images/sample-original.png \
  --backend mock \
  --strength 4 \
  --steps 12 \
  --eot standard \
  --out cloaked.png \
  --report cloak-report.json \
  --html cloak-report.html
```

> The `mock` backend is a deterministic placeholder, not a perceptual model, so
> its cloak numbers are **not meaningful** — it exists so the whole pipeline runs
> in CI without heavy installs. For real numbers, use the CLIP backend.

**Real CLIP** — the CLIP backend is an optional dependency:

```bash
pnpm add @huggingface/transformers
```

Then point `--backend clip` at any command that measures embeddings:

```bash
oas ai-audit original.png candidate.png \
  --backend clip \
  --model Xenova/clip-vit-base-patch32
```

A full, real CLIP + EOT run is checked in under
[`examples/cloak-eot/`](../examples/cloak-eot/README.md).

## 5. Design highlights

Things worth knowing when evaluating the codebase:

- **TypeScript-first** architecture, ESM, strict boundaries.
- A **pure core** package (no IO, fully deterministic and unit-testable).
- **Clean package boundaries**: core ← node ← cli, dependencies flow one way.
- Both a **CLI and an SDK** surface over the same logic.
- **Measurable outputs** (PSNR/SSIM, bit accuracy, embedding drift) instead of
  vague claims.
- **Reports and reproducibility** — JSON + HTML artifacts, deterministic tests.
- An **optional CLIP backend** that never forces a heavy install on users or CI.
- **Honest limitations** stated everywhere, including inside the reports.
- An **incremental research path**: new baselines can plug in behind the same
  interfaces and be compared reproducibly.

## 6. What it does not claim

- It does **not** claim AI-proof protection.
- It does **not** claim prevention of training.
- It is **not** Glaze or Nightshade.
- It does **not** claim universal robustness.
- It does **not** claim legal enforcement.

## 7. In one paragraph

Artist-protection tooling around generative AI often overpromises. Instead of
claiming that an image can be made AI-proof, OpenArtShield is a measurable
TypeScript SDK and CLI for applying and evaluating protection layers:
traceability, AI-facing measurement, experimental cloaking, and robustness audits.
The current version is intentionally experimental, but the architecture is
designed so stronger research baselines can be added and compared reproducibly.
