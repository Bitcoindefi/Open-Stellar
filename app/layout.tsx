import type { Metadata, Viewport } from "next";
import { Press_Start_2P, VT323 } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { WalletProvider } from "@/components/wallet/wallet-provider";
import { MockBanner } from "@/components/mock-banner";
import { PwaRegister } from "@/components/pwa-register";
import { Toaster } from "sonner";
import "./globals.css";

const pressStart2P = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
});

const vt323 = VT323({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-vt323",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://openstellar.vercel.app"),
  title: {
    default: "Agent Arena | Gamified AI Agent Orchestration",
    template: "%s | Agent Arena",
  },
  description:
    "Connect orchestrator agents by API, add specialized workers, and run gamified AI operations across Stellar, Solana, CosmosPay, x402, wallets, skills, and reputation rails.",
  keywords: [
    "Agent Arena", "AI agents", "agent orchestration", "gamified agents",
    "Stellar blockchain", "Solana agents", "CosmosPay", "x402 payments",
    "Web3 agents", "AI agent marketplace", "JEV",
  ],
  authors: [{ name: "Agent Arena" }],
  creator: "Agent Arena",
  publisher: "Agent Arena",
  applicationName: "Agent Arena",
  category: "technology",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "https://openstellar.vercel.app/",
    siteName: "Agent Arena",
    title: "Agent Arena | Gamified AI Agent Orchestration",
    description:
      "A gamified control plane for API-connected AI agents, wallets, payments, skills, reputation, and multichain orchestration.",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: "Agent Arena | Gamified AI Agent Orchestration",
    description:
      "Connect and orchestrate autonomous AI agents with wallets, payments, services, and reputation.",
  },
  robots: { index: true, follow: true },
  generator: "Agent Arena",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Agent Arena",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-light-32x32.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark-32x32.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggleNavbar } from "@/components/theme-toggle-navbar";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-background" suppressHydrationWarning>
      <head />
      <body
        className={`${pressStart2P.variable} ${vt323.variable} font-sans antialiased`}
      >
        <MockBanner />

        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          storageKey="theme"
          disableTransitionOnChange
        >
          <div style={{ position: "fixed", top: 12, right: 12, zIndex: 50 }}>
            <ThemeToggleNavbar />
          </div>
          <WalletProvider>{children}</WalletProvider>
        </ThemeProvider>

        <PwaRegister />
        <Analytics />
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#111827",
              border: "1px solid #2a3a52",
              color: "#e2e8f0",
              fontFamily: "monospace",
              fontSize: 12,
            },
          }}
        />
      </body>
    </html>
  );
}
