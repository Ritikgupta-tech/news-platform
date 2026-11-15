/**
 * Identifies an image from its own bytes. The filename and the browser-supplied MIME type are never consulted.
 * Only JPEG, PNG and WebP are accepted: no SVG (it can carry script) and no GIF/TIFF/HEIC.
 */
export type ImageMime = "image/jpeg" | "image/png" | "image/webp";
export interface ImageInfo { mime: ImageMime; ext: "jpg" | "png" | "webp"; width: number; height: number }

export const MAX_DIMENSION = 12_000;
export const MAX_PIXELS = 60_000_000; // refuses decompression bombs: small file, enormous canvas

const u16be = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const u32be = (b: Uint8Array, i: number) => (((b[i] ?? 0) * 2 ** 24) + (((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0)));
const u16le = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8) | ((b[i + 2] ?? 0) << 16);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

function png(b: Uint8Array): ImageInfo | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 33 || !sig.every((v, i) => b[i] === v) || ascii(b, 12, 4) !== "IHDR") return null;
  return { mime: "image/png", ext: "png", width: u32be(b, 16), height: u32be(b, 20) };
}

function jpeg(b: Uint8Array): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    let marker = b[i + 1]!;
    while (marker === 0xff && i + 2 < b.length) { i += 1; marker = b[i + 1]!; } // fill bytes
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; } // standalone markers
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / start of scan before any frame header
    const len = u16be(b, i + 2);
    if (len < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 9 > b.length) return null;
      return { mime: "image/jpeg", ext: "jpg", height: u16be(b, i + 5), width: u16be(b, i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

function webp(b: Uint8Array): ImageInfo | null {
  if (b.length < 30 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const kind = ascii(b, 12, 4);
  if (kind === "VP8 ") {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { mime: "image/webp", ext: "webp", width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (kind === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const b1 = b[21]!, b2 = b[22]!, b3 = b[23]!, b4 = b[24]!;
    return { mime: "image/webp", ext: "webp", width: 1 + (b1 | ((b2 & 0x3f) << 8)), height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)) };
  }
  if (kind === "VP8X") return { mime: "image/webp", ext: "webp", width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) };
  return null;
}

/** Returns the verified type and pixel size, or null when the bytes are not a supported, plausibly sized image. */
export function sniffImage(bytes: Uint8Array): ImageInfo | null {
  const info = png(bytes) ?? jpeg(bytes) ?? webp(bytes);
  if (!info) return null;
  const { width, height } = info;
  if (!(width > 0 && height > 0) || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) return null;
  return info;
}
