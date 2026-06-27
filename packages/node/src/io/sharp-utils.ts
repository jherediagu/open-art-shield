import sharp from "sharp";
import type { PixelImage } from "@openartshield/core";

// Shared decode path for the readers: normalize to sRGB, keep alpha only if the
// source actually had it, and hand back raw bytes as a PixelImage.
export async function sharpToPixelImage(input: sharp.Sharp): Promise<PixelImage> {
  const base = input.toColourspace("srgb");
  const metadata = await base.metadata();
  const wantAlpha = metadata.hasAlpha === true;

  const pipeline = wantAlpha ? base.ensureAlpha() : base.removeAlpha();
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels === 4 ? 4 : 3;

  return {
    width: info.width,
    height: info.height,
    channels,
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
  };
}

// Wrap raw PixelImage bytes back into sharp so we can encode/transform them.
export function pixelImageToSharp(image: PixelImage): sharp.Sharp {
  return sharp(Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength), {
    raw: {
      width: image.width,
      height: image.height,
      channels: image.channels,
    },
  });
}
