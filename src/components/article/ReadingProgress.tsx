"use client";
import { useEffect, useRef } from "react";

/** Thin progress bar tied to scroll position of the article element. Decorative (aria-hidden). */
export function ReadingProgress({ targetId }: { targetId: string }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight * 0.6;
      const done = total <= 0 ? 1 : Math.min(1, Math.max(0, -r.top / total));
      if (bar.current) bar.current.style.transform = `scaleX(${done})`;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [targetId]);
  return <div className="reading-progress" aria-hidden="true"><div ref={bar} className="reading-progress__bar" /></div>;
}
