/**
 * Smart Contract Soroban utilities para Stellar Testnet
 */

/**
 * Configuración de Soroban para Stellar Testnet
 */
export const STELLAR_SOROBAN_CONFIG = {
  network: "TESTNET",
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
  friendbotUrl: "https://friendbot.stellar.org",
};

/**
 * Ejemplo de contrato Soroban en Rust para Stellar
 * Este código puede compilarse con `soroban contract build`
 */
export const SOROBAN_RUST_EXAMPLE = `
#![no_std]
use soroban_sdk::{contract, contractimpl, log, symbol_short, Env, Symbol, Vec};

#[contract]
pub struct StellarContract;

#[contractimpl]
impl StellarContract {
    pub fn transfer(env: Env, from: Symbol, to: Symbol, amount: i128) -> i128 {
        log!(&env, "Transfer: {} to {} amount {}", from, to, amount);
        amount
    }

    pub fn get_balance(env: Env, account: Symbol) -> i128 {
        log!(&env, "Balance for: {}", account);
        1000
    }

    pub fn mint(env: Env, account: Symbol, amount: i128) -> i128 {
        log!(&env, "Mint {} for {}", amount, account);
        amount
    }
}
`;

/**
 * Interfaz para operaciones de Soroban
 */
export interface SorobanAccount {
  publicKey: string;
  secretKey?: string;
}

export interface SorobanTransaction {
  from: string;
  to: string;
  amount: number;
  memo?: string;
}

/**
 * Funciones helper para interactuar con Soroban en Stellar
 */
export async function getFreighterPublicKey(): Promise<string | null> {
  try {
    const freighter = (window as any).freighter;
    if (!freighter) {
      throw new Error("Freighter not installed");
    }
    return await freighter.getPublicKey();
  } catch (error) {
    console.error("Error getting Freighter public key:", error);
    return null;
  }
}

export async function signStellarTransaction(
  transactionXdr: string,
): Promise<string | null> {
  try {
    const freighter = (window as any).freighter;
    if (!freighter) {
      throw new Error("Freighter not installed");
    }

    const result = await freighter.signTransaction(transactionXdr, {
      networkPassphrase: STELLAR_SOROBAN_CONFIG.networkPassphrase,
    });

    return result;
  } catch (error) {
    console.error("Error signing Stellar transaction:", error);
    return null;
  }
}

export async function submitStellarTransaction(
  transactionXdr: string,
): Promise<string | null> {
  try {
    const response = await fetch(
      `${STELLAR_SOROBAN_CONFIG.rpcUrl}/api/v1/transactions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tx: transactionXdr,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.hash || null;
  } catch (error) {
    console.error("Error submitting Stellar transaction:", error);
    return null;
  }
}

export function formatStellarAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function validateStellarAddress(address: string): boolean {
  // Validar que sea una dirección Stellar válida (comienza con G y tiene 56 caracteres)
  return /^G[A-Z2-7]{55}$/.test(address);
}

/**
 * Configuración para desplegar contratos Soroban
 */
export const SOROBAN_DEPLOYMENT_GUIDE = `
# Guía de Despliegue - Contrato Soroban en Stellar Testnet

## Requisitos
1. Rust toolchain: https://rustup.rs/
2. Soroban CLI: \`cargo install soroban-cli\`
3. Freighter Wallet instalada en el navegador

## Pasos de Despliegue

1. Crear proyecto:
   \`\`\`bash
   soroban contract new stellar_contract
   cd stellar_contract
   \`\`\`

2. Compilar contrato:
   \`\`\`bash
   soroban contract build
   \`\`\`

3. Desplegar a testnet:
   \`\`\`bash
   soroban contract deploy \\
     --wasm target/wasm32-unknown-unknown/release/stellar_contract.wasm \\
     --source <YOUR_WALLET_ALIAS> \\
     --network testnet
   \`\`\`

4. Guardar la dirección del contrato desplegado

## Interacción

\`\`\`bash
soroban contract invoke \\
  --id <CONTRACT_ID> \\
  --source <YOUR_WALLET_ALIAS> \\
  --network testnet \\
  -- transfer \\
  --from alice \\
  --to bob \\
  --amount 100
\`\`\`
`;

/**
 * Tipos de eventos de Soroban
 */
export enum SorobanEventType {
  TRANSFER = "transfer",
  MINT = "mint",
  BURN = "burn",
  APPROVE = "approve",
}

export interface SorobanEvent {
  type: SorobanEventType;
  from?: string;
  to?: string;
  amount: number;
  timestamp: number;
}
