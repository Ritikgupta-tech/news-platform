import { NextResponse } from "next/server";
import { getMarketIndices } from "@/server/market/market-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = getMarketIndices();
    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Unable to retrieve market indices",
        source: "Market Feed Unavailable",
        updatedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
