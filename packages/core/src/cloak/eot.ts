// Expectation Over Transformation (EOT) modes for the experimental cloak.
//
// EOT scores each candidate not only on the clean image but also across a set of
// deterministic transformations (JPEG, resize, blur, brightness/contrast,
// screenshot simulation). Averaging drift over those variants biases the search
// toward perturbations that survive everyday image handling instead of ones that
// only move the embedding of the pristine pixels.
//
// This is still an honest experiment, not protection: a higher averaged drift is
// a measurement under the chosen backend and transforms, nothing more.
//
// Only the transform *names* live here (pure data, no codecs). The actual sharp-
// backed implementations live in @openartshield/node and are resolved by name.

export type EotMode = "none" | "mild" | "standard";

export const EOT_MODES: readonly EotMode[] = ["none", "mild", "standard"];

export const DEFAULT_EOT_MODE: EotMode = "none";

// Additional transforms applied to each candidate per mode. The clean (identity)
// pass is always scored by the runner, so it is not listed here. Names must match
// the transforms exported from @openartshield/node.
export const EOT_TRANSFORM_NAMES: Record<EotMode, readonly string[]> = {
  none: [],
  mild: [
    "jpeg_quality_95",
    "jpeg_quality_85",
    "brightness_0_9",
    "brightness_1_1",
    "gaussian_blur_0_75",
  ],
  standard: [
    "jpeg_quality_95",
    "jpeg_quality_85",
    "jpeg_quality_70",
    "resize_75",
    "brightness_0_9",
    "brightness_1_1",
    "contrast_0_9",
    "contrast_1_1",
    "gaussian_blur_0_75",
    "screenshot_simulation",
  ],
};

export function isEotMode(value: string): value is EotMode {
  return (EOT_MODES as readonly string[]).includes(value);
}

/** Validate an EOT mode string, throwing a clear error listing the valid modes. */
export function resolveEotMode(value: string): EotMode {
  if (!isEotMode(value)) {
    throw new Error(`Unknown EOT mode "${value}". Use one of: ${EOT_MODES.join(", ")}.`);
  }
  return value;
}

/**
 * Full list of scoring variants for a mode, including the leading "clean" pass.
 * Used for the report's "transforms used" summary.
 */
export function eotTransformNames(mode: EotMode): string[] {
  return ["clean", ...EOT_TRANSFORM_NAMES[mode]];
}
