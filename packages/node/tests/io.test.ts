import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readImage, writeImage, encodeImage, decodeImage } from "../src/index.js";
import { createSyntheticImage } from "./helpers.js";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "oas-io-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("image IO", () => {
  it("round-trips a PixelImage through PNG losslessly", async () => {
    const image = createSyntheticImage(64, 48, 3);
    const path = join(dir, "rt.png");
    await writeImage(image, path);

    const read = await readImage(path);
    expect(read.width).toBe(64);
    expect(read.height).toBe(48);
    expect(read.channels).toBe(3);
    expect(Array.from(read.data)).toEqual(Array.from(image.data));
  });

  it("preserves dimensions and channels when reading JPEG", async () => {
    const image = createSyntheticImage(80, 60, 3);
    const path = join(dir, "rt.jpg");
    await writeImage(image, path, { quality: 90 });

    const read = await readImage(path);
    expect(read.width).toBe(80);
    expect(read.height).toBe(60);
    expect(read.channels).toBe(3);
  });

  it("preserves the alpha channel through PNG", async () => {
    const image = createSyntheticImage(40, 40, 4);
    const path = join(dir, "alpha.png");
    await writeImage(image, path);

    const read = await readImage(path);
    expect(read.channels).toBe(4);
  });

  it("encodes and decodes through an in-memory buffer", async () => {
    const image = createSyntheticImage(32, 32, 3);
    const buffer = await encodeImage(image, "png");
    const decoded = await decodeImage(buffer);
    expect(decoded.width).toBe(32);
    expect(decoded.height).toBe(32);
    expect(Array.from(decoded.data)).toEqual(Array.from(image.data));
  });

  it("rejects unsupported output extensions", async () => {
    const image = createSyntheticImage(16, 16, 3);
    await expect(writeImage(image, join(dir, "bad.gif"))).rejects.toThrow();
  });
});
