import { describe, expect, it } from "vitest"
import { PAYMENT_ASSET } from "@/lib/config/chains"
import { ParticleSystem } from "./particles"

function paymentLabels(system: ParticleSystem): string[] {
  return system.particles.filter((particle) => particle.type === "text").map((particle) => String(particle.text))
}

describe("payment spark label", () => {
  it("defaults to the public payment asset", () => {
    const system = new ParticleSystem()
    system.emit("payment-spark", 10, 10)
    expect(paymentLabels(system)).toEqual([`+0.01 ${PAYMENT_ASSET}`])
  })

  it("prefers an explicit amount", () => {
    const system = new ParticleSystem()
    system.emit("payment-spark", 10, 10, { amount: "+2 USDC" })
    expect(paymentLabels(system)).toEqual(["+2 USDC"])
  })
})
