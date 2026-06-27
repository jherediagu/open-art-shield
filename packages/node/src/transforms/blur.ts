import type { ImageTransform } from "@openartshield/core";
import { sharpToPixelImage, pixelImageToSharp } from "../io/sharp-utils.js";

// Gaussian blur. It eats exactly the mid/high-frequency content the watermark
// lives in, so it's a good stress test.
export function gaussianBlur(sigma: number, name: string): ImageTransform {
  return {
    name,
    apply: (image) => sharpToPixelImage(pixelImageToSharp(image).blur(sigma)),
  };
}

export const gaussianBlur075 = gaussianBlur(0.75, "gaussian_blur_0_75");
export const gaussianBlur125 = gaussianBlur(1.25, "gaussian_blur_1_25");

export const blurTransforms: ImageTransform[] = [gaussianBlur075, gaussianBlur125];
