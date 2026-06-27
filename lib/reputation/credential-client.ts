import { getRegisteredAgent } from '@/lib/agent-registry'
import {
  createLocalReputationAttestation,
  verifyLocalReputationAttestation,
  type ReputationAttestation,
} from '@/lib/reputation/attestation'
import { getReputation, type ReputationSnapshot } from '@/lib/reputation/reputation-store'
import { findAgentByLookup, getAgentCardStats, getAgentProfilePath } from '@/lib/og-card-data'

export type ReputationCredentialSubjectSource = 'city-agent' | 'registered-agent' | 'reputation-only'

export interface ReputationCredentialSubject {
  id: string
  requestedId: string
  name: string
  level: number
  successRate: number
  profilePath: string
  source: ReputationCredentialSubjectSource
}

export interface ReputationCredentialProof {
  type: 'SorobanReputationAttestation' | 'LocalReputationAttestation'
  mode: 'local-attestation'
  network: string
  contractId: string | null
  attestationHash: string
  transactionHash: string | null
  explorerUrl: string | null
  attestation: ReputationAttestation
}

export interface ReputationCredential {
  id: string
  type: 'OpenStellarReputationCredential'
  schema: 'https://open-stellar.dev/schemas/reputation-credential.v1'
  issuer: 'Open Stellar Reputation'
  agentId: string
  owner: string
  level: number
  tasksCompleted: number
  successRate: number
  issuedAt: string
  signature: string
  agent: ReputationCredentialSubject
  reputation: ReputationSnapshot
  proof: ReputationCredentialProof
  links: {
    shareUrl: string
    jsonUrl: string
    explorerUrl: string | null
  }
}

export interface ReputationCredentialVerification {
  method: 'verify_credential'
  ok: boolean
  result: 'valid' | 'invalid'
  checkedAt: string
  checks: {
    agentMatchesAttestation: boolean
    scoreMatchesAttestation: boolean
    attestationHashValid: boolean
    proofHashMatchesAttestation: boolean
  }
}

export interface ReputationCredentialOptions {
  baseUrl?: string
  contractId?: string
}

type CredentialDb = Map<string, ReputationCredential>
type PersistableCredentialState = Record<string, ReputationCredential>

const globalCredentials = globalThis as typeof globalThis & {
  __openStellarReputationCredentials__?: CredentialDb
  __openStellarReputationCredentialStorage__?: PersistableCredentialState
}

function hydrateCredentialDb(): CredentialDb {
  if (globalCredentials.__openStellarReputationCredentials__) {
    return globalCredentials.__openStellarReputationCredentials__
  }

  const hydrated = new Map<string, ReputationCredential>(
    Object.entries(globalCredentials.__openStellarReputationCredentialStorage__ ?? {}),
  )
  globalCredentials.__openStellarReputationCredentials__ = hydrated
  return hydrated
}

const credentialDb = hydrateCredentialDb()

function persist(db: CredentialDb): void {
  globalCredentials.__openStellarReputationCredentialStorage__ = Object.fromEntries(db.entries())
}

function decodeAgentId(agentId: string): string {
  try {
    return decodeURIComponent(agentId).trim()
  } catch {
    return agentId.trim()
  }
}

function storageKey(agentId: string): string {
  return decodeAgentId(agentId).toLowerCase()
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Number(value.toFixed(1))))
}

function levelFromReputation(snapshot: ReputationSnapshot | undefined): number {
  if (!snapshot) return 1
  return Math.max(1, Math.min(30, Math.floor(snapshot.score / 50) + 1))
}

function successRateFromReputation(snapshot: ReputationSnapshot | undefined): number {
  if (!snapshot || snapshot.metrics.tasksCompleted <= 0) return 0
  const failures = Math.min(snapshot.metrics.tasksCompleted, snapshot.metrics.infractions)
  return clampPercent(((snapshot.metrics.tasksCompleted - failures) / snapshot.metrics.tasksCompleted) * 100)
}

function linkFor(path: string, baseUrl?: string): string {
  if (!baseUrl) return path
  return new URL(path, baseUrl).toString()
}

function linksFor(agentId: string, explorerUrl: string | null, baseUrl?: string): ReputationCredential['links'] {
  return {
    shareUrl: linkFor(`/credential/${encodeURIComponent(agentId)}`, baseUrl),
    jsonUrl: linkFor(`/api/agents/${encodeURIComponent(agentId)}/credential/latest`, baseUrl),
    explorerUrl,
  }
}

function withRequestLinks(credential: ReputationCredential, baseUrl?: string): ReputationCredential {
  return {
    ...credential,
    links: linksFor(credential.agent.id, credential.proof.explorerUrl, baseUrl),
  }
}

