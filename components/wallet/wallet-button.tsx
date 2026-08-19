"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { bscTestnet } from "wagmi/chains";
import {
  connectFreighter,
  getFreighterPublicKey,
  getFreighterNetwork,
  isFreighterInstalled,
  disconnectFreighter,
  type StellarNetwork,
} from "@/lib/stellar-utils";

type WalletType = "bnb" | "stellar" | null;
type BnbConnectorKind = "metamask" | "walletconnect";

interface WalletState {
  bnb: {
    address: string | null;
    connected: boolean;
  };
  stellar: {
    publicKey: string | null;
    network: StellarNetwork | null;
    connected: boolean;
  };
}

export function WalletButton() {
  const [showDropdown, setShowDropdown] = useState(false);
  const [stellarManuallyDisconnected, setStellarManuallyDisconnected] =
    useState(false);
  const stellarManuallyDisconnectedRef = useRef(false);
  const [walletState, setWalletState] = useState<WalletState>({
    bnb: { address: null, connected: false },
    stellar: { publicKey: null, network: null, connected: false },
  });
  const [freighterAvailable, setFreighterAvailable] = useState(false);
  const [isConnecting, setIsConnecting] = useState<WalletType>(null);

  // Wagmi hooks (siempre disponibles)
  const { address: bnbAddress, isConnected: isBnbConnected } = useAccount();
  const bnbChainId = useChainId();
  const { disconnect: disconnectBnb } = useDisconnect();
  const { switchChainAsync, isPending: isSwitchingBnb } = useSwitchChain();

  const { connect, connectors, isPending: isConnectingBnb } = useConnect();

  const syncFreighterState = useCallback(async () => {
    const installed = await isFreighterInstalled();
    setFreighterAvailable(installed);

    if (stellarManuallyDisconnectedRef.current) {
      setWalletState((prev) => ({
        ...prev,
        stellar: { publicKey: null, network: null, connected: false },
      }));
      return;
    }

    if (!installed) {
      setWalletState((prev) => ({
        ...prev,
        stellar: { publicKey: null, network: null, connected: false },
      }));
      return;
    }

    const publicKey = await getFreighterPublicKey();
    if (!publicKey) {
      setWalletState((prev) => ({
        ...prev,
        stellar: { publicKey: null, network: null, connected: false },
      }));
      return;
    }

    const network = await getFreighterNetwork();
    setWalletState((prev) => ({
      ...prev,
      stellar: { publicKey, network, connected: true },
    }));
  }, []);

  // Keep Freighter state in sync like wagmi does for EVM wallets
  useEffect(() => {
    syncFreighterState();
    const interval = window.setInterval(syncFreighterState, 8000);
    return () => window.clearInterval(interval);
  }, [syncFreighterState]);

  // Sync BNB connection state
  useEffect(() => {
    setWalletState((prev) => ({
      ...prev,
      bnb: {
        address: bnbAddress || null,
        connected: isBnbConnected,
      },
    }));
  }, [bnbAddress, isBnbConnected]);

  const metaMaskConnector = connectors.find(
    (connector) => connector.id === "injected",
  );
  const walletConnectConnector = connectors.find(
    (connector) => connector.id === "walletConnect",
  );

  const handleConnectBnb = useCallback(
    async (kind: BnbConnectorKind) => {
      const connector =
        kind === "walletconnect" ? walletConnectConnector : metaMaskConnector;
      if (!connector) {
        console.error(`[v0] Connector not available: ${kind}`);
        return;
      }

      setIsConnecting("bnb");
      try {
        await connect({ connector });
      } catch (err) {
        const safeErr =
          err instanceof Error
            ? err.message.replace(/[\r\n]/g, " ")
            : "Unknown error";
        console.error("[v0] Error connecting BNB wallet:", safeErr);
      } finally {
        setIsConnecting(null);
        setShowDropdown(false);
      }
    },
    [connect, metaMaskConnector, walletConnectConnector],
  );

  // Connect to Stellar via Freighter
  const handleConnectStellar = useCallback(async () => {
    setIsConnecting("stellar");
    try {
      setStellarManuallyDisconnected(false);
      stellarManuallyDisconnectedRef.current = false;
      const { publicKey, error } = await connectFreighter();

      if (error) {
        const safeError = error.replace(/[\r\n]/g, " ");
        console.error("[v0] Freighter error:", safeError);
        return;
      }

      if (publicKey) {
        await syncFreighterState();
      }
    } catch (err) {
      const safeErr =
        err instanceof Error
          ? err.message.replace(/[\r\n]/g, " ")
          : "Unknown error";
      console.error("[v0] Error connecting Stellar wallet:", safeErr);
    } finally {
      setIsConnecting(null);
      setShowDropdown(false);
    }
  }, [syncFreighterState]);

  const handleSwitchBnbTestnet = useCallback(async () => {
    try {
      await switchChainAsync({ chainId: bscTestnet.id });
    } catch (error) {
      console.error("[v0] Failed switching to BNB testnet:", error);
    }
  }, [switchChainAsync]);

  // Disconnect handlers
  const handleDisconnectBnb = useCallback(() => {
    disconnectBnb();
    setWalletState((prev) => ({
      ...prev,
      bnb: { address: null, connected: false },
    }));
  }, [disconnectBnb]);

  const handleDisconnectStellar = useCallback(() => {
    setStellarManuallyDisconnected(true);
    stellarManuallyDisconnectedRef.current = true;
    disconnectFreighter();
    setWalletState((prev) => ({
      ...prev,
      stellar: { publicKey: null, network: null, connected: false },
    }));
  }, []);

  // Format address for display
  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 4)}..${addr.slice(-3)}`;
  };

  const hasAnyConnection =
    walletState.bnb.connected || walletState.stellar.connected;
  const bnbOnTestnet =
    !walletState.bnb.connected || bnbChainId === bscTestnet.id;
  const stellarOnTestnet =
    !walletState.stellar.connected || walletState.stellar.network === "TESTNET";

  // Pixel art styled button colors
  const buttonBg = hasAnyConnection ? "#2d5a27" : "#4a3728";
  const buttonBorder = hasAnyConnection ? "#1a3d16" : "#2d221a";

  return (
    <div className="relative pointer-events-auto">
      <motion.button
        onClick={() => setShowDropdown(!showDropdown)}
        className="px-3 py-2 flex items-center gap-2"
        style={{
          backgroundColor: buttonBg,
          border: `3px solid ${buttonBorder}`,
          boxShadow: "3px 3px 0 rgba(0,0,0,0.3)",
          fontFamily: "var(--font-vt323)",
          imageRendering: "pixelated",
        }}
        whileHover={{ y: -1 }}
        whileTap={{ y: 1 }}
      >
        <PixelWalletIcon connected={hasAnyConnection} />
        <span className="text-xs font-bold text-white uppercase tracking-wide">
          {(() => {
            if (!hasAnyConnection) return "WALLET";
            const addr = walletState.bnb.address || walletState.stellar.publicKey;
            return addr ? formatAddress(addr) : "WALLET";
          })()}
        </span>
      </motion.button>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute top-full right-0 mt-2 w-56 z-50"
            style={{
              backgroundColor: "#f5e6d3",
              border: "4px solid #4a3728",
              boxShadow: "4px 4px 0 rgba(0,0,0,0.4)",
              imageRendering: "pixelated",
            }}
          >
            {/* Header - Pixel style */}
            <div
              className="px-3 py-2"
              style={{
                backgroundColor: "#4a3728",
                borderBottom: "2px solid #2d221a",
              }}
            >
              <span
                className="text-xs font-bold uppercase tracking-wider"
                style={{ fontFamily: "var(--font-vt323)", color: "#ffd700" }}
              >
                Connect Wallet
              </span>
            </div>

            {/* BNB Section */}
            <div className="p-3" style={{ borderBottom: "2px solid #4a3728" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <PixelBnbIcon />
                  <span
                    className="text-xs font-bold"
                    style={{
                      fontFamily: "var(--font-vt323)",
                      color: "#4a3728",
                    }}
                  >
                    BNB Testnet
                  </span>
                </div>
                <PixelStatusBadge active={walletState.bnb.connected} />
              </div>

              {walletState.bnb.connected && walletState.bnb.address ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-xs truncate"
                      style={{ fontFamily: "var(--font-vt323)", color: "#666" }}
                    >
                      {formatAddress(walletState.bnb.address)}
                    </span>
                    <PixelButton
                      onClick={handleDisconnectBnb}
                      variant="danger"
                      small
                    >
                      X
                    </PixelButton>
                  </div>

                  {!bnbOnTestnet && (
                    <>
                      <div
                        className="text-xs"
                        style={{
                          fontFamily: "var(--font-vt323)",
                          color: "#8b2942",
                        }}
                      >
                        Wrong network: switch to BNB Testnet
                      </div>
                      <PixelButton
                        onClick={handleSwitchBnbTestnet}
                        disabled={isSwitchingBnb}
                        variant="bnb"
                        fullWidth
                      >
                        {isSwitchingBnb ? "Switching..." : "Switch to Testnet"}
                      </PixelButton>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <PixelButton
                    onClick={() => handleConnectBnb("metamask")}
                    disabled={
                      isConnecting === "bnb" ||
                      isConnectingBnb ||
                      !metaMaskConnector
                    }
                    variant="bnb"
                    fullWidth
                  >
                    {isConnecting === "bnb" || isConnectingBnb
                      ? "Connecting..."
                      : metaMaskConnector
                        ? "MetaMask"
                        : "MetaMask not available"}
                  </PixelButton>

                  <PixelButton
                    onClick={() => handleConnectBnb("walletconnect")}
                    disabled={
                      isConnecting === "bnb" ||
                      isConnectingBnb ||
                      !walletConnectConnector
                    }
                    variant="default"
                    fullWidth
                  >
                    {walletConnectConnector
                      ? "WalletConnect"
                      : "WalletConnect disabled"}
                  </PixelButton>
                </div>
              )}
            </div>

            {/* Stellar Section */}
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <PixelStellarIcon />
                  <span
                    className="text-xs font-bold"
                    style={{
                      fontFamily: "var(--font-vt323)",
                      color: "#4a3728",
                    }}
                  >
                    Stellar {walletState.stellar.network || "Testnet"}
                  </span>
                </div>
                <PixelStatusBadge active={walletState.stellar.connected} />
              </div>

              {walletState.stellar.connected &&
              walletState.stellar.publicKey ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-xs truncate"
                      style={{ fontFamily: "var(--font-vt323)", color: "#666" }}
                    >
                      {formatAddress(walletState.stellar.publicKey)}
                    </span>
                    <PixelButton
                      onClick={handleDisconnectStellar}
                      variant="danger"
                      small
                    >
                      X
                    </PixelButton>
                  </div>

                  {!stellarOnTestnet && (
                    <div
                      className="text-xs"
                      style={{
                        fontFamily: "var(--font-vt323)",
                        color: "#8b2942",
                      }}
                    >
                      Switch Freighter to Stellar Testnet
                    </div>
                  )}
                </div>
              ) : (
                <PixelButton
                  onClick={handleConnectStellar}
                  disabled={isConnecting === "stellar"}
                  variant="stellar"
                  fullWidth
                >
                  {(() => {
                    if (!freighterAvailable) return "Install / Retry";
                    if (isConnecting === "stellar") return "Connecting...";
                    if (stellarManuallyDisconnected) return "Reconnect Freighter";
                    return "Connect Freighter";
                  })()}
                </PixelButton>
              )}

              {!freighterAvailable && (
                <a
                  href="https://www.freighter.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs mt-2 text-center"
                  style={{
                    fontFamily: "var(--font-vt323)",
                    color: "#8b2942",
                    textDecoration: "underline",
                  }}
                >
                  Download Extension
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Pixel art styled components

function PixelWalletIcon({ connected }: { connected: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      style={{ imageRendering: "pixelated" }}
    >
      <rect
        x="2"
        y="4"
        width="12"
        height="10"
        fill={connected ? "#ffd700" : "#d4a574"}
      />
      <rect x="1" y="5" width="1" height="8" fill="#4a3728" />
      <rect x="14" y="5" width="1" height="8" fill="#4a3728" />
      <rect x="2" y="3" width="12" height="1" fill="#4a3728" />
      <rect x="2" y="14" width="12" height="1" fill="#4a3728" />
      <rect x="10" y="8" width="4" height="3" fill="#4a3728" />
      <rect
        x="11"
        y="9"
        width="2"
        height="1"
        fill={connected ? "#2d5a27" : "#8b8b8b"}
      />
    </svg>
  );
}

function PixelBnbIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      style={{ imageRendering: "pixelated" }}
    >
      <rect x="0" y="0" width="16" height="16" fill="#f0b90b" rx="2" />
      <rect x="7" y="3" width="2" height="2" fill="#fff" />
      <rect x="4" y="5" width="2" height="2" fill="#fff" />
      <rect x="10" y="5" width="2" height="2" fill="#fff" />
      <rect x="7" y="7" width="2" height="2" fill="#fff" />
      <rect x="4" y="9" width="2" height="2" fill="#fff" />
      <rect x="10" y="9" width="2" height="2" fill="#fff" />
      <rect x="7" y="11" width="2" height="2" fill="#fff" />
    </svg>
  );
}

function PixelStellarIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      style={{ imageRendering: "pixelated" }}
    >
      <rect x="0" y="0" width="16" height="16" fill="#000" rx="2" />
      <rect x="3" y="5" width="10" height="2" fill="#fff" />
      <rect x="3" y="9" width="10" height="2" fill="#fff" />
      <rect x="5" y="7" width="2" height="2" fill="#fff" />
      <rect x="9" y="7" width="2" height="2" fill="#fff" />
    </svg>
  );
}

function PixelStatusBadge({ active }: { active: boolean }) {
  return (
    <div
      className="px-2 py-0.5"
      style={{
        backgroundColor: active ? "#2d5a27" : "#8b8b8b",
        border: `2px solid ${active ? "#1a3d16" : "#666"}`,
        fontFamily: "var(--font-vt323)",
        color: "#fff",
        fontSize: "10px",
      }}
    >
      {active ? "ON" : "OFF"}
    </div>
  );
}

interface PixelButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "bnb" | "stellar" | "danger" | "default";
  fullWidth?: boolean;
  small?: boolean;
}

function PixelButton({
  children,
  onClick,
  disabled,
  variant = "default",
  fullWidth,
  small,
}: PixelButtonProps) {
  const colors = {
    bnb: { bg: "#f0b90b", border: "#c99b09", text: "#1e2026" },
    stellar: { bg: "#222", border: "#000", text: "#fff" },
    danger: { bg: "#8b2942", border: "#5c1a2a", text: "#fff" },
    default: { bg: "#4a3728", border: "#2d221a", text: "#fff" },
  }[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${fullWidth ? "w-full" : ""} ${small ? "px-2 py-1" : "py-2 px-3"} text-xs font-bold uppercase`}
      style={{
        backgroundColor: disabled ? "#ccc" : colors.bg,
        border: `2px solid ${disabled ? "#999" : colors.border}`,
        color: disabled ? "#666" : colors.text,
        fontFamily: "var(--font-vt323)",
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : "2px 2px 0 rgba(0,0,0,0.2)",
      }}
    >
      {children}
    </button>
  );
}
