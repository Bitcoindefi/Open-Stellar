'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDownUp, RefreshCw, AlertCircle, CheckCircle2, ExternalLink, ShieldCheck } from 'lucide-react';
import { SupportedAsset } from '@/lib/defi/treasury-policy';
import { getAssetRate } from '@/lib/defi/soroswap';

interface SwapPanelProps {
  agentId?: string;
  defaultFromAsset?: SupportedAsset;
  onSwapSuccess?: (result: { txHash?: string; fromAmount: string; toAmount: string }) => void;
}

interface SwapHistoryItem {
  id: string;
  fromAsset: SupportedAsset;
  toAsset: SupportedAsset;
  fromAmount: string;
  toAmount: string;
  rate: string;
  fee: string;
  txHash?: string;
  status: 'success' | 'failed';
  failureReason?: string;
  timestamp: number;
}

export function SwapPanel({
  agentId = 'nexus-7',
  defaultFromAsset = 'XLM',
  onSwapSuccess,
}: SwapPanelProps) {
  const [activeTab, setActiveTab] = useState<'swap' | 'history'>('swap');
  const [fromAsset, setFromAsset] = useState<SupportedAsset>(defaultFromAsset);
  const [toAsset, setToAsset] = useState<SupportedAsset>(defaultFromAsset === 'XLM' ? 'USDC' : 'XLM');
  const [amount, setAmount] = useState<string>('10');
  const [slippageTolerance, setSlippageTolerance] = useState<number>(0.005); // 0.5% default
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [latestTxHash, setLatestTxHash] = useState<string | null>(null);
  const [history, setHistory] = useState<SwapHistoryItem[]>([]);

  // Calculate live quote
  const rate = useMemo(() => {
    return getAssetRate(fromAsset, toAsset);
  }, [fromAsset, toAsset]);

  const estimatedOutput = useMemo(() => {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return '0.0000000';
    return (num * rate).toFixed(7);
  }, [amount, rate]);

  const minimumReceived = useMemo(() => {
    const out = parseFloat(estimatedOutput);
    if (isNaN(out) || out <= 0) return '0.0000000';
    return (out * (1 - slippageTolerance)).toFixed(7);
  }, [estimatedOutput, slippageTolerance]);

  // Handle Switch Assets
  const handleSwitchAssets = () => {
    const prevFrom = fromAsset;
    setFromAsset(toAsset);
    setToAsset(prevFrom);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  // Fetch History
  const fetchHistory = async () => {
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/swap`);
      if (res.ok) {
        const data = await res.json();
        if (data.swaps) {
          setHistory(data.swaps);
        }
      }
    } catch {
      // Ignore background fetch error
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, agentId]);

  // Execute Swap
  const handleExecuteSwap = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLatestTxHash(null);

    const parsedAmt = parseFloat(amount);
    if (isNaN(parsedAmt) || parsedAmt <= 0) {
      setErrorMsg('Please enter a valid swap amount greater than zero');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAsset,
          toAsset,
          amount,
          slippageTolerance,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error || 'Swap execution failed');
      } else {
        setSuccessMsg(`Successfully swapped ${data.fromAmount} ${fromAsset} for ${data.toAmount} ${toAsset}!`);
        setLatestTxHash(data.txHash);
        if (onSwapSuccess) {
          onSwapSuccess({ txHash: data.txHash, fromAmount: data.fromAmount, toAmount: data.toAmount });
        }
        fetchHistory();
      }
    } catch (err) {
      setErrorMsg((err as Error).message || 'Network request failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl p-5 text-white shadow-2xl backdrop-blur-md">
      {/* Header Tabs */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-3 mb-4">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-base text-neutral-100">Soroswap DEX Engine</h3>
        </div>
        <div className="flex bg-neutral-800 p-0.5 rounded-lg text-xs font-medium">
          <button
            onClick={() => setActiveTab('swap')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              activeTab === 'swap' ? 'bg-indigo-600 text-white shadow' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Swap
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              activeTab === 'history' ? 'bg-indigo-600 text-white shadow' : 'text-neutral-400 hover:text-white'
            }`}
          >
            History
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'swap' ? (
          <motion.div
            key="swap-tab"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="space-y-4"
          >
            {/* From Asset Box */}
            <div className="bg-neutral-800/60 rounded-lg p-3.5 border border-neutral-700/50">
              <div className="flex justify-between items-center text-xs text-neutral-400 mb-1.5">
                <span>You Pay</span>
                <span>Agent: {agentId}</span>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="bg-transparent text-xl font-mono text-white outline-none w-full"
                />
                <select
                  value={fromAsset}
                  onChange={(e) => {
                    const sel = e.target.value as SupportedAsset;
                    if (sel === toAsset) setToAsset(fromAsset);
                    setFromAsset(sel);
                  }}
                  className="bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-white text-sm font-semibold rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
                >
                  <option value="XLM">XLM</option>
                  <option value="USDC">USDC</option>
                  <option value="BSTC">BSTC</option>
                </select>
              </div>

              {/* Quick Percentages */}
              <div className="flex gap-2 mt-2 pt-2 border-t border-neutral-700/40 text-[11px]">
                {['25%', '50%', '75%', '100%'].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      const num = parseFloat(pct);
                      setAmount((100 * (num / 100)).toString());
                    }}
                    className="px-2 py-0.5 bg-neutral-700/60 hover:bg-neutral-700 text-neutral-300 rounded"
                  >
                    {pct}
                  </button>
                ))}
              </div>
            </div>

            {/* Invert Arrow Button */}
            <div className="flex justify-center -my-2 relative z-10">
              <button
                type="button"
                onClick={handleSwitchAssets}
                className="bg-neutral-800 hover:bg-neutral-700 p-2 rounded-full border border-neutral-700 text-indigo-400 hover:text-indigo-300 transition-colors shadow-lg"
                title="Switch Assets"
              >
                <ArrowDownUp className="w-4 h-4" />
              </button>
            </div>

            {/* To Asset Box */}
            <div className="bg-neutral-800/60 rounded-lg p-3.5 border border-neutral-700/50">
              <div className="flex justify-between items-center text-xs text-neutral-400 mb-1.5">
                <span>You Receive (Estimated)</span>
                <span>Rate: 1 {fromAsset} = {rate.toFixed(4)} {toAsset}</span>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  readOnly
                  value={estimatedOutput}
                  className="bg-transparent text-xl font-mono text-neutral-300 outline-none w-full"
                />
                <select
                  value={toAsset}
                  onChange={(e) => {
                    const sel = e.target.value as SupportedAsset;
                    if (sel === fromAsset) setFromAsset(toAsset);
                    setToAsset(sel);
                  }}
                  className="bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-white text-sm font-semibold rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
                >
                  <option value="XLM">XLM</option>
                  <option value="USDC">USDC</option>
                  <option value="BSTC">BSTC</option>
                </select>
              </div>
            </div>

            {/* Slippage Settings & Network Info */}
            <div className="bg-neutral-950/40 rounded-lg p-3 border border-neutral-800 space-y-2 text-xs text-neutral-400">
              <div className="flex justify-between items-center">
                <span>Max Slippage Tolerance</span>
                <div className="flex gap-1.5">
                  {[0.001, 0.005, 0.01].map((slip) => (
                    <button
                      key={slip}
                      type="button"
                      onClick={() => setSlippageTolerance(slip)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                        slippageTolerance === slip
                          ? 'bg-indigo-600 text-white font-semibold'
                          : 'bg-neutral-800 text-neutral-400 hover:text-white'
                      }`}
                    >
                      {(slip * 100).toFixed(1)}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-1 border-t border-neutral-800/60">
                <span>Minimum Received</span>
                <span className="font-mono text-neutral-200">
                  {minimumReceived} {toAsset}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span>Network Protocol Fee</span>
                <span className="font-mono text-neutral-200">0.00001 XLM</span>
              </div>
            </div>

            {/* Feedback Messages */}
            {errorMsg && (
              <div className="p-3 bg-red-950/50 border border-red-800/80 rounded-lg text-xs text-red-300 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-emerald-950/50 border border-emerald-800/80 rounded-lg text-xs text-emerald-300 flex flex-col space-y-1">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-medium">{successMsg}</span>
                </div>
                {latestTxHash && (
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${latestTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 underline flex items-center gap-1 mt-1 text-[11px]"
                  >
                    <span>View on Stellar Expert Explorer</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            {/* Swap Action Button */}
            <button
              type="button"
              disabled={isLoading}
              onClick={handleExecuteSwap}
              className={`w-full py-3 px-4 rounded-lg font-semibold text-sm transition-all flex items-center justify-center space-x-2 ${
                isLoading
                  ? 'bg-neutral-700 text-neutral-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25 active:scale-[0.99]'
              }`}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Executing Soroswap Order...</span>
                </>
              ) : (
                <span>Execute Automated Swap</span>
              )}
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="history-tab"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="space-y-3"
          >
            <div className="flex justify-between items-center text-xs text-neutral-400 px-1">
              <span>Recent Executions</span>
              <button onClick={fetchHistory} className="hover:text-white flex items-center gap-1 text-[11px]">
                <RefreshCw className="w-3 h-3" />
                <span>Refresh</span>
              </button>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-8 text-neutral-500 text-xs">
                No recent swap transactions recorded for {agentId}
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 bg-neutral-800/50 border border-neutral-700/60 rounded-lg text-xs space-y-1"
                  >
                    <div className="flex justify-between items-center font-medium">
                      <span>
                        {item.fromAmount} {item.fromAsset} → {item.toAmount} {item.toAsset}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          item.status === 'success'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-red-950 text-red-400 border border-red-800'
                        }`}
                      >
                        {item.status.toUpperCase()}
                      </span>
                    </div>
                    {item.txHash && (
                      <div className="text-[11px] text-neutral-400 font-mono truncate">
                        Tx: {item.txHash.slice(0, 16)}...
                      </div>
                    )}
                    {item.failureReason && (
                      <div className="text-[11px] text-red-400">{item.failureReason}</div>
                    )}
                    <div className="text-[10px] text-neutral-500">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
