#!/usr/bin/env bash
# Reproduces the sample audit in this directory using the built `oas` CLI.
#
# Prerequisites (from the repo root):
#   pnpm install
#   pnpm build
#
# Then run this script from the repo root:
#   bash examples/commands/sample-audit.sh
#
# It regenerates examples/images/sample-protected.png and the reports under
# examples/reports/. Everything is deterministic, so re-running it produces
# byte-identical output.
set -euo pipefail

OAS="node packages/cli/dist/index.js"
MESSAGE="artist=demo;license=no-ai-training"

# 1. Embed an invisible watermark into the (procedurally generated) original.
$OAS embed examples/images/sample-original.png \
  --message "$MESSAGE" \
  --seed 123 \
  --strength 8 \
  --repetitions 5 \
  --out examples/images/sample-protected.png

# 2. Audit robustness: embed + run the full transform suite, write JSON + HTML.
$OAS audit examples/images/sample-original.png \
  --message "$MESSAGE" \
  --seed 123 \
  --strength 8 \
  --repetitions 5 \
  --out examples/reports/sample-audit.json \
  --html examples/reports/sample-audit.html
