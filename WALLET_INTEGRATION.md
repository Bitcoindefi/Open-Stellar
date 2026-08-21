# Open Stellar - Multi-Chain DApp (BNB + Stellar)

Una aplicación descentralizada interactiva que integra BNB Smart Chain (testnet) y Stellar (testnet) con soporte para transacciones y smart contracts.

## Características

- **WalletConnect para BNB**: Conexión a BNB Smart Chain testnet mediante WalletConnect v2 (AppKit)
- **Freighter para Stellar**: Integración con extensión Freighter para Stellar testnet
- **Transaction Panel**: UI para ejecutar transacciones en ambas redes
- **Multi-chain Support**: Interactúa simultáneamente con BNB y Stellar
- **Open Stellar Hub**: Interfaz pixel-art con ciudad de agentes IA

## Instalación

### 1. Clonar y instalar dependencias

```bash
git clone <tu-repo>
cd Open-Stellar
pnpm install
```

### 2. Variables de entorno

Crear `.env.local` en la raíz del proyecto:

```env
# WalletConnect - Obtener en https://cloud.reown.com
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=tu_project_id_aqui
```

### 3. Ejecutar en desarrollo

```bash
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## Configuración de Redes

### BNB Smart Chain Testnet

- **Chain ID**: 97
- **RPC**: https://data-seed-prebsc-1-b.binance.org:8545
- **Explorer**: https://testnet.bscscan.com
- **Faucet**: https://testnet.binance.org/faucet-smart

### Stellar Testnet

- **Network**: Test SDF Network
- **RPC**: https://soroban-testnet.stellar.org
- **Explorer**: https://stellar.expert/explorer/testnet
- **Faucet**: https://friendbot.stellar.org

## Smart Contracts

### BNB - SimpleToken.sol

Contrato Solidity desplegado en BNB testnet:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleToken {
    // Ver archivo: lib/bnb-contracts.ts
    // Características:
    // - Transfer de tokens
    // - Mint de nuevos tokens
    // - Balance queries
}
```

**Para desplegar:**

1. Ir a [Remix IDE](https://remix.ethereum.org)
2. Copiar código de `lib/bnb-contracts.ts` (SIMPLE_TOKEN_SOLIDITY)
3. Compilar y desplegar a BNB Testnet
4. Guardar dirección en `lib/bnb-contracts.ts`

### Stellar - Soroban Contract

Contrato Rust para Stellar testnet:

```bash
# Clonar template Soroban
soroban contract new stellar_contract

# Compilar
soroban contract build

# Desplegar
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/stellar_contract.wasm \
  --source <WALLET_ALIAS> \
  --network testnet
```

Ver instrucciones completas en `lib/soroban-contracts.ts` (SOROBAN_DEPLOYMENT_GUIDE)

## Componentes Principales

### `/components/wallet/`

- **wallet-provider.tsx**: Proveedor de contexto Wagmi + Freighter
- **wallet-button.tsx**: Botón multi-chain para conectar wallets
- **transaction-panel.tsx**: Panel para ejecutar transacciones

### `/lib/`

- **wallet-config.ts**: Configuración de Wagmi para BNB testnet
- **stellar-utils.ts**: Utilidades para Freighter y Stellar
- **bnb-contracts.ts**: ABIs y utilidades de smart contracts BNB
- **soroban-contracts.ts**: Utilidades de contratos Soroban

## Uso de la Aplicación

1. **Conectar Wallet**
   - Haz clic en el botón "Connect Wallet" en la esquina superior derecha
   - Selecciona tu billetera para BNB (MetaMask, WalletConnect, etc)
   - Para Stellar, la conexión con Freighter es automática

2. **Ejecutar Transacciones**
   - Abre el Transaction Panel (esquina inferior derecha)
   - Selecciona BNB o Stellar
   - Ingresa la cantidad
   - Confirma en tu wallet

3. **Ver Historial**
   - El panel muestra el histórico de transacciones
   - Incluye hash de transacción para verificar en explorers

## Requisitos para Hackathons

- ✅ WalletConnect integrado para BNB Smart Chain Testnet
- ✅ Freighter integrado para Stellar Testnet
- ✅ UI para ejecutar transacciones en ambas redes
- ✅ Historial de transacciones con hashes verificables
- ⚠️ **Próximo paso**: Desplegar contratos reales y actualizar direcciones
- ⚠️ **Próximo paso**: Ejecutar 2+ transacciones exitosas en cada red

## Estructura del Proyecto

```
Open-Stellar/
├── app/
│   ├── layout.tsx          # Layout principal con WalletProvider
│   ├── page.tsx            # Página principal
│   └── globals.css
├── components/
│   ├── wallet/             # Componentes de wallet
│   │   ├── wallet-provider.tsx
│   │   ├── wallet-button.tsx
│   │   └── transaction-panel.tsx
│   └── open-stellar/       # Componentes del hub
├── lib/
│   ├── wallet-config.ts
│   ├── stellar-utils.ts
│   ├── bnb-contracts.ts
│   └── soroban-contracts.ts
└── public/                 # Assets estáticos
```

## Troubleshooting

### "WalletConnect Project ID not found"

- Verificar que NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID está en `.env.local`
- Recrear en https://cloud.reown.com si es necesario

### "Freighter no disponible"

- Instalar extensión Freighter: https://freighter.app
- Asegurarse de que esté habilitada en el navegador

### Error de red (RPC)

- Verificar que tienes fondos en testnet (usa faucets)
- Verificar que el RPC no está rate-limited
- Cambiar a otro RPC si es necesario

## Recursos Útiles

- WalletConnect Docs: https://docs.reown.com
- Wagmi Docs: https://wagmi.sh
- Freighter Docs: https://docs.freighter.app
- Stellar Soroban: https://developers.stellar.org/learn/soroban
- BNB Chain Docs: https://docs.bnbchain.org

## Licencia

MIT

## Autor

Open Stellar - Hackathon Project
