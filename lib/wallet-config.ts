import { createConfig, http, injected, type Transport } from 'wagmi'
import { walletConnect } from '@wagmi/connectors'
import { bscTestnet, bsc } from 'wagmi/chains'
import type { Chain } from 'viem'
import { ARC_ENABLED } from '@/lib/rails'
import { arcTestnetChain } from '@/lib/rails/arc/constants'

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

const connectors: any[] = [injected()]

if (walletConnectProjectId) {
  connectors.push(
    walletConnect({
      projectId: walletConnectProjectId,
      showQrModal: true,
      metadata: {
        name: 'Open Stellar',
        description: 'Open Stellar multi-chain dApp',
        url: process.env.NEXT_PUBLIC_APP_URL || 'https://github.com/bitcoindefi/Open-Stellar',
        icons: ['https://avatars.githubusercontent.com/u/37784886'],
      },
    })
  )
}

// Arc testnet joins the list only while NEXT_PUBLIC_ENABLE_ARC is on (the "Red de pago" selector
// funds the Arc agents' wallet from MetaMask). Built from the documented RPC/explorer, not viem's
// bundled chain.
const arcChain = ARC_ENABLED ? arcTestnetChain() : null
const chains = (arcChain ? [bscTestnet, bsc, arcChain] : [bscTestnet, bsc]) as unknown as readonly [Chain, ...Chain[]]
const transports: Record<number, Transport> = {
  [bscTestnet.id]: http('https://data-seed-prebsc-1-s1.binance.org:8545'),
  [bsc.id]: http('https://bsc-dataseed.binance.org'),
}
if (arcChain) transports[arcChain.id] = http(arcChain.rpcUrls.default.http[0])

// Wagmi config con MetaMask + WalletConnect para BNB Testnet y Mainnet (y Arc testnet con el flag)
export const wagmiConfig = createConfig({
  chains,
  connectors,
  transports,
  ssr: true,
})
