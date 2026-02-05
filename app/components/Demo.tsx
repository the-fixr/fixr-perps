'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { FrameContext } from '../types/frame';
import {
  GMX_MARKETS,
  type MarketKey,
  type MarketData,
  type Position,
  getAllMarkets,
  getPositions,
  calculateTradePreview,
  formatPrice,
} from '../../lib/gmx';
import { formatUsd, formatPercent } from '../../lib/arbitrum';

// ============ Constants ============

// Token logo URLs (CoinGecko CDN)
const TOKEN_LOGOS: Record<MarketKey, string> = {
  'ETH-USD': 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  'BTC-USD': 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
  'ARB-USD': 'https://assets.coingecko.com/coins/images/16547/small/arb.jpg',
  'LINK-USD': 'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png',
};

// ============ Components ============

// Status indicator
function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={`w-2 h-2 rounded-full ${
        connected ? 'bg-long animate-pulse' : 'bg-short'
      }`}
    />
  );
}

// Price ticker item
function TickerItem({ data }: { data: MarketData }) {
  const isPositive = data.change24h >= 0;
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-r border-terminal-border last:border-0">
      <img
        src={TOKEN_LOGOS[data.market]}
        alt={GMX_MARKETS[data.market].symbol}
        className="w-5 h-5 rounded-full"
      />
      <span className="text-terminal-text font-medium">
        {GMX_MARKETS[data.market].symbol}
      </span>
      <span className="font-mono text-terminal-text">
        ${formatPrice(data.market, data.price)}
      </span>
      <span
        className={`font-mono text-sm ${
          isPositive ? 'text-long' : 'text-short'
        }`}
      >
        {formatPercent(data.change24h)}
      </span>
    </div>
  );
}

// Market selector button
function MarketButton({
  market,
  selected,
  onClick,
  price,
  change,
}: {
  market: MarketKey;
  selected: boolean;
  onClick: () => void;
  price: number;
  change: number;
}) {
  const info = GMX_MARKETS[market];
  const isPositive = change >= 0;

  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between p-3 rounded-lg transition-all ${
        selected
          ? 'bg-terminal-tertiary border border-fixr-purple'
          : 'bg-terminal-secondary border border-terminal-border hover:border-fixr-purple/50'
      }`}
    >
      <div className="flex items-center gap-2">
        <img
          src={TOKEN_LOGOS[market]}
          alt={info.symbol}
          className="w-6 h-6 rounded-full"
        />
        <span className="font-display text-lg font-bold">{info.symbol}</span>
        <span className="text-terminal-secondary text-sm">/USD</span>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm">${formatPrice(market, price)}</div>
        <div
          className={`font-mono text-xs ${
            isPositive ? 'text-long' : 'text-short'
          }`}
        >
          {formatPercent(change)}
        </div>
      </div>
    </button>
  );
}

// Leverage slider
function LeverageSlider({
  value,
  onChange,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  max: number;
}) {
  const presets = [2, 5, 10, 25, max];

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-terminal-secondary text-sm">Leverage</span>
        <span className="font-mono text-fixr-purple">{value}x</span>
      </div>
      <input
        type="range"
        min="1"
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-1 bg-terminal-border rounded-lg appearance-none cursor-pointer accent-accent-blue"
      />
      <div className="flex justify-between gap-2">
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`flex-1 py-1 text-xs rounded transition-all font-mono ${
              value === p
                ? 'bg-fixr-purple/20 text-fixr-purple border border-fixr-purple/50'
                : 'bg-terminal-tertiary text-terminal-secondary border border-terminal-border hover:text-terminal-text'
            }`}
          >
            {p}x
          </button>
        ))}
      </div>
    </div>
  );
}

// Position card
function PositionCard({ position }: { position: Position }) {
  const isProfit = parseFloat(position.pnl.replace(/[^0-9.-]/g, '')) >= 0;

  return (
    <div
      className={`terminal-panel p-4 border-l-2 ${
        position.isLong ? 'border-l-long' : 'border-l-short'
      }`}
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="flex items-center gap-2">
            <img
              src={TOKEN_LOGOS[position.market]}
              alt={GMX_MARKETS[position.market].symbol}
              className="w-5 h-5 rounded-full"
            />
            <span className="font-bold">
              {GMX_MARKETS[position.market].symbol}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                position.isLong
                  ? 'bg-long/20 text-long'
                  : 'bg-short/20 text-short'
              }`}
            >
              {position.isLong ? 'LONG' : 'SHORT'} {position.leverage}x
            </span>
          </div>
          <div className="text-terminal-secondary text-sm mt-1">
            Size: ${position.size}
          </div>
        </div>
        <div className="text-right">
          <div
            className={`font-mono font-bold ${
              isProfit ? 'text-long' : 'text-short'
            }`}
          >
            {position.pnl}
          </div>
          <div
            className={`font-mono text-sm ${
              isProfit ? 'text-long' : 'text-short'
            }`}
          >
            {position.pnlPercent >= 0 ? '+' : ''}
            {position.pnlPercent.toFixed(2)}%
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="data-row">
          <span className="text-terminal-secondary">Entry</span>
          <span className="font-mono">${position.entryPrice}</span>
        </div>
        <div className="data-row">
          <span className="text-terminal-secondary">Mark</span>
          <span className="font-mono">${position.markPrice}</span>
        </div>
        <div className="data-row">
          <span className="text-terminal-secondary">Liq. Price</span>
          <span className="font-mono text-accent-orange">
            ${position.liquidationPrice}
          </span>
        </div>
        <div className="data-row">
          <span className="text-terminal-secondary">Collateral</span>
          <span className="font-mono">${position.collateral}</span>
        </div>
      </div>
    </div>
  );
}

