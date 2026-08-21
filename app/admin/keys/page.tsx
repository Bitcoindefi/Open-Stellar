"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  KeyRound,
  Plus,
  Trash2,
  RotateCw,
  Copy,
  Check,
  Shield,
  Zap,
  Lock,
  ArrowLeft,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

export interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  tier: "free" | "pro" | "admin";
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  requestCount: number;
  status: "active" | "revoked" | "expired";
}

const AVAILABLE_SCOPES = [
  {
    id: "*",
    label: "Full Admin (*)",
    desc: "Unrestricted access across all Open-Stellar endpoints",
  },
  {
    id: "agents:read",
    label: "agents:read",
    desc: "Read agent profiles, stats, metrics, and leaderboards",
  },
  {
    id: "agents:write",
    label: "agents:write",
    desc: "Register, update, and manage agent parameters",
  },
  {
    id: "x402:quote",
    label: "x402:quote",
    desc: "Generate multi-chain X402 payment quotes",
  },
  {
    id: "x402:settle",
    label: "x402:settle",
    desc: "Submit and verify payment settlement receipts",
  },
  {
    id: "webhooks:manage",
    label: "webhooks:manage",
    desc: "Subscribe, rotate, and manage outbound webhook endpoints",
  },
  {
    id: "quests:manage",
    label: "quests:manage",
    desc: "Publish quests, create subtasks, and award XP",
  },
];

function getStatusBadgeClasses(status: string): string {
  if (status === "active") return "bg-emerald-500/10 text-emerald-400";
  if (status === "revoked") return "bg-rose-500/10 text-rose-400";
  return "bg-amber-500/10 text-amber-400";
}

function getStatusDotClasses(status: string): string {
  if (status === "active") return "bg-emerald-400";
  if (status === "revoked") return "bg-rose-400";
  return "bg-amber-400";
}

