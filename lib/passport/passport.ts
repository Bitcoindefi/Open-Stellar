/**
 * The whole Agent Passport pipeline, ported from open-stellar-passport into
 * Open Stellar.
 */
import type * as snarkjs from "snarkjs";
import { Buffer } from "buffer";
import { Client, networks, Errors, type StellarNetwork } from "./validator-client";

const VIEWER = "GC7SABHJPHM7ETSM6RJJOJL3NXJK2EJCY324HLXPMB53NZHISWIMSGBP";

export const PASSPORT_TTL_DAYS = Number(process.env.NEXT_PUBLIC_PASSPORT_TTL_DAYS ?? 90);
export const PASSPORT_TTL_MS = PASSPORT_TTL_DAYS * 24 * 60 * 60 * 1000;
export const PROOF_CACHE_TTL_MS = Number(process.env.NEXT_PUBLIC_PASSPORT_PROOF_CACHE_TTL_MS ?? 15 * 60 * 1000);

type PassportStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export interface AgentPassport {
  id: string;
  agentId: string;
  spendCap: string;
  registryRoot: string;
  nullifierHash: string;
  issuedAt: string;
  expiresAt: string;
  status: PassportStatus;
  network: StellarNetwork;
  txHash?: string;
  proof?: SorobanProof;
}

export interface PassportCollection {
  agentId: string;
  passports: AgentPassport[];
  primaryPassport: string;
}

export const currentNetwork = (): StellarNetwork => {
  const value = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? process.env.STELLAR_NETWORK ?? "testnet";
  return value === "mainnet" ? "mainnet" : "testnet";
};

export const CONTRACTS = {
  get validator() { return networks[currentNetwork()].contractId; },
  get verifier() { return networks[currentNetwork()].verifierContractId; },
  get rpcUrl() { return networks[currentNetwork()].rpcUrl; },
  get networkPassphrase() { return networks[currentNetwork()].networkPassphrase; },
};

const BASE = "/";
const ART = {
  circuit: `${BASE}zk/agent_passport.wasm`,
  zkey: `${BASE}zk/agent_passport_final.zkey`,
  witness: `${BASE}zk/passport_witness.wasm`,
  vk: `${BASE}zk/verification_key.json`,
};

export interface SorobanProof {
  proof: { a: Buffer; b: Buffer; c: Buffer };
  proofHex: { a: string; b: string; c: string };
  publicInputs: string[];
}

export interface MintedProof extends SorobanProof {
  id: string;
  agentId: string;
  spendCap: string;
  registryRoot: string;
  nullifierHash: string;
  issuedAt: string;
  expiresAt: string;
  status: PassportStatus;
  network: StellarNetwork;
  raw: snarkjs.Groth16Proof;
  offChainValid: boolean;
  provingMs: number;
  cacheHit?: boolean;
}

export interface OnChainResult {
  ok: boolean;
  attestation?: { agent_id: string; nullifier: string; registry_root: string; spend_cap: string; ledger: number };
  error?: string;
}

const rndField = () => BigInt("0x" + [...crypto.getRandomValues(new Uint8Array(28))].map((b) => b.toString(16).padStart(2, "0")).join("")).toString();
const rndAgentId = () => BigInt("0x" + [...crypto.getRandomValues(new Uint8Array(5))].map((b) => b.toString(16).padStart(2, "0")).join("")).toString();
const be32 = (dec: string | bigint) => {
  const h = BigInt(dec).toString(16);
  if (h.length > 64) throw new Error("field element overflow");
  return h.padStart(64, "0");
};
const g1 = (p: string[]) => be32(p[0]) + be32(p[1]);
const g2 = (p: string[][]) => be32(p[0][1]) + be32(p[0][0]) + be32(p[1][1]) + be32(p[1][0]);
const buf = (hex: string) => Buffer.from(hex, "hex");
const fetchBytes = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());
const passportId = (network: StellarNetwork, agentId: string, nullifierHash: string) => `${network}:${agentId}:${nullifierHash}`;

