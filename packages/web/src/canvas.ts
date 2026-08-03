import type { PixelImage } from "@openartshield/core";
import { imageDataFromPixelImage, pixelImageFromImageData } from "./image-data.js";

// Canvas-based image IO. Everything here runs client-side - the image never
// leaves the page. These helpers need a browser (OffscreenCanvas +
// createImageBitmap); the pure conversion layer lives in image-data.ts.

/**
 * Decode an image file/blob into a PixelImage using the browser's decoders.
 * Accepts anything createImageBitmap does (File, Blob, ImageBitmapSource).
 */
export async function loadPixelImage(source: Blob | ImageBitmapSource): Promise<PixelImage> {
  const bitmap = await createImageBitmap(source as ImageBitmapSource);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Could not create a 2d canvas context.");
    context.drawImage(bitmap, 0, 0);
    return pixelImageFromImageData(context.getImageData(0, 0, bitmap.width, bitmap.height));
  } finally {
    bitmap.close();
  }
}

export type EncodeBlobOptions = {
  /** MIME type: "image/png" (default), "image/jpeg", or "image/webp". */
  type?: string;
  /** 0-1 quality for lossy formats. */
  quality?: number;
};

/** Encode a PixelImage to a Blob (default PNG) for download or upload. */
export async function pixelImageToBlob(
  image: PixelImage,
  options: EncodeBlobOptions = {},
): Promise<Blob> {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Could not create a 2d canvas context.");
  const rgba = imageDataFromPixelImage(image);
  const imageData = context.createImageData(rgba.width, rgba.height);
  imageData.data.set(rgba.data);
  context.putImageData(imageData, 0, 0);
  return canvas.convertToBlob({
    type: options.type ?? "image/png",
    ...(options.quality !== undefined ? { quality: options.quality } : {}),
  });
}
