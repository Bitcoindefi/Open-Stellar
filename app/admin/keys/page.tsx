"use client";

import { useEffect, useState, useCallback } from "react";
import {
  KeyRound,
  Shield,
  Copy,
  Check,
  Plus,
  RotateCw,
  Trash2,
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  Radio,
  Cpu,
  Clock,
  Sparkles,
} from "lucide-react";
import type { SanitizedApiKey, ApiKeyTier } from "@/lib/auth/api-keys";

const AVAILABLE_SCOPES = [
  {
    id: "x402:quote",
    label: "x402:quote",
    desc: "Request x402 payment quotes",
  },
  {
    id: "x402:settle",
    label: "x402:settle",
    desc: "Execute settlement verification",
  },
  {
    id: "agents:read",
    label: "agents:read",
    desc: "Read registered agents & stats",
  },
  {
    id: "agents:write",
    label: "agents:write",
    desc: "Provision & manage agent instances",
  },
  {
    id: "webhooks:manage",
    label: "webhooks:manage",
    desc: "Create & configure webhooks",
  },
  {
    id: "quests:manage",
    label: "quests:manage",
    desc: "Create & administer quests",
  },
  {
    id: "*",
    label: "Full Root (*)",
    desc: "Unrestricted machine authorization",
  },
];

const SECURITY_HIGHLIGHTS = [
  {
    icon: <Shield className="h-4 w-4" />,
    title: "Zero-Trust Hashing",
    tone: "text-cyan-300",
    border: "border-cyan-500/20",
    desc: "Keys are stored hashed with SHA-256 and compared in constant time. Plaintext secrets are never stored or logged.",
  },
  {
    icon: <Cpu className="h-4 w-4" />,
    title: "Tier Rate Limits",
    tone: "text-amber-300",
    border: "border-slate-800/80",
    desc: "No key: 10 req/min • Free: 60 req/min • Pro: 600 req/min • Admin: Unlimited.",
  },
  {
    icon: <Clock className="h-4 w-4" />,
    title: "Instant Revocation",
    tone: "text-emerald-300",
    border: "border-slate-800/80",
    desc: "Revoking a key immediately invalidates it across all edge nodes without waiting for token expiry.",
  },
];

function getTierBadgeClass(tier: ApiKeyTier): string {
  if (tier === "pro") {
    return "border border-amber-500/20 bg-amber-500/10 text-amber-300";
  }
  if (tier === "admin") {
    return "border border-cyan-500/30 bg-cyan-500/20 text-cyan-200";
  }
  return "border border-slate-700 bg-slate-800 text-slate-300";
}

function getStatusBadgeClasses(status: string): string {
  if (status === "active") {
    return "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (status === "revoked") {
    return "border border-rose-500/30 bg-rose-500/10 text-rose-300";
  }
  return "border border-slate-700 bg-slate-800 text-slate-400";
}

function getStatusDotClasses(status: string): string {
  if (status === "active") return "bg-emerald-400 animate-pulse";
  if (status === "revoked") return "bg-rose-400";
  return "bg-slate-400";
}

