"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { CheckCircle, Copy, Filter, Shield, Star, Zap } from "lucide-react";
import { DISTRICTS } from "@/lib/data";
import {
  getDistrictName,
  type MarketplaceService,
  type ServiceCapability,
  type ServiceStatus,
} from "@/lib/marketplace/services";
import type { X402Quote, X402Receipt } from "@/lib/protocols/x402";

const CAPABILITIES: Array<ServiceCapability | "all"> = [
  "all",
  "data",
  "comms",
  "processing",
  "defense",
  "research",
];
const STATUSES: Array<ServiceStatus | "all"> = ["all", "online", "offline"];

const snippet = (serviceId: string) => `import { withX402 } from '@open-stellar/x402'

export const GET = withX402(
  { serviceId: '${serviceId}', unitPriceUsd: 0.05 },
  async () => Response.json({ status: 'ok', data: 'Protected Content' })
)`;

export function MarketplaceCatalog({
  services,
}: {
  services: MarketplaceService[];
}) {
  const [district, setDistrict] = useState("all");
  const [capability, setCapability] = useState<ServiceCapability | "all">(
    "all",
  );
  const [status, setStatus] = useState<ServiceStatus | "all">("all");
  const [maxPrice, setMaxPrice] = useState("all");

  const filtered = useMemo(() => {
    return services.filter((service) => {
      if (district !== "all" && service.district !== district) return false;
      if (capability !== "all" && !service.capabilityTags.includes(capability))
        return false;
      if (status !== "all" && service.status !== status) return false;
      if (maxPrice !== "all" && service.priceXlm > Number(maxPrice))
        return false;
      return true;
    });
  }, [capability, district, maxPrice, services, status]);

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 shadow-2xl shadow-cyan-950/20">
        <div className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.28em] text-cyan-200">
          <Filter className="h-4 w-4" /> Filters
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <FilterSelect
            label="District"
            value={district}
            onChange={setDistrict}
            options={[
              { value: "all", label: "All districts" },
              ...DISTRICTS.map((item) => ({
                value: item.id,
                label: item.name,
              })),
            ]}
          />
          <FilterSelect
            label="Max price"
            value={maxPrice}
            onChange={setMaxPrice}
            options={[
              { value: "all", label: "Any price" },
              { value: "0.05", label: "≤ 0.05 XLM" },
              { value: "0.10", label: "≤ 0.10 XLM" },
              { value: "0.20", label: "≤ 0.20 XLM" },
              { value: "0.25", label: "≤ 0.25 XLM" },
            ]}
          />
          <FilterSelect
            label="Capability"
            value={capability}
            onChange={(value) =>
              setCapability(value as ServiceCapability | "all")
            }
            options={CAPABILITIES.map((item) => ({
              value: item,
              label: item === "all" ? "All capabilities" : item,
            }))}
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={(value) => setStatus(value as ServiceStatus | "all")}
            options={STATUSES.map((item) => ({
              value: item,
              label: item === "all" ? "All statuses" : item,
            }))}
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {filtered.map((service) => (
          <ServiceCard key={service.id} service={service} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950/60 p-10 text-center font-mono text-sm text-slate-400">
          No services match the current marketplace filters.
        </div>
      )}
    </section>
  );
}

