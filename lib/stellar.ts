// Stellar SDK configuration -- server-side only
// All Stellar operations run through API routes at /api/stellar/*
// Client-side wallet connection uses @stellar/freighter-api

export const STELLAR_TESTNET_HORIZON = "https://horizon-testnet.stellar.org"
export const STELLAR_TESTNET_PASSPHRASE = "Test SDF Network ; September 2015"
export const FRIENDBOT_URL = "https://friendbot.stellar.org"

// Protocol treasury wallet that receives paid cosmetic customizations (e.g. agent color changes).
// Must be set per-environment -- there is no safe default testnet address to fall back to.
export const PROTOCOL_TREASURY_ADDRESS = process.env.STELLAR_TREASURY_ADDRESS || ""
