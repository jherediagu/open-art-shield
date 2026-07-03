import type { PixelImage } from "../types.js";
import type { ImageTransform } from "../audit/types.js";
import type { TransferReport } from "./transfer.js";

// AI-perception measurement layer.
//
// The goal here is NOT to protect anything yet. It is to *measure* how a model
// "sees" an image: given two images (typically an original and a candidate /
// protected version), how far apart are their embeddings, and does that distance
// survive the usual transformations?
//
// Backends are pluggable behind EmbeddingBackend. v0.1 ships only a deterministic
// mock backend (a downsampled-luma feature, NOT a learned model) so the whole
// pipeline can be built and tested without Python or model weights. A real
// CLIP/OpenCLIP backend (transformers.js) plugs in later without touching the
// runner.

/** A dense embedding vector. */
export type Embedding = number[];

export type EmbeddingBackend = {
  /** Stable identifier, e.g. "mock" or "transformers:Xenova/clip-vit-base-patch32". */
  readonly id: string;
  /** Embed an image into a vector. May be async (a real model usually is). */
  embedImage(image: PixelImage): Promise<Embedding> | Embedding;
  /** Optional text embedding (CLIP-style). Absent if the backend can't do it. */
  embedText?(text: string): Promise<Embedding> | Embedding;
};

export type EmbeddingAuditConfig = {
  /** Optional prompt for image<->text drift, used only if the backend supports text. */
  prompt?: string;
  /** Transforms applied to the candidate to test whether drift survives them. */
  transforms?: ImageTransform[];
  /** Recorded in the report for traceability. */
  originalPath?: string;
  candidatePath?: string;
};

export type TransformDriftResult = {
  transform: string;
  /** Cosine similarity between the original and the transformed candidate. */
  cosineToOriginal: number;
  /** Drift = 1 - cosineToOriginal. */
  drift: number;
  /** PSNR/SSIM of the transformed candidate vs. the candidate (image damage). */
  psnr: number | null;
  ssim: number | null;
};

export type EmbeddingAuditReport = {
  version: typeof EMBEDDING_REPORT_VERSION;
  backend: string;
  image: { original?: string; candidate?: string };
  embedding: {
    dimensions: number;
    /** Cosine similarity between original and candidate embeddings. */
    cosineSimilarity: number;
    /** Euclidean distance between original and candidate embeddings. */
    distance: number;
    /** Drift = 1 - cosineSimilarity. Higher = the model sees them as more different. */
    drift: number;
  };
  prompt?: {
    text: string;
    originalSimilarity: number;
    candidateSimilarity: number;
    /** candidateSimilarity - originalSimilarity. */
    delta: number;
  };
  transforms: TransformDriftResult[];
  summary: {
    transformsTested: number;
    meanDriftAfterTransforms: number;
  };
  /**
   * Optional transfer measurement: drift for the same image pair on additional
   * embedding models, with per-model transfer ratios. Present only when
   * comparison models were requested.
   */
  transfer?: TransferReport;
  /** Honest, machine-readable caveat carried inside the report. */
  limitations: string;
};

export const EMBEDDING_REPORT_VERSION = "0.2.0";

export const EMBEDDING_AUDIT_LIMITATIONS =
  "Embedding drift measures how a model's representation changes. It does not " +
  "prove protection from AI training, copying, or style mimicry. The v0.1 'mock' " +
  "backend is a deterministic downsampled-luma feature, not a learned perceptual " +
  "model; use a real backend (e.g. transformers.js) for meaningful numbers.";