export function ServiceCard({ service }: { service: MarketplaceService }) {
  const [copied, setCopied] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [quote, setQuote] = useState<X402Quote | null>(null);
  const [receipt, setReceipt] = useState<X402Receipt | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedChain, setSelectedChain] = useState<"stellar" | "bnb" | "base">("stellar");

  const copySnippet = async () => {
    await navigator.clipboard.writeText(snippet(service.id));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const handleCreateQuote = async () => {
    setLoading(true);
    setReceipt(null);
    try {
      const res = await fetch("/api/protocol/x402/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: service.id,
          chain: selectedChain,
          payer: "demo-agent-ui",
          units: 1,
          unitPriceUsd: Number((service.priceXlm * 0.1).toFixed(4)),
        }),
      });
      const data = await res.json();
      if (data.ok) setQuote(data.quote);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSettleQuote = async () => {
    if (!quote) return;
    setLoading(true);
    try {
      const txHash = selectedChain === "stellar" ? "0x" + "a".repeat(64) : "0x" + "f".repeat(64);
      const res = await fetch("/api/protocol/x402/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentRef: quote.paymentRef,
          chain: selectedChain,
          txHash,
          paidBy: "demo-agent-ui",
        }),
      });
      const data = await res.json();
      if (data.ok) setReceipt(data.receipt);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <article className="group rounded-3xl border border-slate-800 bg-slate-950/90 p-5 transition hover:-translate-y-1 hover:border-cyan-400/50 hover:shadow-2xl hover:shadow-cyan-950/30">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative grid h-14 w-14 place-items-center overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
            <Image
              src={service.providerAgent.sprite}
              alt={`${service.providerAgent.name} sprite`}
              width={44}
              height={44}
              unoptimized
            />
          </div>
          <div>
            <h2 className="font-mono text-lg font-bold uppercase text-slate-100">
              {service.name}
            </h2>
            <p className="text-xs text-slate-400">
              by{" "}
              <span className="text-cyan-200">
                {service.providerAgent.name}
              </span>
            </p>
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-1 font-mono text-[10px] uppercase ${service.status === "online" ? "bg-emerald-400/10 text-emerald-300" : "bg-slate-700/60 text-slate-300"}`}
        >
          {service.status}
        </span>
      </div>

      <p className="mt-4 min-h-12 text-sm leading-6 text-slate-300">
        {service.description}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-xs text-cyan-100">
          {getDistrictName(service.district)}
        </span>
        {service.capabilityTags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Chains:</span>
        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] uppercase text-cyan-300">Stellar</span>
        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] uppercase text-amber-300">BNB</span>
        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] uppercase text-purple-300">Base</span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <Metric label="Price" value={`${service.priceXlm.toFixed(2)} XLM ($${(service.priceXlm * 0.1).toFixed(3)})`} />
        <Metric label="Calls" value={service.totalCalls.toLocaleString()} />
        <Metric label="Avg response" value={`${service.averageResponseMs}ms`} />
        <Metric label="Reputation" value={`${service.reputationScore}/1000`} />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-amber-300">
          <Star className="h-4 w-4 fill-current" />
          <span className="font-mono text-sm">
            {service.rating.toFixed(1)} rating
          </span>
        </div>
        <div className="font-mono text-xs text-cyan-200">
          Sub: 1 XLM/mo
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            setTestModalOpen(true);
            handleCreateQuote();
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-3 py-2 font-mono text-xs font-bold uppercase text-slate-950 transition hover:bg-cyan-200"
        >
          <Zap className="h-4 w-4" /> Test x402 Gate
        </button>
        <button
          type="button"
          onClick={copySnippet}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2 font-mono text-xs font-bold uppercase text-slate-200 transition hover:border-cyan-400/60 hover:text-cyan-100"
        >
          <Copy className="h-4 w-4" /> {copied ? "Copied" : "5-Line SDK"}
        </button>
      </div>

      {testModalOpen && (
        <div className="mt-4 rounded-2xl border border-cyan-400/30 bg-slate-950 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-cyan-200 flex items-center gap-2">
              <Shield className="h-4 w-4" /> Live x402 Payment Gate Test
            </h3>
            <button
              type="button"
              onClick={() => { setTestModalOpen(false); setQuote(null); setReceipt(null); }}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Close
            </button>
          </div>

          <div className="mb-3 flex gap-2">
            {(["stellar", "bnb", "base"] as const).map((chain) => (
              <button
                key={chain}
                type="button"
                onClick={() => setSelectedChain(chain)}
                className={`rounded px-2 py-1 font-mono text-xs uppercase ${selectedChain === chain ? "bg-cyan-400/20 text-cyan-200 border border-cyan-400/50" : "bg-slate-900 text-slate-400"}`}
              >
                {chain}
              </button>
            ))}
          </div>

          {quote && !receipt && (
            <div className="space-y-3">
              <div className="rounded bg-slate-900 p-2 font-mono text-xs text-slate-300">
                <div>Quote ID: <span className="text-cyan-300">{quote.quoteId}</span></div>
                <div>Amount USD: <span className="text-emerald-300">${quote.amountUsd}</span></div>
                <div>Payment Ref: <span className="text-slate-400">{quote.paymentRef}</span></div>
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={handleSettleQuote}
                className="w-full rounded bg-emerald-400 px-3 py-2 font-mono text-xs font-bold uppercase text-slate-950 hover:bg-emerald-300"
              >
                {loading ? "Settling..." : `Settle Payment on ${selectedChain.toUpperCase()}`}
              </button>
            </div>
          )}

          {receipt && (
            <div className="space-y-2 rounded bg-emerald-950/40 border border-emerald-500/30 p-3">
              <div className="flex items-center gap-2 text-emerald-300 font-mono text-xs font-bold">
                <CheckCircle className="h-4 w-4" /> Settlement Accepted!
              </div>
              <pre className="max-h-40 overflow-auto text-[10px] font-mono text-emerald-200 bg-slate-900 p-2 rounded">
                {JSON.stringify(receipt, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      <pre className="mt-4 overflow-x-auto rounded-2xl border border-slate-800 bg-black/40 p-3 text-[11px] leading-5 text-slate-300">
        <code>{`import { withX402 } from '@open-stellar/x402'
export const GET = withX402({ serviceId: '${service.id}', unitPriceUsd: ${(service.priceXlm * 0.1).toFixed(3)} }, handler)`}</code>
      </pre>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 flex items-center gap-1 font-mono text-cyan-100">
        <Zap className="h-3 w-3 text-cyan-300" />
        {value}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="space-y-2 text-xs text-slate-400">
      <span className="font-mono uppercase tracking-[0.2em]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
