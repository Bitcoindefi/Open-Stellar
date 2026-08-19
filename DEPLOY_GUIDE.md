# Deploy Guide (EVM + Soroban)

Esta guia complementa el README y deja comandos listos para despliegue de contratos en ambos tracks.

## 1. EVM (BNB Testnet)

Contratos:

- contracts/evm/EscrowMilestone.sol
- contracts/evm/X402ServicePaywall.sol

Pasos:

1. Configurar variables de entorno:

```bash
export PRIVATE_KEY=<your_private_key>
export BNB_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
export CHAIN_ID=97
```

2. Compilar y desplegar con toolchain EVM (Hardhat, Foundry o Remix).
3. Guardar addresses desplegadas en:

- lib/bnb-contracts.ts

4. Verificar en BscScan Testnet.

Script de referencia:

- npm run deploy:evm:guide
- scripts/deploy/evm/deploy.example.ps1

## 2. Soroban (Stellar Testnet)

Contrato:

- contracts/stellar/escrow/src/lib.rs

Pasos:

1. Instalar CLI:

```bash
cargo install soroban-cli
```

2. Configurar red/identidad:

```bash
soroban config network add --global testnet --rpc-url https://soroban-testnet.stellar.org --network-passphrase "Test SDF Network ; September 2015"
soroban keys generate --global deployer
```

3. Compilar/desplegar:

```bash
cd contracts/stellar/escrow
soroban contract build
soroban contract deploy --wasm target/wasm32-unknown-unknown/release/stellar_escrow.wasm --source deployer --network testnet
```

4. Registrar contract ID en configuración de la app.

Script de referencia:

- npm run deploy:soroban:guide
- scripts/deploy/soroban/deploy.example.sh

## 3. Post-deploy checklist

1. Actualizar addresses/contract IDs en configuración.
2. Probar transacciones en UI:

- Escrow create/release/dispute
- x402 quote/settle
- Track 8004 fallback de reputación en Stellar

3. Validar logs y explorers.
