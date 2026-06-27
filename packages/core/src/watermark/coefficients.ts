import { seededPermutation } from "../utils/prng.js";
import type { CoefficientPosition } from "../types.js";

// Block bookkeeping: cut the luminance plane into 8x8 blocks, read/write them,
// and poke at the two coefficients that carry each bit.

export function blocksPerRow(width: number, size: number): number {
  return Math.floor(width / size);
}

export function countBlocks(width: number, height: number, size: number): number {
  return Math.floor(width / size) * Math.floor(height / size);
}

// The seed decides which blocks (and in what order) carry the payload. Embed and
// extract both call this with the same seed, so they stay in sync.
export function selectBlockOrder(totalBlocks: number, seed: number): number[] {
  return seededPermutation(totalBlocks, seed);
}

export function blockOrigin(
  blockIndex: number,
  width: number,
  size: number,
): { x: number; y: number } {
  const perRow = blocksPerRow(width, size);
  const row = Math.floor(blockIndex / perRow);
  const col = blockIndex % perRow;
  return { x: col * size, y: row * size };
}

export function readBlock(
  luma: Float64Array,
  width: number,
  blockIndex: number,
  size: number,
): number[] {
  const { x: ox, y: oy } = blockOrigin(blockIndex, width, size);
  const block = new Array<number>(size * size);
  for (let y = 0; y < size; y++) {
    const rowBase = (oy + y) * width + ox;
    for (let x = 0; x < size; x++) {
      block[y * size + x] = luma[rowBase + x];
    }
  }
  return block;
}

export function writeBlock(
  luma: Float64Array,
  width: number,
  blockIndex: number,
  size: number,
  block: number[],
): void {
  const { x: ox, y: oy } = blockOrigin(blockIndex, width, size);
  for (let y = 0; y < size; y++) {
    const rowBase = (oy + y) * width + ox;
    for (let x = 0; x < size; x++) {
      luma[rowBase + x] = block[y * size + x];
    }
  }
}

export function getCoefficient(
  block: number[],
  position: CoefficientPosition,
  size: number,
): number {
  return block[position[0] * size + position[1]];
}

export function setCoefficient(
  block: number[],
  position: CoefficientPosition,
  size: number,
  value: number,
): void {
  block[position[0] * size + position[1]] = value;
}
