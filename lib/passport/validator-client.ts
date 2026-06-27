import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  (window as any).Buffer = (window as any).Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CDNSZUNEWFCGSPWLPDSWTENR2WPHKC34RGZQG7RJA54OPGTZGVVRFYBA",
  }
} as const

export const Errors = {
  1: {message:"NotInitialized"},
  2: {message:"AlreadyInitialized"},
  /**
   * Wrong number of public inputs for the agent_passport circuit.
   */
  3: {message:"BadPublicInputs"},
  /**
   * This nullifier was already spent — replay / Sybil attempt.
   */
  4: {message:"NullifierUsed"},
  /**
   * The Groth16 proof did not verify against the embedded key.
   */
  5: {message:"InvalidProof"}
}


export interface Attestation {
  agent_id: u256;
  /**
 * Ledger sequence at which the passport was minted.
 */
ledger: u32;
  nullifier: u256;
  registry_root: u256;
  spend_cap: u256;
}


/**
 * Groth16 proof over BN254, re-declared in *this* contract's spec (the
 * imported one isn't exported) so SDKs/CLI can build the argument directly.
 * Byte layout: G1 `a`/`c` = x||y (32B BE each); G2 `b` = x.c1||x.c0||y.c1||y.c0.
 */
export interface Groth16Proof {
  a: Buffer;
  b: Buffer;
  c: Buffer;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Client {
  /**
   * Construct and simulate a init transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One-time wiring: who can re-point the verifier, and the verifier's
   * contract address. Panics on a second call.
   */
  init: ({admin, verifier}: {admin: string, verifier: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a verifier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The verifier contract this validator delegates proof-checking to.
   */
  verifier: (options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a get_passport transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Fetch the stored attestation for an agent, if any.
   */
  get_passport: ({agent_id}: {agent_id: u256}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Attestation>>>

  /**
   * Construct and simulate a set_verifier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admin-only: re-point to a new verifier (e.g. after a circuit upgrade).
   */
  set_verifier: ({verifier}: {verifier: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a is_registered transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * True iff `agent_id` holds a minted zk-passport.
   */
  is_registered: ({agent_id}: {agent_id: u256}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a is_nullifier_used transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * True iff this nullifier has already been spent.
   */
  is_nullifier_used: ({nullifier}: {nullifier: u256}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a verify_and_register transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Verify a passport proof and, if sound and unspent, mint the attestation.
   * 
   * This is the load-bearing entry point: the proof *is* the authorization,
   * so no `require_auth` is needed — anyone relaying a valid, fresh proof
   * registers the agent. Returns the freshly stored [`Attestation`].
   */
  verify_and_register: ({proof, public_inputs}: {proof: Groth16Proof, public_inputs: Array<u256>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Attestation>>>

}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABQAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAgAAAD1Xcm9uZyBudW1iZXIgb2YgcHVibGljIGlucHV0cyBmb3IgdGhlIGFnZW50X3Bhc3Nwb3J0IGNpcmN1aXQuAAAAAAAAD0JhZFB1YmxpY0lucHV0cwAAAAADAAAAPFRoaXMgbnVsbGlmaWVyIHdhcyBhbHJlYWR5IHNwZW50IOKAlCByZXBsYXkgLyBTeWJpbCBhdHRlbXB0LgAAAA1OdWxsaWZpZXJVc2VkAAAAAAAABAAAADpUaGUgR3JvdGgxNiBwcm9vZiBkaWQgbm90IHZlcmlmeSBhZ2FpbnN0IHRoZSBlbWJlZGRlZCBrZXkuAAAAAAAMSW52YWxpZFByb29mAAAABQ==",
        "AAAAAQAAAAAAAAAAAAAAC0F0dGVzdGF0aW9uAAAAAAUAAAAAAAAACGFnZW50X2lkAAAADAAAADFMZWRnZXIgc2VxdWVuY2UgYXQgd2hpY2ggdGhlIHBhc3Nwb3J0IHdhcyBtaW50ZWQuAAAAAAAABmxlZGdlcgAAAAAABAAAAAAAAAAJbnVsbGlmaWVyAAAAAAAADAAAAAAAAAANcmVnaXN0cnlfcm9vdAAAAAAAAAwAAAAAAAAACXNwZW5kX2NhcAAAAAAAAAw=",
        "AAAAAQAAAN1Hcm90aDE2IHByb29mIG92ZXIgQk4yNTQsIHJlLWRlY2xhcmVkIGluICp0aGlzKiBjb250cmFjdCdzIHNwZWMgKHRoZQppbXBvcnRlZCBvbmUgaXNuJ3QgZXhwb3J0ZWQpIHNvIFNES3MvQ0xJIGNhbiBidWlsZCB0aGUgYXJndW1lbnQgZGlyZWN0bHkuCkJ5dGUgbGF5b3V0OiBHMSBgYWAvYGNgID0geHx8eSAoMzJCIEJFIGVhY2gpOyBHMiBgYmAgPSB4LmMxfHx4LmMwfHx5LmMxfHx5LmMw.AAAAAAAAAAAAAMR3JvdGgxNlByb29mAAAAAwAAAAAAAAABYQAAAAAAA+4AAABAAAAAAAAAAAFiAAAAAAAD7gAAAIAAAAAAAAAAAWMAAAAAAAPuAAAAQA==",
        "AAAAAAAAAG1PbmUtdGltZSB3aXJpbmc6IHdobyBjYW4gcmUtcG9pbnQgdGhlIHZlcmlmaWVyLCBhbmQgdGhlIHZlcmlmaWVyJ3MKY29udHJhY3QgYWRkcmVzcy4gUGFuaWNzIG9uIGEgc2Vjb25kIGNhbGwuAAAAAAAABGluaXQAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACHZlcmlmaWVyAAAAEwAAAAA=",
        "AAAAAAAAAEFUaGUgdmVyaWZpZXIgY29udHJhY3QgdGhpcyB2YWxpZGF0b3IgZGVsZWdhdGVzIHByb29mLWNoZWNraW5nIHRvLgAAAAAAAAh2ZXJpZmllcgAAAAAAAAABAAAD6QAAABMAAAAD",
        "AAAAAAAAADJGZXRjaCB0aGUgc3RvcmVkIGF0dGVzdGF0aW9uIGZvciBhbiBhZ2VudCwgaWYgYW55LgAAAAAADGdldF9wYXNzcG9ydAAAAAEAAAAAAAAACGFnZW50X2lkAAAADAAAAAEAAAPoAAAH0AAAAAtBdHRlc3RhdGlvbgA=",
        "AAAAAAAAAEZBZG1pbi1vbmx5OiByZS1wb2ludCB0byBhIG5ldyB2ZXJpZmllciAoZS5nLiBhZnRlciBhIGNpcmN1aXQgdXBncmFkZSkuAAAAAAAMc2V0X3ZlcmlmaWVyAAAAAQAAAAAAAAAIdmVyaWZpZXIAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAC9UcnVlIGlmZiBgYWdlbnRfaWRgIGhvbGRzIGEgbWludGVkIHprLXBhc3Nwb3J0LgAAAAANaXNfcmVnaXN0ZXJlZAAAAAAAAAEAAAAAAAAACGFnZW50X2lkAAAADAAAAAEAAAAB",
        "AAAAAAAAAC9UcnVlIGlmZiB0aGlzIG51bGxpZmllciBoYXMgYWxyZWFkeSBiZWVuIHNwZW50LgAAAAARaXNfbnVsbGlmaWVyX3VzZWQAAAAAAAABAAAAAAAAAAludWxsaWZpZXIAAAAAAAAMAAAAAQAAAAE=",
        "AAAAAAAAARpWZXJpZnkgYSBwYXNzcG9ydCBwcm9vZiBhbmQsIGlmIHNvdW5kIGFuZCB1bnNwZW50LCBtaW50IHRoZSBhdHRlc3RhdGlvbi4KClRoaXMgaXMgdGhlIGxvYWQtYmVhcmluZyBlbnRyeSBwb2ludDogdGhlIHByb29mICppcyogdGhlIGF1dGhvcml6YXRpb24sCnNvIG5vIGByZXF1aXJlX2F1dGhgIGlzIG5lZWRlZCDigJQgYW55b25lIHJlbGF5aW5nIGEgdmFsaWQsIGZyZXNoIHByb29mCnJlZ2lzdGVycyB0aGUgYWdlbnQuIFJldHVybnMgdGhlIGZyZXNobHkgc3RvcmVkIFtgQXR0ZXN0YXRpb25gXS4AAAAAABN2ZXJpZnlfYW5kX3JlZ2lzdGVyAAAAAAIAAAAAAAAABXByb29mAAAAAAAH0AAAAAxHcm90aDE2UHJvb2YAAAAAAAAADXB1YmxpY19pbnB1dHMAAAAAAAPqAAAADAAAAAEAAAPpAAAH0AAAAAtBdHRlc3RhdGlvbgAAAAAD" ]),
      options
    )
  }
  public readonly fromJSON = {
    init: this.txFromJSON<null>,
        verifier: this.txFromJSON<Result<string>>,
        get_passport: this.txFromJSON<Option<Attestation>>,
        set_verifier: this.txFromJSON<Result<void>>,
        is_registered: this.txFromJSON<boolean>,
        is_nullifier_used: this.txFromJSON<boolean>,
        verify_and_register: this.txFromJSON<Result<Attestation>>
  }
}
