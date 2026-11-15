import type { ArticleImage as Img } from "@/types/news";

/** Plain <img> with a fixed aspect ratio to avoid layout shift. Swap for next/image once the media pipeline lands. */
export function ArticleImage({ image, ratio = "16 / 10", eager = false, sizes }: { image: Img | null; ratio?: string; eager?: boolean; sizes?: string }) {
  return (
    <div className="img-frame" style={{ aspectRatio: ratio }}>
      {image ? (
        <img src={image.url} alt={image.alt} loading={eager ? "eager" : "lazy"} decoding="async" sizes={sizes} />
      ) : (
        <div className="img-frame__empty" role="img" aria-label="No image available" />
      )}
    </div>
  );
}
