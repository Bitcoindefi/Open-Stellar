declare module "snarkjs" {
  export interface Groth16Proof {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  }
  export const groth16: {
    fullProve(
      input: object,
      wasm: string | Uint8Array,
      zkey: string | Uint8Array,
    ): Promise<{ proof: Groth16Proof; publicSignals: string[] }>;
    verify(
      vk: object,
      publicSignals: string[],
      proof: Groth16Proof,
    ): Promise<boolean>;
  };
  export const wtns: {
    calculate(
      input: object,
      wasm: string | Uint8Array,
      output: object,
    ): Promise<void>;
    exportJson(wtns: object): Promise<bigint[]>;
  };
}