// Main trading terminal component
export default function Demo() {
  const [frameData, setFrameData] = useState<FrameContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Trading state
  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<MarketKey>('ETH-USD');
  const [isLong, setIsLong] = useState(true);
  const [collateral, setCollateral] = useState('100');
  const [leverage, setLeverage] = useState(10);
  const [positions, setPositions] = useState<Position[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [walletAddress, setWalletAddress] = useState<`0x${string}` | null>(null);

  // Get current market data
  const currentMarket = markets.find((m) => m.market === selectedMarket);

  // Fetch market data
  const fetchMarkets = useCallback(async () => {
    try {
      const data = await getAllMarkets();
      setMarkets(data);
    } catch (err) {
      console.error('Failed to fetch markets:', err);
    }
  }, []);

  // Fetch user positions
  const fetchPositions = useCallback(async (address: `0x${string}`) => {
    setPositionsLoading(true);
    try {
      const userPositions = await getPositions(address);
      setPositions(userPositions);
    } catch (err) {
      console.error('Failed to fetch positions:', err);
      setPositions([]);
    } finally {
      setPositionsLoading(false);
    }
  }, []);

  // Initialize Frame SDK
  useEffect(() => {
    let mounted = true;

    async function initFrameSDK() {
      try {
        if (typeof window === 'undefined' || !window.frame?.sdk) {
          throw new Error('Frame SDK not found');
        }

        window.frame.sdk.actions.ready();

        let retries = 3;
        let context = null;

        while (retries > 0 && mounted) {
          try {
            context = await window.frame.sdk.context;
            break;
          } catch {
            retries--;
            if (retries > 0) {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          }
        }

        if (!context && mounted) {
          throw new Error('Failed to get Frame context');
        }

        if (mounted) {
          setFrameData(context);
          setError(null);

          // Get wallet address from context if available
          const address = context?.user?.custodyAddress || context?.user?.verifiedAddresses?.ethAddresses?.[0];
          if (address) {
            setWalletAddress(address as `0x${string}`);
            fetchPositions(address as `0x${string}`);
          }
        }
      } catch (err) {
        console.error('Frame initialization error:', err);
        if (mounted) {
          setError(
            err instanceof Error ? err.message : 'Failed to initialize Frame'
          );
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    initFrameSDK();
    fetchMarkets();

    // Refresh prices every 5 seconds
    const interval = setInterval(fetchMarkets, 5000);

    // Refresh positions every 30 seconds if wallet connected
    const positionsInterval = setInterval(() => {
      if (walletAddress) {
        fetchPositions(walletAddress);
      }
    }, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
      clearInterval(positionsInterval);
    };
  }, [fetchMarkets, fetchPositions, walletAddress]);

  // Calculate trade preview
  const preview = currentMarket
    ? calculateTradePreview(
        {
          market: selectedMarket,
          isLong,
          collateral: parseFloat(collateral) || 0,
          leverage,
        },
        currentMarket.price
      )
    : null;

  // Fixr PFP URL
  const FIXR_PFP = 'https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/cb29e65f-deed-422f-d5e0-db1ec1c71300/rectcrop3';

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-terminal-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <img
            src={FIXR_PFP}
            alt="Fixr"
            className="w-16 h-16 rounded-full mx-auto border-2 border-fixr-purple animate-pulse"
          />
          <div className="font-display text-xl font-bold">
            <span className="text-fixr-purple">FIXR</span>
            <span className="text-terminal-text"> PERPS</span>
          </div>
          <div className="text-terminal-secondary text-sm">Initializing terminal...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-terminal-bg fixr-pattern-bg">
      {/* Header */}
      <header className="border-b border-terminal-border bg-terminal-secondary">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img
              src={FIXR_PFP}
              alt="Fixr"
              className="w-8 h-8 rounded-full border border-fixr-purple/50"
            />
            <h1 className="font-display text-xl font-bold tracking-tight">
              <span className="text-fixr-purple">FIXR</span>
              <span className="text-terminal-muted">{'//'}</span>
              <span className="text-terminal-text">PERPS</span>
            </h1>
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-[10px] text-arbitrum-blue border border-arbitrum-blue/30 rounded px-1.5 py-0.5 font-mono">
                ARB
              </span>
              <span className="text-[10px] text-gmx-blue border border-gmx-blue/30 rounded px-1.5 py-0.5 font-mono">
                GMX V2
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <StatusDot connected={!!frameData?.user} />
              {frameData?.user ? (
                <span className="text-terminal-secondary font-mono text-xs">
                  @{frameData.user.username}
                </span>
              ) : (
                <span className="text-terminal-secondary text-xs">Connect</span>
              )}
            </div>
          </div>
        </div>

        {/* Price Ticker */}
        <div className="flex overflow-x-auto border-t border-terminal-border bg-terminal-bg/50">
          {markets.map((m) => (
            <TickerItem key={m.market} data={m} />
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 space-y-4 max-w-4xl mx-auto">
        {/* Market Selector */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.keys(GMX_MARKETS) as MarketKey[]).map((market) => {
            const data = markets.find((m) => m.market === market);
            return (
              <MarketButton
                key={market}
                market={market}
                selected={selectedMarket === market}
                onClick={() => setSelectedMarket(market)}
                price={data?.price || 0}
                change={data?.change24h || 0}
              />
            );
          })}
        </div>

        {/* Trading Panel */}
        <div className="terminal-panel">
          <div className="terminal-header">
            <div className="flex items-center gap-4">
              <img
                src={TOKEN_LOGOS[selectedMarket]}
                alt={GMX_MARKETS[selectedMarket].symbol}
                className="w-7 h-7 rounded-full"
              />
              <span className="font-display font-bold">
                {GMX_MARKETS[selectedMarket].name}
              </span>
              {currentMarket && (
                <span className="font-mono text-lg">
                  ${formatPrice(selectedMarket, currentMarket.price)}
                </span>
              )}
            </div>
            {currentMarket && (
              <span
                className={`font-mono ${
                  currentMarket.change24h >= 0 ? 'text-long' : 'text-short'
                }`}
              >
                {formatPercent(currentMarket.change24h)}
              </span>
            )}
          </div>

          <div className="terminal-body space-y-6">
            {/* Long/Short Toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setIsLong(true)}
                className={`py-3 rounded-lg font-bold transition-all ${
                  isLong
                    ? 'bg-long/20 text-long border border-long/50 shadow-glow-long'
                    : 'bg-terminal-tertiary text-terminal-secondary border border-terminal-border hover:text-long'
                }`}
              >
                LONG
              </button>
              <button
                onClick={() => setIsLong(false)}
                className={`py-3 rounded-lg font-bold transition-all ${
                  !isLong
                    ? 'bg-short/20 text-short border border-short/50 shadow-glow-short'
                    : 'bg-terminal-tertiary text-terminal-secondary border border-terminal-border hover:text-short'
                }`}
              >
                SHORT
              </button>
            </div>

            {/* Collateral Input */}
            <div className="space-y-2">
              <label className="text-terminal-secondary text-sm">
                Collateral (USDC)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-terminal-secondary">
                  $
                </span>
                <input
                  type="number"
                  value={collateral}
                  onChange={(e) => setCollateral(e.target.value)}
                  className="terminal-input w-full pl-7 pr-20"
                  placeholder="100.00"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                  {['25%', '50%', '100%'].map((pct) => (
                    <button
                      key={pct}
                      className="text-xs px-2 py-1 bg-terminal-tertiary text-terminal-secondary rounded hover:text-accent-blue transition-colors"
                    >
                      {pct}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Leverage Slider */}
            <LeverageSlider
              value={leverage}
              onChange={setLeverage}
              max={currentMarket?.maxLeverage || 50}
            />

            {/* Trade Preview */}
            {preview && parseFloat(collateral) > 0 && (
              <div className="bg-terminal-bg rounded-lg p-4 space-y-2">
                <div className="text-sm text-terminal-secondary mb-3">
                  Trade Preview
                </div>
                <div className="data-row">
                  <span className="data-label">Position Size</span>
                  <span className="data-value">{formatUsd(preview.size)}</span>
                </div>
                <div className="data-row">
                  <span className="data-label">Entry Price</span>
                  <span className="data-value">
                    ${formatPrice(selectedMarket, preview.entryPrice)}
                  </span>
                </div>
                <div className="data-row">
                  <span className="data-label">Liquidation Price</span>
                  <span className="data-value text-accent-orange">
                    ${formatPrice(selectedMarket, preview.liquidationPrice)}
                  </span>
                </div>
                <div className="data-row">
                  <span className="data-label">Est. Fees</span>
                  <span className="data-value">{formatUsd(preview.fees)}</span>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              className={`w-full py-4 rounded-lg font-bold text-lg transition-all ${
                isLong
                  ? 'bg-long/20 text-long border border-long/50 hover:bg-long/30'
                  : 'bg-short/20 text-short border border-short/50 hover:bg-short/30'
              }`}
              onClick={() => {
                // In production, this would connect wallet and submit order
                alert('Coming soon: Connect wallet to trade!');
              }}
            >
              {isLong ? 'Open Long' : 'Open Short'}
            </button>
          </div>
        </div>

        {/* Positions */}
        {(positionsLoading || positions.length > 0) && (
          <div className="space-y-3">
            <h2 className="font-display text-lg font-bold text-terminal-text flex items-center gap-2">
              Your Positions
              {!positionsLoading && (
                <span className="text-xs text-terminal-secondary bg-terminal-secondary px-2 py-0.5 rounded">
                  {positions.length}
                </span>
              )}
            </h2>
            {positionsLoading ? (
              <div className="terminal-panel">
                <div className="terminal-body flex items-center justify-center py-8">
                  <div className="text-terminal-secondary animate-pulse">Loading positions...</div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {positions.map((pos, i) => (
                  <PositionCard key={i} position={pos} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Market Stats */}
        {currentMarket && (
          <div className="terminal-panel">
            <div className="terminal-header">
              <span className="font-display font-medium">Market Stats</span>
            </div>
            <div className="terminal-body grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="text-terminal-secondary text-xs">24h High</div>
                <div className="font-mono">
                  ${formatPrice(selectedMarket, currentMarket.high24h)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-terminal-secondary text-xs">24h Low</div>
                <div className="font-mono">
                  ${formatPrice(selectedMarket, currentMarket.low24h)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-terminal-secondary text-xs">
                  24h Volume
                </div>
                <div className="font-mono">
                  {formatUsd(currentMarket.volume24h)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-terminal-secondary text-xs">
                  Funding Rate
                </div>
                <div
                  className={`font-mono ${
                    currentMarket.fundingRate >= 0 ? 'text-long' : 'text-short'
                  }`}
                >
                  {formatPercent(currentMarket.fundingRate * 100, 4)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-terminal-secondary text-xs">
                  OI Long
                </div>
                <div className="font-mono text-long">
                  {formatUsd(currentMarket.openInterestLong)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-terminal-secondary text-xs">
                  OI Short
                </div>
                <div className="font-mono text-short">
                  {formatUsd(currentMarket.openInterestShort)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center text-terminal-secondary text-sm py-4 border-t border-terminal-border">
          <div className="flex items-center justify-center gap-3">
            <a
              href="https://fixr.nexus"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-fixr-purple transition-colors"
            >
              <img src={FIXR_PFP} alt="Fixr" className="w-4 h-4 rounded-full" />
              <span className="font-display font-medium">fixr.nexus</span>
            </a>
            <span className="text-terminal-muted">|</span>
            <span className="text-gmx-blue font-medium">GMX</span>
            <span className="text-terminal-muted">|</span>
            <span className="text-arbitrum-blue font-medium">Arbitrum</span>
          </div>
          {error && (
            <div className="text-short text-xs mt-2">Debug: {error}</div>
          )}
        </footer>
      </main>
    </div>
  );
}
