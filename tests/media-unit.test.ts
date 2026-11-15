import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sniffImage } from "../src/server/media/sniff";
import { LocalDiskStorage, MEDIA_KEY } from "../src/server/media/storage";
import { gif, jpeg, png, svg, webpExtended, webpLossless, webpLossy } from "./media-fixtures";

describe("sniffImage", () => {
  it("reads type and size from the bytes", () => {
    expect(sniffImage(png(1600, 900))).toEqual({ mime: "image/png", ext: "png", width: 1600, height: 900 });
    expect(sniffImage(jpeg(1200, 800))).toEqual({ mime: "image/jpeg", ext: "jpg", width: 1200, height: 800 });
    expect(sniffImage(webpLossy(640, 480))).toEqual({ mime: "image/webp", ext: "webp", width: 640, height: 480 });
    expect(sniffImage(webpExtended(1920, 1080))).toMatchObject({ mime: "image/webp", width: 1920, height: 1080 });
    expect(sniffImage(webpLossless(1000, 563))).toMatchObject({ mime: "image/webp", width: 1000, height: 563 });
  });
  it("rejects SVG, GIF, text, empty and truncated input", () => {
    for (const bad of [svg(), gif(), new TextEncoder().encode("hello"), new Uint8Array(0), png(10, 10).subarray(0, 12), jpeg(10, 10).subarray(0, 8)]) expect(sniffImage(bad)).toBeNull();
  });
  it("is not fooled by a script or HTML payload with an image-like start", () => {
    expect(sniffImage(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 4, 0, 0]))).toBeNull(); // scan before any frame header
  });
  it("rejects zero, huge and bomb-sized dimensions", () => {
    expect(sniffImage(png(0, 100))).toBeNull();
    expect(sniffImage(png(13_000, 100))).toBeNull();
    expect(sniffImage(png(10_000, 10_000))).toBeNull(); // 100 MP
    expect(sniffImage(png(8_000, 6_000))).not.toBeNull(); // 48 MP is allowed
  });
});

describe("LocalDiskStorage", () => {
  const key = "0b8f3c1e-5d2a-4e7b-9c10-1a2b3c4d5e6f.png";
  it("stores, reads, deletes and never overwrites", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "enews-media-"));
    try {
      const s = new LocalDiskStorage(dir);
      expect(await s.get(key)).toBeNull();
      await s.put(key, Uint8Array.from([1, 2, 3]));
      expect([...(await s.get(key))!]).toEqual([1, 2, 3]);
      await expect(s.put(key, Uint8Array.from([9]))).rejects.toThrow();
      await s.delete(key);
      await s.delete(key); // idempotent
      expect(await s.get(key)).toBeNull();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("refuses path traversal and unexpected keys", async () => {
    const s = new LocalDiskStorage(os.tmpdir());
    for (const bad of ["../etc/passwd", "..\\x.png", "a/b.png", `${key}.exe`, "x.png", `/${key}`]) {
      expect(MEDIA_KEY.test(bad)).toBe(false);
      await expect(s.get(bad)).rejects.toThrow();
    }
  });
});
