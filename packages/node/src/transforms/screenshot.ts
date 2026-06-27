import type { ImageTransform } from "@openartshield/core";
import { jpegRoundTrip, resizeTo, toPixels } from "./util.js";

// Rough "screenshot it and re-upload" pipeline: shrink a bit (90%), squash with
// mild JPEG, scale back up. Resampling + lossy compression in one go, so this is
// one of the meaner probes. Metadata gets dropped for free since we go through
// raw pixels.
export const screenshotSimulation: ImageTransform = {
  name: "screenshot_simulation",
  apply: async (image) => {
    const displayW = toPixels(image.width * 0.9);
    const displayH = toPixels(image.height * 0.9);

    const downscaled = await resizeTo(image, displayW, displayH);
    const compressed = await jpegRoundTrip(downscaled, 80);
    return resizeTo(compressed, image.width, image.height);
  },
};

export const screenshotTransforms: ImageTransform[] = [screenshotSimulation];
