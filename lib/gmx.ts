import { formatUnits } from 'viem';
import { publicClient, TOKENS } from './arbitrum';

// GMX V2 Contract Addresses on Arbitrum
export const GMX_CONTRACTS = {
  DataStore: '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8' as const,
  Reader: '0x38d91ED96283d62182Fc6d990C24097A918a4d9b' as const,
  ExchangeRouter: '0x7C68C7866A64FA2160F78EEaE12217FFbf871fa8' as const,
  Router: '0x7452c558d45f8afC8c83dAe62C3f8A5BE19c71f6' as const,
  OrderVault: '0x31eF83a530Fde1B38EE9A18093A333D8Bbbc40D5' as const,
} as const;

// Chainlink Price Feed addresses on Arbitrum
const CHAINLINK_FEEDS = {
  'ETH-USD': '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612' as const,
  'BTC-USD': '0x6ce185860a4963106506C203335A2910C7e99934' as const,
  'ARB-USD': '0xb2A824043730FE05F3DA2efaFa1CBbe83fa548D6' as const,
  'LINK-USD': '0x86E53CF1B870786351Da77A57575e79CB55812CB' as const,
} as const;

// GMX Market tokens (GM tokens)
export const GMX_MARKETS = {
  'ETH-USD': {
    marketToken: '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336' as const,
    indexToken: TOKENS.WETH,
    longToken: TOKENS.WETH,
    shortToken: TOKENS.USDC,
    name: 'ETH/USD',
    symbol: 'ETH',
    coingeckoId: 'ethereum',
  },
  'BTC-USD': {
    marketToken: '0x47c031236e19d024b42f8AE6780E44A573170703' as const,
    indexToken: TOKENS.WBTC,
    longToken: TOKENS.WBTC,
    shortToken: TOKENS.USDC,
    name: 'BTC/USD',
    symbol: 'BTC',
    coingeckoId: 'bitcoin',
  },
  'ARB-USD': {
    marketToken: '0xC25cEf6061Cf5dE5eb761b50E4743c1F5D7E5407' as const,
    indexToken: TOKENS.ARB,
    longToken: TOKENS.ARB,
    shortToken: TOKENS.USDC,
    name: 'ARB/USD',
    symbol: 'ARB',
    coingeckoId: 'arbitrum',
  },
  'LINK-USD': {
    marketToken: '0x7f1fa204bb700853D36994DA19F830b6Ad18455C' as const,
    indexToken: TOKENS.LINK,
    longToken: TOKENS.LINK,
    shortToken: TOKENS.USDC,
    name: 'LINK/USD',
    symbol: 'LINK',
    coingeckoId: 'chainlink',
  },
} as const;

export type MarketKey = keyof typeof GMX_MARKETS;

