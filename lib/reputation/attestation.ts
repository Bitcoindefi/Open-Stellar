import { hash } from '@stellar/stellar-sdk'

import { STELLAR_SOROBAN_CONFIG } from '@/lib/soroban-contracts'
import type { ReputationSnapshot } from '@/lib/reputation/reputation-store'

export interface ReputationAttestation {
  agentId: string
  score: number
  timestamp: number
  hash: string
  contractId?: string
  network: string
  stellarExpertUrl: string
}

export interface ReputationGateRequirement {
  minReputation: number
  tier?: string
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function buildAttestationPayload(agentId: string, score: number, timestamp: number): string {
  return `ReputationAttestation:${agentId}:${score}:${timestamp}:${STELLAR_SOROBAN_CONFIG.networkPassphrase}`
}

export function deriveAttestationHash(agentId: string, score: number, timestamp: number): string {
  const first = hash(Buffer.from(buildAttestationPayload(agentId, score, timestamp)))
  const second = hash(Buffer.concat([Buffer.from('open-stellar-reputation'), first]))
  return bytesToHex(Buffer.concat([first, second]))
}

export function createLocalReputationAttestation(snapshot: ReputationSnapshot, contractId?: string): ReputationAttestation {
  const timestamp = Math.floor(new Date(snapshot.updatedAt).getTime() / 1000)
  const attestationHash = deriveAttestationHash(snapshot.actorId, snapshot.score, timestamp)
  const networkSlug = STELLAR_SOROBAN_CONFIG.network.toLowerCase()

  return {
    agentId: snapshot.actorId,
    score: snapshot.score,
    timestamp,
    hash: attestationHash,
    contractId,
    network: STELLAR_SOROBAN_CONFIG.network,
    stellarExpertUrl: `https://stellar.expert/explorer/${networkSlug}/contract/${contractId ?? attestationHash}`,
  }
}

export function verifyLocalReputationAttestation(
  agentId: string,
  minScore: number,
  attestation: ReputationAttestation,
): boolean {
  if (attestation.agentId !== agentId) return false
  if (attestation.score < minScore) return false
  return deriveAttestationHash(agentId, attestation.score, attestation.timestamp) === attestation.hash
}

export function checkReputationGate(
  requirement: ReputationGateRequirement | undefined,
  attestation: ReputationAttestation | undefined,
): { ok: boolean; error?: string } {
  if (!requirement) return { ok: true }
  if (!attestation) return { ok: false, error: 'Reputation too low for this service' }
  return verifyLocalReputationAttestation(attestation.agentId, requirement.minReputation, attestation)
    ? { ok: true }
    : { ok: false, error: 'Reputation too low for this service' }
}
