# Roadmap

OpenArtShield is an experimental, honest toolkit for protecting visual work from unauthorized AI use - and measuring what actually holds up.

The project does not aim to make images AI-proof. Its goal is to give artists and developers reproducible protection layers - watermarking, embedding cloak, provenance - plus the tools to embed, attack, measure, and report how each layer behaves under realistic conditions.

## Principles

- Be honest about limitations.
- Prefer measurable claims over marketing claims.
- Keep experiments reproducible.
- Keep the core SDK deterministic and testable.
- Separate pure algorithms from Node-specific image IO.
- Treat watermarking, provenance, perturbation, and robustness as experimental signals, not guarantees.
- Make it easy for artists, researchers, and developers to inspect what works, what fails, and under which parameters.

## Protection layers

OpenArtShield is best understood as five layers, not one watermarking tool. Each
is an experimental signal, not a guarantee:

- **Trace** - invisible watermarking, sidecar, verification. _"Can I detect or prove a signal later?"_ (started)
- **Declare** - metadata, license assertions, C2PA/provenance. _"Can I declare ownership and usage terms?"_ (started - `oas declare`, `oas optout`)
- **Cloak** - adversarial/style perturbations aimed at model embeddings. _"Can I make style mimicry harder?"_ (started - experimental `oas cloak`)
- **Poison** - dataset-poisoning experiments. _"Can I make unauthorized training less useful?"_ (research only)
- **Measure** - robustness, visual quality, and AI-perception (embedding) drift. _"Did any of it actually work?"_ (started)

**Trace** and **Measure** are implemented; **Cloak** has an experimental
prototype with EOT (Expectation Over Transformation) scoring, demonstrated with a
real CLIP run in [`examples/cloak-eot/`](examples/cloak-eot/readme.md). The honest
current status: OpenArtShield does not yet protect artworks from AI training or
style mimicry. It embeds/audits watermarks, measures embedding drift, and can
generate a measurable (but unproven) embedding perturbation scored through
transforms, measure whether that drift transfers to other embedding models
(`oas ai-audit --compare-model`), search for it with either random sampling
or a greedy hill-climber (`oas cloak --optimizer greedy`), and target either a
CLIP proxy or the Stable Diffusion VAE latent itself (`--backend vae`). The next
steps are stronger optimizers, style-statistics scoring, and an output-level
protection-success metric.

## v0.1 - Current foundation

The first version focuses on a simple, readable baseline:

- TypeScript monorepo.
- Pure `@openartshield/core` package.
- Node image IO and transformations via `@openartshield/node`.
- CLI package exposed through the `oas` binary.
- DCT-based invisible watermarking.
- UTF-8 payload encoding.
- CRC-32 checksum validation.
- Repetition coding with majority vote.
- Deterministic transform simulations.
- Bit accuracy, PSNR, and SSIM metrics.
- JSON audit reports.
- Tests and CI.

This version is intentionally limited. It exists to establish the architecture, measurement flow, and honest framing.

## v0.2 - Reproducible examples and better reports

Planned improvements:

- Add real example audits to the repository. _(done - see [`examples/`](examples/readme.md))_
- Include original image, protected image, and generated audit report. _(done)_
- Add `examples/readme.md` with reproduction steps. _(done)_
- Add a static HTML report generator. _(done - `oas audit --html`)_
- Add a capacity estimation command such as `oas capacity`. _(done)_
- Add a one-shot `oas protect` workflow with sidecar metadata and `oas verify`. _(done)_
- Add visual report tables and per-transform summaries.
- Add image quality comparison summaries.

Goal: make the project easy to understand, run, and verify in less than two minutes.

## v0.3 - Additional watermarking baselines

Planned improvements:

- Introduce a generic `WatermarkAlgorithm` interface.
- Add alternative classical watermarking baselines.
- Explore DWT/DCT watermarking.
- Explore DWT/SVD watermarking.
- Add spread-spectrum-inspired baselines.
- Compare algorithms under the same audit pipeline.
- Report trade-offs between imperceptibility, capacity, and robustness.

Goal: turn OpenArtShield from a single watermarking implementation into a small evaluation framework.

## v0.4 - Provenance and signed metadata experiments

Planned improvements:

- Explore C2PA / Content Credentials concepts.
- Add experimental provenance metadata support.
- Add machine-readable license assertions.
- Add exportable provenance manifests.
- Compare embedded watermark signals with external signed metadata.
- Document the difference between watermarking and cryptographic provenance.

Goal: evaluate provenance as a complementary signal, not as a replacement for watermarking.

## v0.5 - Embedding drift and semantic robustness

Planned improvements:

- Add an AI-perception (embedding drift) audit pipeline. _(done - `oas ai-audit`, deterministic mock backend)_
- Add a real CLIP/OpenCLIP backend via `transformers.js` behind the `EmbeddingBackend` interface. _(done, experimental - `oas ai-audit --backend clip`, optional dependency)_
- Measure image-text similarity changes after transformations. _(partial - prompt drift, mock backend)_
- Compare semantic drift between original, protected, and transformed images. _(done for the mock backend)_
- Add configurable embedding backends. _(interface in place)_
- Add report sections for semantic similarity metrics. _(done)_

Goal: start measuring whether protection techniques meaningfully affect model-facing representations.

## v0.6 - Adversarial perturbation baselines

Planned improvements:

