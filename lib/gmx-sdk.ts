import { GmxSdk } from '@gmx-io/sdk';
import type { WalletClient } from 'viem';

// Fixr fee receiver address (receives UI fees from GMX)
export const FIXR_FEE_RECEIVER = '0xBe2Cc1861341F3b058A3307385BEBa84167b3fa4' as const;

// GMX SDK configuration for Arbitrum
export const GMX_SDK_CONFIG = {
  chainId: 42161 as const,
  oracleUrl: 'https://arbitrum-api.gmxinfra.io',
  rpcUrl: 'https://arb1.arbitrum.io/rpc',
  subsquidUrl: 'https://gmx.squids.live/gmx-synthetics-arbitrum:prod/api/graphql',
  settings: {
    // UI fee receiver - Fixr receives GMX's UI fee share on all trades
    uiFeeReceiverAccount: FIXR_FEE_RECEIVER,
  },
};

// GMX Market addresses on Arbitrum
export const GMX_MARKET_ADDRESSES = {
  'ETH-USD': '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336',
  'BTC-USD': '0x47c031236e19d024b42f8AE6780E44A573170703',
  'ARB-USD': '0xC25cEf6061Cf5dE5eb761b50E4743c1F5D7E5407',
  'LINK-USD': '0x7f1fa204bb700853D36994DA19F830b6Ad18455C',
} as const;

// USDC on Arbitrum
export const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

// Create SDK instance
export function createGmxSdk(walletClient: WalletClient, account: string): GmxSdk {
  return new GmxSdk({
    ...GMX_SDK_CONFIG,
    account,
    walletClient,
  });
}

// Open long position using SDK
export async function openLongPosition(
  sdk: GmxSdk,
  params: {
    marketAddress: string;
    collateralAmount: bigint; // in USDC (6 decimals)
    leverage?: bigint; // optional, defaults to calculating from size
    allowedSlippageBps?: number; // basis points, default 50 = 0.5%
  }
): Promise<void> {
  console.log('[SDK] Opening long position:', params);

  await sdk.orders.long({
    payAmount: params.collateralAmount,
    marketAddress: params.marketAddress,
    payTokenAddress: USDC_ADDRESS,
    collateralTokenAddress: USDC_ADDRESS,
    allowedSlippageBps: params.allowedSlippageBps ?? 50,
    leverage: params.leverage,
  });
}

// Open short position using SDK
export async function openShortPosition(
  sdk: GmxSdk,
  params: {
    marketAddress: string;
    collateralAmount: bigint; // in USDC (6 decimals)
    leverage?: bigint;
    allowedSlippageBps?: number;
  }
): Promise<void> {
  console.log('[SDK] Opening short position:', params);

  await sdk.orders.short({
    payAmount: params.collateralAmount,
    marketAddress: params.marketAddress,
    payTokenAddress: USDC_ADDRESS,
    collateralTokenAddress: USDC_ADDRESS,
    allowedSlippageBps: params.allowedSlippageBps ?? 50,
    leverage: params.leverage,
  });
}

// TODO: Close position functionality
// The SDK's createDecreaseOrder requires full market/token data
// This will be implemented once we add position tracking with full state
