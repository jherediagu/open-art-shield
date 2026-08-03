// @openartshield/web - browser bindings for OpenArtShield.
//
// The core SDK is pure TypeScript with no Node APIs, so everything it exports
// (DCT watermarking, payload codecs, audits, TrustMark data layer) already
// runs in the browser. This package adds the browser-specific edges: canvas
// image IO, ImageData conversion, and in-browser TrustMark verification.
// Everything runs client-side - the image never leaves the page.

// The full pure SDK, re-exported for one-stop imports.
export * from "@openartshield/core";

// ImageData <-> PixelImage (pure).
export { pixelImageFromImageData, imageDataFromPixelImage } from "./image-data.js";
export type { ImageDataLike } from "./image-data.js";

// Canvas IO (browser-only).
export { loadPixelImage, pixelImageToBlob } from "./canvas.js";
export type { EncodeBlobOptions } from "./canvas.js";

// In-browser TrustMark verification (optional 'onnxruntime-web' dependency).
export { createTrustmarkWebDecoder, trustmarkInputFromImage } from "./trustmark-decoder.js";
export type { TrustmarkWebDecoder, TrustmarkWebDecoderOptions } from "./trustmark-decoder.js";
