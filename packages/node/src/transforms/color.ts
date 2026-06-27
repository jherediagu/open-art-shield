import type { ImageTransform } from "@openartshield/core";
import { sharpToPixelImage, pixelImageToSharp } from "../io/sharp-utils.js";

// Brightness: factor < 1 darkens, > 1 brightens.
export function brightness(factor: number, name: string): ImageTransform {
  return {
    name,
    apply: (image) => sharpToPixelImage(pixelImageToSharp(image).modulate({ brightness: factor })),
  };
}

// Contrast around the 128 midpoint: out = factor*(in - 128) + 128.
export function contrast(factor: number, name: string): ImageTransform {
  const offset = 128 * (1 - factor);
  return {
    name,
    apply: (image) => sharpToPixelImage(pixelImageToSharp(image).linear(factor, offset)),
  };
}

export const brightness09 = brightness(0.9, "brightness_0_9");
export const brightness11 = brightness(1.1, "brightness_1_1");
export const contrast09 = contrast(0.9, "contrast_0_9");
export const contrast11 = contrast(1.1, "contrast_1_1");

export const colorTransforms: ImageTransform[] = [
  brightness09,
  brightness11,
  contrast09,
  contrast11,
];
