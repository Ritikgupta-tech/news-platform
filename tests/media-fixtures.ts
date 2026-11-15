/** Hand-built minimal image headers, enough for the sniffer (not decodable pictures). */
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >> 8) & 255];
const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
const str = (s: string) => [...s].map((c) => c.charCodeAt(0));
const pad = (a: number[], to: number) => Uint8Array.from([...a, ...new Array(Math.max(0, to - a.length)).fill(0)]);

export const png = (w: number, h: number) => pad([0x89, ...str("PNG"), 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), ...str("IHDR"), ...be32(w), ...be32(h), 8, 2, 0, 0, 0], 64);

/** JPEG with a JFIF APP0 segment first, so the scanner must skip a segment to find the frame header. */
export const jpeg = (w: number, h: number) => pad([0xff, 0xd8, 0xff, 0xe0, ...be16(16), ...str("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, ...be16(17), 8, ...be16(h), ...be16(w), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1], 64);

export const webpLossy = (w: number, h: number) => pad([...str("RIFF"), 0, 0, 0, 0, ...str("WEBP"), ...str("VP8 "), 0, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(w), ...le16(h)], 64);
export const webpExtended = (w: number, h: number) => pad([...str("RIFF"), 0, 0, 0, 0, ...str("WEBP"), ...str("VP8X"), 10, 0, 0, 0, 0, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)], 64);
export const webpLossless = (w: number, h: number) => {
  const wm = w - 1, hm = h - 1;
  return pad([...str("RIFF"), 0, 0, 0, 0, ...str("WEBP"), ...str("VP8L"), 0, 0, 0, 0, 0x2f, wm & 255, ((wm >> 8) & 0x3f) | ((hm & 3) << 6), (hm >> 2) & 255, (hm >> 10) & 15], 64);
};
export const svg = () => new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
export const gif = () => pad([...str("GIF89a"), ...le16(10), ...le16(10)], 64);
