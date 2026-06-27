import sharp from "sharp";
import type { PixelImage } from "@openartshield/core";
import { sharpToPixelImage } from "./sharp-utils.js";

// Read an image file (PNG/JPEG/WebP/whatever sharp handles) into a PixelImage.
export async function readImage(path: string): Promise<PixelImage> {
  return sharpToPixelImage(sharp(path));
}

// Same thing but from a buffer in memory - handy when a transform round-trips
// through encoded bytes.
export async function decodeImage(buffer: Buffer): Promise<PixelImage> {
  return sharpToPixelImage(sharp(buffer));
}
