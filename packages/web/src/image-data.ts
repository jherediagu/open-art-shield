import type { PixelImage } from "@openartshield/core";

// ImageData <-> PixelImage conversion.
//
// The core SDK works on PixelImage (interleaved RGB/RGBA bytes) and has no
// DOM dependencies; the browser's native pixel container is ImageData (always
// RGBA). These converters are pure so they are testable without a DOM - they
// only need the {width, height, data} shape, not the real ImageData class.

/** The structural part of ImageData we rely on (so tests don't need a DOM). */
export type ImageDataLike = {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
};

/**
 * View browser ImageData as a PixelImage (RGBA, 4 channels). The pixel buffer
 * is copied so later canvas writes don't mutate the SDK's view.
 */
export function pixelImageFromImageData(imageData: ImageDataLike): PixelImage {
  const { width, height, data } = imageData;
  if (data.length !== width * height * 4) {
    throw new Error(
      `ImageData buffer has ${data.length} bytes; expected ${width * height * 4} (RGBA).`,
    );
  }
  return { width, height, channels: 4, data: new Uint8ClampedArray(data) };
}

/**
 * Convert a PixelImage back to ImageData-shaped RGBA pixels. RGB images gain
 * an opaque alpha channel.
 */
export function imageDataFromPixelImage(image: PixelImage): ImageDataLike {
  const { width, height, channels, data } = image;
  if (channels === 4) {
    return { width, height, data: new Uint8ClampedArray(data) };
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = data[i * 3];
    rgba[i * 4 + 1] = data[i * 3 + 1];
    rgba[i * 4 + 2] = data[i * 3 + 2];
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, data: rgba };
}
