#!/usr/bin/env bash
# Reproduces the cloak transfer experiment: does a cloak optimized against one
# CLIP model produce drift on models it never saw?
#
# Design:
#   cloak A ("single") is optimized against clip-vit-base-patch32 only.
#   cloak B ("multi")  is optimized against clip-vit-base-patch32 AND
#                      clip-vit-base-patch16 (multi-model scoring).
#   Both are then measured with ai-audit against:
#     - clip-vit-base-patch32 (primary; seen by both cloaks)
#     - clip-vit-base-patch16 (seen only by cloak B)
#     - clip-vit-large-patch14 (held out; seen by neither cloak)
#
# The held-out model is the honest test: drift there cannot come from
# optimizing against it.
#
# Prerequisites (from the repo root):
#   pnpm install
#   pnpm build
#   pnpm add @huggingface/transformers   # optional CLIP backend (not a CI dep)
#
# Then run this script from the repo root:
#   bash examples/cloak-transfer/commands/run-transfer-experiment.sh
#
# The source image is the self-owned original from the cloak-eot example. Model
# weights are downloaded from the Hugging Face hub on first use and cached
# locally; nothing is committed. Numbers depend on the model weights and ONNX
# runtime, so they are approximately (not byte-for-byte) reproducible.
set -euo pipefail

OAS="node packages/cli/dist/index.js"
ORIGINAL="examples/cloak-eot/images/original.png"
DIR="examples/cloak-transfer"

PRIMARY="Xenova/clip-vit-base-patch32"
SECOND="Xenova/clip-vit-base-patch16"
HELDOUT="Xenova/clip-vit-large-patch14"

# 1. Cloak A: optimized against the primary model only.
$OAS cloak "$ORIGINAL" \
  --backend clip \
  --model "$PRIMARY" \
  --strength 4 \
  --steps 12 \
  --eot standard \
  --out "$DIR/images/cloaked-single.png" \
  --report "$DIR/reports/cloak-single.json" \
  --html "$DIR/reports/cloak-single.html"

# 2. Cloak B: multi-model scoring (primary + second model).
$OAS cloak "$ORIGINAL" \
  --backend clip \
  --model "$PRIMARY" \
  --score-model "$SECOND" \
  --strength 4 \
  --steps 12 \
  --eot standard \
  --out "$DIR/images/cloaked-multi.png" \
  --report "$DIR/reports/cloak-multi.json" \
  --html "$DIR/reports/cloak-multi.html"

# 3. Measure both cloaks on all three models (transfer measurement).
$OAS ai-audit "$ORIGINAL" "$DIR/images/cloaked-single.png" \
  --backend clip \
  --model "$PRIMARY" \
  --compare-model "$SECOND" \
  --compare-model "$HELDOUT" \
  --out "$DIR/reports/transfer-single.json" \
  --html "$DIR/reports/transfer-single.html"

$OAS ai-audit "$ORIGINAL" "$DIR/images/cloaked-multi.png" \
  --backend clip \
  --model "$PRIMARY" \
  --compare-model "$SECOND" \
  --compare-model "$HELDOUT" \
  --out "$DIR/reports/transfer-multi.json" \
  --html "$DIR/reports/transfer-multi.html"
