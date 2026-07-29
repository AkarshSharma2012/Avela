import { describe, expect, it } from "vitest";

import { computeContentHash, NoopVisualSimilarityProvider, stripJpegExif } from "@/lib/portfolio/image-integrity";

function segment(marker: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt16BE(marker, 0);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

function buildFakeJpeg(): { full: Buffer; app1Payload: Buffer; app0Payload: Buffer; scanData: Buffer } {
  const soi = Buffer.from([0xff, 0xd8]);
  const app0Payload = Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "binary");
  const app0 = segment(0xffe0, app0Payload);
  const app1Payload = Buffer.concat([Buffer.from("Exif\0\0", "binary"), Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8])]);
  const app1 = segment(0xffe1, app1Payload);
  const scanData = Buffer.from([0xff, 0xda, 0x00, 0x0c, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0xff, 0xd9]);
  const full = Buffer.concat([soi, app0, app1, scanData]);
  return { full, app1Payload, app0Payload, scanData };
}

describe("computeContentHash", () => {
  it("is deterministic for identical bytes and different for different bytes", () => {
    const a = Buffer.from("hello");
    const b = Buffer.from("hello");
    const c = Buffer.from("world");
    expect(computeContentHash(a)).toBe(computeContentHash(b));
    expect(computeContentHash(a)).not.toBe(computeContentHash(c));
    expect(computeContentHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("stripJpegExif", () => {
  it("removes the APP1 (EXIF) segment while preserving other segments and image data", () => {
    const { full, app1Payload, app0Payload, scanData } = buildFakeJpeg();
    const stripped = stripJpegExif(full);

    expect(stripped.includes(app1Payload)).toBe(false);
    expect(stripped.includes(app0Payload)).toBe(true);
    expect(stripped.includes(scanData.subarray(2))).toBe(true);
    expect(stripped.readUInt16BE(0)).toBe(0xffd8);
  });

  it("leaves a non-JPEG buffer completely unchanged", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(stripJpegExif(png)).toEqual(png);
  });

  it("falls back to the original bytes unchanged on malformed/truncated JPEG input rather than emitting a corrupt image", () => {
    const malformed = Buffer.from([0xff, 0xd8, 0xff, 0xe1]); // SOI + a marker with no length bytes at all
    expect(stripJpegExif(malformed)).toEqual(malformed);
  });
});

describe("NoopVisualSimilarityProvider", () => {
  it("always reports 'not available' rather than guessing a similarity score", async () => {
    const result = await NoopVisualSimilarityProvider.compare(Buffer.from("a"), Buffer.from("b"));
    expect(result).toBeNull();
  });
});
