import type { ImageTransform } from "@openartshield/core";
import { resizeTo, toPixels } from "./util.js";

// Shrink to `percent`% then blow it back up to the original size. The detail
// lost on the way down doesn't come back, which is the whole point.
export function resizeRoundTrip(percent: number, name: string): ImageTransform {
  return {
    name,
    apply: async (image) => {
      const w = toPixels((image.width * percent) / 100);
      const h = toPixels((image.height * percent) / 100);
      const downscaled = await resizeTo(image, w, h);
      return resizeTo(downscaled, image.width, image.height);
    },
  };
}

export const resize75 = resizeRoundTrip(75, "resize_75");
export const resize50 = resizeRoundTrip(50, "resize_50");

export const resizeTransforms: ImageTransform[] = [resize75, resize50];
