import { DctError } from "../errors.js";

// Separable 2D DCT-II / inverse for square blocks, JPEG normalization.
// Straightforward O(n^4)-per-block with a cached cosine basis - readable over
// fast, which is fine at 8x8. Could swap in a fast DCT later if it ever matters.

export const BLOCK_SIZE = 8;

type CosineTable = {
  size: number;
  basis: Float64Array; // cos[(2x+1)*u*PI/(2N)], indexed basis[u*size + x]
  scale: Float64Array; // orthonormal scale per frequency
};

const tableCache = new Map<number, CosineTable>();

function getCosineTable(size: number): CosineTable {
  let table = tableCache.get(size);
  if (table) return table;

  const basis = new Float64Array(size * size);
  const scale = new Float64Array(size);
  for (let u = 0; u < size; u++) {
    scale[u] = u === 0 ? Math.sqrt(1 / size) : Math.sqrt(2 / size);
    for (let x = 0; x < size; x++) {
      basis[u * size + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * size));
    }
  }
  table = { size, basis, scale };
  tableCache.set(size, table);
  return table;
}

function assertSquareBlock(block: number[], size: number): void {
  if (block.length !== size * size) {
    throw new DctError(
      `DCT block must contain exactly ${size * size} values for a ${size}x${size} block, received ${block.length}`,
    );
  }
}

/** Forward DCT. Takes row-major spatial samples, returns row-major coefficients. */
export function forwardDct(block: number[], size = BLOCK_SIZE): number[] {
  assertSquareBlock(block, size);
  const { basis, scale } = getCosineTable(size);

  // Separable transform: rows first, then columns.
  const temp = new Float64Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let u = 0; u < size; u++) {
      let sum = 0;
      for (let x = 0; x < size; x++) {
        sum += block[y * size + x] * basis[u * size + x];
      }
      temp[y * size + u] = sum * scale[u];
    }
  }

  const out = new Array<number>(size * size);
  for (let u = 0; u < size; u++) {
    for (let v = 0; v < size; v++) {
      let sum = 0;
      for (let y = 0; y < size; y++) {
        sum += temp[y * size + v] * basis[u * size + y];
      }
      out[u * size + v] = sum * scale[u];
    }
  }
  return out;
}

/** Inverse of forwardDct - coefficients back to spatial samples. */
export function inverseDct(coeffs: number[], size = BLOCK_SIZE): number[] {
  assertSquareBlock(coeffs, size);
  const { basis, scale } = getCosineTable(size);

  // Reverse the separable transform: columns first, then rows.
  const temp = new Float64Array(size * size);
  for (let v = 0; v < size; v++) {
    for (let y = 0; y < size; y++) {
      let sum = 0;
      for (let u = 0; u < size; u++) {
        sum += coeffs[u * size + v] * scale[u] * basis[u * size + y];
      }
      temp[y * size + v] = sum;
    }
  }

  const out = new Array<number>(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let v = 0; v < size; v++) {
        sum += temp[y * size + v] * scale[v] * basis[v * size + x];
      }
      out[y * size + x] = sum;
    }
  }
  return out;
}
