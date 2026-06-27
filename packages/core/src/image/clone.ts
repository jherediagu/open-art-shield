import type { PixelImage } from "../types.js";

// Deep copy, fresh data buffer.
export function clonePixelImage(image: PixelImage): PixelImage {
  return {
    width: image.width,
    height: image.height,
    channels: image.channels,
    data: new Uint8ClampedArray(image.data),
  };
}