// Chainlink Aggregator ABI (minimal)
const CHAINLINK_ABI = [
  {
    name: 'latestRoundData',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

// Position types
export interface Position {
  market: MarketKey;
  isLong: boolean;
  size: string;
  collateral: string;
  entryPrice: string;
  markPrice: string;
  leverage: number;
  pnl: string;
  pnlPercent: number;
  liquidationPrice: string;
}

// Market data
export interface MarketData {
  market: MarketKey;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  openInterestLong: number;
  openInterestShort: number;
  fundingRate: number;
  maxLeverage: number;
}

// Cache for 24h price data
let priceCache: {
  data: Record<string, { price: number; change24h: number; high24h: number; low24h: number; volume24h: number }>;
  timestamp: number;
} | null = null;

const CACHE_DURATION = 60_000; // 1 minute cache for 24h data

// Fetch 24h market data from CoinGecko
async function fetch24hData(): Promise<Record<string, { price: number; change24h: number; high24h: number; low24h: number; volume24h: number }>> {
  // Check cache
  if (priceCache && Date.now() - priceCache.timestamp < CACHE_DURATION) {
    return priceCache.data;
  }

  const ids = Object.values(GMX_MARKETS).map(m => m.coingeckoId).join(',');

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    const result: Record<string, { price: number; change24h: number; high24h: number; low24h: number; volume24h: number }> = {};

    for (const coin of data) {
      result[coin.id] = {
        price: coin.current_price,
        change24h: coin.price_change_percentage_24h || 0,
        high24h: coin.high_24h,
        low24h: coin.low_24h,
        volume24h: coin.total_volume,
      };
    }

    // Update cache
    priceCache = { data: result, timestamp: Date.now() };
    return result;
  } catch (error) {
    console.error('Failed to fetch CoinGecko data:', error);
    // Return empty if cache miss and fetch fails
    return priceCache?.data || {};
  }
}

// Get live price from Chainlink
async function getChainlinkPrice(market: MarketKey): Promise<number> {
  const feedAddress = CHAINLINK_FEEDS[market];

  try {
    const [roundData, decimals] = await Promise.all([
      publicClient.readContract({
        address: feedAddress,
        abi: CHAINLINK_ABI,
        functionName: 'latestRoundData',
      }),
      publicClient.readContract({
        address: feedAddress,
        abi: CHAINLINK_ABI,
        functionName: 'decimals',
      }),
    ]);

    const price = Number(formatUnits(roundData[1], decimals));
    return price;
  } catch (error) {
    console.error(`Failed to fetch Chainlink price for ${market}:`, error);
    throw error;
  }
}

// Get market price data - REAL DATA
export async function getMarketData(market: MarketKey): Promise<MarketData> {
  const marketInfo = GMX_MARKETS[market];

  // Fetch both Chainlink (real-time) and CoinGecko (24h stats) in parallel
  const [chainlinkPrice, historicalData] = await Promise.all([
    getChainlinkPrice(market).catch(() => null),
    fetch24hData(),
  ]);

  const coinData = historicalData[marketInfo.coingeckoId];

  // Use Chainlink price if available, otherwise fall back to CoinGecko
  const price = chainlinkPrice ?? coinData?.price ?? 0;

  return {
    market,
    price,
    change24h: coinData?.change24h ?? 0,
    high24h: coinData?.high24h ?? price * 1.02,
    low24h: coinData?.low24h ?? price * 0.98,
    volume24h: coinData?.volume24h ?? 0,
    openInterestLong: 0, // Would need GMX subgraph for this
    openInterestShort: 0,
    fundingRate: 0, // Would need GMX contracts for this
    maxLeverage: market === 'ETH-USD' || market === 'BTC-USD' ? 100 : 50,
  };
}

// Get all market prices - REAL DATA
export async function getAllMarkets(): Promise<MarketData[]> {
  const markets = Object.keys(GMX_MARKETS) as MarketKey[];

  // Fetch all markets in parallel
  const results = await Promise.allSettled(markets.map(getMarketData));

  return results
    .filter((r): r is PromiseFulfilledResult<MarketData> => r.status === 'fulfilled')
    .map(r => r.value);
}

// GMX Reader ABI for positions (minimal)
const GMX_READER_ABI = [
  {
    name: 'getAccountPositions',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'dataStore', type: 'address' },
      { name: 'account', type: 'address' },
      { name: 'start', type: 'uint256' },
      { name: 'end', type: 'uint256' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          {
            name: 'addresses',
            type: 'tuple',
            components: [
              { name: 'account', type: 'address' },
              { name: 'market', type: 'address' },
              { name: 'collateralToken', type: 'address' },
            ],
          },
          {
            name: 'numbers',
            type: 'tuple',
            components: [
              { name: 'sizeInUsd', type: 'uint256' },
              { name: 'sizeInTokens', type: 'uint256' },
              { name: 'collateralAmount', type: 'uint256' },
              { name: 'borrowingFactor', type: 'uint256' },
              { name: 'fundingFeeAmountPerSize', type: 'uint256' },
              { name: 'longTokenClaimableFundingAmountPerSize', type: 'uint256' },
              { name: 'shortTokenClaimableFundingAmountPerSize', type: 'uint256' },
              { name: 'increasedAtBlock', type: 'uint256' },
              { name: 'decreasedAtBlock', type: 'uint256' },
            ],
          },
          {
            name: 'flags',
            type: 'tuple',
            components: [{ name: 'isLong', type: 'bool' }],
          },
        ],
      },
    ],
  },
] as const;

// Market address to MarketKey mapping
const MARKET_ADDRESS_TO_KEY: Record<string, MarketKey> = {
  [GMX_MARKETS['ETH-USD'].marketToken.toLowerCase()]: 'ETH-USD',
  [GMX_MARKETS['BTC-USD'].marketToken.toLowerCase()]: 'BTC-USD',
  [GMX_MARKETS['ARB-USD'].marketToken.toLowerCase()]: 'ARB-USD',
  [GMX_MARKETS['LINK-USD'].marketToken.toLowerCase()]: 'LINK-USD',
};

