// Named error classes so callers (and the CLI) can tell a bad image from a bad
// config from an image that's just too small, and react accordingly.

export class OpenArtShieldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    // Keep instanceof working when compiled down to older targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Image dimensions / channels / buffer length don't add up. */
export class InvalidImageError extends OpenArtShieldError {}

/** A watermark or audit config is invalid or self-contradictory. */
export class InvalidConfigError extends OpenArtShieldError {}

/** Payload won't fit in the available 8x8 blocks at the chosen repetition count. */
export class CapacityError extends OpenArtShieldError {}

/** DCT got a block that isn't the expected size. */
export class DctError extends OpenArtShieldError {}
