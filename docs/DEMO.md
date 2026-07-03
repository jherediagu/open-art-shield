# OpenArtShield Demo Guide

The high-level narrative of the project: what problem it addresses, how the
layers fit together, what to show, and what not to claim. For the hands-on
command walkthrough (install, build, and every command below with runnable
flags), see [GETTING_STARTED.md](./GETTING_STARTED.md).

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

## 4. What to show

A natural tour follows the layers in order — each step is one command, spelled
out in [GETTING_STARTED.md](./GETTING_STARTED.md#quickstart):

1. **Trace** — `oas protect` embeds an invisible watermark and writes an audit
   report plus a sidecar.
2. **Verify** — `oas verify` confirms the watermark from its sidecar.
3. **Measure** — `oas ai-audit` quantifies embedding drift between two images.
4. **Cloak** (experimental) — `oas cloak --eot standard` searches for a
   visually-bounded perturbation scored across transformations.

Everything runs with the default `mock` backend (no model weights, no network).
The `mock` backend is a deterministic placeholder, so its cloak numbers are **not
meaningful** — for real numbers, install the optional CLIP backend
([instructions](./GETTING_STARTED.md#using-the-real-clip-backend-optional)).

A full, real CLIP + EOT run with honest numbers is checked in under
[`examples/cloak-eot/`](../examples/cloak-eot/README.md), and a reproducible
watermark audit under [`examples/`](../examples/README.md).

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