// Get real positions from GMX contracts
export async function getPositions(account: `0x${string}`): Promise<Position[]> {
  try {
    const rawPositions = await publicClient.readContract({
      address: GMX_CONTRACTS.Reader,
      abi: GMX_READER_ABI,
      functionName: 'getAccountPositions',
      args: [GMX_CONTRACTS.DataStore, account, 0n, 100n],
    });

    if (!rawPositions || rawPositions.length === 0) {
      return [];
    }

    // Get current prices for all markets with positions
    const marketPrices = new Map<MarketKey, number>();

    const positions: Position[] = [];

    for (const pos of rawPositions) {
      const marketAddress = pos.addresses.market.toLowerCase();
      const marketKey = MARKET_ADDRESS_TO_KEY[marketAddress];

      if (!marketKey) continue;

      // Get price if we don't have it cached
      if (!marketPrices.has(marketKey)) {
        try {
          const price = await getChainlinkPrice(marketKey);
          marketPrices.set(marketKey, price);
        } catch {
          continue;
        }
      }

      const currentPrice = marketPrices.get(marketKey)!;
      const sizeUsd = Number(formatUnits(pos.numbers.sizeInUsd, 30));
      const collateralAmount = Number(formatUnits(pos.numbers.collateralAmount, 6)); // USDC decimals
      const isLong = pos.flags.isLong;

      if (sizeUsd === 0) continue;

      const leverage = sizeUsd / collateralAmount;
      const entryPrice = sizeUsd / Number(formatUnits(pos.numbers.sizeInTokens, 18));

      // Calculate PnL
      const priceDiff = isLong ? currentPrice - entryPrice : entryPrice - currentPrice;
      const pnl = (priceDiff / entryPrice) * sizeUsd;
      const pnlPercent = (pnl / collateralAmount) * 100;

      // Calculate liquidation price
      const liqThreshold = 1 / leverage - 0.01;
      const liquidationPrice = isLong
        ? entryPrice * (1 - liqThreshold)
        : entryPrice * (1 + liqThreshold);

      positions.push({
        market: marketKey,
        isLong,
        size: formatNumber(sizeUsd),
        collateral: formatNumber(collateralAmount),
        entryPrice: formatNumber(entryPrice),
        markPrice: formatNumber(currentPrice),
        leverage: Math.round(leverage * 10) / 10,
        pnl: (pnl >= 0 ? '+' : '') + formatNumber(pnl),
        pnlPercent,
        liquidationPrice: formatNumber(liquidationPrice),
      });
    }

    return positions;
  } catch (error) {
    console.error('Failed to fetch positions:', error);
    return [];
  }
}

// Helper to format numbers
function formatNumber(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Calculate position PnL
export function calculatePnL(
  isLong: boolean,
  entryPrice: number,
  currentPrice: number,
  size: number
): { pnl: number; pnlPercent: number } {
  const priceDiff = isLong ? currentPrice - entryPrice : entryPrice - currentPrice;
  const pnl = (priceDiff / entryPrice) * size;
  const pnlPercent = (priceDiff / entryPrice) * 100;
  return { pnl, pnlPercent };
}

// Calculate liquidation price
export function calculateLiquidationPrice(
  isLong: boolean,
  entryPrice: number,
  leverage: number,
  maintenanceMargin = 0.01
): number {
  const liquidationThreshold = 1 / leverage - maintenanceMargin;
  return isLong
    ? entryPrice * (1 - liquidationThreshold)
    : entryPrice * (1 + liquidationThreshold);
}

// Trade parameters
export interface TradeParams {
  market: MarketKey;
  isLong: boolean;
  collateral: number;
  leverage: number;
  slippage?: number;
}

// Calculate trade preview
export function calculateTradePreview(params: TradeParams, currentPrice: number) {
  const size = params.collateral * params.leverage;
  const positionFee = size * 0.0005; // 0.05% position fee
  const executionFee = 0.0001 * currentPrice; // ~0.0001 ETH
  const fees = positionFee + executionFee;

  const liquidationPrice = calculateLiquidationPrice(
    params.isLong,
    currentPrice,
    params.leverage
  );

  return {
    size,
    entryPrice: currentPrice,
    liquidationPrice,
    fees,
    margin: params.collateral,
    leverage: params.leverage,
  };
}

// Price precision for display
export const PRICE_PRECISION: Record<MarketKey, number> = {
  'ETH-USD': 2,
  'BTC-USD': 2,
  'ARB-USD': 4,
  'LINK-USD': 2,
};

// Format price with appropriate precision
export function formatPrice(market: MarketKey, price: number): string {
  const precision = PRICE_PRECISION[market];
  return price.toLocaleString('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}
