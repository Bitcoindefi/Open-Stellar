import { describe, expect, it } from "vitest"

import fixture from "../test/fixtures/valid-proof.json"
import { buildVerifyCall, ProofEncodingError } from "./verify"

describe("buildVerifyCall", () => {
  it.each([
    "Test SDF Network ; September 2015",
    "Public Global Stellar Network ; September 2015",
  ])("builds a transaction for %s using a valid proof fixture", async (networkPassphrase) => {
    const tx = await buildVerifyCall(
      fixture.proof,
      fixture.publicInputs,
      "CDNSZUNEWFCGSPWLPDSWTENR2WPHKC34RGZQG7RJA54OPGTZGVVRFYBA",
      networkPassphrase,
    )

    expect(tx.networkPassphrase).toBe(networkPassphrase)
    expect(tx.operations).toHaveLength(1)
    expect(tx.toXDR()).toEqual(expect.any(String))
  })

  it("throws a typed error when the proof is malformed", async () => {
    await expect(
      buildVerifyCall(
        {
          ...fixture.proof,
          pi_b: [["0x01"]],
        },
        fixture.publicInputs,
        "CDNSZUNEWFCGSPWLPDSWTENR2WPHKC34RGZQG7RJA54OPGTZGVVRFYBA",
        "Test SDF Network ; September 2015",
      ),
    ).rejects.toMatchObject<Partial<ProofEncodingError>>({
      name: "ProofEncodingError",
      field: "proof.pi_b",
    })
  })
})
