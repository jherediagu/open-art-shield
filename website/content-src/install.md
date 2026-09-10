---
title: Install
description: Install the OpenArtShield CLI, SDK, browser package or REST server from npm.
sidebar:
  order: 0
---

All packages are published on npm under the `@openartshield` scope and versioned
in lockstep. Node.js 18 or newer.

## CLI

```bash
npm install -g @openartshield/cli
oas --help
```

Or run it once without installing:

```bash
npx @openartshield/cli protect artwork.png --message "artist=jane"
```

## Node SDK

```bash
npm install @openartshield/node
```

```ts
import { protectArtwork } from "@openartshield/node";

const result = await protectArtwork("artwork.png", { message: "artist=jane" });
```

`@openartshield/node` depends on [sharp](https://sharp.pixelplumbing.com/) for
image IO. The pure algorithms live in `@openartshield/core`, which has no
dependencies and runs wherever JavaScript runs.

## Browser

```bash
npm install @openartshield/web
```

Canvas and `ImageData` bindings over the core SDK, plus in-browser TrustMark
verification through the optional `onnxruntime-web` peer dependency. The image
never leaves the page. See [the live verifier]({{base}}/verify/) for a working example.

## REST server

```bash
git clone https://github.com/jherediagu/open-art-shield.git
cd open-art-shield
docker build -f packages/server/Dockerfile -t openartshield-server .
docker run --rm -p 8787:8787 -e OAS_API_KEYS=change-me -e OAS_RATE_LIMIT=120/1m openartshield-server
```

JSON in, JSON out, images as base64. Details in
[@openartshield/server]({{base}}/packages/server/).

## Optional layers

Some layers need native peer dependencies that you install only if you use them:

| Layer                     | Install                                 |
| ------------------------- | --------------------------------------- |
| C2PA signing and reading  | `npm install c2pa-node`                 |
| TrustMark and VAE backend | `npm install onnxruntime-node`          |
| CLIP embedding backend    | `npm install @huggingface/transformers` |

Everything else, including DCT watermarking, audits, opt-out metadata and the
benchmark, works with the base install.
