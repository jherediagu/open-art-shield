// @openartshield/node - the Node side: image IO and the sharp-based transforms.
// The actual watermarking lives in @openartshield/core; we don't reimplement it.

// Image IO.
export { readImage, decodeImage } from "./io/read-image.js";
export { writeImage, encodeImage, type WriteImageOptions } from "./io/write-image.js";

// Transforms.
export type { TransformGroup, ImageTransform } from "./transforms/types.js";
export {
  jpegCompression,
  jpegQuality95,
  jpegQuality85,
  jpegQuality70,
  jpegTransforms,
} from "./transforms/jpeg.js";
export { resizeRoundTrip, resize75, resize50, resizeTransforms } from "./transforms/resize.js";
export { centerCropResize, centerCrop90, cropTransforms } from "./transforms/crop.js";
export {
  gaussianBlur,
  gaussianBlur075,
  gaussianBlur125,
  blurTransforms,
} from "./transforms/blur.js";
export {
  brightness,
  contrast,
  brightness09,
  brightness11,
  contrast09,
  contrast11,
  colorTransforms,
} from "./transforms/color.js";
export { screenshotSimulation, screenshotTransforms } from "./transforms/screenshot.js";
export {
  defaultTransforms,
  transformsByName,
  selectTransforms,
  composeTransforms,
} from "./transforms/pipeline.js";

// Audit.
export { auditProtectedImage, embedAndAudit } from "./audit/node-audit-runner.js";
