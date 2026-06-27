# @open-stellar/sdk

One-liner x402 integration for Open Stellar services.

```ts
import { withX402 } from '@open-stellar/sdk'

export const GET = withX402({
  price: '0.01 XLM',
  service: 'my-data-api',
  description: 'Access to premium data endpoint',
})(async () => Response.json({ data: '...' }))
```

```ts
import { OpenStellarClient } from '@open-stellar/sdk'

const client = new OpenStellarClient({ nodeUrl: 'https://my-open-stellar.vercel.app' })
const result = await client.call('https://target-api.com/premium', {
  wallet: freighterWallet,
  maxPrice: '0.05 XLM',
})
```
