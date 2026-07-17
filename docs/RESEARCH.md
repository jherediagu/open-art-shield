# Research landscape: protecting art from generative AI

This document summarizes the published state of the art on protecting visual
artwork from unauthorized use by generative AI, and grounds OpenArtShield's
direction in it. It exists so the project's choices are traceable to real
sources, and so our honesty is not just a slogan but a reading of the evidence.

> **Method note.** The sources below were gathered by a multi-source literature
> sweep and are primary (USENIX, IEEE S&P, NeurIPS, ICLR, arXiv) except where
> marked. The automated adversarial fact-check step did not complete on the run
> that produced this summary (API rate limit), so treat the specific figures as
> "reported by the cited source," cross-checked against well-known results but
> not independently re-verified here. Corrections welcome.

## The honest bottom line

The strongest current consensus (2024-2025) is that **adversarial-perturbation
protections do not reliably protect artists against a motivated adversary**. This
is not our opinion; it is the finding of multiple independent robustness studies:

- **Honig, Rando, Carlini, Tramer - "Adversarial Perturbations Cannot Reliably
  Protect Artists From Generative AI"** (ICLR 2025; arXiv:2406.12027). Low-effort,
  off-the-shelf methods - notably **"noisy upscaling"** (add Gaussian noise, then
  a public upscaler) - build robust mimicry that defeats Glaze, Mist, and
  Anti-DreamBooth. Their framing: these tools give a **false sense of security**.
- **IMPRESS** (Cao et al., NeurIPS 2023; arXiv:2310.19248). A purifier that
  exploits the fact that a protected image reconstructs _poorly_ through a
  diffusion model. Reported to restore a style classifier on Glaze-protected art
  from **42.5% to 87.0%** accuracy.
- **LightShed** (Foerster et al., USENIX Security 2025). Detects Nightshade-
  protected images with reported **99.98%** accuracy and strips the perturbation;
  a single learned purifier generalizes across Glaze and Nightshade.
- **Zhao et al. - "Invisible Image Watermarks Are Provably Removable Using
  Generative AI"** (NeurIPS 2023; arXiv:2306.01953). A regeneration attack removes
  content-based invisible watermarks - **the same class as our DCT watermark**.

For OpenArtShield this is a feature, not a defeat: it confirms the project's
thesis (measurable, not guaranteed) and points the work toward being an honest
**measurement and benchmarking harness** rather than another breakable shield.

## What each protection actually attacks

A key technical finding: **no serious protection attacks the CLIP text-image
cosine space that our current cloak targets.** They act on the diffusion model's
own latent/feature space or its training process.

| Method                             | Target surface                                                              | Reported effect / cost                                                                                                          | Source                            |
| ---------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Glaze**                          | LDM image feature extractor / VAE encoder (autoencoder-KL)                  | Style-cloak matches a style-shifted target in feature space; PSR >92% claimed; gradient-based, needs a differentiable extractor | USENIX Sec 2023; arXiv:2302.04222 |
| **PhotoGuard**                     | VAE/latent encoder ("encoder attack") or full pipeline ("diffusion attack") | Breaks diffusion **editing/inpainting**; authors concede purification defeats it                                                | ICML 2023; arXiv:2302.06588       |
| **Mist / AdvDM / Anti-DreamBooth** | Diffusion UNet / fine-tuning (DreamBooth personalization)                   | Poisons customization on the artist's images                                                                                    | arXiv:2303.16378                  |
| **Nightshade**                     | Training data (prompt-specific poisoning)                                   | <100 optimized samples corrupt a concept in SDXL                                                                                | IEEE S&P 2024                     |
| **StyleGuard** (2025)              | Style loss over VAE + OpenCLIP features (mean/variance, Gram/AdaIN-style)   | Targets _style statistics_, not raw cosine distance                                                                             | arXiv:2505.18766                  |

**Two lessons for us:**

1. The space that matters for diffusion is the **VAE/latent encoder**, not CLIP
   text-image cosine. Our cloak optimizes a weak proxy.
2. For _style_ specifically, the meaningful signal is a **feature-statistics loss
   (Gram / mean-variance)**, not cosine drift.

## Transferability (our central open question)

- Glaze **reports** within-family transfer (cloak with one extractor, mimic with
  another SD extractor: PSR >90%), but protection degrades most when architecture
  **and** training data both differ. This matches what OpenArtShield already
  measured with CLIP variants in [`examples/cloak-transfer/`](../examples/cloak-transfer/README.md).
