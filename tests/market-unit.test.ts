import { describe, expect, it } from "vitest";
import { getMarketIndices } from "@/server/market/market-service";

describe("Market Indices Service (Editorial Compliance)", () => {
  it("provides consolidated global market indices with explicit source attribution", () => {
    const data = getMarketIndices();

    expect(data).toBeDefined();
    expect(data.source).toContain("Refinitiv");
    expect(data.disclaimer).toContain("delayed at least 15 minutes");
    expect(data.updatedAt).toBeTruthy();
    expect(data.formattedTime).toContain("UTC");
    expect(data.marketStatus).toContain("Delayed 15m");
  });

  it("contains major international benchmark indices with valid direction and percentages", () => {
    const data = getMarketIndices();
    const symbols = data.indices.map((i) => i.symbol);

    expect(symbols).toContain("S&P 500");
    expect(symbols).toContain("NASDAQ");
    expect(symbols).toContain("FTSE 100");
    expect(symbols).toContain("GOLD");
    expect(symbols).toContain("BRENT CRUDE");
    expect(symbols).toContain("NIFTY 50");

    for (const index of data.indices) {
      expect(index.price).toBeTruthy();
      expect(index.changePercent).toMatch(/^[+-]?\d+(\.\d+)?%$/);
      expect(["up", "down", "flat"]).toContain(index.direction);
    }
  });

  it("caches consecutive requests within the TTL window", () => {
    const first = getMarketIndices();
    const second = getMarketIndices();

    expect(second.updatedAt).toBe(first.updatedAt);
  });
});
