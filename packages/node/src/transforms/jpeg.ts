import type { ImageTransform } from "@openartshield/core";
import { jpegRoundTrip } from "./util.js";

// JPEG compression at a given quality - the bread-and-butter "saved as JPEG"
// damage. Keeps the dimensions.
export function jpegCompression(quality: number, name: string): ImageTransform {
  return {
    name,
    apply: (image) => jpegRoundTrip(image, quality),
  };
}

export const jpegQuality95 = jpegCompression(95, "jpeg_quality_95");
export const jpegQuality85 = jpegCompression(85, "jpeg_quality_85");
export const jpegQuality70 = jpegCompression(70, "jpeg_quality_70");

export const jpegTransforms: ImageTransform[] = [jpegQuality95, jpegQuality85, jpegQuality70];
