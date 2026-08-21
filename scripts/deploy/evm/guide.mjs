const steps = [
  "EVM deploy guide (BNB Testnet)",
  "",
  "1) Export required env vars:",
  "   - PRIVATE_KEY=<wallet_private_key_without_0x>",
  "   - BNB_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545",
  "   - CHAIN_ID=97",
  "",
  "2) Compile contracts with your preferred toolchain (Hardhat/Foundry/Remix).",
  "   Contracts available:",
  "   - contracts/evm/EscrowMilestone.sol",
  "   - contracts/evm/X402ServicePaywall.sol",
  "",
  "3) Deploy EscrowMilestone and X402ServicePaywall to BNB testnet.",
  "",
  "4) Update addresses in lib/bnb-contracts.ts:",
  "   - BNB_TESTNET_CONTRACTS.ESCROW_MILESTONE",
  "   - BNB_TESTNET_CONTRACTS.X402_SERVICE_PAYWALL",
  "",
  "5) Verify contracts in testnet.bscscan.com and run app smoke tests.",
];

console.log(steps.join("\n"));
