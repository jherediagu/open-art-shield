// BCH error correction for the TrustMark data layer.
//
// Direct port of Adobe TrustMark's BCH codec (MIT), via the Rust
// re-implementation (rust/src/bits/bch.rs), itself a port of the original
// Python bchecc.py. The galois-field arithmetic is kept structurally identical
// to the sources so the two stay comparable line-by-line; all u32 arithmetic
// is normalized with `>>> 0`.
//
// https://github.com/adobe/trustmark

export const BCH_POLYNOMIAL = 137;

/** Codec failure sentinel returned by decode (mirrors the reference ports). */
export const BCH_DECODE_FAILED = 255;

type Polynomial = {
  deg: number;
  c: number[];
};

export type BchCodec = {
  readonly t: number;
  readonly eccBytes: number;
  readonly eccBits: number;
  encode(data: Uint8Array): Uint8Array;
  /**
   * Correct `data` (mutated in place) using the received ECC bytes. Returns
   * the number of corrected bitflips, or BCH_DECODE_FAILED when the word is
   * uncorrectable.
   */
  decode(data: Uint8Array, receivedEcc: Uint8Array): number;
};

function ilog2(value: number): number {
  return 31 - Math.clz32(value);
}

/** Create a BCH codec correcting up to `t` bitflips over GF(2^m), poly 137. */
export function createBchCodec(t: number, poly: number = BCH_POLYNOMIAL): BchCodec {
  const m = ilog2(poly);
  const n = 2 ** m - 1;
  const eccBytes = Math.ceil((m * t) / 8);

  const exponents = new Array<number>(1 + n).fill(0);
  const logarithms = new Array<number>(1 + n).fill(0);
  const elpPre = new Array<number>(1 + m).fill(0);

  {
    let x = 1;
    const k = 2 ** ilog2(poly);
    if (k !== 2 ** m) throw new Error("invalid BCH polynomial");
    for (let i = 0; i < n; i++) {
      exponents[i] = x;
      logarithms[x] = i;
      if (i !== 0 && x === 1) throw new Error("invalid BCH polynomial");
      x *= 2;
      if ((x & k) !== 0) x ^= poly;
    }
    logarithms[0] = 0;
    exponents[n] = 1;
  }

  function gMul(a: number, b: number): number {
    if (a > 0 && b > 0) {
      return exponents[(logarithms[a] + logarithms[b]) % n];
    }
    return 0;
  }

  function modn(v: number): number {
    while (v >= n) {
      v -= n;
      v = (v & n) + (v >> m);
    }
    return v;
  }

  function gPow(i: number): number {
    return exponents[modn(i)];
  }

  function gSqrt(a: number): number {
    return a !== 0 ? exponents[(2 * logarithms[a]) % n] : 0;
  }

  function gLog(a: number): number {
    return logarithms[a];
  }

  function gMod(v: number): number {
    return v < n ? v : v - n;
  }

  function gDiv(a: number, b: number): number {
    return a !== 0 ? exponents[gMod(logarithms[a] + n - logarithms[b])] : 0;
  }

  // Build the generator polynomial g(x) from the roots.
  const g: Polynomial = { deg: 0, c: new Array<number>(m * t + 1).fill(0) };
  {
    const roots = new Array<number>(n + 1).fill(0);
    for (let i = 0; i < t; i++) {
      let r = 2 * i + 1;
      for (let j = 0; j < m; j++) {
        roots[r] = 1;
        r = (2 * r) % n;
      }
    }
    g.c[0] = 1;
    for (let i = 0; i < n; i++) {
      if (roots[i] !== 0) {
        const r = exponents[i];
        g.c[g.deg + 1] = 1;
        for (let j = g.deg; j > 0; j--) {
          g.c[j] = gMul(g.c[j], r) ^ g.c[j - 1];
        }
        g.c[0] = gMul(g.c[0], r);
        g.deg += 1;
      }
    }
  }
  const eccBits = g.deg;

  // Pack g(x) into 32-bit words, MSB-first.
  const genpoly = new Array<number>(Math.ceil((m * t + 1) / 32)).fill(0);
  {
    let bitsLeft = g.deg + 1;
    let i = 0;
    while (bitsLeft > 0) {
      const nbits = Math.min(bitsLeft, 32);
      let word = 0;
      for (let j = 0; j < nbits; j++) {
        if (g.c[bitsLeft - 1 - j] !== 0) word = (word | (2 ** (31 - j))) >>> 0;
      }
      genpoly[i] = word;
      i += 1;
      bitsLeft -= nbits;
    }
  }

  // Cyclic remainder tables for byte-at-a-time encoding.
  const l32 = Math.ceil((m * t) / 32);
  const cyclicTab = new Array<number>(4 * 256 * l32).fill(0);
  {
    const plen = Math.ceil((eccBits + 1) / 32);
    const ecclen = Math.ceil(eccBits / 32);
    for (let i = 0; i < 256; i++) {
      for (let b = 0; b < 4; b++) {
        const offset = (b * 256 + i) * l32;
        let data = (i << (8 * b)) >>> 0;
        while (data !== 0) {
          const d = ilog2(data);
          data = (data ^ (genpoly[0] >>> (31 - d))) >>> 0;
          for (let j = 0; j < ecclen; j++) {
            const hi = d < 31 ? (genpoly[j] << (d + 1)) >>> 0 : 0;
            const lo = j + 1 < plen ? genpoly[j + 1] >>> (31 - d) : 0;
            cyclicTab[j + offset] = (cyclicTab[j + offset] ^ (hi | lo)) >>> 0;
          }
        }
      }
    }
  }

  // Precompute the roots of x^2 + x = a for the degree-2 error locator.
  {
    let sum = 0;
    let aexp = 0;
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) {
        sum ^= gPow(i * 2 ** j);
      }
      if (sum !== 0) {
        aexp = exponents[i];
        break;
      }
    }
    let x = 0;
    const precomp = new Array<number>(31).fill(0);
    let remaining = m;
    while (x <= n && remaining !== 0) {
      let y = gSqrt(x) ^ x;
      for (let i = 0; i < 2; i++) {
        const r = logarithms[y];
        if (y !== 0 && r < m && precomp[r] === 0) {
          elpPre[r] = x;
          precomp[r] = 1;
          remaining -= 1;
          break;
        }
        y ^= aexp;
      }
      x += 1;
    }
  }

  // Remainder of the last encode; decode XORs the received ECC against it.
  let eccBuf: number[] = [];

  function loadWordBE(bytes: Uint8Array, offset: number): number {
    return (
      ((bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]) >>>
      0
    );
  }

  function encode(data: Uint8Array): Uint8Array {
    const l = l32 - 1;
    const eccMaxWords = Math.ceil((31 * 64) / 32);
    const r = new Array<number>(eccMaxWords).fill(0);

    const tab0idx = 0;
    const tab1idx = tab0idx + 256 * (l + 1);
    const tab2idx = tab1idx + 256 * (l + 1);
    const tab3idx = tab2idx + 256 * (l + 1);

    let mlen = Math.floor(data.length / 4);
    let offset = 0;
    while (mlen > 0) {
      let w = loadWordBE(data, offset);
      w = (w ^ r[0]) >>> 0;
      const p0 = tab0idx + (l + 1) * (w & 0xff);
      const p1 = tab1idx + (l + 1) * ((w >>> 8) & 0xff);
      const p2 = tab2idx + (l + 1) * ((w >>> 16) & 0xff);
      const p3 = tab3idx + (l + 1) * ((w >>> 24) & 0xff);
      for (let i = 0; i < l; i++) {
        r[i] =
          (r[i + 1] ^
            cyclicTab[p0 + i] ^
            cyclicTab[p1 + i] ^
            cyclicTab[p2 + i] ^
            cyclicTab[p3 + i]) >>>
          0;
      }
      r[l] = (cyclicTab[p0 + l] ^ cyclicTab[p1 + l] ^ cyclicTab[p2 + l] ^ cyclicTab[p3 + l]) >>> 0;
      mlen -= 1;
      offset += 4;
    }

    let leftdata = data.length - offset;
    const ecc = r;
    let posn = offset;
    while (leftdata !== 0) {
      const tmp = data[posn];
      posn += 1;
      let pidx = (l + 1) * (((ecc[0] >>> 24) ^ tmp) & 0xff);
      for (let i = 0; i < l; i++) {
        ecc[i] = ((((ecc[i] << 8) >>> 0) | (ecc[i + 1] >>> 24)) ^ cyclicTab[pidx]) >>> 0;
        pidx += 1;
      }
      ecc[l] = (((ecc[l] << 8) >>> 0) ^ cyclicTab[pidx]) >>> 0;
      leftdata -= 1;
    }

    eccBuf = ecc.slice();
    const eccout = new Uint8Array(eccBytes);
    for (let i = 0; i < eccBytes; i++) {
      eccout[i] = (ecc[Math.floor(i / 4)] >>> (24 - 8 * (i % 4))) & 0xff;
    }
    return eccout;
  }

  function getroots(dataLen: number, poly: Polynomial, errloc: number[]): number {
    const roots: number[] = [];

    if (poly.deg > 2) {
      const k = dataLen * 8 + eccBits;
      const rep = new Array<number>(t * 2).fill(0);
      const d = poly.deg;
      const lVal = n - gLog(poly.c[poly.deg]);
      for (let i = 0; i < d; i++) {
        rep[i] = poly.c[i] !== 0 ? gMod(gLog(poly.c[i]) + lVal) : -1;
      }
      rep[poly.deg] = 0;
      const syn0 = gDiv(poly.c[0], poly.c[poly.deg]);
      for (let i = n - k + 1; i < n + 1; i++) {
        let syn = syn0;
        for (let j = 1; j < poly.deg + 1; j++) {
          const mj = rep[j];
          if (mj >= 0) syn ^= gPow(mj + j * i);
        }
        if (syn === 0) {
          roots.push(n - i);
          if (roots.length === poly.deg) break;
        }
      }
      if (roots.length < poly.deg) {
        errloc.length = 0;
        return -1;
      }
    }

    if (poly.deg === 1 && poly.c[0] !== 0) {
      roots.push(gMod(n - logarithms[poly.c[0]] + logarithms[poly.c[1]]));
    }

    if (poly.deg === 2 && poly.c[0] !== 0 && poly.c[1] !== 0) {
      const l0 = logarithms[poly.c[0]];
      const l1 = logarithms[poly.c[1]];
      const l2 = logarithms[poly.c[2]];
      const u = gPow(l0 + l2 + 2 * (n - l1));
      let r = 0;
      let v = u;
      while (v !== 0) {
        const i = ilog2(v);
        r ^= elpPre[i];
        v = (v ^ (2 ** i)) >>> 0;
      }
      if ((gSqrt(r) ^ r) === u) {
        roots.push(modn(2 * n - l1 - logarithms[r] + l2));
        roots.push(modn(2 * n - l1 - logarithms[r ^ 1] + l2));
      }
    }

    errloc.length = 0;
    for (const root of roots) errloc.push(root);
    return roots.length;
  }

  function decode(data: Uint8Array, receivedEcc: Uint8Array): number {
    encode(data);

    const errloc: number[] = [];

    const eccbuf: number[] = [];
    let mlen = Math.floor(receivedEcc.length / 4);
    let offset = 0;
    while (mlen > 0) {
      eccbuf.push(loadWordBE(receivedEcc, offset));
      offset += 4;
      mlen -= 1;
    }
    const leftdata = receivedEcc.length - offset;
    if (leftdata > 0) {
      const padded = new Uint8Array(4);
      padded.set(receivedEcc.subarray(offset));
      eccbuf.push(loadWordBE(padded, 0));
    }

    const eccwords = l32;
    let sum = 0;
    for (let i = 0; i < eccwords; i++) {
      eccBuf[i] = (eccBuf[i] ^ eccbuf[i]) >>> 0;
      sum = (sum | eccBuf[i]) >>> 0;
    }
    if (sum === 0) return 0;

    // Compute the syndromes.
    let s = eccBits;
    const syn = new Array<number>(2 * t).fill(0);
    const mRem = s & 31;
    const synbuf = eccBuf.slice();
    if (mRem !== 0) {
      synbuf[Math.floor(s / 32)] = (synbuf[Math.floor(s / 32)] & ~(2 ** (32 - mRem) - 1)) >>> 0;
    }
    let synptr = 0;
    while (s > 0 || synptr === 0) {
      let poly = synbuf[synptr];
      synptr += 1;
      s -= 32;
      while (poly !== 0) {
        const i = ilog2(poly);
        for (let j = 0; j < 2 * t; j += 2) {
          syn[j] ^= gPow((j + 1) * (i + s));
        }
        poly = (poly ^ (2 ** i)) >>> 0;
      }
    }
    for (let i = 0; i < t; i++) {
      syn[2 * i + 1] = gSqrt(syn[i]);
    }

    // Berlekamp-Massey: find the error locator polynomial.
    let pp = -1;
    let pd = 1;
    let pelp: Polynomial = { deg: 0, c: new Array<number>(2 * t).fill(0) };
    pelp.c[0] = 1;
    const elp: Polynomial = { deg: 0, c: new Array<number>(2 * t).fill(0) };
    elp.c[0] = 1;
    let d = syn[0];

    for (let i = 0; i < t; i++) {
      if (elp.deg > t) break;
      if (d !== 0) {
        const k = 2 * i - pp;
        const elpCopy: Polynomial = { deg: elp.deg, c: elp.c.slice() };
        const tmp = gLog(d) + n - gLog(pd);
        for (let j = 0; j < pelp.deg + 1; j++) {
          if (pelp.c[j] !== 0) {
            const lVal = gLog(pelp.c[j]);
            elp.c[j + k] ^= gPow(tmp + lVal);
          }
        }
        const tmpDeg = pelp.deg + k;
        if (tmpDeg > elp.deg) {
          elp.deg = tmpDeg;
          pelp = elpCopy;
          pd = d;
          pp = 2 * i;
        }
      }
      if (i < t - 1) {
        d = syn[2 * i + 2];
        for (let j = 1; j < elp.deg + 1; j++) {
          d ^= gMul(elp.c[j], syn[2 * i + 2 - j]);
        }
      }
    }

    const nroots = getroots(data.length, elp, errloc);
    if (nroots === -1) return BCH_DECODE_FAILED;

    const nbits = data.length * 8 + eccBits;
    for (let i = 0; i < nroots; i++) {
      if (errloc[i] >= nbits) return BCH_DECODE_FAILED;
      errloc[i] = nbits - 1 - errloc[i];
      errloc[i] = (errloc[i] & ~7) | (7 - (errloc[i] & 7));
    }

    for (const bitflip of errloc) {
      const byte = Math.floor(bitflip / 8);
      const bit = 2 ** (bitflip & 7);
      if (bitflip < (data.length + receivedEcc.length) * 8) {
        if (byte < data.length) {
          data[byte] ^= bit;
        }
        // Flips inside the ECC bytes don't affect the recovered data.
      }
    }

    return nroots;
  }

  return { t, eccBytes, eccBits, encode, decode };
}
