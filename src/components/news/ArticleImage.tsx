"use client";

import { useState } from "react";
import type { ArticleImage as Img } from "@/types/news";

/** Plain <img> with a fixed aspect ratio and graceful fallback if image fails to load. */
export function ArticleImage({
  image,
  ratio = "16 / 10",
  eager = false,
  sizes,
}: {
  image: Img | null;
  ratio?: string;
  eager?: boolean;
  sizes?: string;
}) {
  const [hasError, setHasError] = useState(false);

  return (
    <div className="img-frame" style={{ aspectRatio: ratio }}>
      {image && !hasError ? (
        <img
          src={image.url}
          alt={image.alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          sizes={sizes}
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="img-frame__empty" role="img" aria-label={image?.alt || "News image"}>
          <span className="img-frame__fallback-brand">E News</span>
        </div>
      )}
    </div>
  );
}
