# Open Stellar

Plataforma de infraestructura de pagos para agentes de IA, construida sobre Stellar y compatibilidad EVM. Implementa los protocolos x402 (HTTP payment gate), ZK Agent Passport (Groth16 sobre Soroban), track 8004 con fallback de reputación, y un admin console multi-tab para operar y vender el stack como servicio.

[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fleocagli%2FOpen-Stellar&project-name=open-stellar&repository-name=open-stellar)

---

## Stack

| Capa | Tecnología |
|------|------------|
| Framework | Next.js 16 (modo webpack — requerido por snarkjs) |
| UI | React 19, Tailwind v4, Radix UI, Framer Motion |
| Stellar | @stellar/stellar-sdk v16, @stellar/freighter-api, Soroban RPC |
| ZK | snarkjs 0.7.6, Groth16/BN254, circom (WASM artifacts) |
| EVM | wagmi, viem, WalletConnect |
| Deploy | Vercel (Next.js, auto-detect) |

---

## Arquitectura

```
Browser
  ├─ Wallet (MetaMask / WalletConnect / Freighter)
  ├─ Admin Console
  │    ├─ Tab: Orchestration Overview  (métricas, squads, suscripciones)
  │    ├─ Tab: Agent Passport (ZK)     (mint, verify, x402 gate, replay demo)
  │    └─ Tab: Private Deploy          (API reference, one-click deploy)
  └─ Hub UI                            (mapa de agentes, distrito, telemetría)

API Routes (Next.js)
  ├─ /api/protocol/x402/quote          GET  – crea quote de pago
  ├─ /api/protocol/x402/settle         POST – liquida pago (+ passport gate opcional)
  ├─ /api/protocol/passport/authorize  POST – verifica spend-cap ZK on-chain
  ├─ /api/protocol/passport/status     GET  – lee attestation del agente
  ├─ /api/protocol/reputation          GET/POST – sistema de reputación
  ├─ /api/protocol/track8004           GET  – resolución ERC-8004
  ├─ /api/stellar/balance              GET  – balance Stellar
  ├─ /api/stellar/build-tx             POST – construye transacción
  ├─ /api/stellar/submit-tx            POST – envía transacción firmada
  └─ /api/stellar/fund                 POST – Friendbot testnet

Contratos Soroban (testnet)
  ├─ AgentPassportValidator  CDNSZUNEWFCGSPWLPDSWTENR2WPHKC34RGZQG7RJA54OPGTZGVVRFYBA
  └─ CircomGroth16Verifier   CCMKLYSRUH2HMA4UU6WLXWQXEY6KAH5AWB5BEVMJGNGC5GLGTVROLG4A
```

---

## Protocolos

### x402 — HTTP payment gate

Cada llamada a un servicio de agente queda protegida por una microtransacción XLM. El flujo es:

1. Cliente solicita quote → `GET /api/protocol/x402/quote`
2. Paga on-chain
3. Envía evidencia de settlement → `POST /api/protocol/x402/settle`
4. La API verifica y emite receipt

El settle acepta `agentId` opcional; si está presente, llama al gate de passport antes de liquidar. Requests sin `agentId` mantienen comportamiento original (retrocompatible).

Archivos: [lib/protocols/x402.ts](lib/protocols/x402.ts), [app/api/protocol/x402/](app/api/protocol/x402/)

### Agent Passport (ZK) — capa de confianza zero-knowledge

Cada agente puede acuñar un **pasaporte Groth16** que prueba — sin revelar la identidad del dueño ni el saldo real — que está respaldado por un humano verificado y es solvente hasta su spend cap.

Las cuatro invariantes on-chain:
- Prueba Groth16 válida (verificada por CircomGroth16Verifier en Soroban)
- Nullifier anti-replay (un pasaporte, un uso)
- Membresía en el identity registry
- Proof-of-funds para el spend cap declarado

Flujo en el browser:
1. Se genera un keypair efímero (`privateKey`, `agentId`)
2. snarkjs calcula el witness y genera la prueba WASM local
3. La prueba se envía al validador Soroban para attestation on-chain
4. El x402 settle gate consulta el spend cap antes de cada pago

Archivos: [lib/passport/passport.ts](lib/passport/passport.ts), [lib/passport/validator-client.ts](lib/passport/validator-client.ts), [public/zk/](public/zk/), [components/admin/passport-panel.tsx](components/admin/passport-panel.tsx)

Rutas API: [app/api/protocol/passport/](app/api/protocol/passport/)

### Track 8004 + Reputación

Resolución de identidad de agentes siguiendo el estándar ERC-8004. Si la cadena no soporta 8004 nativo, el sistema hace fallback automático al motor de reputación en Stellar.

Archivos: [lib/protocols/track8004.ts](lib/protocols/track8004.ts), [lib/reputation/reputation-store.ts](lib/reputation/reputation-store.ts)

### Escrow