function toSoroban(raw: snarkjs.Groth16Proof, publicSignals: string[]): SorobanProof {
  const a = g1(raw.pi_a), b = g2(raw.pi_b), c = g1(raw.pi_c);
  return { proof: { a: buf(a), b: buf(b), c: buf(c) }, proofHex: { a, b, c }, publicInputs: publicSignals.map(String) };
}
function errName(code: number): string { return (Errors as Record<number, { message: string }>)[code]?.message ?? `Error #${code}`; }
function parseContractError(e: unknown): string {
  const s = String((e as Error)?.message ?? e);
  const m = s.match(/Error\(Contract,\s*#(\d+)\)/) ?? s.match(/#(\d+)/);
  if (m) return errName(Number(m[1]));
  return s.length > 140 ? s.slice(0, 140) + "…" : s;
}
function client(publicKey = VIEWER, network = currentNetwork()) {
  return new Client({ contractId: networks[network].contractId, networkPassphrase: networks[network].networkPassphrase, rpcUrl: networks[network].rpcUrl, publicKey, allowHttp: true });
}

const collectionKey = (agentId: string, network = currentNetwork()) => `open-stellar:passport-collection:${network}:${agentId}`;
export function getPassportStatus(passport: Pick<AgentPassport, "expiresAt" | "status">, now = new Date()): PassportStatus {
  if (passport.status === "REVOKED") return "REVOKED";
  return new Date(passport.expiresAt).getTime() <= now.getTime() ? "EXPIRED" : "ACTIVE";
}
export function toAgentPassport(m: MintedProof, txHash?: string): AgentPassport {
  return { id: m.id, agentId: m.agentId, spendCap: m.spendCap, registryRoot: m.registryRoot, nullifierHash: m.nullifierHash, issuedAt: m.issuedAt, expiresAt: m.expiresAt, status: getPassportStatus(m), network: m.network, txHash, proof: m };
}
export function loadPassportCollection(agentId: string): PassportCollection {
  if (typeof localStorage === "undefined") return { agentId, passports: [], primaryPassport: "" };
  const parsed = JSON.parse(localStorage.getItem(collectionKey(agentId)) ?? "null") as PassportCollection | null;
  const passports = (parsed?.passports ?? []).map((p) => ({ ...p, status: getPassportStatus(p) }));
  return { agentId, passports, primaryPassport: parsed?.primaryPassport ?? passports.find((p) => p.status === "ACTIVE")?.id ?? passports[0]?.id ?? "" };
}
export function savePassport(passport: AgentPassport): PassportCollection {
  const current = loadPassportCollection(passport.agentId);
  const passports = [passport, ...current.passports.filter((p) => p.id !== passport.id)];
  const primaryPassport = passport.status === "ACTIVE" ? passport.id : current.primaryPassport;
  const collection = { agentId: passport.agentId, passports, primaryPassport };
  localStorage.setItem(collectionKey(passport.agentId, passport.network), JSON.stringify(collection));
  return collection;
}
export function revokePassportLocal(passport: AgentPassport): PassportCollection {
  return savePassport({ ...passport, status: "REVOKED" });
}
export async function revokePassport(_nullifierHash: string): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: "On-chain revocation requires the upgraded validator blacklist admin method to be deployed." };
}

const cacheKey = (spendCap: string, agentId = "new") => `open-stellar:proof-cache:${currentNetwork()}:${agentId}:${spendCap}`;
function openProofDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open("open-stellar-passport-proofs", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("proofs");
    req.onerror = () => resolve(null);
    req.onsuccess = () => resolve(req.result);
  });
}
async function readProofCache(key: string): Promise<MintedProof | null> {
  const db = await openProofDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const req = db.transaction("proofs", "readonly").objectStore("proofs").get(key);
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const parsed = req.result as { expiresAt: number; value: MintedProof } | undefined;
      resolve(parsed && parsed.expiresAt > Date.now() ? parsed.value : null);
    };
  });
}
async function writeProofCache(key: string, value: MintedProof): Promise<void> {
  const db = await openProofDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const req = db.transaction("proofs", "readwrite").objectStore("proofs").put({ expiresAt: Date.now() + PROOF_CACHE_TTL_MS, value }, key);
    req.onerror = () => resolve();
    req.onsuccess = () => resolve();
  });
}

export async function mintPassport(spendCap: string, options: { agentId?: string; useCache?: boolean } = {}): Promise<MintedProof> {
  const key = cacheKey(spendCap, options.agentId);
  if (options.useCache !== false) {
    const cached = await readProofCache(key);
    if (cached) return { ...cached, cacheHit: true };
  }
  const snarkjs = await import("snarkjs");
  const privateKey = rndField();
  const agentId = options.agentId ?? rndAgentId();
  const balance = (BigInt(spendCap) + BigInt(rndAgentId())).toString();
  const pathIndices = "0";
  const pathElements = Array.from({ length: 20 }, rndField);
  const witnessWasm = await fetchBytes(ART.witness);
  const o = { type: "mem" } as object;
  await snarkjs.wtns.calculate({ privateKey, agentId, pathElements, pathIndices }, witnessWasm, o);
  const w = await snarkjs.wtns.exportJson(o);
  const registryRoot = w[1].toString();
  const nullifierHash = w[2].toString();
  const [circuitWasm, zkey] = await Promise.all([fetchBytes(ART.circuit), fetchBytes(ART.zkey)]);
  const input = { registryRoot, nullifierHash, agentId, spendCap, privateKey, balance, pathElements, pathIndices };
  const t0 = performance.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, circuitWasm, zkey);
  const provingMs = Math.round(performance.now() - t0);
  const vk = await (await fetch(ART.vk)).json();
  const offChainValid = await snarkjs.groth16.verify(vk, publicSignals, proof);
  const issuedAt = new Date();
  const minted = { ...toSoroban(proof, publicSignals), id: passportId(currentNetwork(), agentId, nullifierHash), agentId, spendCap, registryRoot, nullifierHash, issuedAt: issuedAt.toISOString(), expiresAt: new Date(issuedAt.getTime() + PASSPORT_TTL_MS).toISOString(), status: "ACTIVE" as const, network: currentNetwork(), raw: proof, offChainValid, provingMs };
  await writeProofCache(key, minted);
  return minted;
}

