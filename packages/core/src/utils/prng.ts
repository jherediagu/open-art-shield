// Mulberry32 PRNG. Not crypto-secure - we only need a seeded, reproducible
// sequence so embed and extract pick the exact same blocks on any platform.
export class Prng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  // float in [0, 1)
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // integer in [0, max)
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }
}

// Seeded Fisher-Yates. Same seed => same ordering, which is how embed/extract
// agree on the block order without storing it anywhere.
export function seededPermutation(length: number, seed: number): number[] {
  const prng = new Prng(seed);
  const indices = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = prng.nextInt(i + 1);
    const tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
  }
  return indices;
}
