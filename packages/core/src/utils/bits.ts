// Bit helpers for the payload pipeline. Bits are plain 0/1 numbers in number[].
// Byte order is big-endian within each byte (MSB first).

export function bytesToBits(bytes: Uint8Array): number[] {
  const bits: number[] = new Array(bytes.length * 8);
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    for (let b = 0; b < 8; b++) {
      bits[i * 8 + b] = (byte >> (7 - b)) & 1;
    }
  }
  return bits;
}

export function bitsToBytes(bits: number[]): Uint8Array {
  if (bits.length % 8 !== 0) {
    throw new Error(`bitsToBytes: bit length ${bits.length} is not a multiple of 8`);
  }
  const bytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bytes.length; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | (bits[i * 8 + b] & 1);
    }
    bytes[i] = byte;
  }
  return bytes;
}

// 32-bit unsigned <-> 4 big-endian bytes, used for the CRC checksum.
export function uint32ToBytes(value: number): Uint8Array {
  const v = value >>> 0;
  return new Uint8Array([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]);
}

export function bytesToUint32(bytes: Uint8Array, offset = 0): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}
