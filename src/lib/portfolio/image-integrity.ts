/**
 * Weak, honest integrity signals for uploaded evidence (spec section 7):
 * a cryptographic hash for exact-duplicate detection, a real (dependency-
 * free) EXIF strip for JPEGs, and a provider abstraction for
 * perceptual/near-duplicate hashing and reverse-image search — which this
 * codebase does not implement, since doing so would need real pixel
 * decoding and no image-processing library (e.g. sharp) exists in
 * package.json. Rather than silently adding one, `NoopVisualSimilarityProvider`
 * ships as the default and every caller treats "not available" as neutral,
 * never as a false negative.
 *
 * None of this ever proves or disproves authorship. Missing EXIF is never
 * suspicious by itself (spec section 7); a hash match only ever produces a
 * respectful, non-blocking note (see docs/security.md's threat model).
 */

import { createHash } from "node:crypto";

export function computeContentHash(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const JPEG_SOI = 0xffd8;
const APP1_MARKER = 0xffe1;

/**
 * Strips EXIF (APP1) segments from a JPEG buffer by scanning its marker
 * segments directly — no image-decoding library needed, since EXIF removal
 * only requires understanding the JPEG container format, not the pixel
 * data itself. Non-JPEG buffers, or anything that doesn't parse as valid
 * JPEG markers, are returned unchanged rather than corrupted.
 */
export function stripJpegExif(bytes: Buffer): Buffer {
  if (bytes.length < 4 || bytes.readUInt16BE(0) !== JPEG_SOI) return bytes;

  const segments: Buffer[] = [Buffer.from([0xff, 0xd8])];
  let offset = 2;

  while (offset < bytes.length - 1) {
    if (bytes[offset] !== 0xff) break; // Malformed — stop and return what we've validated so far via the fallback below.

    const marker = bytes.readUInt16BE(offset);
    // Start of Scan (0xFFDA): everything after this is entropy-coded image
    // data with no further marker segments to parse — copy the rest as-is.
    if (marker === 0xffda) {
      segments.push(bytes.subarray(offset));
      return Buffer.concat(segments);
    }
    // Standalone markers (no length field): RST0-7, TEM, and the like.
    if ((marker & 0xfff0) === 0xffd0 || marker === 0xff01) {
      segments.push(bytes.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }

    if (offset + 4 > bytes.length) break;
    const length = bytes.readUInt16BE(offset + 2);
    const segmentEnd = offset + 2 + length;
    if (length < 2 || segmentEnd > bytes.length) break;

    if (marker !== APP1_MARKER) {
      segments.push(bytes.subarray(offset, segmentEnd));
    }
    // marker === APP1_MARKER is simply omitted — that's the strip.
    offset = segmentEnd;
  }

  // Anything unparsed (malformed input, or we hit `break` above) is dropped
  // rather than guessed at — safer to fall back to the original bytes than
  // to emit a truncated, possibly-corrupt image.
  return offset >= bytes.length - 1 ? Buffer.concat(segments) : bytes;
}

export type VisualSimilarityComparison = { similarity: number } | null;

/** Optional abstraction (spec section 7) — never wired to a real reverse-image-search or perceptual-hash provider in this codebase; see the module doc. */
export interface VisualSimilarityProvider {
  readonly name: string;
  compare(a: Buffer, b: Buffer): Promise<VisualSimilarityComparison>;
}

/** The only implementation shipped — always "not available," never a guess. */
export const NoopVisualSimilarityProvider: VisualSimilarityProvider = {
  name: "none",
  async compare(): Promise<VisualSimilarityComparison> {
    return null;
  },
};