export async function renewPassport(passport: AgentPassport, spendCap = passport.spendCap): Promise<MintedProof> {
  return mintPassport(spendCap, { agentId: passport.agentId, useCache: false });
}

export async function verifyOnChain(p: SorobanProof): Promise<OnChainResult> {
  try {
    const tx = await client().verify_and_register({ proof: p.proof, public_inputs: p.publicInputs.map((s) => BigInt(s)) });
    const r = tx.result as unknown as { isOk: () => boolean; unwrap: () => { agent_id: bigint; nullifier: bigint; registry_root: bigint; spend_cap: bigint; ledger: number }; unwrapErr: () => { message?: string } };
    if (r.isOk()) {
      const a = r.unwrap();
      return { ok: true, attestation: { agent_id: String(a.agent_id), nullifier: String(a.nullifier), registry_root: String(a.registry_root), spend_cap: String(a.spend_cap), ledger: Number(a.ledger) } };
    }
    return { ok: false, error: r.unwrapErr()?.message ?? "InvalidProof" };
  } catch (e) { return { ok: false, error: parseContractError(e) }; }
}

export async function commitOnChain(p: SorobanProof, publicKey: string, signTransaction: (xdr: string, opts?: object) => Promise<{ signedTxXdr: string }>): Promise<{ ok: boolean; hash?: string; error?: string }> {
  try {
    const tx = await client(publicKey).verify_and_register({ proof: p.proof, public_inputs: p.publicInputs.map((s) => BigInt(s)) });
    const sent = await tx.signAndSend({ signTransaction: async (xdr: string, opts?: object) => signTransaction(xdr, opts) });
    return { ok: true, hash: (sent as { sendTransactionResponse?: { hash?: string } }).sendTransactionResponse?.hash };
  } catch (e) { return { ok: false, error: parseContractError(e) }; }
}
export async function isRegistered(agentId: string): Promise<boolean> { return (await client().is_registered({ agent_id: BigInt(agentId) })).result; }
export async function getPassport(agentId: string): Promise<OnChainResult["attestation"] | undefined> {
  const a = (await client().get_passport({ agent_id: BigInt(agentId) })).result;
  if (!a) return undefined;
  return { agent_id: String(a.agent_id), nullifier: String(a.nullifier), registry_root: String(a.registry_root), spend_cap: String(a.spend_cap), ledger: Number(a.ledger) };
}
export async function authorizePayment(agentId: string, amount: string): Promise<{ authorized: boolean; reason: string; cap?: string }> {
  const collection = typeof localStorage !== "undefined" ? loadPassportCollection(agentId) : undefined;
  const activeLocal = collection?.passports.find((p) => p.id === collection.primaryPassport && getPassportStatus(p) === "ACTIVE") ?? collection?.passports.find((p) => getPassportStatus(p) === "ACTIVE");
  const passport = activeLocal ? { spend_cap: activeLocal.spendCap } : await getPassport(agentId);
  if (!passport) return { authorized: false, reason: "No active passport — agent not verified" };
  const ok = BigInt(passport.spend_cap) >= BigInt(amount);
  return { authorized: ok, cap: passport.spend_cap, reason: ok ? "Within proven spend cap" : "Exceeds proven spend cap" };
}
export async function replaySpentProof(): Promise<OnChainResult> {
  const [hex, pub] = await Promise.all([fetch(`${BASE}zk/spent_proof.json`).then((r) => r.json()), fetch(`${BASE}zk/spent_public.json`).then((r) => r.json())]);
  return verifyOnChain({ proof: { a: buf(hex.a), b: buf(hex.b), c: buf(hex.c) }, proofHex: hex, publicInputs: pub });
}
