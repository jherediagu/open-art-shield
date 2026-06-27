import { InvalidImageError } from "../errors.js";
import type { PixelImage } from "../types.js";
import { validatePixelImage } from "./validation.js";

// Build a validated PixelImage from raw bits. Anything array-like gets copied
// into a Uint8ClampedArray. Throws if the result doesn't validate.
export function createPixelImage(
  width: number,
  height: number,
  channels: 3 | 4,
  data: ArrayLike<number>,
): PixelImage {
  const image: PixelImage = {
    width,
    height,
    channels,
    data: data instanceof Uint8ClampedArray ? data : Uint8ClampedArray.from(data),
  };
  validatePixelImage(image);
  return image;
}

export function pixelCount(image: PixelImage): number {
  return image.width * image.height;
}

/** RGBA at (x, y). Alpha comes back as 255 for 3-channel images. */
export function getPixel(
  image: PixelImage,
  x: number,
  y: number,
): [number, number, number, number] {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    throw new InvalidImageError(`Pixel (${x}, ${y}) is out of bounds`);
  }
  const base = (y * image.width + x) * image.channels;
  const { data, channels } = image;
  return [data[base], data[base + 1], data[base + 2], channels === 4 ? data[base + 3] : 255];
}
