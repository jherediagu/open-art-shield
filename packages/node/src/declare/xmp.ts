import { extname } from "node:path";
import sharp from "sharp";
import type { PixelImage } from "@openartshield/core";
import { pixelImageToSharp } from "../io/sharp-utils.js";

// XMP embedding for the opt-out layer. The packet itself is built by the pure
// buildXmpDataMiningPacket in @openartshield/core; this file just re-encodes
// the image with the packet attached, keeping the rest of the metadata
// (EXIF, ICC) intact.

export type WriteXmpOptions = {
  /** 1-100, only used for JPEG/WebP output. */
  quality?: number;
};

function applyOutputFormat(
  pipeline: sharp.Sharp,
  path: string,
  quality: number | undefined,
): sharp.Sharp {
  const ext = extname(path).toLowerCase();
  const opts = quality !== undefined ? { quality } : {};
  switch (ext) {
    case ".png":
      return pipeline.png();
    case ".jpg":
    case ".jpeg":
      return pipeline.flatten().jpeg(opts);
    case ".webp":
      return pipeline.webp(opts);
    default:
      throw new Error(`Unsupported output extension "${ext}". Use .png, .jpg/.jpeg, or .webp.`);
  }
}

/**
 * Write a copy of the image with the given XMP packet attached, preserving
 * the existing EXIF/ICC metadata. Any existing XMP is replaced.
 */
export async function writeImageWithXmp(
  input: string,
  output: string,
  xmpPacket: string,
  options: WriteXmpOptions = {},
): Promise<void> {
  const pipeline = sharp(input).keepMetadata().withXmp(xmpPacket);
  await applyOutputFormat(pipeline, output, options.quality).toFile(output);
}

/**
 * Encode a PixelImage to a buffer with an XMP packet attached. The buffer
 * variant of writeImageWithXmp, for servers and pipelines without files.
 */
export async function encodeImageWithXmp(
  image: PixelImage,
  format: "png" | "jpeg" | "webp",
  xmpPacket: string,
  options: WriteXmpOptions = {},
): Promise<Buffer> {
  const pipeline = pixelImageToSharp(image).withXmp(xmpPacket);
  const opts = options.quality !== undefined ? { quality: options.quality } : {};
  switch (format) {
    case "png":
      return pipeline.png().toBuffer();
    case "jpeg":
      return pipeline.flatten().jpeg(opts).toBuffer();
    case "webp":
      return pipeline.webp(opts).toBuffer();
  }
}

/** Read the XMP packet of an image, or null when it has none. */
export async function readImageXmp(input: string): Promise<string | null> {
  const metadata = await sharp(input).metadata();
  const xmp = (metadata as { xmp?: Buffer }).xmp;
  return xmp !== undefined ? Buffer.from(xmp).toString("utf8") : null;
}
