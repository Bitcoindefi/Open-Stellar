/**
 * A USDC amount from the API ("0.1", "0.085", "2") as the wallet panel shows it: a decimal comma
 * and at least two decimals, the way money reads ("0,10", "0,085", "2,00"). The panel used to
 * show the fund button as "Cargar 0,1 USDC".
 */
export function usdcLabel(value: string): string {
  const [whole, fraction = ""] = value.trim().split(".")
  return `${whole},${fraction.padEnd(2, "0")}`
}

/** True when the agents' wallet may hold USDC: a positive balance, or one that could not be read. */
export function mayHoldUsdc(balanceUsdc: string | null): boolean {
  return balanceUsdc === null || Number(balanceUsdc) > 0
}
