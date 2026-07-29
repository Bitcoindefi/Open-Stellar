# StellarEscrow

**Type:** SOROBAN
**Source File:** [contracts/stellar/escrow/src/lib.rs](../../contracts/stellar/escrow/src/lib.rs)

## Data Structures

### `EscrowDeal`

| Field | Type |
| --- | --- |
| `payer` | `Address` |
| `payee` | `Address` |
| `amount` | `i128` |
| `released` | `bool` |
| `disputed` | `bool` |
| `metadata` | `String` |

### `StellarEscrow`

| Field | Type |
| --- | --- |

## Public Entry Points / Methods

### `create`

```rust
pub fn create(env: Env, deal_id: u64, payer: Address, payee: Address, amount: i128, metadata: String) -> void
```

### `release`

```rust
pub fn release(env: Env, deal_id: u64, payer: Address) -> void
```

### `dispute`

```rust
pub fn dispute(env: Env, deal_id: u64, actor: Address) -> void
```

### `get`

```rust
pub fn get(env: Env, deal_id: u64) -> EscrowDeal
```

---
*Generated automatically from source code. Do not edit directly.*
