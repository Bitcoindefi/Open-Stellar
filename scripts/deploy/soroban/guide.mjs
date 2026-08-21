const steps = [
  "Soroban deploy guide (Stellar Testnet)",
  "",
  "1) Install Soroban CLI:",
  "   cargo install soroban-cli",
  "",
  "2) Configure testnet identity and network:",
  '   soroban config network add --global testnet --rpc-url https://soroban-testnet.stellar.org --network-passphrase "Test SDF Network ; September 2015"',
  "   soroban keys generate --global deployer",
  "",
  "3) Move to contract folder:",
  "   cd contracts/stellar/escrow",
  "",
  "4) Build wasm:",
  "   soroban contract build",
  "",
  "5) Deploy contract:",
  "   soroban contract deploy --wasm target/wasm32-unknown-unknown/release/stellar_escrow.wasm --source deployer --network testnet",
  "",
  "6) Save contract ID and wire it into your app config/services.",
];

console.log(steps.join("\n"));
