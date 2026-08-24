const globalState = globalThis as typeof globalThis & {
  __openStellarAdminApiKey__?: string;
};

export function getAdminApiKey(
  requireInProd = process.env.NODE_ENV === "production",
): string {
  if (process.env.ADMIN_API_KEY) {
    return process.env.ADMIN_API_KEY;
  }

  if (requireInProd) {
    throw new Error(
      "FATAL: ADMIN_API_KEY environment variable is required in production",
    );
  }

  if (!globalState.__openStellarAdminApiKey__) {
    const bytes = new Uint8Array(24);
    if (
      typeof globalThis !== "undefined" &&
      globalThis.crypto?.getRandomValues
    ) {
      globalThis.crypto.getRandomValues(bytes);
    }
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
    globalState.__openStellarAdminApiKey__ = `osk_${hex}`;
    if (process.env.NODE_ENV !== "production") {
      console.log(
        "[Open Stellar] Generated admin API key on first boot:",
        globalState.__openStellarAdminApiKey__,
      );
    }
  }

  return globalState.__openStellarAdminApiKey__;
}
