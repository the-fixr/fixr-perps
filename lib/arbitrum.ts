import { createPublicClient, http, formatUnits } from 'viem';
import { arbitrum } from 'viem/chains';

// Arbitrum public client for read operations
export const publicClient = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc'),
});

// Chain configuration
export const ARBITRUM_CONFIG = {
  chainId: 42161,
  name: 'Arbitrum One',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrl: 'https://arb1.arbitrum.io/rpc',
  blockExplorer: 'https://arbiscan.io',
} as const;

// Common token addresses on Arbitrum
export const TOKENS = {
  WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as const,
  USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const, // Native USDC
  USDC_BRIDGED: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8' as const, // Bridged USDC.e
  ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548' as const,
  WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' as const,
  LINK: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4' as const,
  UNI: '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0' as const,
} as const;

// Token decimals
export const TOKEN_DECIMALS: Record<string, number> = {
  [TOKENS.WETH]: 18,
  [TOKENS.USDC]: 6,
  [TOKENS.USDC_BRIDGED]: 6,
  [TOKENS.ARB]: 18,
  [TOKENS.WBTC]: 8,
  [TOKENS.LINK]: 18,
  [TOKENS.UNI]: 18,
};

// ERC20 ABI for balance/allowance checks
export const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
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
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

// Get ETH balance
export async function getEthBalance(address: `0x${string}`): Promise<string> {
  const balance = await publicClient.getBalance({ address });
  return formatUnits(balance, 18);
}

// Get token balance
export async function getTokenBalance(
  tokenAddress: `0x${string}`,
  walletAddress: `0x${string}`
): Promise<{ balance: bigint; formatted: string; decimals: number }> {
  const decimals = TOKEN_DECIMALS[tokenAddress] ?? 18;

  const balance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [walletAddress],
  });

  return {
    balance,
    formatted: formatUnits(balance, decimals),
    decimals,
  };
}

// Format address for display
export function formatAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

// Format number with commas and decimals
export function formatNumber(
  value: number | string,
  decimals = 2,
  prefix = ''
): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return `${prefix}0.00`;

  return `${prefix}${num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

// Format USD value
export function formatUsd(value: number | string): string {
  return formatNumber(value, 2, '$');
}

// Format percentage
export function formatPercent(value: number | string, decimals = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return `${num >= 0 ? '+' : ''}${num.toFixed(decimals)}%`;
}
