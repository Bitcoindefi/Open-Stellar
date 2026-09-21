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
    default: "Open Stellar | AI Agent City for Stellar and Web3",
    template: "%s | Open Stellar",
  },
  description:
    "Build, fund, orchestrate, and discover autonomous AI agents with Stellar payments, CosmosPay wallet rails, x402 services, reputation, and escrow workflows.",
  keywords: [
    "Open Stellar", "AI agents", "agentic infrastructure", "Stellar blockchain",
    "CosmosPay", "x402 payments", "Web3 agents", "AI agent marketplace", "JEV",
  ],
  authors: [{ name: "Open Stellar" }],
  creator: "Open Stellar",
  publisher: "Open Stellar",
  applicationName: "Open Stellar",
  category: "technology",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "https://openstellar.vercel.app/",
    siteName: "Open Stellar",
    title: "Open Stellar | AI Agent City for Stellar and Web3",
    description:
      "A developer platform for autonomous AI agents, Stellar payments, CosmosPay wallets, x402 services, reputation, and orchestration.",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: "Open Stellar | AI Agent City for Stellar and Web3",
    description:
      "Build and orchestrate autonomous AI agents with wallets, payments, services, and reputation.",
  },
  robots: { index: true, follow: true },
  generator: "Open Stellar",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Open Stellar",
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
