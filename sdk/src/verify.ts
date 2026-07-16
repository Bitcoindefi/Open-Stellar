import { Buffer } from "buffer"
import {
  Account,
  BASE_FEE,
  Contract,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk"

const PLACEHOLDER_SOURCE_ACCOUNT = "GC7SABHJPHM7ETSM6RJJOJL3NXJK2EJCY324HLXPMB53NZHISWIMSGBP"
const FIELD_ELEMENT_HEX_LENGTH = 64

export interface Groth16Proof {
  pi_a: string[]
  pi_b: string[][]
  pi_c: string[]
}

export class ProofEncodingError extends Error {
  readonly field: string

  constructor(field: string, message: string) {
    super(message)
    this.name = "ProofEncodingError"
    this.field = field
  }
}

function isHexString(value: string): boolean {
  return /^(?:0x)?[0-9a-fA-F]+$/.test(value)
}

function normalizeFieldElement(value: string, field: string, allowDecimal: boolean): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new ProofEncodingError(field, `${field} must be a non-empty string`)
  }

  if (!allowDecimal && !isHexString(trimmed)) {
    throw new ProofEncodingError(field, `${field} must be a hex string`)
  }

  let parsed: bigint
  try {
    if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
      parsed = BigInt(trimmed)
    } else if (allowDecimal && /^[0-9]+$/.test(trimmed)) {
      parsed = BigInt(trimmed)
    } else if (!allowDecimal && isHexString(trimmed)) {
      parsed = BigInt(`0x${trimmed}`)
    } else {
      throw new Error("invalid field element")
    }
  } catch {
    throw new ProofEncodingError(field, `${field} is not a valid field element`)
  }

  if (parsed < 0n) {
    throw new ProofEncodingError(field, `${field} must be non-negative`)
  }

  const hex = parsed.toString(16)
  if (hex.length > FIELD_ELEMENT_HEX_LENGTH) {
    throw new ProofEncodingError(field, `${field} exceeds 32 bytes`)
  }

  return hex.padStart(FIELD_ELEMENT_HEX_LENGTH, "0")
}

function readG1(input: string[], field: string): Buffer {
  if (!Array.isArray(input) || input.length < 2) {
    throw new ProofEncodingError(field, `${field} must contain at least two coordinates`)
  }

  const x = normalizeFieldElement(input[0], `${field}[0]`, true)
  const y = normalizeFieldElement(input[1], `${field}[1]`, true)
  return Buffer.from(`${x}${y}`, "hex")
}

function readG2(input: string[][], field: string): Buffer {
  if (!Array.isArray(input) || input.length < 2) {
    throw new ProofEncodingError(field, `${field} must contain at least two coordinate pairs`)
  }

  const x = input[0]
  const y = input[1]
  if (!Array.isArray(x) || x.length < 2 || !Array.isArray(y) || y.length < 2) {
    throw new ProofEncodingError(field, `${field} must contain two [c0, c1] coordinate pairs`)
  }

  const xc1 = normalizeFieldElement(x[1], `${field}[0][1]`, true)
  const xc0 = normalizeFieldElement(x[0], `${field}[0][0]`, true)
  const yc1 = normalizeFieldElement(y[1], `${field}[1][1]`, true)
  const yc0 = normalizeFieldElement(y[0], `${field}[1][0]`, true)

  return Buffer.from(`${xc1}${xc0}${yc1}${yc0}`, "hex")
}

function toScSymbol(name: string): xdr.ScVal {
  return xdr.ScVal.scvSymbol(name)
}

function toScMapEntry(key: string, value: xdr.ScVal): xdr.ScMapEntry {
  return new xdr.ScMapEntry({
    key: toScSymbol(key),
    val: value,
  })
}

function encodeProof(proof: Groth16Proof): xdr.ScVal {
  const a = readG1(proof.pi_a, "proof.pi_a")
  const b = readG2(proof.pi_b, "proof.pi_b")
  const c = readG1(proof.pi_c, "proof.pi_c")

  return xdr.ScVal.scvMap([
    toScMapEntry("a", xdr.ScVal.scvBytes(a)),
    toScMapEntry("b", xdr.ScVal.scvBytes(b)),
    toScMapEntry("c", xdr.ScVal.scvBytes(c)),
  ])
}

function encodePublicInputs(publicInputs: string[]): xdr.ScVal {
  if (!Array.isArray(publicInputs)) {
    throw new ProofEncodingError("publicInputs", "publicInputs must be an array")
  }

  return xdr.ScVal.scvVec(
    publicInputs.map((value, index) => {
      const normalized = normalizeFieldElement(value, `publicInputs[${index}]`, false)
      return nativeToScVal(BigInt(`0x${normalized}`), { type: "u256" })
    }),
  )
}

/**
 * Build a Soroban contract invocation transaction for `verify_credential`.
 *
 * @param proof Raw Groth16 proof with `pi_a`, `pi_b`, and `pi_c` coordinates.
 * @param publicInputs Public field elements encoded as hex strings.
 * @param contractId Soroban contract ID that exposes `verify_credential`.
 * @param networkPassphrase Stellar network passphrase for the target network.
 */
export async function buildVerifyCall(
  proof: Groth16Proof,
  publicInputs: string[],
  contractId: string,
  networkPassphrase: string,
): Promise<Transaction> {
  const trimmedContractId = contractId.trim()
  if (trimmedContractId.length === 0) {
    throw new ProofEncodingError("contractId", "contractId must be a non-empty string")
  }

  const trimmedPassphrase = networkPassphrase.trim()
  if (trimmedPassphrase.length === 0) {
    throw new ProofEncodingError("networkPassphrase", "networkPassphrase must be a non-empty string")
  }

  const contract = new Contract(trimmedContractId)
  const source = new Account(PLACEHOLDER_SOURCE_ACCOUNT, "0")
  const operation = contract.call(
    "verify_credential",
    encodeProof(proof),
    encodePublicInputs(publicInputs),
  )

  return new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: trimmedPassphrase,
  })
    .addOperation(operation)
    .setTimeout(0)
    .build()
}
