'use client';

import { useMemo, useCallback } from 'react';
import { useWalletClient, useAccount } from 'wagmi';
import { parseUnits } from 'viem';
import { GmxSdk } from '@gmx-io/sdk';
import { GMX_SDK_CONFIG, GMX_MARKET_ADDRESSES, USDC_ADDRESS } from '@/lib/gmx-sdk';
import type { MarketKey } from '@/lib/gmx';

// Create SDK instance from wagmi wallet client
export function useGmxSdk() {
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();

  const sdk = useMemo(() => {
    if (!walletClient || !address) return null;

    try {
      console.log('[useGmxSdk] Creating SDK instance for', address);
      return new GmxSdk({
        ...GMX_SDK_CONFIG,
        account: address,
        walletClient,
      });
    } catch (err) {
      console.error('[useGmxSdk] Failed to create SDK:', err);
      return null;
    }
  }, [walletClient, address]);

  // Open a long position
  const openLong = useCallback(
    async (params: {
      market: MarketKey;
      collateralUsd: number; // USD amount
      leverage?: number;
      slippageBps?: number;
    }) => {
      if (!sdk) throw new Error('SDK not initialized - wallet not connected');

      const marketAddress = GMX_MARKET_ADDRESSES[params.market];
      const collateralAmount = parseUnits(params.collateralUsd.toString(), 6); // USDC 6 decimals

      console.log('[useGmxSdk] Opening long via SDK:', {
        market: params.market,
        marketAddress,
        collateralUsd: params.collateralUsd,
        collateralAmount: collateralAmount.toString(),
        leverage: params.leverage,
        slippageBps: params.slippageBps ?? 50,
      });

      // SDK handles everything: approvals, price fetching, calldata encoding, tx sending
      await sdk.orders.long({
        payAmount: collateralAmount,
        marketAddress,
        payTokenAddress: USDC_ADDRESS,
        collateralTokenAddress: USDC_ADDRESS,
        allowedSlippageBps: params.slippageBps ?? 50, // 0.5% default
        leverage: params.leverage ? BigInt(params.leverage) : undefined,
      });

      console.log('[useGmxSdk] Long order submitted successfully');
    },
    [sdk]
  );

  // Open a short position
  const openShort = useCallback(
    async (params: {
      market: MarketKey;
      collateralUsd: number;
      leverage?: number;
      slippageBps?: number;
    }) => {
      if (!sdk) throw new Error('SDK not initialized - wallet not connected');

      const marketAddress = GMX_MARKET_ADDRESSES[params.market];
      const collateralAmount = parseUnits(params.collateralUsd.toString(), 6);

      console.log('[useGmxSdk] Opening short via SDK:', {
        market: params.market,
        marketAddress,
        collateralUsd: params.collateralUsd,
        collateralAmount: collateralAmount.toString(),
        leverage: params.leverage,
        slippageBps: params.slippageBps ?? 50,
      });

      // SDK handles everything: approvals, price fetching, calldata encoding, tx sending
      await sdk.orders.short({
        payAmount: collateralAmount,
        marketAddress,
        payTokenAddress: USDC_ADDRESS,
        collateralTokenAddress: USDC_ADDRESS,
        allowedSlippageBps: params.slippageBps ?? 50,
        leverage: params.leverage ? BigInt(params.leverage) : undefined,
      });

      console.log('[useGmxSdk] Short order submitted successfully');
    },
    [sdk]
  );

  return {
    sdk,
    isReady: !!sdk,
    openLong,
    openShort,
  };
}
