"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useAccount,
  useChainId,
  useConnect,
  usePublicClient,
  useSendTransaction,
  useSwitchChain,
} from "wagmi";
import { bscTestnet } from "wagmi/chains";
import {
  connectFreighter,
  getFreighterNetwork,
  getFreighterPublicKey,
  isFreighterInstalled,
  sendStellarPayment,
} from "@/lib/stellar-utils";
import { isAddress, parseEther } from "viem";

interface TransactionLog {
  id: string;
  type: "bnb" | "stellar";
  status: "pending" | "success" | "error";
  message: string;
  txHash?: string;
  timestamp: number;
}

export function TransactionPanel() {
  const { address, isConnected } = useAccount();
  const bnbChainId = useChainId();
  const bnbPublicClient = usePublicClient({ chainId: bscTestnet.id });
  const { sendTransactionAsync, isPending: isSendingBnb } =
    useSendTransaction();
  const { connect, connectors, isPending: isConnectingBnb } = useConnect();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"bnb" | "stellar">("bnb");
  const [txLogs, setTxLogs] = useState<TransactionLog[]>([]);
  const [bnbAmount, setBnbAmount] = useState("0.01");
  const [bnbRecipient, setBnbRecipient] = useState("");
  const [stellarAmount, setStellarAmount] = useState("10");
  const [stellarRecipient, setStellarRecipient] = useState("");
  const [isSendingStellar, setIsSendingStellar] = useState(false);
  const [isConnectingStellar, setIsConnectingStellar] = useState(false);
  const bnbTestnetReady = isConnected && bnbChainId === bscTestnet.id;
  const bnbDefaultRecipient = address || "";

  const addLog = (log: Omit<TransactionLog, "id" | "timestamp">) => {
    setTxLogs((prev) => [
      {
        ...log,
        id: Date.now().toString(),
        timestamp: Date.now(),
      },
      ...prev.slice(0, 4), // Keep only last 5 logs
    ]);
  };

  const metaMaskConnector = connectors.find(
    (connector) => connector.id === "injected",
  );
  const walletConnectConnector = connectors.find(
    (connector) => connector.id === "walletConnect",
  );

  const openBnbWalletModal = async (
    kind: "metamask" | "walletconnect" = "metamask",
  ) => {
    try {
      const connector =
        kind === "walletconnect" ? walletConnectConnector : metaMaskConnector;
      if (!connector) {
        addLog({
          type: "bnb",
          status: "error",
          message: `${kind} no disponible`,
        });
        return;
      }

      connect({ connector });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo conectar MetaMask";
      addLog({
        type: "bnb",
        status: "error",
        message: message.slice(0, 80),
      });
    }
  };

  const handleConnectStellar = async () => {
    setIsConnectingStellar(true);
    try {
      const { error } = await connectFreighter();
      if (error) {
        addLog({
          type: "stellar",
          status: "error",
          message: error.slice(0, 80),
        });
      }
    } finally {
      setIsConnectingStellar(false);
    }
  };

  const handleBNBTransaction = async () => {
    if (!isConnected || !address) {
      await openBnbWalletModal("metamask");
      return;
    }

    if (bnbChainId !== bscTestnet.id) {
      addLog({
        type: "bnb",
        status: "error",
        message: "Cambia a BNB Testnet (chain 97)",
      });
      return;
    }

    const recipient = (bnbRecipient || bnbDefaultRecipient).trim();
    if (!isAddress(recipient)) {
      addLog({
        type: "bnb",
        status: "error",
        message: "Direccion BNB invalida",
      });
      return;
    }

    const amountNum = Number(bnbAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      addLog({
        type: "bnb",
        status: "error",
        message: "Monto BNB invalido",
      });
      return;
    }

    addLog({
      type: "bnb",
      status: "pending",
      message: `Enviando ${bnbAmount} BNB...`,
    });

    try {
      const txHash = await sendTransactionAsync({
        to: recipient as `0x${string}`,
        value: parseEther(bnbAmount),
        chainId: bscTestnet.id,
      });

      if (bnbPublicClient) {
        await bnbPublicClient.waitForTransactionReceipt({ hash: txHash });
      }

      addLog({
        type: "bnb",
        status: "success",
        message: `${bnbAmount} BNB enviados`,
        txHash,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error enviando BNB";
      addLog({
        type: "bnb",
        status: "error",
        message: message.slice(0, 80),
      });
    }
  };

  const handleStellarTransaction = async () => {
    const installed = await isFreighterInstalled();
    if (!installed) {
      addLog({
        type: "stellar",
        status: "error",
        message: "Freighter no instalado",
      });
      return;
    }

    try {
      const publicKey = await getFreighterPublicKey();
      if (!publicKey) {
        await handleConnectStellar();
        return;
      }

      const network = await getFreighterNetwork();
      if (network !== "TESTNET") {
        addLog({
          type: "stellar",
          status: "error",
          message: "Cambia Freighter a TESTNET",
        });
        return;
      }

      const destination = (stellarRecipient || publicKey).trim();
      if (!destination) {
        addLog({
          type: "stellar",
          status: "error",
          message: "Direccion Stellar requerida",
        });
        return;
      }

      const amountNum = Number(stellarAmount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        addLog({
          type: "stellar",
          status: "error",
          message: "Monto XLM invalido",
        });
        return;
      }

      addLog({
        type: "stellar",
        status: "pending",
        message: `Enviando ${stellarAmount} XLM...`,
      });

      setIsSendingStellar(true);
      const { txHash, error } = await sendStellarPayment({
        sourcePublicKey: publicKey,
        destinationPublicKey: destination,
        amount: stellarAmount,
        network: "TESTNET",
      });

      if (error || !txHash) {
        addLog({
          type: "stellar",
          status: "error",
          message: (error || "Error enviando XLM").slice(0, 80),
        });
        return;
      }

      addLog({
        type: "stellar",
        status: "success",
        message: `${stellarAmount} XLM enviados`,
        txHash,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error de conexion";
      addLog({
        type: "stellar",
        status: "error",
        message: message.slice(0, 80),
      });
    } finally {
      setIsSendingStellar(false);
    }
  };

  return (
    <>
      {/* Toggle button - pixel style */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-16 right-4 z-50 px-3 py-2 flex items-center gap-2"
        style={{
          backgroundColor: "#4a3728",
          border: "3px solid #2d221a",
          boxShadow: "3px 3px 0 rgba(0,0,0,0.3)",
          fontFamily: "var(--font-vt323)",
          imageRendering: "pixelated",
        }}
        whileHover={{ y: -1 }}
        whileTap={{ y: 1 }}
      >
        <PixelCoinIcon />
        <span className="text-xs font-bold text-white uppercase">
          {isOpen ? "Cerrar" : "Transacciones"}
        </span>
      </motion.button>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: 300, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 300, opacity: 0 }}
            transition={{ type: "spring", damping: 25 }}
            className="fixed top-28 right-4 z-40 w-72"
            style={{
              backgroundColor: "#f5e6d3",
              border: "4px solid #4a3728",
              boxShadow: "4px 4px 0 rgba(0,0,0,0.4)",
              imageRendering: "pixelated",
            }}
          >
            {/* Header */}
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
                Panel de Transacciones
              </span>
            </div>

            {/* Tabs */}
            <div className="flex" style={{ borderBottom: "2px solid #4a3728" }}>
              <button
                onClick={() => setActiveTab("bnb")}
                className="flex-1 py-2 px-3 text-xs font-bold uppercase"
                style={{
                  backgroundColor: activeTab === "bnb" ? "#f0b90b" : "#e8d5c4",
                  color: activeTab === "bnb" ? "#1e2026" : "#4a3728",
                  fontFamily: "var(--font-vt323)",
                  borderRight: "2px solid #4a3728",
                }}
              >
                BNB
              </button>
              <button
                onClick={() => setActiveTab("stellar")}
                className="flex-1 py-2 px-3 text-xs font-bold uppercase"
                style={{
                  backgroundColor: activeTab === "stellar" ? "#222" : "#e8d5c4",
                  color: activeTab === "stellar" ? "#fff" : "#4a3728",
                  fontFamily: "var(--font-vt323)",
                }}
              >
                Stellar
              </button>
            </div>

            {/* Content */}
            <div className="p-3 space-y-3">
              {activeTab === "bnb" && (
                <>
                  <div>
                    <label
                      className="block text-xs font-bold mb-1"
                      style={{
                        fontFamily: "var(--font-vt323)",
                        color: "#4a3728",
                      }}
                    >
                      Destino BNB
                    </label>
                    <input
                      type="text"
                      value={bnbRecipient}
                      onChange={(e) => setBnbRecipient(e.target.value)}
                      placeholder={bnbDefaultRecipient || "0x..."}
                      className="w-full px-2 py-1 text-xs mb-2"
                      style={{
                        backgroundColor: "#fff",
                        border: "2px solid #4a3728",
                        fontFamily: "var(--font-vt323)",
                        color: "#4a3728",
                      }}
                      disabled={!isConnected || isSendingBnb}
                    />

                    <label
                      className="block text-xs font-bold mb-1"
                      style={{
                        fontFamily: "var(--font-vt323)",
                        color: "#4a3728",
                      }}
                    >
                      Cantidad BNB
                    </label>
                    <input
                      type="number"
                      value={bnbAmount}
                      onChange={(e) => setBnbAmount(e.target.value)}
                      step="0.01"
                      min="0"
                      className="w-full px-2 py-1 text-xs"
                      style={{
                        backgroundColor: "#fff",
                        border: "2px solid #4a3728",
                        fontFamily: "var(--font-vt323)",
                        color: "#4a3728",
                      }}
                      disabled={!isConnected || isSendingBnb}
                    />
                  </div>
                  {!isConnected ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => openBnbWalletModal("metamask")}
                        disabled={
                          isSendingBnb || isConnectingBnb || !metaMaskConnector
                        }
                        className="w-full py-2 px-3 text-xs font-bold uppercase"
                        style={{
                          backgroundColor:
                            !isSendingBnb && metaMaskConnector
                              ? "#f0b90b"
                              : "#ccc",
                          border: `2px solid ${!isSendingBnb && metaMaskConnector ? "#c99b09" : "#999"}`,
                          color:
                            !isSendingBnb && metaMaskConnector
                              ? "#1e2026"
                              : "#666",
                          fontFamily: "var(--font-vt323)",
                          cursor:
                            !isSendingBnb && metaMaskConnector
                              ? "pointer"
                              : "not-allowed",
                          boxShadow:
                            !isSendingBnb && metaMaskConnector
                              ? "2px 2px 0 rgba(0,0,0,0.2)"
                              : "none",
                        }}
                      >
                        MetaMask
                      </button>

                      <button
                        onClick={() => openBnbWalletModal("walletconnect")}
                        disabled={
                          isSendingBnb ||
                          isConnectingBnb ||
                          !walletConnectConnector
                        }
                        className="w-full py-2 px-3 text-xs font-bold uppercase"
                        style={{
                          backgroundColor:
                            !isSendingBnb && walletConnectConnector
                              ? "#4a3728"
                              : "#ccc",
                          border: `2px solid ${!isSendingBnb && walletConnectConnector ? "#2d221a" : "#999"}`,
                          color:
                            !isSendingBnb && walletConnectConnector
                              ? "#fff"
                              : "#666",
                          fontFamily: "var(--font-vt323)",
                          cursor:
                            !isSendingBnb && walletConnectConnector
                              ? "pointer"
                              : "not-allowed",
                          boxShadow:
                            !isSendingBnb && walletConnectConnector
                              ? "2px 2px 0 rgba(0,0,0,0.2)"
                              : "none",
                        }}
                      >
                        WalletConnect
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleBNBTransaction}
                      disabled={isSendingBnb}
                      className="w-full py-2 px-3 text-xs font-bold uppercase"
                      style={{
                        backgroundColor: !isSendingBnb ? "#f0b90b" : "#ccc",
                        border: `2px solid ${!isSendingBnb ? "#c99b09" : "#999"}`,
                        color: !isSendingBnb ? "#1e2026" : "#666",
                        fontFamily: "var(--font-vt323)",
                        cursor: !isSendingBnb ? "pointer" : "not-allowed",
                        boxShadow: !isSendingBnb
                          ? "2px 2px 0 rgba(0,0,0,0.2)"
                          : "none",
                      }}
                    >
                      {bnbChainId !== bscTestnet.id
                        ? "Red Incorrecta"
                        : isSendingBnb || isConnectingBnb
                          ? "Confirmando..."
                          : "Enviar BNB"}
                    </button>
                  )}
                  {isConnected && bnbChainId !== bscTestnet.id && (
                    <div className="space-y-2">
                      <p
                        className="text-xs"
                        style={{
                          fontFamily: "var(--font-vt323)",
                          color: "#8b2942",
                        }}
                      >
                        Debe estar en BNB Testnet para operar.
                      </p>
                      <button
                        onClick={async () => {
                          try {
                            await switchChainAsync({ chainId: bscTestnet.id });
                          } catch {
                            addLog({
                              type: "bnb",
                              status: "error",
                              message: "No se pudo cambiar de red",
                            });
                          }
                        }}
                        disabled={isSwitchingChain}
                        className="w-full py-2 px-3 text-xs font-bold uppercase"
                        style={{
                          backgroundColor: !isSwitchingChain
                            ? "#4a3728"
                            : "#ccc",
                          border: `2px solid ${!isSwitchingChain ? "#2d221a" : "#999"}`,
                          color: !isSwitchingChain ? "#fff" : "#666",
                          fontFamily: "var(--font-vt323)",
                          cursor: !isSwitchingChain ? "pointer" : "not-allowed",
                          boxShadow: !isSwitchingChain
                            ? "2px 2px 0 rgba(0,0,0,0.2)"
                            : "none",
                        }}
                      >
                        {isSwitchingChain
                          ? "Cambiando..."
                          : "Cambiar a BNB Testnet"}
                      </button>
                    </div>
                  )}
                </>
              )}

              {activeTab === "stellar" && (
                <>
                  <div>
                    <label
                      className="block text-xs font-bold mb-1"
                      style={{
                        fontFamily: "var(--font-vt323)",
                        color: "#4a3728",
                      }}
                    >
                      Destino Stellar
                    </label>
                    <input
                      type="text"
                      value={stellarRecipient}
                      onChange={(e) => setStellarRecipient(e.target.value)}
                      placeholder="G..."
                      className="w-full px-2 py-1 text-xs mb-2"
                      style={{
                        backgroundColor: "#fff",
                        border: "2px solid #4a3728",
                        fontFamily: "var(--font-vt323)",
                        color: "#4a3728",
                      }}
                      disabled={isSendingStellar}
                    />

                    <label
                      className="block text-xs font-bold mb-1"
                      style={{
                        fontFamily: "var(--font-vt323)",
                        color: "#4a3728",
                      }}
                    >
                      Cantidad XLM
                    </label>
                    <input
                      type="number"
                      value={stellarAmount}
                      onChange={(e) => setStellarAmount(e.target.value)}
                      step="1"
                      min="0"
                      className="w-full px-2 py-1 text-xs"
                      style={{
                        backgroundColor: "#fff",
                        border: "2px solid #4a3728",
                        fontFamily: "var(--font-vt323)",
                        color: "#4a3728",
                      }}
                      disabled={isSendingStellar}
                    />
                  </div>
                  <button
                    onClick={handleStellarTransaction}
                    disabled={isSendingStellar || isConnectingStellar}
                    className="w-full py-2 px-3 text-xs font-bold uppercase"
                    style={{
                      backgroundColor:
                        isSendingStellar || isConnectingStellar
                          ? "#666"
                          : "#222",
                      border: `2px solid ${isSendingStellar || isConnectingStellar ? "#555" : "#000"}`,
                      color: "#fff",
                      fontFamily: "var(--font-vt323)",
                      boxShadow:
                        isSendingStellar || isConnectingStellar
                          ? "none"
                          : "2px 2px 0 rgba(0,0,0,0.2)",
                      cursor:
                        isSendingStellar || isConnectingStellar
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    {isConnectingStellar
                      ? "Conectando..."
                      : isSendingStellar
                        ? "Confirmando..."
                        : "Enviar XLM"}
                  </button>
                </>
              )}
            </div>

            {/* Transaction logs */}
            <div
              className="p-2 max-h-32 overflow-y-auto"
              style={{
                borderTop: "2px solid #4a3728",
                backgroundColor: "#e8d5c4",
              }}
            >
              {txLogs.length === 0 ? (
                <p
                  className="text-xs text-center py-2"
                  style={{ fontFamily: "var(--font-vt323)", color: "#8b8b8b" }}
                >
                  Sin transacciones
                </p>
              ) : (
                <div className="space-y-1">
                  {txLogs.map((log) => (
                    <motion.div
                      key={log.id}
                      initial={{ x: -10, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      className="p-1.5 text-xs"
                      style={{
                        backgroundColor:
                          log.type === "bnb" ? "#fff8e7" : "#f0f0f0",
                        borderLeft: `3px solid ${
                          log.status === "pending"
                            ? "#f0b90b"
                            : log.status === "success"
                              ? "#2d5a27"
                              : "#8b2942"
                        }`,
                        fontFamily: "var(--font-vt323)",
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            backgroundColor:
                              log.status === "pending"
                                ? "#f0b90b"
                                : log.status === "success"
                                  ? "#2d5a27"
                                  : "#8b2942",
                          }}
                        />
                        <span style={{ color: "#4a3728" }}>{log.message}</span>
                      </div>
                      {log.txHash && (
                        <p style={{ color: "#8b8b8b", fontSize: "10px" }}>
                          {log.txHash.substring(0, 12)}...
                        </p>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function PixelCoinIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      style={{ imageRendering: "pixelated" }}
    >
      <rect x="4" y="1" width="8" height="2" fill="#ffd700" />
      <rect x="2" y="3" width="2" height="2" fill="#ffd700" />
      <rect x="12" y="3" width="2" height="2" fill="#ffd700" />
      <rect x="1" y="5" width="2" height="6" fill="#ffd700" />
      <rect x="13" y="5" width="2" height="6" fill="#ffd700" />
      <rect x="2" y="11" width="2" height="2" fill="#ffd700" />
      <rect x="12" y="11" width="2" height="2" fill="#ffd700" />
      <rect x="4" y="13" width="8" height="2" fill="#ffd700" />
      <rect x="3" y="3" width="10" height="10" fill="#c9a227" />
      <rect x="6" y="5" width="4" height="1" fill="#ffd700" />
      <rect x="7" y="6" width="2" height="4" fill="#ffd700" />
      <rect x="6" y="10" width="4" height="1" fill="#ffd700" />
    </svg>
  );
}
