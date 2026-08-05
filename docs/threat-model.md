# Threat model

What OpenArtShield defends, against whom, and - just as important - what it
does **not**. Every claim below is tied to something measurable in this repo
(the [benchmark](benchmarks/latest.md), the attack suite, the research notes
in [research.md](research.md)); nothing is aspirational.

## Assets

1. **The artwork itself** - the pixels an artist publishes.
2. **Attribution** - the ability to later show "this file carries my mark".
3. **Usage intent** - the declared terms ("no AI training") and their
   legal weight under the EU AI Act / Art. 4(3) DSM reservation.
4. **The link between the two** - provenance that connects a found copy back
   to the declaration, even after re-encoding.

## Adversary tiers

We model three tiers, in increasing capability. The honest headline: **our
layers hold against tiers 1-2 in measured conditions, and no watermark or
cloak - ours or anyone's - reliably holds against tier 3.**

### Tier 1 - Lossy infrastructure (no intent to strip)

Platforms that re-encode uploads (JPEG/WebP), resize, crop thumbnails, strip
all metadata; users who screenshot and repost.

- What survives: TrustMark payloads in 16-18/18 benchmark conditions;
  DCT payloads in 8-14/18 depending on image texture; durable declarations
  (`oas recover`) whenever the watermark survives, because the recovery ID
  lives in the pixels.
- What dies: everything metadata-based (C2PA manifests, XMP opt-outs) - by
  design they are complements, not the durable layer.

### Tier 2 - Casual stripper (off-the-shelf removal)

Someone who deliberately runs cheap removal: aggressive JPEG, noise + public
upscaler ("noisy upscaling"), blur/purification filters - the published
low-effort attacks from the robustness literature.

- What survives: TrustMark held in the benchmark's `gaussian_purify` and
  `noisy_upscale` conditions on all three textures; `jpeg_quality_30` broke
  it on two of three. The DCT baseline mostly falls here.
- Caveat: our attack implementations are CPU proxies of the published
  methods (see `oas attack`); a stronger implementation of the same idea
  removes more.

### Tier 3 - Motivated adversary (adaptive, model-equipped)

Someone running WAVES-class attacks: diffusion regeneration, adversarial
optimization against the specific decoder, watermark forgery, or - for
cloaks - the IMPRESS/LightShed purification family.

- **No protection in this repo survives this tier, and we know of no
  published watermark or cloak that reliably does** (see research.md:
  Hönig et al. ICLR 2025, WAVES, LightShed, single-image semantic forgery).
- What still holds at tier 3: **timestamped, signed declarations**. A C2PA
  signature over the stamped file plus the durable record's hash binding
  remain cryptographically verifiable evidence of _what you declared and
  when_ - the adversary can strip the mark from their copy, but cannot
  unsign yours. This is why the Declare layer, not the watermark, is the
  backbone claim.

## Per-layer claims

| Layer                     | Claims                                                                       | Does NOT claim                                                                  |
| ------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Trace (DCT)               | Detectable mark under mild transforms; measurable via `oas audit`            | Robustness to resize/crop/screenshot (measured: it breaks)                      |
| Trace (TrustMark)         | Robust payload under tier 1-2 conditions (benchmarked)                       | Resistance to tier 3; forgery resistance                                        |
| Declare (C2PA/XMP/TDMRep) | Verifiable, legally meaningful reservation; survives while metadata survives | Any technical prevention; survival through re-encoding                          |
| Durable credentials       | Recovery of the declaration from pixels alone (tier 1); tamper-evident store | Recovery after tier 2-3 watermark removal; proof of authorship by itself        |
| Cloak                     | Measurable embedding drift, EOT-scored                                       | Protection from mimicry (consensus: perturbations are friction, not protection) |
| Measure/Audit             | Honest numbers for all of the above                                          | -                                                                               |

## Out of scope

- DRM, copy prevention, screenshot prevention.
- Proving _authorship_ cryptographically (a signature proves who signed,
  not who created; pair with your own evidence chain).
- Adversaries inside the store: `oas recover` detects a tampered manifest
  record (hash mismatch) but cannot restore it - keep backups.
- Legal enforcement. We produce evidence and machine-readable reservations;
  courts and regulators do the rest.

## Security of the software itself

Vulnerability reports: see [security.md](../security.md). The SDK processes
untrusted images; the image-parsing surface is delegated to `sharp`/libvips
(Node) and the browser's own decoders (web). The REST server ships without
authentication by design - deploy it behind your gateway.