export default function AdminKeysPage() {
  const [keys, setKeys] = useState<SanitizedApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Creation State
  const [isCreating, setIsCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyTier, setNewKeyTier] = useState<ApiKeyTier>("free");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([
    "x402:quote",
    "agents:read",
  ]);
  const [newKeyExpiresAt, setNewKeyExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Created/Rotated Secret Display (ONE TIME ONLY)
  const [revealedKey, setRevealedKey] = useState<{
    id: string;
    key: string;
    name: string;
  } | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Helper to extract API key from URL params or session storage
  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (typeof window === "undefined") return {};
    const params = new URLSearchParams(window.location.search);
    const keyFromUrl = params.get("apiKey") || params.get("key");
    if (keyFromUrl) {
      try {
        window.sessionStorage.setItem("osk_admin_api_key", keyFromUrl);
      } catch {
        // Ignore session storage errors
      }
      return { Authorization: `Bearer ${keyFromUrl}` };
    }
    try {
      const stored = window.sessionStorage.getItem("osk_admin_api_key");
      if (stored) {
        return { Authorization: `Bearer ${stored}` };
      }
    } catch {
      // Ignore session storage errors
    }
    return {};
  }, []);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/keys", {
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(
          data.error || `Failed to load keys (HTTP ${res.status})`,
        );
      }
      if (Array.isArray(data.keys)) {
        setKeys(data.keys);
      } else {
        throw new TypeError(data.error || "Failed listing keys");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreateKey = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          name: newKeyName.trim(),
          tier: newKeyTier,
          scopes: newKeyScopes,
          expiresAt: newKeyExpiresAt
            ? new Date(newKeyExpiresAt).toISOString()
            : null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed creating API key");
      }

      setRevealedKey({
        id: data.id,
        key: data.key,
        name: data.name,
      });

      setNewKeyName("");
      setNewKeyExpiresAt("");
      setIsCreating(false);
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (
      !window.confirm(
        "Are you sure you want to revoke this API key? This action is immediate and cannot be undone.",
      )
    ) {
      return;
    }

    try {
      const res = await fetch("/api/admin/keys", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ id, action: "revoke" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Revocation failed");
      }
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revocation failed");
    }
  };

  const handleRotateKey = async (id: string, name: string) => {
    if (
      !window.confirm(
        `Rotate secret for "${name}"? The existing key will stop working immediately.`,
      )
    ) {
      return;
    }

    try {
      const res = await fetch("/api/admin/keys", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ id, action: "rotate" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Rotation failed");
      }

      setRevealedKey({
        id: data.id,
        key: data.key,
        name,
      });

      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rotation failed");
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Ignore clipboard write failures
    }
  };

  const copyRevealedSecret = async () => {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey.key);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2500);
    } catch {
      // Ignore clipboard write failures
    }
  };

  const toggleScope = (scopeId: string) => {
    setNewKeyScopes((prev) =>
      prev.includes(scopeId)
        ? prev.filter((s) => s !== scopeId)
        : [...prev, scopeId],
    );
  };

  return (
    <div className="min-h-screen bg-[#04070d] text-slate-100 selection:bg-cyan-500 selection:text-black">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.14),_transparent_30%),radial-gradient(circle_at_80%_20%,_rgba(251,191,36,0.1),_transparent_25%),linear-gradient(180deg,_rgba(3,7,18,0.85),_rgba(3,7,18,0.98))]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <a
              href="/admin"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3.5 py-2 text-xs uppercase tracking-wider text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-200"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Admin Console</span>
            </a>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-0.5 text-[10px] uppercase tracking-[0.25em] text-cyan-300">
                <Radio className="h-3 w-3 animate-pulse" />
                Security Gateway
              </div>
              <h1 className="mt-1 font-pixel text-2xl uppercase tracking-wide text-white sm:text-3xl">
                API Key Management
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={fetchKeys}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-300 transition hover:border-slate-700 hover:text-white disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin text-cyan-400" : ""}`}
              />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.35)] transition hover:bg-cyan-400 active:scale-95"
            >
              <Plus className="h-4 w-4 stroke-[3]" />
              <span>Create API Key</span>
            </button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {SECURITY_HIGHLIGHTS.map((item) => (
            <div
              key={item.title}
              className={`rounded-2xl border ${item.border} bg-slate-950/60 p-4 backdrop-blur`}
            >
              <div className={`flex items-center gap-2.5 ${item.tone}`}>
                {item.icon}
                <span className="font-pixel text-xs uppercase tracking-wider">
                  {item.title}
                </span>
              </div>
              <p className="mt-2 font-vt323 text-lg leading-snug text-slate-300">
                {item.desc}
              </p>
            </div>
          ))}
        </section>

        {revealedKey && (
          <div className="rounded-2xl border-2 border-cyan-400 bg-cyan-950/40 p-6 shadow-[0_0_40px_rgba(6,182,212,0.25)] backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 text-cyan-300">
                <Sparkles className="h-5 w-5 animate-spin" />
                <h3 className="font-pixel text-lg uppercase tracking-wide text-white">
                  API Key Generated: &quot;{revealedKey.name}&quot;
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRevealedKey(null)}
                className="text-xs uppercase tracking-wider text-slate-400 hover:text-white"
              >
                Dismiss
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200">
              <div className="flex items-center gap-2 font-bold uppercase tracking-wider">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                <span>Save this key immediately</span>
              </div>
              <p className="mt-1 text-amber-200/90 font-vt323 text-base">
                For security reasons, this is the{" "}
                <strong className="text-white">ONLY TIME</strong> the full
                secret key will be shown. It cannot be recovered after you close
                this message.
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex-1 overflow-x-auto rounded-xl border border-cyan-500/30 bg-slate-950 px-4 py-3 font-mono text-sm text-cyan-200 selection:bg-cyan-400 selection:text-black">
                {revealedKey.key}
              </div>
              <button
                type="button"
                onClick={copyRevealedSecret}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-cyan-400 active:scale-95"
              >
                {copiedSecret ? (
                  <Check className="h-4 w-4 stroke-[3]" />
                ) : (
                  <Copy className="h-4 w-4 stroke-[2.5]" />
                )}
                <span>{copiedSecret ? "Copied!" : "Copy Key"}</span>
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {isCreating && (
          <div className="rounded-2xl border border-cyan-500/30 bg-slate-950/90 p-6 shadow-[0_16px_50px_rgba(0,0,0,0.6)] backdrop-blur">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2 text-cyan-300">
                <KeyRound className="h-5 w-5" />
                <h3 className="font-pixel text-lg uppercase tracking-wider text-white">
                  Issue Scoped Service Key
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="text-xs uppercase tracking-wider text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleCreateKey} className="mt-5 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="new-key-name-input"
                    className="block text-xs uppercase tracking-wider text-slate-400"
                  >
                    Key Name / Identifier *
                  </label>
                  <input
                    id="new-key-name-input"
                    type="text"
                    required
                    placeholder="e.g. billing-settlement-worker"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 font-mono text-sm text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-key-tier-select"
                    className="block text-xs uppercase tracking-wider text-slate-400"
                  >
                    Tier (Rate Limit)
                  </label>
                  <select
                    id="new-key-tier-select"
                    value={newKeyTier}
                    onChange={(e) =>
                      setNewKeyTier(e.target.value as ApiKeyTier)
                    }
                    className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 font-mono text-sm text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="free">Free (60 req/min)</option>
                    <option value="pro">Pro (600 req/min)</option>
                    <option value="admin">Admin (Unlimited)</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-key-expires-input"
                  className="block text-xs uppercase tracking-wider text-slate-400"
                >
                  Expiration Date (Optional)
                </label>
                <input
                  id="new-key-expires-input"
                  type="date"
                  value={newKeyExpiresAt}
                  onChange={(e) => setNewKeyExpiresAt(e.target.value)}
                  className="mt-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 font-mono text-sm text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <fieldset>
                <legend className="block text-xs uppercase tracking-wider text-slate-400">
                  Granted Scopes
                </legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {AVAILABLE_SCOPES.map((scope) => {
                    const isSelected = newKeyScopes.includes(scope.id);
                    return (
                      <button
                        type="button"
                        key={scope.id}
                        onClick={() => toggleScope(scope.id)}
                        className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                          isSelected
                            ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-200"
                            : "border-slate-800/80 bg-slate-900/40 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="font-mono text-xs font-semibold">
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
              </fieldset>

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

        <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/60 backdrop-blur">
          <div className="border-b border-slate-800/80 px-6 py-4">
            <h3 className="font-pixel text-lg uppercase tracking-wider text-slate-200">
              Active &amp; Issued Credentials
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
                    <th className="px-6 py-3.5">Name &amp; Prefix</th>
                    <th className="px-6 py-3.5">Scopes</th>
                    <th className="px-6 py-3.5">Tier</th>
                    <th className="px-6 py-3.5">Usage</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Last Used</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {keys.map((key) => (
                    <tr key={key.id} className="hover:bg-slate-900/20">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-white">
                          {key.name}
                        </div>
                        <div className="mt-0.5 font-mono text-xs text-cyan-400/90 flex items-center gap-1.5">
                          <span>{key.keyPrefix}</span>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(key.keyPrefix, key.id)
                            }
                            className="text-slate-500 hover:text-cyan-300"
                            title="Copy Prefix"
                          >
                            {copiedId === key.id ? (
                              <Check className="h-3 w-3 text-emerald-400" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
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
                          className={`rounded-full px-2.5 py-0.5 font-mono text-xs uppercase ${getTierBadgeClass(key.tier)}`}
                        >
                          {key.tier}
                        </span>
                      </td>

                      <td className="px-6 py-4 font-mono text-xs">
                        {key.requestCount.toLocaleString()} reqs
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeClasses(key.status)}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${getStatusDotClasses(key.status)}`}
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
                              onClick={() => handleRotateKey(key.id, key.name)}
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
