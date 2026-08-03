# Product research: making OpenArtShield a real SDK for artists and B2B

This document complements [`RESEARCH.md`](RESEARCH.md) (which covers the
adversarial/cloaking science) with the product side: what exists in the market,
what integrators and artists actually need, which recent techniques we have not
yet covered, and what it would take to turn OpenArtShield into an SDK that
users and businesses adopt.

> **Method note.** Compiled August 2026 from a three-track parallel research
> sweep (recent papers 2024–2026, market/competitor landscape, SDK/DX
> requirements) with primary sources linked inline. Figures are "as reported by
> the cited source."

## The market gap (why this project has a real slot)

**No open-source SDK combines invisible watermarking + C2PA provenance +
robustness auditing in a single flow.** Today a developer must compose:

- `c2pa-js` / `@contentauth/c2pa-node` — manifests/signing only, no watermark
  (the JS repos were consolidated into one monorepo in June 2026).
- Adobe **TrustMark** (MIT) — watermarking with C2PA soft-binding examples, but
  no robustness audit, and the official JS build only decodes.
- `invisible-watermark` (Python, DWT-DCT) — no C2PA, no audit.
- Research code (Stable Signature, Watermark Anything, VINE) — not products.

The complete suites (Digimarc, Imatag, Steg.AI, Truepic) are enterprise,
sales-led, with no free tier or self-serve. The npm/TypeScript ecosystem is
especially empty: serious invisible watermarking lives in Python/Rust; in JS
there is only C2PA reading and TrustMark decoding. **A TS SDK with
embed + verify + audit is a real, defensible gap** — and robustness auditing
as a product feature does not exist in OSS at all.

Two macro-tailwinds:

1. **Post-LightShed narrative shift (2025–2026).** After LightShed (USENIX Sec 2025) showed cloaks are detectable/strippable at 99.98% accuracy, press and
   community moved from "cloaking as a shield" to **layered defense**:
   signed provenance + durable watermark + crawler blocking + opt-outs + legal
   enforcement. Our honest measure-don't-promise framing is exactly aligned.
2. **EU AI Act.** Art. 53 (in force Aug 2025) requires GPAI providers to
   respect machine-readable TDM opt-outs (Art. 4(3) DSM); Art. 50(2) (in force
   Aug 2026) makes machine-readable marking of AI outputs mandatory (fines up
   to €15M / 3% turnover; pre-existing systems have until Dec 2026).
   Watermarking and opt-out tooling becomes compliance spend, not optional.

## New technical findings (beyond RESEARCH.md)

### Watermarking: what actually holds up

