import { createConfig, http, injected } from "wagmi";
import { walletConnect } from "@wagmi/connectors";
import { bscTestnet, bsc } from "wagmi/chains";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const connectors: any[] = [injected()];

if (walletConnectProjectId) {
  connectors.push(
    walletConnect({
      projectId: walletConnectProjectId,
      showQrModal: true,
      metadata: {
        name: "Open Stellar",
        description: "Open Stellar multi-chain dApp",
        url:
          process.env.NEXT_PUBLIC_APP_URL ||
          "https://github.com/bitcoindefi/Open-Stellar",
        icons: ["https://avatars.githubusercontent.com/u/37784886"],
      },
    }),
  );
}

// Wagmi config con MetaMask + WalletConnect para BNB Testnet y Mainnet
export const wagmiConfig = createConfig({
  chains: [bscTestnet, bsc],
  connectors,
  transports: {
    [bscTestnet.id]: http("https://data-seed-prebsc-1-s1.binance.org:8545"),
    [bsc.id]: http("https://bsc-dataseed.binance.org"),
  },
  ssr: true,
});
