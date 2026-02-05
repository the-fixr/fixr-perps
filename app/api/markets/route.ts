import { NextResponse } from 'next/server';

// CoinGecko IDs for our markets
const COINGECKO_IDS = ['ethereum', 'bitcoin', 'arbitrum', 'chainlink'];

export async function GET() {
  try {
    const ids = COINGECKO_IDS.join(',');
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`,
      {
        headers: {
          'Accept': 'application/json',
        },
        next: { revalidate: 30 }, // Cache for 30 seconds
      }
    );

    if (!response.ok) {
      // Return cached data or empty if CoinGecko is rate limiting
      return NextResponse.json({ data: [], error: 'Rate limited' }, { status: 200 });
    }

    const data = await response.json();

    // Transform to our format
    const markets: Record<string, {
      price: number;
      change24h: number;
      high24h: number;
      low24h: number;
      volume24h: number;
    }> = {};

    for (const coin of data) {
      markets[coin.id] = {
        price: coin.current_price,
        change24h: coin.price_change_percentage_24h || 0,
        high24h: coin.high_24h,
        low24h: coin.low_24h,
        volume24h: coin.total_volume,
      };
    }

    return NextResponse.json({ data: markets });
  } catch (error) {
    console.error('Failed to fetch market data:', error);
    return NextResponse.json({ data: {}, error: 'Failed to fetch' }, { status: 200 });
  }
}
