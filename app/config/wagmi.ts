import { http, createConfig } from 'wagmi';
import { arbitrum } from 'wagmi/chains';
import { farcasterFrame as farcasterConnector } from '@farcaster/miniapp-wagmi-connector';

export const wagmiConfig = createConfig({
  chains: [arbitrum],
  transports: {
    [arbitrum.id]: http(),
  },
  connectors: [farcasterConnector()],
});