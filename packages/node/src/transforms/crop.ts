import type { ImageTransform } from "@openartshield/core";
import { sharpToPixelImage, pixelImageToSharp } from "../io/sharp-utils.js";
import { resizeTo, toPixels } from "./util.js";

// Keep the centered `percent`% of the image, then scale it back up to full size
// - i.e. someone cropped the edges off and re-posted it.
export function centerCropResize(percent: number, name: string): ImageTransform {
  return {
    name,
    apply: async (image) => {
      const cropW = toPixels((image.width * percent) / 100);
      const cropH = toPixels((image.height * percent) / 100);
      const left = Math.floor((image.width - cropW) / 2);
      const top = Math.floor((image.height - cropH) / 2);

      const cropped = await sharpToPixelImage(
        pixelImageToSharp(image).extract({ left, top, width: cropW, height: cropH }),
      );
      return resizeTo(cropped, image.width, image.height);
    },
  };
}

export const centerCrop90 = centerCropResize(90, "center_crop_90");

export const cropTransforms: ImageTransform[] = [centerCrop90];
