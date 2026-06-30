#!/usr/bin/env bash
# Reproduces the experimental cloak EOT example in this directory using the built
# `oas` CLI and a REAL CLIP backend.
#
# Prerequisites (from the repo root):
#   pnpm install
#   pnpm build
#   pnpm add @huggingface/transformers   # optional CLIP backend (not a CI dep)
#
# Then run this script from the repo root:
#   bash examples/cloak-eot/commands/run-cloak-eot.sh
#
# It regenerates examples/cloak-eot/images/cloaked.png and the reports under
# examples/cloak-eot/reports/.
#
# Note: unlike the pure-DCT watermark example, the numbers here depend on the
# CLIP model weights and the ONNX runtime, so they are *approximately*, not
# byte-for-byte, reproducible across machines and library versions.
set -euo pipefail

OAS="node packages/cli/dist/index.js"
MODEL="Xenova/clip-vit-base-patch32"

# (optional) regenerate the self-owned source image
# node examples/cloak-eot/commands/generate-original.mjs

# 1. Cloak: search for a visually-bounded perturbation that increases CLIP
#    embedding drift, scoring each candidate across the "standard" EOT transform
#    set (clean + JPEG/resize/brightness/contrast/blur/screenshot).
$OAS cloak examples/cloak-eot/images/original.png \
  --backend clip \
  --model "$MODEL" \
  --strength 4 \
  --steps 12 \
  --eot standard \
  --out examples/cloak-eot/images/cloaked.png \
  --report examples/cloak-eot/reports/cloak-eot-report.json \
  --html examples/cloak-eot/reports/cloak-eot-report.html

# 2. AI-audit: independently measure the embedding drift between the original and
#    the cloaked image (and how it survives the transform suite).
$OAS ai-audit examples/cloak-eot/images/original.png \
  examples/cloak-eot/images/cloaked.png \
  --backend clip \
  --model "$MODEL" \
  --out examples/cloak-eot/reports/ai-audit-report.json \
  --html examples/cloak-eot/reports/ai-audit-report.html