- There is dedicated work on **transfer-robust / black-box** perturbation that
  exploits diffusion models' generative and discriminative signals to cross
  models (arXiv:2305.08192).
- **Gradient-free** black-box attacks exist and are directly relevant to our
  gradient-free greedy search - e.g. **ABCAttack** (Entropy/MDPI), which uses an
  Artificial Bee Colony swarm on softmax outputs alone.

## Evaluation: how the field measures "protection"

We currently report embedding drift. The field measures **degradation of the
actual mimicked output**:

- **CopyrightMeter** (arXiv:2411.13144, 2024) - a unified benchmark of 17
  protections x 16 attacks x 10 metrics across three axes we should mirror:
  **fidelity** (how invisible the protection is), **efficacy** (how much it
  degrades mimicry), and **robustness** (how well it survives removal attacks).
- Common metrics: LPIPS / FID / CLIP-similarity between the artist's work and the
  model's mimicked output, plus human studies (Glaze's artist-rated PSR).

The honest gap: raw embedding drift is not shown to correlate with "the model
struggles to mimic this." A protection-success metric must measure the _output_.

## What is feasible in a CPU-only, transformers.js / ONNX stack

- **VAE encoder of Stable Diffusion as ONNX** -> attack the _latent_ with our
  gradient-free greedy search. Moves us from "CLIP proxy" to the real diffusion
  surface.
- **Style-statistics scoring** (Gram / mean-variance) over features we already
  extract.
- **The attacks as a robustness suite**: noisy-upscaling, JPEG, and an
  autoencoder-reconstruction purifier (IMPRESS-style) - all CPU-feasible.
- **Output-degradation proxy**: an autoencoder round-trip + LPIPS as a stand-in
  for "does mimicry get worse," short of running a full diffusion pipeline.

## Ranked research lines for OpenArtShield

Scored by (scientific value x CPU/TypeScript feasibility):

1. **Robustness-under-attack suite.** Add the published removal attacks (noisy
   upscaling, JPEG, autoencoder/diffusion-reconstruction purification) and report
   how much cloak drift **survives** each. High value, high feasibility. This
   operationalizes the critiques above and is the most honest, differentiating
   thing we can build. _(In progress - see the robustness attack work extending
   the EOT suite.)_
2. **VAE-latent cloak.** Attack a Stable Diffusion VAE encoder's latent (via ONNX)
   instead of CLIP, with the greedy black-box search. High value (real surface),
   medium feasibility (VAE is slower on CPU).
3. **Style-statistics scoring.** Score candidates on Gram / mean-variance feature
   statistics (StyleGuard-style) rather than raw cosine. Reuses existing feature
   extraction.
4. **Honest protection-success metric.** A lightweight editing/reconstruction
   proxy (autoencoder round-trip + LPIPS) instead of embedding drift alone.
5. **Benchmark posture (CopyrightMeter-style).** Position OpenArtShield as the
   reproducible harness that measures protections _against_ attacks - the axis
   that makes it unique.
6. **Declare / provenance via C2PA cryptographic signing**, not invisible
   watermarking - because Zhao et al. shows content watermarks are removable,
   while a cryptographic signature stays verifiable.

## Sources

Primary unless noted. Verify figures against the originals before citing.

- Glaze - USENIX Security 2023 - arXiv:2302.04222
- PhotoGuard ("Raising the Cost of Malicious AI-Powered Image Editing") - ICML 2023 - arXiv:2302.06588
- Nightshade - IEEE S&P 2024
- Anti-DreamBooth - ICCV 2023 - arXiv:2303.16378
- StyleGuard - 2025 - arXiv:2505.18766
- Honig et al., "Adversarial Perturbations Cannot Reliably Protect Artists" - ICLR 2025 - arXiv:2406.12027
- IMPRESS - NeurIPS 2023 - arXiv:2310.19248
- LightShed - USENIX Security 2025
- Zhao et al., "Invisible Image Watermarks Are Provably Removable Using Generative AI" - NeurIPS 2023 - arXiv:2306.01953
- Transfer-robust / black-box perturbation - arXiv:2305.08192
- ABCAttack (gradient-free black-box) - Entropy/MDPI
- CopyrightMeter - 2024 - arXiv:2411.13144