- **TrustMark** (Adobe, ICCV 2025, MIT, [github.com/adobe/trustmark](https://github.com/adobe/trustmark)) —
  post-hoc multi-bit watermark, arbitrary resolution, >96% bit accuracy at
  42–45 dB PSNR under heavy degradation. Listed in the official **C2PA Soft
  Binding Algorithm List**. Official JS/ONNX decoder exists — the natural fit
  for our onnxruntime-node stack, and the best practical/deployable
  compromise today.
- **VINE** (ICLR 2025, arXiv:2410.18775) — first watermark trained explicitly
  against generative editing; best partial answer to "does anything survive
  regeneration"; heavy (SDXL-Turbo encoder), decoder possibly exportable.
- **SynthID-Image** (Google, arXiv:2510.09263) — internet-scale but closed;
  OpenAI adopted SynthID in May 2026 → de-facto proprietary standard risk for
  _generated_ content. The OSS space is protection of _human_ content and
  multi-scheme verification.
- Attacks keep winning: WAVES benchmark, "A Crack in the Bark" (Tree-Ring),
  single-image forgery of semantic watermarks (CVPR 2025), NeurIPS 2024
  removal challenge. **Consensus: no published watermark reliably survives
  dedicated adversarial regeneration.** The industry answer is C2PA
  **Durable Content Credentials**: cryptographic manifest (hard binding) +
  watermark as recoverable pointer (soft binding), i.e. the watermark is
  assumed removable but not forgeable-in-context.

### Provenance: ready to implement today

- **C2PA 2.2** (May 2025) formalizes durable credentials and the Soft Binding
  Resolution API; a conformance program launched in 2025.
- **CAWG "Training and Data Mining" assertion v1.1** (ratified May 2025) is
  the in-asset opt-out vocabulary (allow/deny data mining, AI training,
  generative training).
- `@contentauth/c2pa-node` gives us signing/verification in TypeScript with
  prebuilt binaries. **This is the highest value-per-effort item in the whole
  report**: C2PA 2.2 + CAWG assertion + TrustMark soft binding =
  full Durable Content Credentials in our monorepo, CPU-only.
- Caveat: there is no "Let's Encrypt for C2PA" — the trust list requires
  paid certs (DigiCert et al.). DX pattern: local keygen + self-signed to
  start, KMS/HSM for enterprise, client-provided certs for trust-list interop.

### Proving training use (the "did they train on my art" ask)

- **Position paper (IEEE SaTML 2025, arXiv:2409.19798):** post-hoc membership
  inference cannot _prove_ training use — only **a-priori canaries** can.
  Direct implication: proactive marking before publication is the only
  evidentiary path, which is exactly what an SDK can do.
- **DIAGNOSIS** (ICLR 2024) — imperceptible "coating" (warping) that a
  fine-tuned model memorizes; detection via binary classifier on outputs.
  Marking side is CPU-trivial → feasible in our stack as a research line.
- **CDI** (CVPR 2025, arXiv:2411.12858) — dataset inference: with ≥70 works
  from one creator, >99% confidence on whether a dataset was used. Python,
  needs model access; viable as a companion service, not in-SDK.

### Anti-mimicry: where the field settled

- ICLR 2025 consensus stands: perturbations are friction, not protection.
- The only paradigm compatible with CPU/edge is **one-pass perturbation
  generation** ("Nearly Zero-Cost Protection", CVPR 2025, arXiv:2412.11423) —
  a pretrained generator, milliseconds instead of minutes of optimization.
  Relevant as an eventual replacement for our greedy search.
- No certified protection exists (certificates currently favor the attacker).

### Machine-readable opt-out (cheap, high-value, unclaimed in TS)

Layers a single SDK call could emit:

| Layer          | Mechanism                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| In-file XMP    | IPTC `plus:DataMining` (best-practice PDF from IPTC)                                                                         |
| In-file signed | C2PA/CAWG training-mining assertion                                                                                          |
| Site-level     | TDMRep `/.well-known/tdmrep.json` + `tdm-reservation` header (W3C CG, deployed by EU publishers, read by Spawning/Stability) |
| Site-level     | `ai.txt` (Spawning); Cloudflare Content Signals (`ai-train`)                                                                 |
| Future         | IETF **AIPREF** WG (RFC expected ~late 2026) — design our data model to map onto it                                          |

Spawning's `datadiligence` (Python) is the closest thing to an opt-out
compliance library; **no TypeScript equivalent exists.**

## What users need

### Artists (evidence from Glaze/Cara/Overlai adoption)

Demand is proven: 8.5M Glaze + 2.5M Nightshade downloads, months-long WebGlaze
waitlists, Cara's viral growth, 1.5B+ works in Spawning's Do-Not-Train
registry. What they consistently ask for:

- **No GPU, no desktop install, works from mobile** (Glaze needs NVIDIA and
  12–60 min/image; the success of ibis Paint's fast filter proves speed wins).
- **Privacy** — distrust of cloud tools ("is this harvesting my art?");
  client-side/local processing is a differentiator WebGlaze cannot offer.
- **Automatic protection at publish time** (the Cara × Glaze pattern), not a
  manual per-image workflow.
- Protection that **survives platform re-encoding** (C2PA metadata dies on
  TikTok/Instagram pipelines and screenshots → durable credentials).

### B2B integrators (who would embed the SDK)

1. **Portfolio/social art platforms** (Cara-like): protect-on-upload pipeline —
   batch/queue, async + webhooks, per-user intensity. Cara had to build its
   Glaze integration ad-hoc; there is no reusable SDK for this.
2. **Stock/marketplaces/agencies**: forensic per-buyer watermark
   (traitor-tracing), credential verification at ingest, AI-content detection,
   licensing reports. All enterprise-only today → self-serve/OSS gap.
3. **Image infra/DAM/CDN** (Cloudinary implemented C2PA; Catbox hosts Mist as
   a paid plan feature): on-the-fly C2PA + watermark surviving transforms.
4. **Creative tools** (Krita/ibis-style export filters) as SDK/WASM clients.
5. **Rights managers / legal-tech** (Pixsy-like): watermark detection as
   evidence after crops/compression, dataset monitoring, DMCA evidence export.
6. **AI labs (buy side)**: opt-out verification pre-training (`datadiligence`
   model) and AI Act Art. 50 output-marking compliance.

Recurring functional needs: **batch + async + webhooks, symmetric
embed/verify, quantified robustness (audit reports), C2PA↔watermark soft
binding, monitoring/matching, legal evidence export.**

## Product architecture implications

**Split the SDK by latency budget — two products, not one:**

- `protect` (watermark + metadata + C2PA): milliseconds, CPU, sync — fits an
  upload pipeline. This is the B2B product.
- `cloak`: minutes, GPU-leaning, always async (job states + webhook; "protect
  your 10k-image catalog overnight"). This is the artist/batch product, kept
  honestly experimental.

Deployment surface, in priority order (patterns from c2pa-js and sharp:
one Rust/TS core + per-runtime bindings under one npm scope, prebuilt
binaries):

1. **`@openartshield/web`** — WASM (+ optional WebGPU via onnxruntime-web) for
   watermark/verify client-side. Enables the zero-infra artist web app
   ("your image never leaves your browser").
2. **Docker self-hosted REST server** (`protect/verify/audit` + async jobs +
   webhooks) — the artifact a platform team actually evaluates.
3. **Hosted API** for what can't be self-hosted: web monitoring, GPU cloaking,
   signing notary — the open-core paid tier (Imatag charges from €299/mo for
   monitoring alone).
4. Plugins (Photoshop/Figma/WordPress/Shopify) later, as clients of the API.
   GPU without owning infra: Replicate (community model), HF Spaces ZeroGPU
   (demo), Modal (reference batch deploy).

Canonical API surface the sector converges on:

```
protect(image, opts) → protected image + manifest    [watermark sync | cloak async]
verify(image)        → { watermarked?, payload, confidence, manifest?, tampered? }
audit(image|pair)    → robustness / drift report     [our unique differentiator]
monitor(assetId)     → web matches                   [hosted-only, the recurring revenue]
```

Format rules: JPEG/PNG/WebP minimum (TIFF for photo/stock, AVIF for delivery
later); always preserve EXIF/XMP + color profile; sidecar manifest by default
with the watermark payload as recovery pointer (durable-credentials pattern).

## Trust & sustainability

- Credibility artifacts for a security-adjacent OSS project: published threat
  model, reproducible continuous robustness benchmarks (fixed datasets, seeds,
  CI-published results), SECURITY.md, OpenSSF Best Practices badge +
  Scorecard. **Our audit suite is the differentiator: post-LightShed, nobody
  believes in absolute protection — but "know exactly how much your protection
  survives" is credible and nobody ships it.**
- Funding precedents: Glaze/Nightshade live on NSF/DARPA grants + donations;
  Spawning is VC-backed; Imatag/Steg.AI are enterprise SaaS. Realistic model
  here: **open core** (MIT SDK + self-host free → hosted monitor/GPU/notary
  paid → enterprise on-prem) + niche grants (NLnet/NGI, Sovereign Tech Fund,
  Mozilla Tech Fund — "consent/provenance layer" fits their calls).

## Proposed roadmap extension

Ranked by (user value × feasibility in our TS/ONNX/CPU stack):

1. **v0.7 — Declare layer (C2PA + opt-out).** `oas declare`: sign/verify C2PA
   2.2 manifests with the CAWG training-mining assertion via
   `@contentauth/c2pa-node`; local keygen + self-signed for instant DX.
   `oas optout`: write IPTC XMP + emit `tdmrep.json`/headers + `ai.txt` in one
   command. Immediate, CPU-only, fills the empty "Declare" layer, rides the
   AI Act tailwind.
2. **v0.8 — Durable credentials.** TrustMark as an additional watermark
   backend (official ONNX decoder exists; MIT) and soft binding: watermark
   payload ↔ sidecar/remote manifest recovery, so provenance survives
   platform re-encoding. Benchmark TrustMark vs our DCT under `oas attack`.
3. **v0.9 — Integration surface.** `@openartshield/web` (WASM watermark/verify)
   - Docker REST server with async jobs/webhooks; static client-side web app +
     public verifier as demo and marketing.
4. **v1.0 — Benchmark posture.** CopyrightMeter-style continuous public
   benchmark (protections × attacks × metrics), published threat model,
   OpenSSF badge. Position: "the reproducible harness that measures what
   holds up."
5. **Research track (parallel):** DIAGNOSIS-style proactive coating as
   training-evidence canary (CPU-trivial marking; aligns with the
   "only a-priori marks can prove" doctrine); one-pass cloak generator to
   replace greedy search; CDI-based portfolio audit as Python companion.

## Sources

Key additions beyond RESEARCH.md (primary unless noted):

- TrustMark — ICCV 2025 — github.com/adobe/trustmark (MIT)
- VINE / W-Bench — ICLR 2025 — arXiv:2410.18775
- SynthID-Image — arXiv:2510.09263
- WAVES benchmark — ICML 2024 — arXiv:2401.08573
- Semantic watermark forgery — CVPR 2025 — arXiv:2412.03283
- Watermarking survey — arXiv:2510.02384
- C2PA 2.2 spec + Soft Binding API — spec.c2pa.org
- CAWG Training & Data Mining assertion v1.1 — cawg.io/training-and-data-mining/1.1/
- c2pa-js / @contentauth/c2pa-node — github.com/contentauth/c2pa-js
- MIAs cannot prove training — IEEE SaTML 2025 — arXiv:2409.19798
- CDI dataset inference — CVPR 2025 — arXiv:2411.12858
- DIAGNOSIS — ICLR 2024 — arXiv:2307.03108
- Nearly Zero-Cost Protection — CVPR 2025 — arXiv:2412.11423
- LightShed — USENIX Security 2025 — trust-lightshed.github.io
- TDMRep — W3C CG Final Report, May 2024; IETF AIPREF WG — datatracker.ietf.org/wg/aipref
- IPTC Data Mining opt-out best practices — iptc.org
- EU AI Act Art. 50/53 analyses — artificialintelligenceact.eu
- Market: Imatag API, Steg.AI, Digimarc, Truepic, Vermillio, Spawning
  (datadiligence), Cloudflare pay-per-crawl, Cara × Glaze, Overlai — URLs in
  the underlying sweep, available on request.
