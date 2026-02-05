import { formatUnits, getAddress, parseUnits, encodeFunctionData } from 'viem';
import { publicClient, TOKENS } from './arbitrum';

// GMX V2 Contract Addresses on Arbitrum
export const GMX_CONTRACTS = {
  DataStore: '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8' as const,
  Reader: '0x38d91ED96283d62182Fc6d990C24097A918a4d9b' as const,
  ExchangeRouter: '0x602b805EedddBbD9ddff44A7dcBD46cb07849685' as const, // Current GMX V2 ExchangeRouter
  Router: '0x7452c558d45f8afC8c83dAe62C3f8A5BE19c71f6' as const,
  OrderVault: '0x31eF83a530Fde1B38EE9A18093A333D8Bbbc40D5' as const,
} as const;

// Chainlink Price Feed addresses on Arbitrum (use getAddress for proper checksumming)
const CHAINLINK_FEEDS: Record<string, `0x${string}`> = {
  'ETH-USD': getAddress('0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612'),
  'BTC-USD': getAddress('0x6ce185860a4963106506C203335A2910413708e9'), // BTC/USD on Arbitrum
  'ARB-USD': getAddress('0xb2A824043730FE05F3DA2efaFa1CBbe83fa548D6'),
  'LINK-USD': getAddress('0x86E53CF1B870786351Da77A57575e79CB55812CB'),
};

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

