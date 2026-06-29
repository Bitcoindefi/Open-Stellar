const REPOSITORY_URL = 'https://github.com/bitcoindefi/Open-Stellar'

export type VercelDeployOptions = {
  nodeName?: string
  network?: 'testnet' | 'mainnet'
  adminApiKey: string
  projectName?: string
}

export function buildVercelDeployUrl(options: VercelDeployOptions): string {
  const nodeName = options.nodeName ?? 'My Open Stellar Node'
  const network = options.network ?? 'testnet'
  const adminApiKey = options.adminApiKey
  const projectName = options.projectName ?? 'open-stellar'

  const envKeys = [
    'NEXT_PUBLIC_NODE_NAME',
    'STELLAR_NETWORK',
    'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID',
    'ADMIN_API_KEY',
  ]

  const params = new URLSearchParams({
    'repository-url': REPOSITORY_URL,
    'project-name': projectName,
    'repository-name': projectName,
    env: envKeys.join(','),
    envDescription: 'Open Stellar node configuration',
    envLink: `${REPOSITORY_URL}#variables-de-entorno`,
    envDefaults: JSON.stringify({
      NEXT_PUBLIC_NODE_NAME: nodeName,
      STELLAR_NETWORK: network,
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: 'your-walletconnect-project-id',
      ADMIN_API_KEY: adminApiKey,
    }),
  })

  return `https://vercel.com/new/clone?${params.toString()}`
}
