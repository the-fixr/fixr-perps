'use client';

import { useMemo, useCallback } from 'react';
import { useWalletClient, useAccount, useSwitchChain, useChainId, usePublicClient } from 'wagmi';
import { parseUnits, encodeFunctionData } from 'viem';
import { GmxSdk } from '@gmx-io/sdk';
import { GMX_SDK_CONFIG, GMX_MARKET_ADDRESSES, USDC_ADDRESS } from '@/lib/gmx-sdk';
import { GMX_CONTRACTS } from '@/lib/gmx';
import type { MarketKey } from '@/lib/gmx';

const ARBITRUM_CHAIN_ID = 42161;

// Default slippage tolerance in basis points (3% = 300 bps)
// Higher slippage needed because:
// 1. Time between order submission and keeper execution
// 2. Price oracle updates
// 3. Market volatility
const DEFAULT_SLIPPAGE_BPS = 300;

// ERC20 ABI for approvals
const ERC20_ABI = [
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
] as const;

// Create SDK instance from wagmi wallet client
export function useGmxSdk() {
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const chainId = useChainId();
  const publicClient = usePublicClient();

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

  // Check and approve exact amount for Router
  const ensureApproval = useCallback(
    async (amount: bigint) => {
      if (!walletClient || !address || !publicClient) {
        throw new Error('Wallet not connected');
      }

      // Check current allowance for GMX Router
      const currentAllowance = await publicClient.readContract({
        address: USDC_ADDRESS as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, GMX_CONTRACTS.Router],
      });

      console.log('[useGmxSdk] Current allowance:', currentAllowance.toString(), 'needed:', amount.toString());

      // If allowance is insufficient, approve exact amount
      if (currentAllowance < amount) {
        console.log('[useGmxSdk] Approving exact amount:', amount.toString());

        const hash = await walletClient.writeContract({
          address: USDC_ADDRESS as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [GMX_CONTRACTS.Router, amount],
        });

        console.log('[useGmxSdk] Approval tx:', hash);

        // Wait for approval confirmation
        await publicClient.waitForTransactionReceipt({ hash });
        console.log('[useGmxSdk] Approval confirmed');
      }
    },
    [walletClient, address, publicClient]
  );

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
        slippageBps: params.slippageBps ?? DEFAULT_SLIPPAGE_BPS,
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

        // Ensure exact approval before trade
        await ensureApproval(collateralAmount);

        // SDK handles price fetching, calldata encoding, tx sending
        await sdk.orders.long({
          payAmount: collateralAmount,
          marketAddress,
          payTokenAddress: USDC_ADDRESS,
          collateralTokenAddress: USDC_ADDRESS,
          allowedSlippageBps: params.slippageBps ?? DEFAULT_SLIPPAGE_BPS, // 3% default slippage
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
    [sdk, chainId, switchChainAsync, ensureApproval]
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
        slippageBps: params.slippageBps ?? DEFAULT_SLIPPAGE_BPS,
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

        // Ensure exact approval before trade
        await ensureApproval(collateralAmount);

        // SDK handles price fetching, calldata encoding, tx sending
        await sdk.orders.short({
          payAmount: collateralAmount,
          marketAddress,
          payTokenAddress: USDC_ADDRESS,
          collateralTokenAddress: USDC_ADDRESS,
          allowedSlippageBps: params.slippageBps ?? DEFAULT_SLIPPAGE_BPS, // 3% default slippage
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
    [sdk, chainId, switchChainAsync, ensureApproval]
  );

  return {
    sdk,
    isReady: !!sdk,
    openLong,
    openShort,
  };
}
