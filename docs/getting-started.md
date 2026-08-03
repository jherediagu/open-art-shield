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

There is also an experimental `--backend vae` that encodes images with the
**Stable Diffusion VAE encoder** (the latent surface diffusion models actually
use) instead of a CLIP proxy. It needs the optional `onnxruntime-node`
dependency and downloads the ~130 MB encoder on first use:

```bash
pnpm add onnxruntime-node

oas cloak artwork.png --backend vae --optimizer greedy --steps 40 \
  --out artwork.cloaked.png
```

To check whether drift transfers beyond the primary model, add one or more
repeatable `--compare-model` flags (see the transfer measurement section of the
[root README](../readme.md)):

```bash
oas ai-audit original.png cloaked.png \
  --backend clip --compare-model Xenova/clip-vit-base-patch16
```

## Declaring "no AI training" (optional)

The Declare layer signs C2PA Content Credentials with a standards-based
AI-training opt-out, and writes machine-readable opt-out metadata and site
files. C2PA signing needs the optional native `c2pa-node` dependency:

```bash
pnpm add c2pa-node

# One-time: local key + self-signed certificate (requires openssl)
oas declare-keys --name "Jane Artist" --out-dir ~/.openartshield

# Sign the declaration into a copy of the artwork, then read it back
oas declare artwork.png --out artwork.declared.png \
  --creator "Jane Artist" \
  --cert ~/.openartshield/openartshield-cert.pem \
  --key ~/.openartshield/openartshield-key.pem
oas declare-read artwork.declared.png
```

Without `c2pa-node` you can still write the XMP opt-out and site-level files -
they only need sharp:

```bash
oas optout artwork.jpg --out artwork.optout.jpg --creator "Jane Artist"
oas optout-site --dir public
```

These are voluntary-compliance signals (with legal weight under the EU AI
Act), not technical protection - see the Declare section of the
[root README](../readme.md) for the honest framing.

To make a declaration survive metadata stripping (re-encoding, screenshots),
use the durable variant - it embeds a recovery ID in the pixels via a
TrustMark watermark (optional `onnxruntime-node` dependency, ~64 MB of ONNX
models cached on first use):

```bash
pnpm add onnxruntime-node

oas declare-durable artwork.png --out artwork.durable.png --creator "Jane Artist"
oas recover some-downloaded-copy.jpg --store oas-manifests
```

## Using the SDK

The packages are also consumable as libraries:

```ts
// Pure algorithms, no IO
import { embedWatermark, extractWatermark } from "@openartshield/core";

// Image IO + transforms (Node)
import { readImage, writeImage } from "@openartshield/node";
```

See the [root README](../readme.md) for SDK examples and the
[`@openartshield/core`](../packages/core/readme.md) API surface.

## Integrating (browser and server)

For platforms and tools, two packages wrap the same SDK:

```ts
// Browser - fully client-side, the image never leaves the page:
import { loadPixelImage, embedWatermark, createTrustmarkWebDecoder } from "@openartshield/web";
```

```bash
# Self-hosted REST server (JSON API over a port):
docker build -f packages/server/Dockerfile -t openartshield-server .
docker run --rm -p 8787:8787 openartshield-server
curl -s localhost:8787/healthz
```

See [`packages/web`](../packages/web/readme.md) and
[`packages/server`](../packages/server/readme.md) for the API surface.

## Where to go next

- [Demo guide](./demo.md) - a short tour of every layer and its command.
- [Architecture overview](./architecture.md) - packages, data flows, and design decisions.
- [`examples/`](../examples/readme.md) - a reproducible watermark audit.
- [`examples/cloak-eot/`](../examples/cloak-eot/readme.md) - a real CLIP + EOT cloak run.
- [Roadmap](../roadmap.md) - versioned plan, principles, and non-goals.