| Contrato | Red | Función |
|----------|-----|---------|
| [EscrowMilestone.sol](contracts/evm/EscrowMilestone.sol) | EVM | Escrow por hitos (createDeal, release, refund, raiseDispute) |
| [X402ServicePaywall.sol](contracts/evm/X402ServicePaywall.sol) | EVM | Paywall x402 (settle402, hasPaid, withdraw) |
| [escrow/src/lib.rs](contracts/stellar/escrow/src/lib.rs) | Soroban | Base funcional (create, release, dispute, get) |

---

## Admin Console

Accesible en `/admin`. Tres tabs:

### Orchestration Overview

Vista operativa del stack como SaaS: squads de agentes por distrito, telemetría de CPU/memoria, planes de suscripción (Starter $49/mo → Growth $249/mo → Command custom), uso mensual de requests y API key con scope completo.

### Agent Passport (ZK)

Panel interactivo de 4 pasos:
1. **Mint** — genera prueba Groth16 en el browser
2. **Verify on-chain** — consulta attestation en Soroban testnet
3. **Authorize x402** — gate de spend cap contra el validador
4. **Replay attack demo** — demuestra que el nullifier bloquea reusos

Muestra contratos desplegados en testnet con links a stellar.expert.

### Private Deploy

Para desarrolladores que quieren su propio nodo Open Stellar:
- Guía de 3 pasos (Fork → Configure → Deploy)
- Botón "Deploy to Vercel" de un click
- Tabla completa de endpoints API con método y descripción
- Variables de entorno requeridas
- Snippet curl de test

---

## Variables de entorno

```env
# WalletConnect Cloud project ID (requerido para conectores EVM)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=abc123...

# URL pública del deployment (opcional, usado en metadata)
NEXT_PUBLIC_APP_URL=https://tu-instancia.vercel.app
```

Obtener WalletConnect project ID en [cloud.walletconnect.com](https://cloud.walletconnect.com).

---

## Instalación y desarrollo local

```bash
git clone https://github.com/bitcoindefi/Open-Stellar.git
cd Open-Stellar
npm install
```

Crear `.env.local`:

```env
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=tu_project_id
```

Iniciar dev server:

```bash
npm run dev
```

> El script usa `next dev --webpack`. La flag `--webpack` es obligatoria porque snarkjs requiere configuración webpack y Next.js 16 usa Turbopack por defecto, que ignora `next.config.mjs`.

Build de producción:

```bash
npm run build
```

Pruebas de carga:

```bash
k6 run load-tests/x402-settle.js
```

Ver [load-tests/README.md](load-tests/README.md) para los escenarios de x402, orquestación, SSE y heartbeats.

---

## Deploy a Vercel

El repositorio incluye `vercel.json` que fuerza:

```json
{
  "buildCommand": "next build --webpack",
  "installCommand": "npm install",
  "framework": "nextjs"
}
```

Pasos:
1. Fork en GitHub
2. Importar en [vercel.com/new](https://vercel.com/new)
3. Agregar `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` en las variables de entorno del proyecto
4. Deploy — Vercel detecta Next.js y usa el buildCommand del `vercel.json`

O usar el botón de un click al inicio de este README.

---

## Contratos desplegados (Stellar testnet)

| Contrato | ID |
|----------|----|
| AgentPassportValidator | `CDNSZUNEWFCGSPWLPDSWTENR2WPHKC34RGZQG7RJA54OPGTZGVVRFYBA` |
| CircomGroth16Verifier | `CCMKLYSRUH2HMA4UU6WLXWQXEY6KAH5AWB5BEVMJGNGC5GLGTVROLG4A` |

Explorar en [stellar.expert/explorer/testnet](https://stellar.expert/explorer/testnet).

---

## Estructura de archivos relevantes

```
app/
  api/
    protocol/
      x402/               x402 quote + settle
      passport/           ZK passport authorize + status
      reputation/         motor de reputación
      track8004/          resolución ERC-8004
    stellar/              balance, build-tx, submit-tx, fund

components/
  admin/
    admin-console.tsx     console multi-tab
    passport-panel.tsx    ZK passport UI
  open-stellar/           hub principal
  wallet/                 botones y panel de transacción

lib/
  passport/
    passport.ts           pipeline ZK completo
    validator-client.ts   bindings Soroban (stellar-sdk v16)
    snarkjs.d.ts          tipos snarkjs
  protocols/
    x402.ts               x402 quote/settle/registry
    track8004.ts          resolución 8004
  reputation/
    reputation-store.ts   store de reputación

public/zk/               artifacts circom (WASM + zkey + vk)

contracts/
  evm/                    Solidity (EscrowMilestone, X402ServicePaywall)
  stellar/escrow/         Soroban base escrow (Rust)

vercel.json              build config para Vercel
```

---

## Repositorios relacionados

- [open-stellar-passport](https://github.com/bitcoindefi/open-stellar-passport) — fuente original del sistema ZK passport (Vite standalone), portado a este repo en `lib/passport/`

---

## Scripts de deploy de contratos

```bash
npm run deploy:evm:guide      # guía interactiva EVM
npm run deploy:soroban:guide  # guía interactiva Soroban
```

---

## Licencia

MIT