// Fetch 24h market data via our API route (avoids CORS issues)
async function fetch24hData(): Promise<Record<string, { price: number; change24h: number; high24h: number; low24h: number; volume24h: number }>> {
  // Check cache
  if (priceCache && Date.now() - priceCache.timestamp < CACHE_DURATION) {
    return priceCache.data;
  }

  try {
    // Use our API route to avoid CORS issues with CoinGecko
    const response = await fetch('/api/markets');

    if (!response.ok) {
      throw new Error(`Market API error: ${response.status}`);
    }

    const { data } = await response.json();

    if (data && Object.keys(data).length > 0) {
      // Update cache
      priceCache = { data, timestamp: Date.now() };
      return data;
    }

    // Return cached data if API returned empty
    return priceCache?.data || {};
  } catch (error) {
    console.error('Failed to fetch market data:', error);
    // Return cached data or empty if cache miss and fetch fails
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

// ============ GMX V2 Order Creation ============

// Order types
export const ORDER_TYPE = {
  MarketSwap: 0,
  LimitSwap: 1,
  MarketIncrease: 2,
  LimitIncrease: 3,
  MarketDecrease: 4,
  LimitDecrease: 5,
  StopLossDecrease: 6,
  Liquidation: 7,
} as const;

// Decrease position swap type
export const DECREASE_POSITION_SWAP_TYPE = {
  NoSwap: 0,
  SwapPnlTokenToCollateralToken: 1,
  SwapCollateralTokenToPnlToken: 2,
} as const;

// ERC20 ABI for approvals
export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// GMX ExchangeRouter ABI for creating orders (updated for current V2)
export const EXCHANGE_ROUTER_ABI = [
  {
    name: 'createOrder',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          {
            name: 'addresses',
            type: 'tuple',
            components: [
              { name: 'receiver', type: 'address' },
              { name: 'cancellationReceiver', type: 'address' },
              { name: 'callbackContract', type: 'address' },
              { name: 'uiFeeReceiver', type: 'address' },
              { name: 'market', type: 'address' },
              { name: 'initialCollateralToken', type: 'address' },
              { name: 'swapPath', type: 'address[]' },
            ],
          },
          {
            name: 'numbers',
            type: 'tuple',
            components: [
              { name: 'sizeDeltaUsd', type: 'uint256' },
              { name: 'initialCollateralDeltaAmount', type: 'uint256' },
              { name: 'triggerPrice', type: 'uint256' },
              { name: 'acceptablePrice', type: 'uint256' },
              { name: 'executionFee', type: 'uint256' },
              { name: 'callbackGasLimit', type: 'uint256' },
              { name: 'minOutputAmount', type: 'uint256' },
              { name: 'validFromTime', type: 'uint256' },
            ],
          },
          { name: 'orderType', type: 'uint8' },
          { name: 'decreasePositionSwapType', type: 'uint8' },
          { name: 'isLong', type: 'bool' },
          { name: 'shouldUnwrapNativeToken', type: 'bool' },
          { name: 'autoCancel', type: 'bool' },
          { name: 'referralCode', type: 'bytes32' },
          { name: 'dataList', type: 'bytes32[]' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    name: 'sendWnt',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'receiver', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'sendTokens',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'receiver', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'multicall',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'data', type: 'bytes[]' }],
    outputs: [{ name: 'results', type: 'bytes[]' }],
  },
] as const;

// GMX execution fee (in ETH) - ~0.0003 ETH is typical for Arbitrum
// SDK uses ~1M gas * ~0.1 gwei = ~0.0001 ETH, we add buffer
export const EXECUTION_FEE = parseUnits('0.0003', 18);

// Empty referral code (zero bytes32) - can use registered code later
export const FIXR_REFERRAL_CODE = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;

// Order creation parameters
export interface CreateOrderParams {
  market: MarketKey;
  isLong: boolean;
  collateralAmount: number; // in USDC
  sizeDeltaUsd: number; // position size in USD
  acceptablePrice: number; // with slippage applied
  account: `0x${string}`;
}

// Token decimals for price conversion (GMX contract price format)
const INDEX_TOKEN_DECIMALS: Record<MarketKey, number> = {
  'ETH-USD': 18,
  'BTC-USD': 8,
  'ARB-USD': 18,
  'LINK-USD': 18,
};

// Convert price to GMX contract format
// GMX stores acceptablePrice in 10^(30-tokenDecimals) precision
function convertToContractPrice(price: number, tokenDecimals: number): bigint {
  // price is in USD (e.g., 3000 for $3000)
  // Contract expects: price * 10^(30 - tokenDecimals)
  const precision = 30 - tokenDecimals;
  // Use fixed-point to avoid floating point issues
  const priceStr = price.toFixed(2);
  return parseUnits(priceStr, precision);
}

// Build the multicall data for creating an order
export function buildCreateOrderCalldata(params: CreateOrderParams): {
  calldata: `0x${string}`;
  value: bigint;
} {
  const marketInfo = GMX_MARKETS[params.market];
  const tokenDecimals = INDEX_TOKEN_DECIMALS[params.market];

  // Convert amounts to proper units
  const collateralAmountBigInt = parseUnits(params.collateralAmount.toString(), 6); // USDC has 6 decimals
  const sizeDeltaUsdBigInt = parseUnits(params.sizeDeltaUsd.toString(), 30); // GMX uses 30 decimals for USD

  // Convert acceptable price to contract format
  // GMX contract expects price in 10^(30-tokenDecimals) precision
  const acceptablePriceBigInt = convertToContractPrice(params.acceptablePrice, tokenDecimals);

  console.log('[buildCreateOrderCalldata] params:', {
    market: params.market,
    tokenDecimals,
    acceptablePrice: params.acceptablePrice,
    acceptablePriceBigInt: acceptablePriceBigInt.toString(),
    sizeDeltaUsd: params.sizeDeltaUsd,
    sizeDeltaUsdBigInt: sizeDeltaUsdBigInt.toString(),
    collateralAmount: params.collateralAmount,
    collateralAmountBigInt: collateralAmountBigInt.toString(),
  });

  // Order parameters (aligned with GMX SDK)
  const orderParams = {
    addresses: {
      receiver: params.account,
      cancellationReceiver: '0x0000000000000000000000000000000000000000' as `0x${string}`, // Must be zero address per SDK
      callbackContract: '0x0000000000000000000000000000000000000000' as `0x${string}`,
      uiFeeReceiver: '0x0000000000000000000000000000000000000000' as `0x${string}`,
      market: marketInfo.marketToken,
      initialCollateralToken: TOKENS.USDC,
      swapPath: [] as `0x${string}`[],
    },
    numbers: {
      sizeDeltaUsd: sizeDeltaUsdBigInt,
      initialCollateralDeltaAmount: 0n, // Must be 0 per SDK - collateral sent via sendTokens
      triggerPrice: 0n,
      acceptablePrice: acceptablePriceBigInt,
      executionFee: EXECUTION_FEE,
      callbackGasLimit: 0n,
      minOutputAmount: 0n,
      validFromTime: 0n, // Execute immediately
    },
    orderType: ORDER_TYPE.MarketIncrease,
    decreasePositionSwapType: DECREASE_POSITION_SWAP_TYPE.NoSwap,
    isLong: params.isLong,
    shouldUnwrapNativeToken: false,
    autoCancel: false,
    referralCode: FIXR_REFERRAL_CODE,
    dataList: [] as `0x${string}`[],
  };

  // Build multicall: sendWnt (execution fee) + sendTokens (collateral) + createOrder
  const sendWntData = encodeFunctionData({
    abi: EXCHANGE_ROUTER_ABI,
    functionName: 'sendWnt',
    args: [GMX_CONTRACTS.OrderVault, EXECUTION_FEE],
  });

  const sendTokensData = encodeFunctionData({
    abi: EXCHANGE_ROUTER_ABI,
    functionName: 'sendTokens',
    args: [TOKENS.USDC, GMX_CONTRACTS.OrderVault, collateralAmountBigInt],
  });

  const createOrderData = encodeFunctionData({
    abi: EXCHANGE_ROUTER_ABI,
    functionName: 'createOrder',
    args: [orderParams],
  });

  // Multicall with all three calls
  const multicallData = encodeFunctionData({
    abi: EXCHANGE_ROUTER_ABI,
    functionName: 'multicall',
    args: [[sendWntData, sendTokensData, createOrderData]],
  });

  return {
    calldata: multicallData,
    value: EXECUTION_FEE,
  };
}

// Check USDC allowance
export async function checkAllowance(
  owner: `0x${string}`,
  spender: `0x${string}` = GMX_CONTRACTS.Router
): Promise<bigint> {
  return publicClient.readContract({
    address: TOKENS.USDC,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [owner, spender],
  });
}

// Check USDC balance
export async function getUsdcBalance(account: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({
    address: TOKENS.USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account],
  });
}