export function resolveReputationCredentialSubject(
  agentLookup: string,
  snapshot?: ReputationSnapshot,
): ReputationCredentialSubject {
  const requestedId = decodeAgentId(agentLookup) || 'anonymous'
  const cityAgent = findAgentByLookup(requestedId)

  if (cityAgent) {
    const stats = getAgentCardStats(cityAgent)

    return {
      id: cityAgent.id,
      requestedId,
      name: cityAgent.name,
      level: stats.level,
      successRate: clampPercent(Number(stats.uptime)),
      profilePath: getAgentProfilePath(cityAgent),
      source: 'city-agent',
    }
  }

  const registeredAgent = getRegisteredAgent(requestedId)

  if (registeredAgent) {
    return {
      id: registeredAgent.agentId,
      requestedId,
      name: registeredAgent.agentId,
      level: levelFromReputation(snapshot),
      successRate: successRateFromReputation(snapshot),
      profilePath: `/agents/${encodeURIComponent(registeredAgent.agentId)}`,
      source: 'registered-agent',
    }
  }

  return {
    id: requestedId,
    requestedId,
    name: requestedId,
    level: levelFromReputation(snapshot),
    successRate: successRateFromReputation(snapshot),
    profilePath: `/agents/${encodeURIComponent(requestedId)}`,
    source: 'reputation-only',
  }
}

export function issueReputationCredential(
  agentLookup: string,
  options: ReputationCredentialOptions = {},
): ReputationCredential {
  const initialSubject = resolveReputationCredentialSubject(agentLookup)
  const reputation = getReputation(initialSubject.id)
  const agent = resolveReputationCredentialSubject(agentLookup, reputation)
  const attestation = createLocalReputationAttestation(reputation, options.contractId)
  const issuedAt = new Date().toISOString()
  const transactionHash: string | null = null
  const isOnChain = transactionHash !== null

  const credential: ReputationCredential = {
    id: `credential:${agent.id}:${attestation.hash.slice(0, 32)}`,
    type: 'OpenStellarReputationCredential',
    schema: 'https://open-stellar.dev/schemas/reputation-credential.v1',
    issuer: 'Open Stellar Reputation',
    agentId: agent.id,
    owner: agent.id,
    level: agent.level,
    tasksCompleted: reputation.metrics.tasksCompleted,
    successRate: agent.successRate,
    issuedAt,
    signature: attestation.hash,
    agent,
    reputation,
    proof: {
      type: isOnChain ? 'SorobanReputationAttestation' : 'LocalReputationAttestation',
      mode: 'local-attestation',
      network: attestation.network,
      contractId: attestation.contractId ?? null,
      attestationHash: attestation.hash,
      transactionHash,
      explorerUrl: isOnChain ? attestation.stellarExpertUrl : null,
      attestation,
    },
    links: linksFor(agent.id, isOnChain ? attestation.stellarExpertUrl : null),
  }

  credentialDb.set(storageKey(agent.id), credential)
  credentialDb.set(storageKey(agent.requestedId), credential)
  persist(credentialDb)
  return withRequestLinks(credential, options.baseUrl)
}

export function getLatestReputationCredential(agentLookup: string): ReputationCredential | null {
  const subject = resolveReputationCredentialSubject(agentLookup)
  return credentialDb.get(storageKey(subject.id)) ?? credentialDb.get(storageKey(agentLookup)) ?? null
}

export function getOrIssueLatestReputationCredential(
  agentLookup: string,
  options: ReputationCredentialOptions = {},
): ReputationCredential {
  const credential = getLatestReputationCredential(agentLookup)
  return credential ? withRequestLinks(credential, options.baseUrl) : issueReputationCredential(agentLookup, options)
}

export function verifyReputationCredential(credential: ReputationCredential): ReputationCredentialVerification {
  const attestation = credential.proof.attestation
  const agentMatchesAttestation = attestation.agentId === credential.agent.id
  const scoreMatchesAttestation = attestation.score === credential.reputation.score
  const attestationHashValid = verifyLocalReputationAttestation(
    credential.agent.id,
    credential.reputation.score,
    attestation,
  )
  const proofHashMatchesAttestation = credential.proof.attestationHash === attestation.hash
  const ok = agentMatchesAttestation && scoreMatchesAttestation && attestationHashValid && proofHashMatchesAttestation

  return {
    method: 'verify_credential',
    ok,
    result: ok ? 'valid' : 'invalid',
    checkedAt: new Date().toISOString(),
    checks: {
      agentMatchesAttestation,
      scoreMatchesAttestation,
      attestationHashValid,
      proofHashMatchesAttestation,
    },
  }
}
