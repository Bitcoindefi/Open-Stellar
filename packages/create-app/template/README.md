# **PROJECT_NAME**

Open Stellar node scaffolded with `create-open-stellar-app`.

- **Node name:** **NODE_NAME**
- **Network:** **NETWORK**
- **Deploy target:** **DEPLOY_TARGET**

## Quick start

```bash
npm install
npm run dev
```

## Admin API key

Generated at scaffold time:

```
__ADMIN_API_KEY__
```

If `ADMIN_API_KEY` is unset at runtime, the node generates one on first boot.

## x402 example

```bash
curl -X POST http://localhost:3000/api/protocol/x402/quote \
  -H 'Content-Type: application/json' \
  -d '{"serviceId":"my-service","chain":"stellar","payer":"demo"}'

curl http://localhost:3000/api/my-service \
  -H 'x-payment-ref: <paymentRef from quote>'
```

## Tests

```bash
npm test
```
