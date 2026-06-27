# Roadmap

OpenArtShield is an experimental toolkit for measuring practical image protection techniques under real-world transformations.

The project does not aim to make images AI-proof. Its goal is to provide reproducible tools for embedding, extracting, attacking, measuring, and reporting how protection signals behave under realistic conditions.

## Principles

- Be honest about limitations.
- Prefer measurable claims over marketing claims.
- Keep experiments reproducible.
- Keep the core SDK deterministic and testable.
- Separate pure algorithms from Node-specific image IO.
- Treat watermarking, provenance, perturbation, and robustness as experimental signals, not guarantees.
- Make it easy for artists, researchers, and developers to inspect what works, what fails, and under which parameters.

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

- Add real example audits to the repository. _(done - see [`examples/`](examples/README.md))_
- Include original image, protected image, and generated audit report. _(done)_
- Add `examples/README.md` with reproduction steps. _(done)_
- Add a static HTML report generator. _(done - `oas audit --html`)_
- Add a capacity estimation command such as `oas capacity`.
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

- Add CLIP/OpenCLIP-based embedding drift experiments.
- Measure image-text similarity changes after transformations.
- Compare semantic drift between original, protected, and transformed images.
- Add configurable embedding backends.
- Add report sections for semantic similarity metrics.

Goal: start measuring whether protection techniques meaningfully affect model-facing representations.

## v0.6 - Adversarial perturbation baselines

Planned improvements:

- Add simple adversarial perturbation baselines.
- Study Glaze/Mist-style research directions.
- Add perturbation quality metrics.
- Compare perturbation survival under resize, JPEG, blur, and screenshot-like transformations.
- Add benchmark datasets where licensing allows.
- Clearly document known limitations and failure modes.

Goal: evaluate perturbation-based techniques without overclaiming their effectiveness.

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
