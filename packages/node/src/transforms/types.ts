import type { ImageTransform } from "@openartshield/core";

export type { ImageTransform } from "@openartshield/core";

// A named bundle of related transforms (e.g. all the JPEG qualities).
export type TransformGroup = {
  name: string;
  transforms: ImageTransform[];
};
