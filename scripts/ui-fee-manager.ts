/**
 * GMX UI Fee Manager
 *
 * Utilities for registering as a UI fee receiver and claiming accumulated fees.
 *
 * Usage:
 *   npx ts-node scripts/ui-fee-manager.ts query     # Check MAX_UI_FEE_FACTOR limit
 *   npx ts-node scripts/ui-fee-manager.ts register  # Register with max allowed fee
 *   npx ts-node scripts/ui-fee-manager.ts claim     # Claim accumulated UI fees
 */

import { createPublicClient, createWalletClient, http } from 'viem';
import { arbitrum } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Contract addresses on Arbitrum
const EXCHANGE_ROUTER = '0x1C3fa76e6E1088bCE750f23a5BFcffa1efEF6A41' as const;
const DATA_STORE = '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8' as const;

// Fixr fee receiver
const FIXR_FEE_RECEIVER = '0xBe2Cc1861341F3b058A3307385BEBa84167b3fa4' as const;

// GMX Market addresses (for claiming fees)
const GMX_MARKETS = [
  '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336', // ETH-USD
  '0x47c031236e19d024b42f8AE6780E44A573170703', // BTC-USD
  '0xC25cEf6061Cf5dE5eb761b50E4743c1F5D7E5407', // ARB-USD
  '0x7f1fa204bb700853D36994DA19F830b6Ad18455C', // LINK-USD
] as const;

// Common tokens for fee claiming
const TOKENS = [
  '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC
  '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
  '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', // WBTC
] as const;

// ABIs (minimal)
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

// Create public client
const publicClient = createPublicClient({
  chain: arbitrum,
  transport: http('https://arb1.arbitrum.io/rpc'),
});

// Key for MAX_UI_FEE_FACTOR in DataStore
// Computed as keccak256(abi.encode("MAX_UI_FEE_FACTOR")) in Solidity
const MAX_UI_FEE_FACTOR_KEY = '0xab045c9d202ad7ee7dd9fa7ab3c082d9835872721eaf03397e59b961fe399329' as `0x${string}`;

/**
 * Query the MAX_UI_FEE_FACTOR from DataStore
 */
async function queryMaxUiFeeFactor(): Promise<{ raw: bigint; percentage: number }> {
  const maxFactor = await publicClient.readContract({
    address: DATA_STORE,
    abi: dataStoreAbi,
    functionName: 'getUint',
    args: [MAX_UI_FEE_FACTOR_KEY],
  });

  // Convert from factor (over 10^30) to percentage
  const percentage = Number(maxFactor) / 1e30 * 100;

  return { raw: maxFactor, percentage };
}

/**
 * Register as UI fee receiver by calling setUiFeeFactor
 * Must be called from the FIXR_FEE_RECEIVER address
 */
async function registerUiFeeReceiver(privateKey: `0x${string}`, feeFactor?: bigint) {
  const account = privateKeyToAccount(privateKey);

  if (account.address.toLowerCase() !== FIXR_FEE_RECEIVER.toLowerCase()) {
    throw new Error(`Private key must be for ${FIXR_FEE_RECEIVER}, got ${account.address}`);
  }

  const walletClient = createWalletClient({
    account,
    chain: arbitrum,
    transport: http('https://arb1.arbitrum.io/rpc'),
  });

  // If no fee factor specified, use the max allowed
  let uiFeeFactor = feeFactor;
  if (!uiFeeFactor) {
    const { raw: maxFactor } = await queryMaxUiFeeFactor();
    uiFeeFactor = maxFactor;
    console.log(`Using max allowed fee factor: ${uiFeeFactor}`);
  }

  console.log(`Registering UI fee receiver...`);
  console.log(`  Address: ${account.address}`);
  console.log(`  Fee factor: ${uiFeeFactor} (${Number(uiFeeFactor) / 1e30 * 100}%)`);

  const hash = await walletClient.writeContract({
    address: EXCHANGE_ROUTER,
    abi: exchangeRouterAbi,
    functionName: 'setUiFeeFactor',
    args: [uiFeeFactor],
  });

  console.log(`Transaction submitted: ${hash}`);
  console.log(`View on Arbiscan: https://arbiscan.io/tx/${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

  return hash;
}

/**
 * Claim accumulated UI fees
 * Can be called by anyone, fees go to FIXR_FEE_RECEIVER
 */
async function claimUiFees(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);

  const walletClient = createWalletClient({
    account,
    chain: arbitrum,
    transport: http('https://arb1.arbitrum.io/rpc'),
  });

  console.log(`Claiming UI fees...`);
  console.log(`  Caller: ${account.address}`);
  console.log(`  Receiver: ${FIXR_FEE_RECEIVER}`);
  console.log(`  Markets: ${GMX_MARKETS.length}`);
  console.log(`  Tokens: ${TOKENS.length}`);

  const hash = await walletClient.writeContract({
    address: EXCHANGE_ROUTER,
    abi: exchangeRouterAbi,
    functionName: 'claimUiFees',
    args: [[...GMX_MARKETS], [...TOKENS], FIXR_FEE_RECEIVER],
  });

  console.log(`Transaction submitted: ${hash}`);
  console.log(`View on Arbiscan: https://arbiscan.io/tx/${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

  return hash;
}

// CLI entry point
async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'query': {
      console.log('Querying MAX_UI_FEE_FACTOR...\n');
      const { raw, percentage } = await queryMaxUiFeeFactor();
      console.log(`MAX_UI_FEE_FACTOR:`);
      console.log(`  Raw value: ${raw}`);
      console.log(`  Percentage: ${percentage}%`);
      console.log(`\nThis is the maximum UI fee you can set.`);
      break;
    }

    case 'register': {
      const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
      if (!privateKey) {
        console.error('Error: PRIVATE_KEY environment variable required');
        console.error('Usage: PRIVATE_KEY=0x... npx ts-node scripts/ui-fee-manager.ts register');
        process.exit(1);
      }
      await registerUiFeeReceiver(privateKey);
      break;
    }

    case 'claim': {
      const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
      if (!privateKey) {
        console.error('Error: PRIVATE_KEY environment variable required');
        console.error('Usage: PRIVATE_KEY=0x... npx ts-node scripts/ui-fee-manager.ts claim');
        process.exit(1);
      }
      await claimUiFees(privateKey);
      break;
    }

    default:
      console.log(`GMX UI Fee Manager

Commands:
  query     Query the MAX_UI_FEE_FACTOR limit (no wallet needed)
  register  Register as UI fee receiver (requires PRIVATE_KEY env var)
  claim     Claim accumulated UI fees (requires PRIVATE_KEY env var)

Examples:
  npx ts-node scripts/ui-fee-manager.ts query
  PRIVATE_KEY=0x... npx ts-node scripts/ui-fee-manager.ts register
  PRIVATE_KEY=0x... npx ts-node scripts/ui-fee-manager.ts claim
`);
  }
}

main().catch(console.error);