// Build approve calldata
export function buildApproveCalldata(amount: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [GMX_CONTRACTS.Router, amount],
  });
}

// Calculate acceptable price with slippage for OPENING positions
export function calculateAcceptablePrice(
  price: number,
  isLong: boolean,
  slippagePercent: number = 0.5
): number {
  const slippageMultiplier = slippagePercent / 100;
  if (isLong) {
    // For longs, we're willing to pay up to this price
    return price * (1 + slippageMultiplier);
  } else {
    // For shorts, we want to receive at least this price
    return price * (1 - slippageMultiplier);
  }
}

// ============ GMX V2 Close Position ============

// Close position parameters
export interface ClosePositionParams {
  market: MarketKey;
  isLong: boolean;
  sizeDeltaUsd: number; // Position size to close in USD (use full size for complete close)
  collateralDeltaUsd: number; // Collateral to withdraw in USD (use full collateral for complete close)
  acceptablePrice: number; // With slippage applied (opposite direction from open!)
  account: `0x${string}`;
}

// Calculate acceptable price with slippage for CLOSING positions
// Note: This is the OPPOSITE of opening - closing a long means selling, closing a short means buying back
export function calculateAcceptablePriceForClose(
  price: number,
  isLong: boolean,
  slippagePercent: number = 0.5
): number {
  const slippageMultiplier = slippagePercent / 100;
  if (isLong) {
    // Closing a long = selling, accept lower price
    return price * (1 - slippageMultiplier);
  } else {
    // Closing a short = buying back, accept higher price
    return price * (1 + slippageMultiplier);
  }
}

