import { InvalidImageError } from "../errors.js";
import type { PixelImage } from "../types.js";

// Sanity-check a PixelImage. Throws InvalidImageError if the dimensions, channel
// count, or buffer length don't add up.
export function validatePixelImage(image: PixelImage): void {
  const { width, height, channels, data } = image;

  if (!Number.isInteger(width) || width <= 0) {
    throw new InvalidImageError(`Image width must be a positive integer, received ${width}`);
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new InvalidImageError(`Image height must be a positive integer, received ${height}`);
  }
  if (channels !== 3 && channels !== 4) {
    throw new InvalidImageError(`Image channels must be 3 or 4, received ${channels}`);
  }
  const expected = width * height * channels;
  if (data.length !== expected) {
    throw new InvalidImageError(
      `Image data length ${data.length} does not match width*height*channels (${expected})`,
    );
  }
}

// Same check, boolean instead of throwing.
export function isValidPixelImage(image: PixelImage): boolean {
  try {
    validatePixelImage(image);
    return true;
  } catch {
    return false;
  }
}
