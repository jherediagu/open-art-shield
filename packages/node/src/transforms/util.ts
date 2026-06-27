import sharp from "sharp";
import type { PixelImage } from "@openartshield/core";
import { sharpToPixelImage, pixelImageToSharp } from "../io/sharp-utils.js";
import { decodeImage } from "../io/read-image.js";

// Shared building blocks for the transforms.

export async function resizeTo(
  image: PixelImage,
  width: number,
  height: number,
  options?: sharp.ResizeOptions,
): Promise<PixelImage> {
  return sharpToPixelImage(pixelImageToSharp(image).resize(width, height, options));
}

// Encode to JPEG at `quality` and decode back - that's the lossy damage. Result
// is always 3-channel (JPEG has no alpha).
export async function jpegRoundTrip(image: PixelImage, quality: number): Promise<PixelImage> {
  const buffer = await pixelImageToSharp(image).flatten().jpeg({ quality }).toBuffer();
  return decodeImage(buffer);
}

// Fractional pixel count -> a valid positive integer.
export function toPixels(value: number): number {
  return Math.max(1, Math.round(value));
}
