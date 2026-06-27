import { extname } from "node:path";
import type sharp from "sharp";
import type { PixelImage } from "@openartshield/core";
import { pixelImageToSharp } from "./sharp-utils.js";

export type WriteImageOptions = {
  /** 1-100, only used for JPEG/WebP. */
  quality?: number;
};

type OutputFormat = "png" | "jpeg" | "webp";

function formatFromPath(path: string): OutputFormat {
  const ext = extname(path).toLowerCase();
  switch (ext) {
    case ".png":
      return "png";
    case ".jpg":
    case ".jpeg":
      return "jpeg";
    case ".webp":
      return "webp";
    default:
      throw new Error(`Unsupported output extension "${ext}". Use .png, .jpg/.jpeg, or .webp.`);
  }
}

// Apply the right encoder to the pipeline. JPEG gets flattened first since it
// can't carry alpha.
function applyFormat(
  pipeline: sharp.Sharp,
  format: OutputFormat,
  quality: number | undefined,
): sharp.Sharp {
  const opts = quality !== undefined ? { quality } : {};
  switch (format) {
    case "png":
      return pipeline.png();
    case "jpeg":
      return pipeline.flatten().jpeg(opts);
    case "webp":
      return pipeline.webp(opts);
  }
}

// Encode a PixelImage and write it out. Format comes from the file extension.
export async function writeImage(
  image: PixelImage,
  path: string,
  options: WriteImageOptions = {},
): Promise<void> {
  const pipeline = applyFormat(pixelImageToSharp(image), formatFromPath(path), options.quality);
  await pipeline.toFile(path);
}

// Same, but to a Buffer instead of a file.
export async function encodeImage(
  image: PixelImage,
  format: OutputFormat,
  options: WriteImageOptions = {},
): Promise<Buffer> {
  return applyFormat(pixelImageToSharp(image), format, options.quality).toBuffer();
}
