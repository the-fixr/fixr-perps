'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAccount, useConnect, useSendTransaction, useWaitForTransactionReceipt, useChainId, useSwitchChain } from 'wagmi';
import { parseUnits } from 'viem';
import type { FrameContext } from '../types/frame';
import {
  GMX_MARKETS,
  GMX_CONTRACTS,
  type MarketKey,
  type MarketData,
  type Position,
  getAllMarkets,
  getPositions,
  calculateTradePreview,
  formatPrice,
  checkAllowance,
  getUsdcBalance,
  buildClosePositionCalldata,
  calculateAcceptablePriceForClose,
} from '../../lib/gmx';
import { formatUsd, formatPercent } from '../../lib/arbitrum';
import { useGmxSdk } from '../../hooks/useGmxSdk';

// ============ Constants ============

// GMX minimum collateral (in USD)
// GMX on-chain MIN_COLLATERAL_USD = $1, MIN_POSITION_SIZE_USD = $1
const MIN_COLLATERAL_USD = 1;

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

// Tooltip component
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
        className="cursor-help"
      >
        {children}
      </span>
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] bg-terminal-tertiary border border-terminal-border rounded text-terminal-text whitespace-nowrap z-50">
          {text}
        </span>
      )}
    </span>
  );
}

// Price ticker item (compact)
function TickerItem({ data }: { data: MarketData }) {
  const isPositive = data.change24h >= 0;
  return (
    <div className="flex items-center gap-1.5 px-2 shrink-0">
      <img
        src={TOKEN_LOGOS[data.market]}
        alt={GMX_MARKETS[data.market].symbol}
        className="w-4 h-4 rounded-full"
      />
      <span className="text-terminal-text text-xs font-medium">
        {GMX_MARKETS[data.market].symbol}
      </span>
      <span className="font-mono text-xs text-terminal-text">
        ${formatPrice(data.market, data.price)}
      </span>
      <span
        className={`font-mono text-[10px] ${
          isPositive ? 'text-long' : 'text-short'
        }`}
      >
        {formatPercent(data.change24h)}
      </span>
    </div>
  );
}

// Scrolling ticker wrapper
function ScrollingTicker({ markets }: { markets: MarketData[] }) {
  // Duplicate markets for seamless loop
  const tickerItems = [...markets, ...markets];

  return (
    <div className="overflow-hidden border-t border-terminal-border bg-terminal-bg/50">
      <div className="ticker-scroll flex py-1.5">
        {tickerItems.map((m, i) => (
          <TickerItem key={`${m.market}-${i}`} data={m} />
        ))}
      </div>
    </div>
  );
}

