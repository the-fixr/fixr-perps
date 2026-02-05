'use client';

import { useCallback, useState } from 'react';
import { useWalletClient, usePublicClient } from 'wagmi';

// Contract addresses on Arbitrum
const EXCHANGE_ROUTER = '0x1C3fa76e6E1088bCE750f23a5BFcffa1efEF6A41' as const;
const DATA_STORE = '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8' as const;

// Fixr fee receiver
export const FIXR_FEE_RECEIVER = '0xBe2Cc1861341F3b058A3307385BEBa84167b3fa4' as const;

// GMX Market addresses (for claiming fees)
const GMX_MARKETS = [
  '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336', // ETH-USD
  '0x47c031236e19d024b42f8AE6780E44A573170703', // BTC-USD
  '0xC25cEf6061Cf5dE5eb761b50E4743c1F5D7E5407', // ARB-USD
  '0x7f1fa204bb700853D36994DA19F830b6Ad18455C', // LINK-USD
] as `0x${string}`[];

// Common tokens for fee claiming
const TOKENS = [
  '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC
  '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
  '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', // WBTC
] as `0x${string}`[];

// ABIs
const dataStoreAbi = [
  {
    name: 'getUint',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'key', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const exchangeRouterAbi = [
  {
    name: 'setUiFeeFactor',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'uiFeeFactor', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'claimUiFees',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'markets', type: 'address[]' },
      { name: 'tokens', type: 'address[]' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
] as const;

// Computed as keccak256(abi.encode("MAX_UI_FEE_FACTOR")) in Solidity
const MAX_UI_FEE_FACTOR_KEY = '0xab045c9d202ad7ee7dd9fa7ab3c082d9835872721eaf03397e59b961fe399329' as `0x${string}`;

export function useUiFees() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Query the MAX_UI_FEE_FACTOR from DataStore
   */
  const queryMaxUiFeeFactor = useCallback(async () => {
    if (!publicClient) throw new Error('Public client not available');

    const maxFactor = await publicClient.readContract({
      address: DATA_STORE,
      abi: dataStoreAbi,
      functionName: 'getUint',
      args: [MAX_UI_FEE_FACTOR_KEY],
    });

    const percentage = Number(maxFactor) / 1e30 * 100;
    return { raw: maxFactor, percentage };
  }, [publicClient]);

  /**
   * Register as UI fee receiver
   * Must be called from the FIXR_FEE_RECEIVER address
   */
  const registerUiFeeReceiver = useCallback(
    async (feeFactor?: bigint) => {
      if (!walletClient) throw new Error('Wallet not connected');

      setIsLoading(true);
      try {
        // If no fee factor specified, use the max allowed
        let uiFeeFactor = feeFactor;
        if (!uiFeeFactor) {
          const { raw: maxFactor } = await queryMaxUiFeeFactor();
          uiFeeFactor = maxFactor;
        }

        console.log('[useUiFees] Registering UI fee receiver:', {
          address: walletClient.account?.address,
          feeFactor: uiFeeFactor.toString(),
          percentage: `${Number(uiFeeFactor) / 1e30 * 100}%`,
        });

        const hash = await walletClient.writeContract({
          address: EXCHANGE_ROUTER,
          abi: exchangeRouterAbi,
          functionName: 'setUiFeeFactor',
          args: [uiFeeFactor],
        });

        console.log('[useUiFees] Registration tx:', hash);
        return hash;
      } finally {
        setIsLoading(false);
      }
    },
    [walletClient, queryMaxUiFeeFactor]
  );

  /**
   * Claim accumulated UI fees
   */
  const claimUiFees = useCallback(async () => {
    if (!walletClient) throw new Error('Wallet not connected');

    setIsLoading(true);
    try {
      console.log('[useUiFees] Claiming UI fees for:', FIXR_FEE_RECEIVER);

      const hash = await walletClient.writeContract({
        address: EXCHANGE_ROUTER,
        abi: exchangeRouterAbi,
        functionName: 'claimUiFees',
        args: [GMX_MARKETS, TOKENS, FIXR_FEE_RECEIVER],
      });

      console.log('[useUiFees] Claim tx:', hash);
      return hash;
    } finally {
      setIsLoading(false);
    }
  }, [walletClient]);

  return {
    queryMaxUiFeeFactor,
    registerUiFeeReceiver,
    claimUiFees,
    isLoading,
    FIXR_FEE_RECEIVER,
  };
}
