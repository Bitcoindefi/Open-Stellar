'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Ban,
  ArrowRight,
  Lock,
  FileText,
  RefreshCw,
} from 'lucide-react';
import type { EscrowMilestoneDeal, Milestone, EscrowStatus } from '@/lib/escrow/milestones';
import { formatStroopsToXlm } from '@/lib/escrow/milestones';

interface MilestoneTrackerProps {
  readonly initialDeal: EscrowMilestoneDeal;
}

function getProgressBarColor(status: EscrowStatus): string {
  if (status === 'disputed') {
    return 'bg-rose-500';
  }
  if (status === 'completed') {
    return 'bg-purple-500';
  }
  return 'bg-emerald-500';
}

function getMilestoneCardClass(isCompleted: boolean, isNext: boolean): string {
  if (isCompleted) {
    return 'bg-emerald-950/20 border-emerald-900/40 text-slate-300';
  }
  if (isNext) {
    return 'bg-slate-800/80 border-slate-700 text-white shadow';
  }
  return 'bg-slate-950/50 border-slate-800/60 text-slate-500';
}

export function MilestoneTracker({ initialDeal }: Readonly<MilestoneTrackerProps>) {
  const [deal, setDeal] = useState<EscrowMilestoneDeal>(initialDeal);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const completedCount = deal.milestones.filter((m) => m.status === 'completed').length;
  const progressPercent = Math.round((completedCount / deal.milestones.length) * 100);

  const releasedXlm = formatStroopsToXlm(BigInt(deal.releasedAmountStroops));
  const lockedXlm = formatStroopsToXlm(BigInt(deal.remainingLockedStroops));
  const refundedXlm = formatStroopsToXlm(BigInt(deal.refundedAmountStroops));

  // Invariant verification check
  const invariantHolds =
    BigInt(deal.releasedAmountStroops) +
      BigInt(deal.remainingLockedStroops) +
      BigInt(deal.refundedAmountStroops) ===
    BigInt(deal.totalAmountStroops);

  const handleRelease = async (milestoneId: number) => {
    setLoadingAction(`release-${milestoneId}`);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/escrow/${deal.id}/release-milestone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestoneId, actor: 'client' }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to release milestone');
      }
      setDeal(data.escrow);
      setSuccessMessage(
        data.alreadyPaid
          ? `Milestone #${milestoneId} was already approved and paid.`
          : `Milestone #${milestoneId} successfully released to provider!`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Release failed');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDispute = async () => {
    if (!disputeReason.trim()) {
      setErrorMessage('Please provide a reason for the dispute');
      return;
    }
    setLoadingAction('dispute');
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/escrow/${deal.id}/dispute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'client', reason: disputeReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to raise dispute');
      }
      setDeal(data.escrow);
      setShowDisputeModal(false);
      setSuccessMessage('Dispute raised. Remaining funds are now frozen pending arbitration.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Dispute failed');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this escrow? 100% of deposited funds will be refunded.')) {
      return;
    }
    setLoadingAction('cancel');
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/escrow/${deal.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'client', reason: 'Client requested early cancellation' }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to cancel escrow');
      }
      setDeal(data.escrow);
      setSuccessMessage('Escrow cancelled. 100% of deposited funds have been refunded to the client.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Cancellation failed');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header with Title & Status Badge */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono px-2 py-1 bg-slate-800 text-slate-300 rounded">
              {deal.id}
            </span>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Escrow Milestone Tracker
            </h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Trustless payment release for multi-step agent orchestration work
          </p>
        </div>

        <div>
          {deal.status === 'active' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Active Escrow</span>
            </span>
          )}
          {deal.status === 'completed' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <CheckCircle2 className="w-4 h-4" />
              <span>Fully Completed</span>
            </span>
          )}
          {deal.status === 'disputed' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertTriangle className="w-4 h-4" />
              <span>Disputed (Funds Frozen)</span>
            </span>
          )}
          {deal.status === 'cancelled' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-700/50 text-slate-400 border border-slate-600">
              <Ban className="w-4 h-4" />
              <span>Cancelled & Refunded</span>
            </span>
          )}
        </div>
      </div>

      {/* Alerts */}
      {errorMessage && (
        <div className="p-4 bg-rose-950/50 border border-rose-800 text-rose-300 rounded-lg text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
      {successMessage && (
        <div className="p-4 bg-emerald-950/50 border border-emerald-800 text-emerald-300 rounded-lg text-sm flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Disputed Banner if frozen */}
      {deal.status === 'disputed' && (
        <div className="bg-rose-950/40 border-2 border-rose-600 rounded-xl p-5 text-white space-y-2">
          <div className="flex items-center gap-2 text-rose-400 font-semibold">
            <AlertTriangle className="w-5 h-5" />
            <span>Escrow In Dispute — Remaining Funds Frozen</span>
          </div>
          <p className="text-sm text-slate-300">
            <strong>Reason:</strong> {deal.disputeReason}
          </p>
          <p className="text-xs text-slate-400">
            Disputed by <code className="text-slate-300">{deal.disputedBy}</code> at{' '}
            {deal.disputedAt && new Date(deal.disputedAt).toLocaleString()}. No milestones can be released or refunded until dispute arbitration concludes.
          </p>
        </div>
      )}

      {/* Accounting & Invariant Card */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <span className="text-xs text-slate-400 font-medium">Total Deposited</span>
          <p className="text-xl font-bold text-white mt-1">{deal.totalAmount}</p>
          <span className="text-[10px] text-emerald-400 flex items-center gap-1 mt-1">
            <Lock className="w-3 h-3" /> 100% Upfront Backed
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <span className="text-xs text-slate-400 font-medium">Released to Provider</span>
          <p className="text-xl font-bold text-emerald-400 mt-1">{releasedXlm}</p>
          <span className="text-[10px] text-slate-400 mt-1 block">
            {completedCount} of {deal.milestones.length} milestones
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <span className="text-xs text-slate-400 font-medium">Remaining Locked</span>
          <p className="text-xl font-bold text-amber-400 mt-1">{lockedXlm}</p>
          <span className="text-[10px] text-slate-400 mt-1 block">
            {deal.status === 'disputed' ? 'Frozen in Dispute' : 'Available for Next Milestones'}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <span className="text-xs text-slate-400 font-medium">Refunded to Client</span>
          <p className="text-xl font-bold text-blue-400 mt-1">{refundedXlm}</p>
          <span className="text-[10px] text-slate-400 mt-1 block">
            {deal.status === 'cancelled' ? 'Full Early Refund' : '0.0 XLM'}
          </span>
        </div>
      </div>

      {/* Invariant Health Guarantee Badge */}
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 px-4 flex items-center justify-between text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>
            <strong>Formal Invariant Guarantee:</strong> Released ({releasedXlm}) + Locked ({lockedXlm}) + Refunded ({refundedXlm}) === Total ({deal.totalAmount})
          </span>
        </div>
        <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-semibold ${invariantHolds ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'}`}>
          {invariantHolds ? '✓ INVARIANT VALID' : '✗ INVARIANT VIOLATION'}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3">
        <div className="flex justify-between items-center text-sm">
          <span className="font-semibold text-white">Execution Progress</span>
          <span className="text-slate-400 font-mono">
            {progressPercent}% Complete ({completedCount}/{deal.milestones.length})
          </span>
        </div>
        <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 rounded-full ${getProgressBarColor(deal.status)}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Milestone List */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-400" />
            Sequential Milestones
          </h2>
          <span className="text-xs text-slate-500 font-mono">
            Contract: {deal.sorobanContractId}
          </span>
        </div>

        <div className="space-y-3">
          {deal.milestones.map((m: Milestone, idx: number) => {
            const isNext = m.status === 'pending' && (idx === 0 || deal.milestones[idx - 1]?.status === 'completed');
            const isCompleted = m.status === 'completed';

            return (
              <div
                key={m.id}
                className={`p-4 rounded-lg border transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${getMilestoneCardClass(isCompleted, isNext)}`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      #{m.id}
                    </span>
                    <span className="font-semibold">{m.description}</span>
                  </div>
                  {isCompleted && (
                    <div className="text-xs text-emerald-400 flex items-center gap-1.5 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Paid {m.releaseAmount} to provider at{' '}
                      {m.completedAt && new Date(m.completedAt).toLocaleTimeString()}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                  <span className="font-mono font-bold text-sm text-slate-200">
                    {m.releaseAmount}
                  </span>

                  {isCompleted ? (
                    <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/30">
                      Paid
                    </span>
                  ) : (
                    <button
                      onClick={() => handleRelease(m.id)}
                      disabled={deal.status !== 'active' || loadingAction === `release-${m.id}`}
                      className={`px-3 py-1.5 text-xs font-semibold rounded flex items-center gap-1.5 transition-all ${
                        deal.status === 'active'
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {loadingAction === `release-${m.id}` ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5" />
                      )}
                      Release Milestone
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Control Actions (Dispute / Early Cancel) */}
      {deal.status === 'active' && (
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <div>
            <h3 className="text-sm font-semibold text-white">Escrow Controls</h3>
            <p className="text-xs text-slate-400">
              Raise arbitration dispute or cancel before work begins
            </p>
          </div>

          <div className="flex items-center gap-3">
            {completedCount === 0 && (
              <button
                onClick={handleCancel}
                disabled={loadingAction === 'cancel'}
                className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
              >
                Cancel Escrow (100% Refund)
              </button>
            )}

            <button
              onClick={() => setShowDisputeModal(true)}
              className="px-3 py-1.5 text-xs font-medium bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 rounded border border-rose-500/30 transition flex items-center gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Raise Dispute
            </button>
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {showDisputeModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              Raise Escrow Dispute
            </h3>
            <p className="text-sm text-slate-300">
              Raising a dispute will immediately freeze all remaining locked funds ({lockedXlm}). Neither client nor provider can release or refund funds until arbitration completes.
            </p>
            <div>
              <label htmlFor="dispute-reason-input" className="block text-xs font-semibold text-slate-400 mb-1">
                Reason for dispute
              </label>
              <textarea
                id="dispute-reason-input"
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="e.g. Milestone 2 deliverable does not match specifications..."
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:outline-none focus:border-rose-500 h-24"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDisputeModal(false)}
                className="px-4 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleDispute}
                disabled={loadingAction === 'dispute'}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded flex items-center gap-1.5"
              >
                {loadingAction === 'dispute' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Freeze & Raise Dispute
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Participant Addresses & Audit History */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-white">Participants & Audit Ledger</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div className="p-3 bg-slate-950 rounded border border-slate-800">
            <span className="text-slate-500 block">Client Address (Payer)</span>
            <span className="text-slate-300 break-all">{deal.clientAddress}</span>
          </div>
          <div className="p-3 bg-slate-950 rounded border border-slate-800">
            <span className="text-slate-500 block">Provider Address (Payee)</span>
            <span className="text-slate-300 break-all">{deal.providerAddress}</span>
          </div>
        </div>

        {/* History log */}
        <div className="space-y-2 mt-4">
          <span className="text-xs font-semibold text-slate-400">Activity History</span>
          <div className="space-y-1.5">
            {deal.history.map((ev, i) => (
              <div
                key={`${ev.timestamp}-${ev.action}-${i}`}
                className="text-xs font-mono text-slate-400 p-2 bg-slate-950/60 rounded flex justify-between items-center"
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3 text-slate-500" />
                  <span className="text-slate-200">{ev.action}</span>
                  <span className="text-slate-500">by {ev.actor}</span>
                </div>
                <span className="text-slate-500">{new Date(ev.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
