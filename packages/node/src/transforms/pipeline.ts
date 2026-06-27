import type { ImageTransform } from "@openartshield/core";
import { jpegTransforms } from "./jpeg.js";
import { resizeTransforms } from "./resize.js";
import { cropTransforms } from "./crop.js";
import { blurTransforms } from "./blur.js";
import { colorTransforms } from "./color.js";
import { screenshotTransforms } from "./screenshot.js";

// What `oas audit` runs by default, roughly mildest -> harshest. The runner adds
// an identity baseline on top, so a full run has defaultTransforms.length + 1 rows.
export const defaultTransforms: ImageTransform[] = [
  ...jpegTransforms,
  ...resizeTransforms,
  ...cropTransforms,
  ...blurTransforms,
  ...colorTransforms,
  ...screenshotTransforms,
];

// Look up by name.
export const transformsByName: Record<string, ImageTransform> = Object.fromEntries(
  defaultTransforms.map((t) => [t.name, t]),
);

// Resolve a list of names to transforms (order preserved). Throws on a typo.
export function selectTransforms(names: string[]): ImageTransform[] {
  return names.map((name) => {
    const transform = transformsByName[name];
    if (!transform) {
      throw new Error(
        `Unknown transform "${name}". Available: ${Object.keys(transformsByName).join(", ")}`,
      );
    }
    return transform;
  });
}

// Chain transforms into one, applied left to right. For custom attack pipelines.
export function composeTransforms(name: string, transforms: ImageTransform[]): ImageTransform {
  return {
    name,
    apply: async (image) => {
      let current = image;
      for (const transform of transforms) {
        current = await transform.apply(current);
      }
      return current;
    },
  };
}