export default function ApiKeyManagementPage() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    "agents:read",
    "x402:quote",
  ]);
  const [selectedTier, setSelectedTier] = useState<"free" | "pro">("free");
  const [expiresAt, setExpiresAt] = useState("");

  // Revealed Key Modal
  const [revealedKey, setRevealedKey] = useState<{
    id: string;
    key: string;
    name: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Helper to attach authorization header from sessionStorage (clean URL to prevent secret leakage)
  const getAdminAuthHeaders = (): Record<string, string> => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const queryKey = params.get("apiKey");
      if (queryKey) {
        sessionStorage.setItem("openstellar_admin_key", queryKey);
        // Sanitize URL immediately so secret is never stored in browser history or leaked via Referer
        window.history.replaceState({}, "", window.location.pathname);
        return { Authorization: `Bearer ${queryKey}` };
      }

      const sessionKey = sessionStorage.getItem("openstellar_admin_key");
      if (sessionKey) {
        return { Authorization: `Bearer ${sessionKey}` };
      }
    }
    return {};
  };

  // Fetch keys list
  const loadKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/keys", {
        headers: getAdminAuthHeaders(),
      });
      if (!res.ok) {
        throw new Error(`Failed to load keys: ${res.statusText}`);
      }
      const data = await res.json();
      if (data.ok && Array.isArray(data.keys)) {
        setKeys(data.keys);
      } else {
        throw new Error(data.error || "Failed to parse keys");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error connecting to server",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleCreateKey = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminAuthHeaders(),
        },
        body: JSON.stringify({
          name: newKeyName.trim(),
          scopes: selectedScopes,
          tier: selectedTier,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to create API key");
      }

      setRevealedKey({ id: data.id, key: data.key, name: data.name });
      setNewKeyName("");
      setExpiresAt("");
      setIsCreating(false);
      loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (!confirm("Are you sure you want to immediately revoke this API key?"))
      return;

    try {
      const res = await fetch("/api/admin/keys", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAdminAuthHeaders(),
        },
        body: JSON.stringify({ id, action: "revoke" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to revoke key");
      }
      loadKeys();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revoke key");
    }
  };

  const handleRotateKey = async (id: string, name: string) => {
    if (
      !confirm(
        "Rotating will immediately invalidate the current secret and generate a new one. Continue?",
      )
    ) {
      return;
    }

    try {
      const res = await fetch("/api/admin/keys", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAdminAuthHeaders(),
        },
        body: JSON.stringify({ id, action: "rotate" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to rotate key");
      }
      setRevealedKey({ id: data.id, key: data.key, name });
      loadKeys();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to rotate key");
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const toggleScope = (scopeId: string) => {
    if (selectedScopes.includes(scopeId)) {
      setSelectedScopes(selectedScopes.filter((s) => s !== scopeId));
    } else {
      setSelectedScopes([...selectedScopes, scopeId]);
    }
  };

  const activeKeysCount = keys.filter((k) => k.status === "active").length;
  const totalRequestsCount = keys.reduce(
    (acc, k) => acc + (k.requestCount || 0),
    0,
  );

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 selection:bg-cyan-500 selection:text-black">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Navigation & Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-700 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Admin</span>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <KeyRound className="h-6 w-6 text-cyan-400" />
                <h1 className="font-pixel text-2xl uppercase tracking-wider text-white">
                  API Key Management
                </h1>
              </div>
              <p className="font-vt323 text-lg text-slate-400">
                Issue scoped machine-to-machine tokens, configure rate limits,
                and enforce zero-trust production auth.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadKeys}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-700 hover:text-white"
              title="Refresh keys"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin text-cyan-400" : ""}`}
              />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.15)] transition hover:bg-cyan-500/20 hover:text-cyan-200"
            >
              <Plus className="h-4 w-4" />
              <span>Create API Key</span>
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Top Metric Cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5 backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="font-vt323 text-lg uppercase tracking-wider text-slate-400">
                Active Keys
              </span>
              <Shield className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-bold text-white">
                {activeKeysCount}
              </span>
              <span className="text-xs text-slate-500">
                / {keys.length} total
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5 backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="font-vt323 text-lg uppercase tracking-wider text-slate-400">
                Total API Traffic
              </span>
              <Zap className="h-5 w-5 text-amber-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-bold text-white">
                {totalRequestsCount}
              </span>
              <span className="text-xs text-slate-500">requests</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5 backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="font-vt323 text-lg uppercase tracking-wider text-slate-400">
                Storage Security
              </span>
              <Lock className="h-5 w-5 text-cyan-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-lg font-bold text-cyan-300">
                SHA-256 Hashed
              </span>
              <span className="text-xs text-slate-500">Constant-time Safe</span>
            </div>
          </div>
        </div>

        {/* Revealed Secret Modal */}
        {revealedKey && (
          <div className="mb-8 rounded-2xl border border-amber-500/30 bg-amber-950/20 p-6 backdrop-blur">
            <div className="flex items-start gap-4">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-400">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-pixel text-lg uppercase tracking-wide text-amber-200">
                  Secret Key Generated: {revealedKey.name}
                </h3>
                <p className="mt-1 text-sm text-slate-300">
                  Please copy and save this secret key now. For your security,{" "}
                  <strong className="text-amber-300">
                    it will never be displayed again
                  </strong>
                  .
                </p>

                <div className="mt-4 flex items-center gap-2">
                  <div className="flex-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 font-mono text-sm text-cyan-300 select-all">
                    {revealedKey.key}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(revealedKey.key)}
                    className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 font-mono text-sm text-cyan-300 transition hover:bg-cyan-500/20"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    <span>{copied ? "Copied!" : "Copy"}</span>
                  </button>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setRevealedKey(null)}
                    className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-1.5 text-xs text-slate-300 hover:text-white"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Key Modal / Section */}
        {isCreating && (
          <div className="mb-8 rounded-2xl border border-cyan-500/30 bg-slate-950/80 p-6 backdrop-blur">
            <h2 className="font-pixel text-xl uppercase tracking-wide text-cyan-200">
              Create New Scoped API Key
            </h2>
            <p className="font-vt323 text-lg text-slate-400">
              Provision credentials with granular service access and
              sliding-window rate limit tiers.
            </p>

            <form onSubmit={handleCreateKey} className="mt-6 space-y-6">
              <div>
                <label
                  htmlFor="create-key-name"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                >
                  Key Name / Client Identifier
                </label>
                <input
                  id="create-key-name"
                  type="text"
                  required
                  placeholder="e.g. my-production-backend, data-oracle-relay"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-900/90 px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <span
                    id="create-key-tier-label"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                  >
                    Rate Limit Tier
                  </span>
                  <div
                    className="mt-2 flex gap-4"
                    aria-labelledby="create-key-tier-label"
                  >
                    <label
                      className={`flex flex-1 cursor-pointer items-center justify-between rounded-xl border p-3.5 transition ${
                        selectedTier === "free"
                          ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-200"
                          : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="tier"
                          value="free"
                          checked={selectedTier === "free"}
                          onChange={() => setSelectedTier("free")}
                          className="text-cyan-500 focus:ring-0"
                        />
                        <span className="font-mono text-sm font-semibold">
                          Free
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">60 req/min</span>
                    </label>

                    <label
                      className={`flex flex-1 cursor-pointer items-center justify-between rounded-xl border p-3.5 transition ${
                        selectedTier === "pro"
                          ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-200"
                          : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="tier"
                          value="pro"
                          checked={selectedTier === "pro"}
                          onChange={() => setSelectedTier("pro")}
                          className="text-cyan-500 focus:ring-0"
                        />
                        <span className="font-mono text-sm font-semibold">
                          Pro
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">
                        600 req/min
                      </span>
                    </label>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="create-key-expires"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                  >
                    Expiration Date (Optional)
                  </label>
                  <input
                    id="create-key-expires"
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-900/90 px-4 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <span
                  id="create-key-scopes-label"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                >
                  Granular Scopes
                </span>
                <div
                  className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                  aria-labelledby="create-key-scopes-label"
                >
                  {AVAILABLE_SCOPES.map((scope) => {
                    const isSelected = selectedScopes.includes(scope.id);
                    return (
                      <button
                        key={scope.id}
                        type="button"
                        onClick={() => toggleScope(scope.id)}
                        className={`text-left rounded-xl border p-3 transition ${
                          isSelected
                            ? "border-cyan-500/40 bg-cyan-500/10 text-white"
                            : "border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-cyan-300">
                            {scope.label}
                          </span>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            tabIndex={-1}
                            className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0"
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {scope.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2 text-sm font-semibold text-black transition hover:bg-cyan-400 disabled:opacity-50"
                >
                  {submitting ? "Generating..." : "Generate Key"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Keys Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/60 backdrop-blur">
          <div className="border-b border-slate-800/80 px-6 py-4">
            <h3 className="font-pixel text-lg uppercase tracking-wider text-slate-200">
              Active & Issued Credentials
            </h3>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-6 w-6 animate-spin text-cyan-400" />
            </div>
          )}

          {!loading && keys.length === 0 && (
            <div className="py-16 text-center">
              <KeyRound className="mx-auto h-12 w-12 text-slate-700" />
              <h3 className="mt-3 font-pixel text-lg text-slate-400">
                No API Keys Issued Yet
              </h3>
              <p className="font-vt323 text-lg text-slate-500">
                Click &quot;Create API Key&quot; above to issue your first
                machine token.
              </p>
            </div>
          )}

          {!loading && keys.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="border-b border-slate-800/60 bg-slate-900/40 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-6 py-3.5">Name & Prefix</th>
                    <th className="px-6 py-3.5">Scopes</th>
                    <th className="px-6 py-3.5">Tier</th>
                    <th className="px-6 py-3.5">Usage</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Last Used</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {keys.map((key) => {
                    const statusBadgeClass = getStatusBadgeClasses(key.status);
                    const statusDotClass = getStatusDotClasses(key.status);

                    return (
                      <tr key={key.id} className="hover:bg-slate-900/20">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-white">
                            {key.name}
                          </div>
                          <div className="mt-0.5 font-mono text-xs text-cyan-400/90">
                            {key.keyPrefix}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1.5 max-w-xs">
                            {key.scopes.map((scope) => (
                              <span
                                key={scope}
                                className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] text-cyan-300"
                              >
                                {scope}
                              </span>
                            ))}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`rounded-full px-2.5 py-0.5 font-mono text-xs uppercase ${
                              key.tier === "pro"
                                ? "border border-amber-500/20 bg-amber-500/10 text-amber-300"
                                : "border border-slate-700 bg-slate-800 text-slate-300"
                            }`}
                          >
                            {key.tier}
                          </span>
                        </td>

                        <td className="px-6 py-4 font-mono text-xs">
                          {key.requestCount.toLocaleString()} reqs
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`}
                            />
                            {key.status}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-xs text-slate-400">
                          {key.lastUsedAt
                            ? new Date(key.lastUsedAt).toLocaleString()
                            : "Never"}
                        </td>

                        <td className="px-6 py-4 text-right">
                          {key.status === "active" ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  handleRotateKey(key.id, key.name)
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-700 hover:text-white"
                                title="Rotate secret key"
                              >
                                <RotateCw className="h-3.5 w-3.5 text-amber-400" />
                                <span>Rotate</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRevokeKey(key.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-500/20"
                                title="Revoke key immediately"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Revoke</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-600">
                              Disabled
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
