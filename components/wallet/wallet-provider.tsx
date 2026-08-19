"use client";

import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, type State } from "wagmi";
import { wagmiConfig } from "@/lib/wallet-config";

// Create query client
const queryClient = new QueryClient();

interface WalletProviderProps {
  children: ReactNode;
  initialState?: State;
}

export function WalletProvider({
  children,
  initialState,
}: WalletProviderProps) {
  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

// Kept for backward compatibility - MetaMask is always ready if installed
export function useAppKitReady() {
  return true;
}