// Market selector button (compact)
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
      className={`flex items-center justify-between p-2 rounded transition-all ${
        selected
          ? 'bg-terminal-tertiary border border-fixr-purple'
          : 'bg-terminal-secondary border border-terminal-border hover:border-fixr-purple/50'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <img
          src={TOKEN_LOGOS[market]}
          alt={info.symbol}
          className="w-5 h-5 rounded-full"
        />
        <span className="font-display text-sm font-bold">{info.symbol}</span>
      </div>
      <div className="text-right">
        <div className="font-mono text-[11px]">${formatPrice(market, price)}</div>
        <div
          className={`font-mono text-[10px] ${
            isPositive ? 'text-long' : 'text-short'
          }`}
        >
          {formatPercent(change)}
        </div>
      </div>
    </button>
  );
}

// Leverage slider (compact)
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
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-terminal-secondary text-xs">Leverage</span>
        <span className="font-mono text-xs text-fixr-purple">{value}x</span>
      </div>
      <input
        type="range"
        min="1"
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-1 bg-terminal-border rounded-lg appearance-none cursor-pointer accent-accent-blue"
      />
      <div className="flex justify-between gap-1">
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`flex-1 py-0.5 text-[10px] rounded transition-all font-mono ${
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

// Trade confirmation modal
type TradeStatus = 'confirm' | 'approving' | 'submitting' | 'success' | 'error';

interface TradeInfo {
  market: string;
  marketKey: MarketKey;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  size: string;
  sizeNum: number;
  leverage: string;
  leverageNum: number;
  entryPrice: string;
  entryPriceNum: number;
  liqPrice: string;
  walletAddress: string;
  collateralAmount: number;
}

function TradeConfirmModal({
  trade,
  status,
  errorMessage,
  needsApproval,
  onConfirm,
  onCancel,
}: {
  trade: TradeInfo;
  status: TradeStatus;
  errorMessage?: string;
  needsApproval: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isLong = trade.direction === 'LONG';
  const isPending = status === 'approving' || status === 'submitting';

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-terminal-secondary border border-terminal-border rounded-lg w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className={`px-4 py-3 border-b border-terminal-border ${isLong ? 'bg-long/10' : 'bg-short/10'}`}>
          <h3 className="font-display font-bold text-base">
            {status === 'success' ? 'Order Submitted!' : status === 'error' ? 'Transaction Failed' : `Confirm ${trade.direction}`}
          </h3>
          <p className="text-terminal-secondary text-xs">{trade.symbol}</p>
        </div>

        {/* Trade Details */}
        <div className="p-4 space-y-2">
          {status === 'success' ? (
            <div className="text-center py-4">
              <div className="text-long text-2xl mb-2">✓</div>
              <div className="text-sm text-terminal-text">Order submitted to GMX</div>
              <div className="text-xs text-terminal-secondary mt-1">
                Keepers will execute your order shortly
              </div>
            </div>
          ) : status === 'error' ? (
            <div className="text-center py-4">
              <div className="text-short text-2xl mb-2">✗</div>
              <div className="text-sm text-terminal-text">Transaction failed</div>
              <div className="text-xs text-short mt-1">{errorMessage || 'Unknown error'}</div>
            </div>
          ) : (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-terminal-secondary">Direction</span>
                <span className={`font-bold ${isLong ? 'text-long' : 'text-short'}`}>
                  {trade.direction}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-terminal-secondary">Size</span>
                <span className="font-mono">{trade.size}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-terminal-secondary">Leverage</span>
                <span className="font-mono text-fixr-purple">{trade.leverage}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-terminal-secondary">Entry Price</span>
                <span className="font-mono">${trade.entryPrice}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-terminal-secondary">Liq Price</span>
                <span className="font-mono text-accent-orange">${trade.liqPrice}</span>
              </div>
              <div className="border-t border-terminal-border my-2 pt-2">
                <div className="flex justify-between text-xs">
                  <span className="text-terminal-secondary">Collateral</span>
                  <span className="font-mono">${trade.collateralAmount.toFixed(2)} USDC</span>
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-terminal-secondary">Exec Fee</span>
                  <span className="font-mono">~0.0003 ETH</span>
                </div>
              </div>
              {isPending && (
                <div className="text-center py-2">
                  <div className="animate-spin inline-block w-5 h-5 border-2 border-fixr-purple border-t-transparent rounded-full mb-2"></div>
                  <div className="text-xs text-terminal-secondary">
                    {status === 'approving' ? 'Approving USDC...' : 'Submitting order...'}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Buttons */}
        <div className="p-4 pt-0 grid grid-cols-2 gap-2">
          {status === 'success' || status === 'error' ? (
            <button
              onClick={onCancel}
              className="col-span-2 py-2.5 rounded font-bold text-sm bg-terminal-tertiary text-terminal-secondary border border-terminal-border hover:text-terminal-text transition-colors"
            >
              Close
            </button>
          ) : (
            <>
              <button
                onClick={onCancel}
                disabled={isPending}
                className="py-2.5 rounded font-bold text-sm bg-terminal-tertiary text-terminal-secondary border border-terminal-border hover:text-terminal-text transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={isPending}
                className={`py-2.5 rounded font-bold text-sm transition-colors disabled:opacity-50 ${
                  isLong
                    ? 'bg-long/20 text-long border border-long/50 hover:bg-long/30'
                    : 'bg-short/20 text-short border border-short/50 hover:bg-short/30'
                }`}
              >
                {needsApproval ? 'Approve & Trade' : 'Confirm Trade'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Position card (compact) with close button
function PositionCard({
  position,
  onClose,
  isClosing
}: {
  position: Position;
  onClose: (position: Position) => void;
  isClosing: boolean;
}) {
  const isProfit = parseFloat(position.pnl.replace(/[^0-9.-]/g, '')) >= 0;

  return (
    <div
      className={`terminal-panel p-2 border-l-2 ${
        position.isLong ? 'border-l-long' : 'border-l-short'
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="flex items-center gap-1.5">
            <img
              src={TOKEN_LOGOS[position.market]}
              alt={GMX_MARKETS[position.market].symbol}
              className="w-4 h-4 rounded-full"
            />
            <span className="font-bold text-sm">
              {GMX_MARKETS[position.market].symbol}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                position.isLong
                  ? 'bg-long/20 text-long'
                  : 'bg-short/20 text-short'
              }`}
            >
              {position.isLong ? 'L' : 'S'} {position.leverage}x
            </span>
          </div>
          <div className="text-terminal-secondary text-[10px] mt-0.5">
            Size: ${position.size}
          </div>
        </div>
        <div className="text-right">
          <div
            className={`font-mono text-sm font-bold ${
              isProfit ? 'text-long' : 'text-short'
            }`}
          >
            {position.pnl}
          </div>
          <div
            className={`font-mono text-[10px] ${
              isProfit ? 'text-long' : 'text-short'
            }`}
          >
            {position.pnlPercent >= 0 ? '+' : ''}
            {position.pnlPercent.toFixed(2)}%
          </div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1 text-[10px] mb-2">
        <div>
          <span className="text-terminal-secondary block">Entry</span>
          <span className="font-mono">${position.entryPrice}</span>
        </div>
        <div>
          <span className="text-terminal-secondary block">Mark</span>
          <span className="font-mono">${position.markPrice}</span>
        </div>
        <div>
          <span className="text-terminal-secondary block">Liq</span>
          <span className="font-mono text-accent-orange">${position.liquidationPrice}</span>
        </div>
        <div>
          <span className="text-terminal-secondary block">Coll</span>
          <span className="font-mono">${position.collateral}</span>
        </div>
      </div>
      {/* Close Position Button */}
      <button
        onClick={() => onClose(position)}
        disabled={isClosing}
        className={`w-full py-1.5 text-[11px] font-bold rounded transition-all ${
          isClosing
            ? 'bg-terminal-tertiary text-terminal-secondary cursor-not-allowed'
            : 'bg-short/10 text-short border border-short/30 hover:bg-short/20'
        }`}
      >
        {isClosing ? 'Closing...' : 'Close Position'}
      </button>
    </div>
  );
}

// Main trading terminal component
export default function Demo() {
  const [frameData, setFrameData] = useState<FrameContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Wagmi hooks - auto-connect in mini app
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  // Transaction hooks
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sendTransaction, data: txHash, reset: resetTx, error: txError } = useSendTransaction();
  const { isSuccess: isTxSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // GMX SDK hook - handles order creation with proper encoding
  const { isReady: sdkReady, openLong: sdkOpenLong, openShort: sdkOpenShort } = useGmxSdk();

  // Log transaction errors
  useEffect(() => {
    if (txError) {
      console.error('[Transaction Error]', txError);
    }
  }, [txError]);

  // Trading state
  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<MarketKey>('ETH-USD');
  const [isLong, setIsLong] = useState(true);
  const [collateral, setCollateral] = useState('10');
  const [leverage, setLeverage] = useState(10);
  const [positions, setPositions] = useState<Position[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingTrade, setPendingTrade] = useState<TradeInfo | null>(null);
  const [tradeStatus, setTradeStatus] = useState<TradeStatus>('confirm');
  const [tradeError, setTradeError] = useState<string | undefined>();
  const [needsApproval, setNeedsApproval] = useState(false);
  const [closingPosition, setClosingPosition] = useState<string | null>(null); // market key of position being closed

  // Get current market data
  const currentMarket = markets.find((m) => m.market === selectedMarket);

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

  // Auto-connect on mount if connector available
  useEffect(() => {
    if (!isConnected && connectors.length > 0) {
      connect({ connector: connectors[0] });
    }
  }, [isConnected, connect, connectors]);

  // Fetch positions when wallet connects
  useEffect(() => {
    if (address) {
      fetchPositions(address);
    }
  }, [address, fetchPositions]);

  // Handle trade submission - opens confirmation modal
  const handleTrade = useCallback(async () => {
    console.log('[handleTrade] Called', { isConnected, address, chainId, preview, collateral });

    if (!isConnected || !address) {
      console.log('[handleTrade] Not connected, attempting connect');
      // Try to connect
      if (connectors.length > 0) {
        connect({ connector: connectors[0] });
      }
      return;
    }

    // Check chain - must be on Arbitrum (42161)
    if (chainId !== 42161) {
      console.log('[handleTrade] Wrong chain:', chainId, 'switching to Arbitrum');
      setError('Please switch to Arbitrum network');
      try {
        switchChain({ chainId: 42161 });
      } catch (e) {
        console.error('[handleTrade] Failed to switch chain:', e);
      }
      return;
    }

    if (!preview) {
      console.log('[handleTrade] No preview');
      setError('Unable to calculate trade preview');
      return;
    }

    const collateralNum = parseFloat(collateral) || 0;
    if (collateralNum <= 0) {
      console.log('[handleTrade] No collateral');
      setError('Enter collateral amount');
      return;
    }

    if (collateralNum < MIN_COLLATERAL_USD) {
      console.log('[handleTrade] Below minimum collateral');
      setError(`Minimum $${MIN_COLLATERAL_USD} collateral required`);
      return;
    }

    setError(null);
    console.log('[handleTrade] Checking balance/allowance for', address);

    // Check USDC balance and allowance
    try {
      const [balance, allowance] = await Promise.all([
        getUsdcBalance(address),
        checkAllowance(address),
      ]);
      console.log('[handleTrade] Balance:', balance, 'Allowance:', allowance);

      const collateralBigInt = parseUnits(collateralNum.toString(), 6);

      if (balance < collateralBigInt) {
        console.log('[handleTrade] Insufficient balance');
        setError(`Insufficient USDC. Have: ${(Number(balance) / 1e6).toFixed(2)}`);
        return;
      }

      // Check if approval is needed
      setNeedsApproval(allowance < collateralBigInt);
      console.log('[handleTrade] Needs approval:', allowance < collateralBigInt);
    } catch (err) {
      console.error('[handleTrade] Failed to check balance/allowance:', err);
      setError('Failed to check wallet balance');
      return;
    }

    // Build trade info for confirmation modal
    const tradeInfo: TradeInfo = {
      market: GMX_MARKETS[selectedMarket].name,
      marketKey: selectedMarket,
      symbol: GMX_MARKETS[selectedMarket].symbol,
      direction: isLong ? 'LONG' : 'SHORT',
      size: formatUsd(preview.size),
      sizeNum: preview.size,
      leverage: `${leverage}x`,
      leverageNum: leverage,
      entryPrice: formatPrice(selectedMarket, preview.entryPrice),
      entryPriceNum: preview.entryPrice,
      liqPrice: formatPrice(selectedMarket, preview.liquidationPrice),
      walletAddress: `${address.slice(0, 6)}...${address.slice(-4)}`,
      collateralAmount: collateralNum,
    };

    // Reset state and show confirmation modal
    console.log('[handleTrade] Showing modal with trade:', tradeInfo);
    setTradeStatus('confirm');
    setTradeError(undefined);
    resetTx();
    setPendingTrade(tradeInfo);
    setShowConfirmModal(true);
  }, [isConnected, address, chainId, preview, selectedMarket, isLong, leverage, collateral, connect, connectors, resetTx, switchChain]);

  // Submit order to GMX using SDK
  const submitOrder = useCallback(async () => {
    if (!pendingTrade || !address) return;

    console.log('[submitOrder] Starting order submission via SDK');
    setTradeStatus('submitting');

    try {
      const isLongOrder = pendingTrade.direction === 'LONG';

      console.log('[submitOrder] Using GMX SDK:', {
        market: pendingTrade.marketKey,
        isLong: isLongOrder,
        collateralUsd: pendingTrade.collateralAmount,
        leverage: pendingTrade.leverageNum,
        sdkReady,
      });

      // Use SDK - it handles approvals, price fetching, and calldata encoding
      if (isLongOrder) {
        await sdkOpenLong({
          market: pendingTrade.marketKey,
          collateralUsd: pendingTrade.collateralAmount,
          leverage: pendingTrade.leverageNum,
          slippageBps: 50, // 0.5%
        });
      } else {
        await sdkOpenShort({
          market: pendingTrade.marketKey,
          collateralUsd: pendingTrade.collateralAmount,
          leverage: pendingTrade.leverageNum,
          slippageBps: 50,
        });
      }

      console.log('[submitOrder] SDK order submitted successfully');
      setTradeStatus('success');

      // Refresh positions after a delay (keeper needs to execute)
      if (address) {
        setTimeout(() => fetchPositions(address), 3000);
      }
    } catch (err) {
      console.error('[submitOrder] SDK order failed:', err);
      setTradeStatus('error');
      setTradeError(err instanceof Error ? err.message : 'Order submission failed');
    }
  }, [pendingTrade, address, sdkReady, sdkOpenLong, sdkOpenShort, fetchPositions]);

  // Handle trade confirmation from modal - executes real trade via SDK
  const handleConfirmTrade = useCallback(async () => {
    console.log('[handleConfirmTrade] Called', { pendingTrade, address, sdkReady });
    if (!pendingTrade || !address) return;

    if (!sdkReady) {
      console.error('[handleConfirmTrade] SDK not ready');
      setTradeError('Wallet not connected properly. Please reconnect.');
      return;
    }

    // SDK handles approvals internally - just submit the order
    await submitOrder();
  }, [pendingTrade, address, sdkReady, submitOrder]);

  // Watch for transaction success and move to next step
  useEffect(() => {
    if (isTxSuccess && tradeStatus === 'approving') {
      // Approval succeeded, now submit order
      setNeedsApproval(false);
      resetTx();
      submitOrder();
    } else if (isTxSuccess && tradeStatus === 'submitting') {
      // Order submitted successfully
      setTradeStatus('success');
      // Refresh positions after a delay (keeper needs to execute)
      if (address) {
        setTimeout(() => fetchPositions(address), 3000);
      }
    }
  }, [isTxSuccess, tradeStatus, address, fetchPositions, resetTx, submitOrder]);

  // Handle cancel from modal
  const handleCancelTrade = useCallback(() => {
    setShowConfirmModal(false);
    setPendingTrade(null);
    setTradeStatus('confirm');
    setTradeError(undefined);
    resetTx();
  }, [resetTx]);

  // Handle close position
  const handleClosePosition = useCallback(async (position: Position) => {
    if (!address) {
      setError('Wallet not connected');
      return;
    }

    // Ensure on Arbitrum
    if (chainId !== 42161) {
      setError('Please switch to Arbitrum network');
      try {
        switchChain({ chainId: 42161 });
      } catch (e) {
        console.error('[handleClosePosition] Failed to switch chain:', e);
      }
      return;
    }

    // Parse position values (remove commas)
    const sizeNum = parseFloat(position.size.replace(/,/g, ''));
    const collateralNum = parseFloat(position.collateral.replace(/,/g, ''));
    const markPriceNum = parseFloat(position.markPrice.replace(/,/g, ''));

    console.log('[handleClosePosition] Closing position:', {
      market: position.market,
      isLong: position.isLong,
      size: sizeNum,
      collateral: collateralNum,
      markPrice: markPriceNum,
    });

    // Set closing state
    const positionKey = `${position.market}-${position.isLong ? 'long' : 'short'}`;
    setClosingPosition(positionKey);
    setError(null);

    try {
      // Calculate acceptable price with 1% slippage for close
      const acceptablePrice = calculateAcceptablePriceForClose(
        markPriceNum,
        position.isLong,
        1.0 // 1% slippage
      );

      // Build the close position calldata
      const { calldata, value } = buildClosePositionCalldata({
        market: position.market,
        isLong: position.isLong,
        sizeDeltaUsd: sizeNum,
        collateralDeltaUsd: collateralNum,
        acceptablePrice,
        account: address,
      });

      console.log('[handleClosePosition] Sending close tx:', {
        to: GMX_CONTRACTS.ExchangeRouter,
        data: calldata.slice(0, 66) + '...',
        value: value.toString(),
      });

      // Send the transaction
      sendTransaction({
        to: GMX_CONTRACTS.ExchangeRouter,
        data: calldata,
        value,
      });

      // Note: Transaction confirmation handled by useWaitForTransactionReceipt
      // We'll refresh positions after a delay to allow keeper execution
      setTimeout(() => {
        if (address) fetchPositions(address);
        setClosingPosition(null);
      }, 5000);

    } catch (err) {
      console.error('[handleClosePosition] Failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to close position');
      setClosingPosition(null);
    }
  }, [address, chainId, switchChain, sendTransaction, fetchPositions]);

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
          // Wallet connection handled by wagmi auto-connect
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

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [fetchMarkets]);

  // Fixr PFP - local file
  const FIXR_PFP = '/fixrpfp.png';

  // Loading state
  if (isLoading) {
    return (
      <div className="h-screen bg-terminal-bg flex items-center justify-center">
        <div className="text-center space-y-3">
          <img
            src={FIXR_PFP}
            alt="Fixr"
            className="w-12 h-12 rounded-full mx-auto border-2 border-fixr-purple animate-pulse"
          />
          <div className="font-display text-lg font-bold">
            <span className="text-fixr-purple">FIXR</span>
            <span className="text-terminal-text"> PERPS</span>
          </div>
          <div className="text-terminal-secondary text-xs">Initializing...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-terminal-bg fixr-pattern-bg flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-terminal-border bg-terminal-secondary shrink-0">
        <div className="flex items-center justify-between px-2 py-1.5">
          <div className="flex items-center gap-2">
            <img
              src={FIXR_PFP}
              alt="Fixr"
              className="w-6 h-6 rounded-full border border-fixr-purple/50"
            />
            <h1 className="font-display text-sm font-bold tracking-tight">
              <span className="text-fixr-purple">FIXR</span>
              <span className="text-terminal-muted">{'//'}</span>
              <span className="text-terminal-text">PERPS</span>
            </h1>
            <span className="text-[8px] text-arbitrum-blue border border-arbitrum-blue/30 rounded px-1 py-0.5 font-mono">
              ARB
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusDot connected={isConnected} />
            {isConnected && address ? (
              <span className="text-terminal-secondary font-mono text-[10px]">
                {address.slice(0, 4)}...{address.slice(-3)}
              </span>
            ) : frameData?.user ? (
              <span className="text-terminal-secondary font-mono text-[10px]">
                @{frameData.user.username}
              </span>
            ) : (
              <span className="text-terminal-secondary text-[10px]">...</span>
            )}
          </div>
        </div>

        {/* Scrolling Price Ticker */}
        {markets.length > 0 && <ScrollingTicker markets={markets} />}
      </header>

      {/* Main Content - Scrollable */}
      <main className="flex-1 overflow-y-auto p-2 space-y-2">
        {/* Market Selector */}
        <div className="grid grid-cols-2 gap-1.5">
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
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-terminal-border">
            <div className="flex items-center gap-2">
              <img
                src={TOKEN_LOGOS[selectedMarket]}
                alt={GMX_MARKETS[selectedMarket].symbol}
                className="w-5 h-5 rounded-full"
              />
              <span className="font-display text-sm font-bold">
                {GMX_MARKETS[selectedMarket].symbol}
              </span>
              {currentMarket && (
                <span className="font-mono text-sm">
                  ${formatPrice(selectedMarket, currentMarket.price)}
                </span>
              )}
            </div>
            {currentMarket && (
              <span
                className={`font-mono text-xs ${
                  currentMarket.change24h >= 0 ? 'text-long' : 'text-short'
                }`}
              >
                {formatPercent(currentMarket.change24h)}
              </span>
            )}
          </div>

          <div className="p-2 space-y-3">
            {/* Long/Short Toggle */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setIsLong(true)}
                className={`py-2 rounded text-sm font-bold transition-all ${
                  isLong
                    ? 'bg-long/20 text-long border border-long/50'
                    : 'bg-terminal-tertiary text-terminal-secondary border border-terminal-border hover:text-long'
                }`}
              >
                LONG
              </button>
              <button
                onClick={() => setIsLong(false)}
                className={`py-2 rounded text-sm font-bold transition-all ${
                  !isLong
                    ? 'bg-short/20 text-short border border-short/50'
                    : 'bg-terminal-tertiary text-terminal-secondary border border-terminal-border hover:text-short'
                }`}
              >
                SHORT
              </button>
            </div>

            {/* Collateral Input */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-terminal-secondary text-xs">
                  Collateral (USDC)
                </label>
                <Tooltip text="GMX minimum is $1 collateral / $1 position size">
                  <span className="text-terminal-secondary text-[10px] flex items-center gap-0.5">
                    Min: ${MIN_COLLATERAL_USD}
                    <span className="text-accent-orange">ⓘ</span>
                  </span>
                </Tooltip>
              </div>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-terminal-secondary text-sm">
                  $
                </span>
                <input
                  type="number"
                  value={collateral}
                  onChange={(e) => setCollateral(e.target.value)}
                  className={`terminal-input w-full pl-5 pr-16 py-1.5 text-sm ${
                    parseFloat(collateral) > 0 && parseFloat(collateral) < MIN_COLLATERAL_USD
                      ? 'border-short/50 focus:border-short'
                      : ''
                  }`}
                  placeholder="1"
                  min={MIN_COLLATERAL_USD}
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5">
                  {['25%', '50%', 'MAX'].map((pct) => (
                    <button
                      key={pct}
                      className="text-[9px] px-1.5 py-0.5 bg-terminal-tertiary text-terminal-secondary rounded hover:text-accent-blue transition-colors"
                    >
                      {pct}
                    </button>
                  ))}
                </div>
              </div>
              {parseFloat(collateral) > 0 && parseFloat(collateral) < MIN_COLLATERAL_USD && (
                <div className="text-short text-[10px]">
                  Minimum ${MIN_COLLATERAL_USD} required
                </div>
              )}
            </div>

            {/* Leverage Slider */}
            <LeverageSlider
              value={leverage}
              onChange={setLeverage}
              max={currentMarket?.maxLeverage || 50}
            />

            {/* Trade Preview */}
            {preview && parseFloat(collateral) > 0 && (
              <div className="bg-terminal-bg rounded p-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-terminal-secondary">Size</span>
                  <span className="font-mono">{formatUsd(preview.size)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-secondary">Entry</span>
                  <span className="font-mono">${formatPrice(selectedMarket, preview.entryPrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-secondary">Liq</span>
                  <span className="font-mono text-accent-orange">${formatPrice(selectedMarket, preview.liquidationPrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-secondary">Fees</span>
                  <span className="font-mono">{formatUsd(preview.fees)}</span>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              className={`w-full py-2.5 rounded font-bold text-sm transition-all ${
                isLong
                  ? 'bg-long/20 text-long border border-long/50 hover:bg-long/30'
                  : 'bg-short/20 text-short border border-short/50 hover:bg-short/30'
              } ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={handleTrade}
              disabled={isConnecting || !parseFloat(collateral)}
            >
              {isConnecting ? 'Processing...' : isConnected ? (isLong ? 'Open Long' : 'Open Short') : 'Connect Wallet'}
            </button>
          </div>
        </div>

        {/* Positions */}
        {(positionsLoading || positions.length > 0) && (
          <div className="space-y-1.5">
            <h2 className="font-display text-xs font-bold text-terminal-text flex items-center gap-1.5">
              Positions
              {!positionsLoading && (
                <span className="text-[10px] text-terminal-secondary bg-terminal-secondary px-1.5 py-0.5 rounded">
                  {positions.length}
                </span>
              )}
            </h2>
            {positionsLoading ? (
              <div className="terminal-panel p-2">
                <div className="text-terminal-secondary text-xs animate-pulse text-center">Loading...</div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {positions.map((pos, i) => (
                  <PositionCard
                    key={i}
                    position={pos}
                    onClose={handleClosePosition}
                    isClosing={closingPosition === `${pos.market}-${pos.isLong ? 'long' : 'short'}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Market Stats - Compact */}
        {currentMarket && (
          <div className="terminal-panel">
            <div className="px-2 py-1 border-b border-terminal-border">
              <span className="font-display text-xs font-medium">Stats</span>
            </div>
            <div className="p-2 grid grid-cols-3 gap-2 text-[10px]">
              <div>
                <div className="text-terminal-secondary">24h H/L</div>
                <div className="font-mono">
                  ${formatPrice(selectedMarket, currentMarket.high24h)} / ${formatPrice(selectedMarket, currentMarket.low24h)}
                </div>
              </div>
              <div>
                <div className="text-terminal-secondary">Volume</div>
                <div className="font-mono">{formatUsd(currentMarket.volume24h)}</div>
              </div>
              <div>
                <div className="text-terminal-secondary">Funding</div>
                <div className={`font-mono ${currentMarket.fundingRate >= 0 ? 'text-long' : 'text-short'}`}>
                  {formatPercent(currentMarket.fundingRate * 100, 4)}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer - Fixed at bottom */}
      <footer className="shrink-0 text-center text-terminal-secondary text-[10px] py-1.5 border-t border-terminal-border bg-terminal-secondary">
        <div className="flex items-center justify-center gap-2">
          <a
            href="https://fixr.nexus"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-fixr-purple transition-colors"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={FIXR_PFP} alt="Fixr" className="w-3 h-3 rounded-full" />
            <span className="font-display font-medium">fixr</span>
          </a>
          <span className="text-terminal-muted">•</span>
          <span className="text-gmx-blue font-medium">GMX</span>
          <span className="text-terminal-muted">•</span>
          <span className="text-arbitrum-blue font-medium">Arbitrum</span>
        </div>
        {error && <div className="text-short text-[9px] mt-0.5">{error}</div>}
      </footer>

      {/* Trade Confirmation Modal */}
      {showConfirmModal && pendingTrade && (
        <TradeConfirmModal
          trade={pendingTrade}
          status={tradeStatus}
          errorMessage={tradeError}
          needsApproval={needsApproval}
          onConfirm={handleConfirmTrade}
          onCancel={handleCancelTrade}
        />
      )}
    </div>
  );
}
