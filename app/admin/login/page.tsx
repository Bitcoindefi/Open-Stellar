"use client";

import { FormEvent, useState } from "react";

export default function AdminLoginPage() {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Admin sign in failed");
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.assign(next?.startsWith("/admin") ? next : "/admin");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Admin sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#04070d] px-4 text-slate-100">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-cyan-500/20 bg-slate-950 p-6 shadow-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">Agentic City · Admin</p>
        <h1 className="mt-3 font-pixel text-2xl uppercase">Operator sign in</h1>
        <p className="mt-3 font-mono text-sm leading-6 text-slate-400">Enter this deployment&apos;s admin API key. It is sent directly to the server (over HTTPS on deployed sites) and kept out of page URLs and browser storage.</p>
        <label htmlFor="admin-api-key" className="mt-6 block font-mono text-xs uppercase text-slate-400">Admin API key</label>
        <input id="admin-api-key" autoComplete="current-password" required type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 font-mono text-sm outline-none focus:border-cyan-400" />
        {error && <p role="alert" className="mt-3 font-mono text-sm text-rose-300">{error}</p>}
        <button type="submit" disabled={busy} className="mt-5 w-full rounded-lg border border-cyan-400/50 bg-cyan-400/10 px-4 py-3 font-mono text-xs uppercase tracking-[0.2em] text-cyan-100 disabled:opacity-60">{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}
