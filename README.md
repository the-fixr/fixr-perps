# Fixr Perps

**perps.fixr.nexus** - GMX V2 trading terminal for Farcaster.

Part of the [Fixr](https://fixr.nexus) ecosystem.

## Features

- **Modern Trading Terminal UI** - Dark theme with neon accents, designed for mobile-first trading
- **GMX V2 Integration** - Trade ETH, BTC, ARB, and LINK perpetuals with up to 50x leverage
- **Real-time Prices** - Live market data with price tickers and 24h stats
- **Position Tracking** - View your open positions with PnL, entry prices, and liquidation levels
- **Farcaster Native** - Built as a Farcaster mini app with SDK integration

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Project Structure

```
gmxlite/
├── app/
│   ├── components/
│   │   └── Demo.tsx          # Main trading terminal component
│   ├── types/
│   │   └── frame.ts          # Farcaster SDK types
│   ├── globals.css           # Terminal theme styles
│   ├── layout.tsx            # App layout with metadata
│   └── page.tsx              # Entry point
├── lib/
│   ├── arbitrum.ts           # Arbitrum chain config & utilities
│   └── gmx.ts                # GMX contract integration
└── public/
    └── images/               # Frame preview images
```

## Configuration

### Environment Variables

No environment variables required for basic functionality. For production deployments with real trading:

```env
# Optional: Custom RPC for better performance
NEXT_PUBLIC_ARBITRUM_RPC=https://your-rpc-url
```

### Supported Markets

| Market   | Symbol | Max Leverage |
|----------|--------|--------------|
| ETH/USD  | ETH    | 50x          |
| BTC/USD  | BTC    | 50x          |
| ARB/USD  | ARB    | 30x          |
| LINK/USD | LINK   | 30x          |

## Development Roadmap

### MVP (Current)
- [x] Trading terminal UI
- [x] Market price display
- [x] Position preview
- [x] Mock position tracking
- [ ] Wallet connection (Farcaster SDK)
- [ ] Real position fetching from GMX contracts

### Phase 2
- [ ] Order submission via GMX Exchange Router
- [ ] Real-time position updates
- [ ] Share position frames
- [ ] Leaderboard

### Phase 3
- [ ] Advanced order types (TP/SL)
- [ ] Position management (increase/decrease)
- [ ] Notifications

## Tech Stack

- **Framework**: Next.js 15
- **Styling**: Tailwind CSS
- **Blockchain**: viem, wagmi
- **Chain**: Arbitrum One
- **Protocol**: GMX V2

## GMX Contract Addresses

```typescript
// Core Contracts (Arbitrum)
DataStore: '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8'
Reader: '0x38d91ED96283d62182Fc6d990C24097A918a4d9b'
ExchangeRouter: '0x7C68C7866A64FA2160F78EEaE12217FFbf871fa8'
Router: '0x7452c558d45f8afC8c83dAe62C3f8A5BE19c71f6'
```

## Deployment

### Vercel

```bash
vercel
```

After deployment, update the URLs in `app/layout.tsx`:
- `imageUrl` - Frame preview image
- `url` - Your deployed URL
- `splashImageUrl` - Splash screen image

### Frame Preview Images

Create these images in `public/images/`:
- `frame-preview.png` (1200x630) - Frame embed preview
- `splash.png` (512x512) - Loading splash screen

## License

MIT

---

Built by [Fixr](https://fixr.nexus) 🔧(https://fixr.nexus) | GMX V2 on Arbitrum | Farcaster Frames