- Add a first experimental embedding cloak. _(done - `oas cloak`, seeded random search, mock + clip backends)_
- Add perturbation quality guardrails (PSNR/SSIM). _(done)_
- Add EOT-based robustness: score the cloak _through_ JPEG/resize/blur/screenshot transforms. _(done - `oas cloak --eot`, see [`examples/cloak-eot/`](examples/cloak-eot/readme.md))_
- Measure whether cloak drift transfers to other embedding models (avoid overfitting to one CLIP variant). _(done - `oas ai-audit --compare-model`)_
- Score cloak candidates across multiple embedding models during the search. _(done - `oas cloak --score-model`)_
- Replace random search with a smarter optimizer. _(started - `oas cloak --optimizer greedy`)_
- Measure how much of a cloak survives published removal attacks (noisy upscaling, JPEG, purification). _(done - `oas attack`, see [`docs/research.md`](docs/research.md))_
- Study Glaze/Mist-style research directions. _(surveyed - see [`docs/research.md`](docs/research.md))_
- Move the cloak from the CLIP proxy toward the diffusion VAE latent surface. _(done, experimental - `--backend vae`, SD VAE encoder via ONNX)_
- Add benchmark datasets where licensing allows.
- Clearly document known limitations and failure modes. _(done)_

Goal: evaluate perturbation-based techniques without overclaiming their effectiveness.

## v0.7 - Declare layer: provenance and machine-readable opt-out

Grounded in [`docs/product-research.md`](docs/product-research.md): no open
source SDK combines watermarking, provenance, and robustness auditing in one
flow, and the EU AI Act makes machine-readable opt-outs legally meaningful
(Art. 4(3) DSM reservation, Art. 53/50). Declarations are voluntary-compliance
signals, not enforcement - but they are the only layer with regulatory teeth.

Planned improvements:

- Sign C2PA manifests carrying the CAWG training-and-data-mining assertion
  (`oas declare`, optional `c2pa-node` dependency). _(done)_
- Inspect Content Credentials on any image (`oas declare-read`). _(done)_
- Local keypair + self-signed certificate generation for instant DX
  (`oas declare-keys`); bring-your-own-cert for trust-list interop. _(done)_
- Embed the IPTC `plus:DataMining` opt-out as XMP metadata (`oas optout`). _(done)_
- Emit site-level opt-out artifacts: TDMRep (`/.well-known/tdmrep.json`),
  `ai.txt`, and robots/header snippets (`oas optout-site`). _(done)_
- Map the opt-out data model onto the IETF AIPREF vocabulary once the RFC
  lands (~2026).

Goal: fill the empty **Declare** layer with standards-based, verifiable
signals instead of inventing our own.

## v0.8 - Durable credentials

Planned improvements:

- Add TrustMark (MIT, Adobe) as an alternative, learned watermark backend.
  _(done - `oas trustmark` / `oas trustmark-decode`; ONNX models via the
  optional `onnxruntime-node` dependency, the 100-bit BCH data layer is a
  pure-TS port cross-checked against the canonical Python implementation)_
- Implement the durable-credentials pattern: watermark payload as a recovery
  pointer to the sidecar/remote manifest, so provenance survives platform
  re-encoding and metadata stripping. _(done - `oas declare-durable` embeds a
  60-bit truncated-SHA-256 record ID in the pixels; `oas recover` finds and
  integrity-checks the manifest from a fully stripped copy)_
- Benchmark TrustMark vs the DCT baseline under the transform + attack
  suites. _(done - on a natural-like test image TrustMark survived all 17
  transforms/attacks including JPEG q30, screenshot simulation, noisy
  upscaling and the purification proxy, mostly with 0 corrected bit flips;
  the classical DCT baseline is strongly content-dependent and failed on
  smooth imagery. One image, one run - reproduce before citing.)_

Goal: provenance that survives the places where metadata dies.

Known limits: only the TrustMark Q variant is wired up; extreme aspect
ratios (beyond 1:2) are rejected at embed time; and published attacks
(WAVES-class regeneration/adversarial) can still remove any watermark -
durable credentials raise the cost of _casual_ stripping, nothing more.

## v0.9 - Integration surface

Planned improvements:

- `@openartshield/web`: browser package (WASM, optional WebGPU) for
  watermark/verify, enabling fully client-side protection ("your image never
  leaves your browser").
- Docker self-hosted REST server: `protect/verify/audit` plus async jobs and
  webhooks - the artifact a platform team actually evaluates.
- Static client-side web app + public verifier as demo.

Goal: meet integrators (B2B) and artists where they are.

## v1.0 - Benchmark posture

Planned improvements:

- Continuous, reproducible public benchmark (protections x attacks x
  metrics, CopyrightMeter-style) published from CI.
- Documented threat model; OpenSSF Best Practices badge and Scorecard.
- Position OpenArtShield as the reproducible harness that measures what
  actually holds up.

Goal: make honesty the differentiator - "know exactly how much your
protection survives."

## Non-goals

OpenArtShield does not aim to:

- Make images impossible to train on.
- Prevent copying, screenshotting, editing, or re-uploading.
- Guarantee watermark survival.
- Guarantee legal protection.
- Implement DRM.
- Claim that invisible watermarking alone protects artists from generative AI.
- Present adversarial perturbations as a solved problem.

## Research directions

Relevant research areas include:

- Robust invisible watermarking.
- DCT, DWT, and SVD watermarking.
- Perceptual quality metrics.
- Adversarial perturbations.
- Data poisoning.
- Style mimicry protection.
- Content provenance.
- C2PA / Content Credentials.
- CLIP/OpenCLIP embedding analysis.
- Diffusion model robustness evaluation.

OpenArtShield should remain research-aware but implementation-honest: every new technique should come with measurable results, reproducible examples, and clear limitations.
