import { getDb } from "@/lib/db";
import { getMediaStorage, MEDIA_KEY } from "@/server/media/storage";

export const dynamic = "force-dynamic";

/**
 * Serves stored images. The content type comes from the verified value saved at upload (never from the URL),
 * and the response forbids sniffing and script execution. Deleted assets return 404.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!MEDIA_KEY.test(key)) return new Response("Not found", { status: 404 });
  const asset = await getDb().mediaAsset.findFirst({ where: { storageKey: key, deletedAt: null }, select: { mimeType: true } });
  const bytes = asset ? await getMediaStorage().get(key) : null;
  if (!asset || !bytes) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cache-Control": "public, max-age=31536000, immutable", // keys are random and never reused
    },
  });
}
