# EscrowMilestone

**Type:** SOLIDITY
**Source File:** [contracts/evm/EscrowMilestone.sol](../../contracts/evm/EscrowMilestone.sol)

## Data Structures

### `Deal`

| Field | Type |
| --- | --- |
| `payer` | `address` |
| `payee` | `address` |
| `amount` | `uint256` |
| `deadline` | `uint64` |
| `state` | `EscrowState` |
| `metadataURI` | `string` |

## Public Entry Points / Methods

### `createDeal`

```solidity
function createDeal(address payee, uint64 deadline, string calldata metadataURI) external payable returns (uint256)
```

### `release`

```solidity
function release(uint256 dealId) external
```

### `refund`

```solidity
function refund(uint256 dealId) external
```

### `raiseDispute`

```solidity
function raiseDispute(uint256 dealId) external
```

---
*Generated automatically from source code. Do not edit directly.*
