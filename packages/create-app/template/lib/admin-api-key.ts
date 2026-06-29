import crypto from 'node:crypto'

const globalState = globalThis as typeof globalThis & {
  __openStellarAdminApiKey__?: string
}

export function getAdminApiKey(): string {
  if (process.env.ADMIN_API_KEY) {
    return process.env.ADMIN_API_KEY
  }

  if (!globalState.__openStellarAdminApiKey__) {
    globalState.__openStellarAdminApiKey__ = `osk_${crypto.randomBytes(24).toString('hex')}`
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Open Stellar] Generated admin API key on first boot:', globalState.__openStellarAdminApiKey__)
    }
  }

  return globalState.__openStellarAdminApiKey__
}
