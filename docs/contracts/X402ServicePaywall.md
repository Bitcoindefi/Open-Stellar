# X402ServicePaywall

**Type:** SOLIDITY
**Source File:** [contracts/evm/X402ServicePaywall.sol](../../contracts/evm/X402ServicePaywall.sol)

## Public Entry Points / Methods

### `settle402`

```solidity
function settle402(bytes32 paymentRefHash) external payable
```

### `hasPaid`

```solidity
function hasPaid(bytes32 paymentRefHash) external view returns (bool)
```

### `withdraw`

```solidity
function withdraw(address payable to, uint256 amount) external onlyOwner
```

---
*Generated automatically from source code. Do not edit directly.*
