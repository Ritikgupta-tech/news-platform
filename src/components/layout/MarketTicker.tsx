"use client";

import { useEffect, useState, useRef } from "react";
import type { MarketDataResponse } from "@/server/market/market-service";

interface Props {
  initialData?: MarketDataResponse | null;
}

export function MarketTicker({ initialData }: Props) {
  const [data, setData] = useState<MarketDataResponse | null>(initialData ?? null);
  const [showInfo, setShowInfo] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    async function fetchIndices() {
      try {
        const res = await fetch("/api/v1/market-indices");
        if (res.ok) {
          const json = await res.json();
          if (mounted) setData(json);
        }
      } catch (e) {
        // Fall back gracefully to existing or default state
      }
    }

    if (!initialData) {
      fetchIndices();
    }

    // Refresh every 60 seconds
    const interval = setInterval(fetchIndices, 60_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [initialData]);

  // Click outside listener for the attribution tooltip
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (infoRef.current && !infoRef.current.contains(event.target as Node)) {
        setShowInfo(false);
      }
    }
    if (showInfo) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showInfo]);

  if (!data || !data.indices?.length) {
    return (
      <div className="top-ticker-bar__marquee" aria-label="Market Data Status">
        <span className="marquee-item marquee-item--muted">
          <em>Market indices loading...</em>
        </span>
      </div>
    );
  }

  return (
    <div className="top-ticker-bar__marquee" aria-label="Global Market Indices">
      <div className="marquee-track" role="region" aria-live="polite">
        {data.indices.map((item, index) => (
          <span key={item.id} className="marquee-group">
            <span className="marquee-item">
              <strong>{item.symbol}</strong>
              <span className={item.direction === "up" ? "delta--up" : "delta--down"}>
                {item.direction === "up" ? "▲" : "▼"} {item.price}{" "}
                <small>({item.changePercent})</small>
              </span>
            </span>
            {index < data.indices.length - 1 ? (
              <span className="marquee-sep" aria-hidden="true">•</span>
            ) : null}
          </span>
        ))}

        {/* Source Attribution & Timestamp Badge */}
        <span className="marquee-sep" aria-hidden="true">|</span>
        <div className="marquee-attribution-wrap" ref={infoRef}>
          <button
            type="button"
            className="marquee-attribution-btn"
            onClick={() => setShowInfo((prev) => !prev)}
            aria-label="Market data source and delay information"
            aria-expanded={showInfo}
            title="Click to view market data source and update time"
          >
            <span className="live-dot live-dot--amber" aria-hidden="true" />
            <span className="attribution-label">Delayed 15m · Refinitiv</span>
            <span className="attribution-info-icon" aria-hidden="true">ⓘ</span>
          </button>

          {showInfo ? (
            <div className="marquee-attribution-popover" role="tooltip">
              <div className="popover-title">Market Feed Transparency</div>
              <p className="popover-line">
                <strong>Source:</strong> {data.source}
              </p>
              <p className="popover-line">
                <strong>Last Updated:</strong> {data.formattedTime}
              </p>
              <p className="popover-line">
                <strong>Session:</strong> {data.marketStatus}
              </p>
              <div className="popover-disclaimer">{data.disclaimer}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