// Build the multicall data for closing a position (MarketDecrease order)
export function buildClosePositionCalldata(params: ClosePositionParams): {
  calldata: `0x${string}`;
  value: bigint;
} {
  const marketInfo = GMX_MARKETS[params.market];
  const tokenDecimals = INDEX_TOKEN_DECIMALS[params.market];

  // Convert amounts to proper units
  const sizeDeltaUsdBigInt = parseUnits(params.sizeDeltaUsd.toString(), 30); // GMX uses 30 decimals for USD
  const collateralDeltaAmountBigInt = parseUnits(params.collateralDeltaUsd.toString(), 6); // USDC has 6 decimals

  // Convert acceptable price to contract format
  const acceptablePriceBigInt = convertToContractPrice(params.acceptablePrice, tokenDecimals);

  console.log('[buildClosePositionCalldata] params:', {
    market: params.market,
    tokenDecimals,
    acceptablePrice: params.acceptablePrice,
    acceptablePriceBigInt: acceptablePriceBigInt.toString(),
    sizeDeltaUsd: params.sizeDeltaUsd,
    sizeDeltaUsdBigInt: sizeDeltaUsdBigInt.toString(),
    collateralDeltaUsd: params.collateralDeltaUsd,
    collateralDeltaAmountBigInt: collateralDeltaAmountBigInt.toString(),
  });

  // Order parameters for closing (MarketDecrease)
  const orderParams = {
    addresses: {
      receiver: params.account,
      cancellationReceiver: '0x0000000000000000000000000000000000000000' as `0x${string}`,
      callbackContract: '0x0000000000000000000000000000000000000000' as `0x${string}`,
      uiFeeReceiver: '0x0000000000000000000000000000000000000000' as `0x${string}`,
      market: marketInfo.marketToken,
      initialCollateralToken: TOKENS.USDC,
      swapPath: [] as `0x${string}`[],
    },
    numbers: {
      sizeDeltaUsd: sizeDeltaUsdBigInt,
      initialCollateralDeltaAmount: collateralDeltaAmountBigInt, // Collateral to withdraw
      triggerPrice: 0n,
      acceptablePrice: acceptablePriceBigInt,
      executionFee: EXECUTION_FEE,
      callbackGasLimit: 0n,
      minOutputAmount: 0n, // Min USDC to receive (0 = any amount)
      validFromTime: 0n,
    },
    orderType: ORDER_TYPE.MarketDecrease, // Close position
    decreasePositionSwapType: DECREASE_POSITION_SWAP_TYPE.NoSwap, // Receive USDC directly
    isLong: params.isLong,
    shouldUnwrapNativeToken: false, // We want USDC, not ETH
    autoCancel: false,
    referralCode: FIXR_REFERRAL_CODE,
    dataList: [] as `0x${string}`[],
  };

  // Build multicall: sendWnt (execution fee) + createOrder
  // Note: No sendTokens needed for closing - we're withdrawing, not depositing
  const sendWntData = encodeFunctionData({
    abi: EXCHANGE_ROUTER_ABI,
    functionName: 'sendWnt',
    args: [GMX_CONTRACTS.OrderVault, EXECUTION_FEE],
  });

  const createOrderData = encodeFunctionData({
    abi: EXCHANGE_ROUTER_ABI,
    functionName: 'createOrder',
    args: [orderParams],
  });

  // Multicall with both calls (no sendTokens for close)
  const multicallData = encodeFunctionData({
    abi: EXCHANGE_ROUTER_ABI,
    functionName: 'multicall',
    args: [[sendWntData, createOrderData]],
  });

  return {
    calldata: multicallData,
    value: EXECUTION_FEE,
  };
}
