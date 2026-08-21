/**
 * Smart Contract ABIs y funciones para interactuar con contratos en BNB Testnet
 */

export const SIMPLE_TOKEN_ABI = [
  {
    inputs: [],
    name: "decimals",
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "mint",
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const ESCROW_MILESTONE_ABI = [
  {
    inputs: [
      { name: "payee", type: "address" },
      { name: "deadline", type: "uint64" },
      { name: "metadataURI", type: "string" },
    ],
    name: "createDeal",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ name: "dealId", type: "uint256" }],
    name: "release",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "dealId", type: "uint256" }],
    name: "refund",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const X402_SERVICE_PAYWALL_ABI = [
  {
    inputs: [{ name: "paymentRefHash", type: "bytes32" }],
    name: "settle402",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ name: "paymentRefHash", type: "bytes32" }],
    name: "hasPaid",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Direcciones de contratos en BNB Smart Chain Testnet
export const BNB_TESTNET_CONTRACTS = {
  // Reemplazar con direcciones de tus contratos desplegados
  SIMPLE_TOKEN: "0x0000000000000000000000000000000000000000", // Placeholder
  VENDIMIA_TOKEN: "0x0000000000000000000000000000000000000000", // Placeholder
  ESCROW_MILESTONE: "0x0000000000000000000000000000000000000000",
  X402_SERVICE_PAYWALL: "0x0000000000000000000000000000000000000000",
};

// Chain ID y configuración
export const BNB_TESTNET_CONFIG = {
  chainId: 97,
  name: "BNB Smart Chain Testnet",
  network: "bsc-testnet",
  nativeCurrency: {
    decimals: 18,
    name: "BNB",
    symbol: "tBNB",
  },
  rpcUrls: {
    default: {
      http: ["https://data-seed-prebsc-1-b.binance.org:8545"],
    },
    public: {
      http: ["https://data-seed-prebsc-1-b.binance.org:8545"],
    },
  },
  blockExplorers: {
    default: {
      name: "BscScan Testnet",
      url: "https://testnet.bscscan.com",
    },
  },
};

/**
 * Ejemplo de contrato inteligente simple en Solidity para BNB Testnet
 * Este código puede desplegarse en Remix o usando Hardhat
 */
export const SIMPLE_TOKEN_SOLIDITY = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleToken {
    string public name = "Stellar Token";
    string public symbol = "VDM";
    uint8 public decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() {
        totalSupply = 1000000 * 10 ** uint256(decimals);
        balanceOf[msg.sender] = totalSupply;
    }

    function transfer(address to, uint256 value) public returns (bool) {
        require(to != address(0));
        require(balanceOf[msg.sender] >= value);
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function mint(uint256 amount) public returns (bool) {
        balanceOf[msg.sender] += amount;
        totalSupply += amount;
        emit Transfer(address(0), msg.sender, amount);
        return true;
    }
}
`;

/**
 * Funciones helper para interactuar con Smart Contracts en BNB
 */
export async function getTokenBalance(
  _address: string,
  _contractAddress: string,
  _rpcUrl: string,
): Promise<string> {
  try {
    // Implementación con ethers.js o viem
    return "0";
  } catch (error) {
    console.error("Error getting token balance:", error);
    throw error;
  }
}

export async function transferToken(
  _from: string,
  _to: string,
  _amount: string,
  _contractAddress: string,
): Promise<string> {
  try {
    // Implementación con useWriteContract de wagmi
    return "0x0000000000000000000000000000000000000000";
  } catch (error) {
    console.error("Error transferring token:", error);
    throw error;
  }
}

export function formatBNBAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function parseBNBAmount(amount: string, decimals: number = 18): string {
  try {
    const factor = Math.pow(10, decimals);
    return (parseFloat(amount) * factor).toFixed(0);
  } catch {
    return "0";
  }
}
