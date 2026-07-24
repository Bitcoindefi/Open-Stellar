# API Key Authentication

This document describes the API key authentication middleware used to secure admin and protocol routes in Open Stellar.

## Overview

The API key authentication system provides secure access control for:
- **Admin routes** (`/api/admin/*`) - Administrative operations
- **Protocol routes** (`/api/protocol/*`) - Protocol-level operations (x402, passport, reputation)

## API Keys

### Admin API Key
- **Purpose**: Access administrative endpoints
- **Environment Variable**: `ADMIN_API_KEY`
- **Format**: `osk_<random_48_char_hex>`
- **Generation**: Auto-generated on first boot if not set

### Protocol API Key
- **Purpose**: Access protocol endpoints (x402, passport, reputation)
- **Environment Variable**: `MOLTBOT_GATEWAY_TOKEN`
- **Format**: Custom string
- **Usage**: Gateway token for protocol operations

## Usage

### Adding Authentication to a Route

Wrap your route handler with `withApiKeyAuth`:

```typescript
import { withApiKeyAuth } from '@/lib/auth/api-key-middleware'

// Admin-only route
export const GET = withApiKeyAuth(async (req: Request) => {
  // Your handler logic
  return NextResponse.json({ ok: true, data: '...' })
}, { keyType: 'admin' })

// Protocol-only route
export const POST = withApiKeyAuth(async (req: Request) => {
  // Your handler logic
  return NextResponse.json({ ok: true, data: '...' })
}, { keyType: 'protocol' })

// Accept either key type
export const PUT = withApiKeyAuth(async (req: Request) => {
  // Your handler logic
  return NextResponse.json({ ok: true, data: '...' })
}, { keyType: 'any' })
```

### Authentication Options

```typescript
interface ApiKeyAuthOptions {
  /**
   * The type of API key to accept
   * - 'admin': Only accepts admin API keys
   * - 'protocol': Only accepts protocol API keys
   * - 'any': Accepts both admin and protocol API keys
   */
  keyType?: ApiKeyType
  
  /**
   * Custom error message for unauthorized requests
   */
  errorMessage?: string
  
  /**
   * Whether to allow requests in development mode without authentication
   */
  allowDevMode?: boolean
}
```

### Making Authenticated Requests

#### Using Bearer Token
```bash
curl -X GET http://localhost:3000/api/admin/agents \
  -H "Authorization: Bearer <your-api-key>"
```

#### Using API-Key Header
```bash
curl -X GET http://localhost:3000/api/admin/agents \
  -H "Authorization: API-Key <your-api-key>"
```

#### Using X-API-Key Header
```bash
curl -X GET http://localhost:3000/api/admin/agents \
  -H "Authorization: X-API-Key <your-api-key>"
```

#### Using Plain API Key
```bash
curl -X GET http://localhost:3000/api/admin/agents \
  -H "Authorization: <your-api-key>"
```

## Protected Routes

### Admin Routes
- `GET /api/admin/agents` - List cloud agents
- `POST /api/admin/agents` - Provision cloud agent
- `GET /api/admin/claude-costs` - List Claude cost records
- `GET /api/admin/runs` - List orchestration runs
- `POST /api/admin/runs` - Create re-run

### Protocol Routes
- `POST /api/protocol/x402/quote` - Create x402 quote
- `POST /api/protocol/x402/settle` - Settle x402 payment
- `POST /api/protocol/passport/authorize` - Authorize passport payment
- `GET /api/protocol/reputation` - Get reputation data
- `POST /api/protocol/reputation` - Update reputation

## Helper Functions

### `validateApiKey(req, options)`
Validates an API key from the request without wrapping the handler.

```typescript
import { validateApiKey } from '@/lib/auth/api-key-middleware'

const validation = validateApiKey(req, { keyType: 'admin' })
if (!validation.valid) {
  return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}
```

### `isAuthenticated(req)`
Quick check if request is authenticated.

```typescript
import { isAuthenticated } from '@/lib/auth/api-key-middleware'

if (!isAuthenticated(req)) {
  return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}
```

### `getApiKeyType(req)`
Get the type of API key used for authentication.

```typescript
import { getApiKeyType } from '@/lib/auth/api-key-middleware'

const keyType = getApiKeyType(req) // 'admin' | 'protocol' | null
```

## Environment Configuration

### Development Mode
In development mode, you can optionally bypass authentication:

```typescript
export const GET = withApiKeyAuth(handler, { 
  keyType: 'admin',
  allowDevMode: true 
})
```

### Production
Always set environment variables in production:

```bash
# Admin API key
ADMIN_API_KEY=osk_your_admin_key_here

# Protocol gateway token
MOLTBOT_GATEWAY_TOKEN=your_protocol_token_here
```

## Security Considerations

1. **Never commit API keys** to version control
2. **Use environment variables** for all API keys
3. **Rotate keys regularly** in production
4. **Use different keys** for admin and protocol access
5. **Monitor usage** of API keys for suspicious activity
6. **Use HTTPS** in production to prevent key interception

## Error Responses

### Unauthorized (401)
```json
{
  "ok": false,
  "error": "Unauthorized: Invalid or missing API key"
}
```

Headers include:
```
WWW-Authenticate: Bearer realm="API", API-Key realm="API"
```

## Testing

The middleware includes comprehensive test coverage:

```bash
# Run API key authentication tests
npm test lib/auth/api-key-middleware.test.ts
```

Tests cover:
- Valid and invalid API keys
- Different header formats
- Key type restrictions
- Development mode bypass
- Custom error messages
- Helper functions
