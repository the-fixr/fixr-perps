'use client';

import { useMemo, useCallback } from 'react';
import { useWalletClient, useAccount, useSwitchChain, useChainId } from 'wagmi';
import { parseUnits } from 'viem';
import { GmxSdk } from '@gmx-io/sdk';
import { GMX_SDK_CONFIG, GMX_MARKET_ADDRESSES, USDC_ADDRESS } from '@/lib/gmx-sdk';
import type { MarketKey } from '@/lib/gmx';

const ARBITRUM_CHAIN_ID = 42161;

// Create SDK instance from wagmi wallet client
export function useGmxSdk() {
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const chainId = useChainId();

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
        slippageBps: params.slippageBps ?? 100,
        currentChainId: chainId,
      });

      try {
        // CRITICAL: Ensure we're on Arbitrum before sending the transaction
        if (chainId !== ARBITRUM_CHAIN_ID) {
          console.log('[useGmxSdk] Switching to Arbitrum...');
          await switchChainAsync({ chainId: ARBITRUM_CHAIN_ID });
          // Small delay to let the chain switch propagate
          await new Promise(resolve => setTimeout(resolve, 500));
          console.log('[useGmxSdk] Chain switched to Arbitrum');
        }

        // SDK handles everything: approvals, price fetching, calldata encoding, tx sending
        await sdk.orders.long({
          payAmount: collateralAmount,
          marketAddress,
          payTokenAddress: USDC_ADDRESS,
          collateralTokenAddress: USDC_ADDRESS,
          allowedSlippageBps: params.slippageBps ?? 100, // 1% default slippage
          leverage: params.leverage ? BigInt(params.leverage) : undefined,
          skipSimulation: true, // Skip simulation - can cause false failures
        });
        console.log('[useGmxSdk] Long order submitted successfully');
      } catch (err: unknown) {
        console.error('[useGmxSdk] Long order FAILED:', err);
        if (err instanceof Error) {
          console.error('[useGmxSdk] Error message:', err.message);
          console.error('[useGmxSdk] Error stack:', err.stack);
        }
        throw err;
      }
    },
    [sdk, chainId, switchChainAsync]
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
        slippageBps: params.slippageBps ?? 100,
        currentChainId: chainId,
      });

      try {
        // CRITICAL: Ensure we're on Arbitrum before sending the transaction
        if (chainId !== ARBITRUM_CHAIN_ID) {
          console.log('[useGmxSdk] Switching to Arbitrum...');
          await switchChainAsync({ chainId: ARBITRUM_CHAIN_ID });
          // Small delay to let the chain switch propagate
          await new Promise(resolve => setTimeout(resolve, 500));
          console.log('[useGmxSdk] Chain switched to Arbitrum');
        }

        // SDK handles everything: approvals, price fetching, calldata encoding, tx sending
        await sdk.orders.short({
          payAmount: collateralAmount,
          marketAddress,
          payTokenAddress: USDC_ADDRESS,
          collateralTokenAddress: USDC_ADDRESS,
          allowedSlippageBps: params.slippageBps ?? 100, // 1% default slippage
          leverage: params.leverage ? BigInt(params.leverage) : undefined,
          skipSimulation: true, // Skip simulation - can cause false failures
        });
        console.log('[useGmxSdk] Short order submitted successfully');
      } catch (err: unknown) {
        console.error('[useGmxSdk] Short order FAILED:', err);
        if (err instanceof Error) {
          console.error('[useGmxSdk] Error message:', err.message);
          console.error('[useGmxSdk] Error stack:', err.stack);
        }
        throw err;
      }
    },
    [sdk, chainId, switchChainAsync]
  );

  return {
    sdk,
    isReady: !!sdk,
    openLong,
    openShort,
  };
}
