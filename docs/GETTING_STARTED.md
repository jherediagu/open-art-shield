# Getting started

OpenArtShield is a public, open-source TypeScript SDK and CLI for experimenting
with layered image-protection workflows against unauthorized AI use. This guide
gets you from a clone to a working watermark, audit, and cloak run.

## Prerequisites

- **Node.js 18+**
- **pnpm 9+** (the repo pins `packageManager` in `package.json`)

The `node` and `cli` packages use [`sharp`](https://sharp.pixelplumbing.com/) for
image decoding/encoding; it installs prebuilt binaries automatically on common
platforms.

## Install and build

```bash
git clone https://github.com/jherediagu/open-art-shield.git
cd open-art-shield
pnpm install
pnpm build
```

Verify everything works:

```bash
pnpm test
```

## Running the CLI

After `pnpm build`, the `oas` binary is at `packages/cli/dist/index.js`. Run it
directly or add it to your PATH:

```bash
node packages/cli/dist/index.js --help
# or, once linked/installed:
oas --help
```

The examples below assume `oas` resolves to that binary.

## Quickstart

Each command maps to one protection layer. All of these run with the default
`mock` backend, so no model download or network access is needed.

**Trace** — embed an invisible watermark, audit it, and write a sidecar:

```bash
oas protect examples/images/sample-original.png \
  --message "artist=demo;license=no-ai-training" \
  --out protected.png \
  --html protected.audit.html
```

**Verify** — check the watermark from its sidecar:

```bash
oas verify protected.png --sidecar protected.openartshield.json
```

**Measure** — embedding drift between the original and the protected image:

```bash
oas ai-audit examples/images/sample-original.png protected.png \
  --backend mock --out ai-audit.json --html ai-audit.html
```

**Cloak** (experimental) — search for a visually-bounded perturbation, scored
across transformations (EOT):

```bash
oas cloak examples/images/sample-original.png \
  --backend mock --strength 4 --steps 12 --eot standard \
  --out cloaked.png --report cloak-report.json --html cloak-report.html
```

Run `oas <command> --help` for the full option list of any command.

## Using the real CLIP backend (optional)

The `mock` backend is a deterministic placeholder - useful for a fast, dependency-
free run, but its embedding numbers are **not meaningful**. For real measurements,
install the optional dependency and switch the backend:

```bash
pnpm add @huggingface/transformers

oas ai-audit original.png candidate.png \
  --backend clip --model Xenova/clip-vit-base-patch32
```

If `@huggingface/transformers` is not installed, `--backend clip` fails with a
clear message; nothing else in the pipeline requires it.

To check whether drift transfers beyond the primary model, add one or more
repeatable `--compare-model` flags (see the transfer measurement section of the
[root README](../README.md)):

```bash
oas ai-audit original.png cloaked.png \
  --backend clip --compare-model Xenova/clip-vit-base-patch16
```

## Using the SDK

The packages are also consumable as libraries:

```ts
// Pure algorithms, no IO
import { embedWatermark, extractWatermark } from "@openartshield/core";

// Image IO + transforms (Node)
import { readImage, writeImage } from "@openartshield/node";
```

See the [root README](../README.md) for SDK examples and the
[`@openartshield/core`](../packages/core/README.md) API surface.

## Where to go next

- [Demo guide](./DEMO.md) - a short tour of every layer and its command.
- [Architecture overview](./ARCHITECTURE.md) - packages, data flows, and design decisions.
- [`examples/`](../examples/README.md) - a reproducible watermark audit.
- [`examples/cloak-eot/`](../examples/cloak-eot/README.md) - a real CLIP + EOT cloak run.
- [Roadmap](../ROADMAP.md) - versioned plan, principles, and non-goals.
