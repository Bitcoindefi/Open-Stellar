-- X402 Receipts Table
-- Stores payment receipts for x402 protocol settlements

CREATE TABLE IF NOT EXISTS x402_receipts (
  id VARCHAR(255) PRIMARY KEY,
  quote_id VARCHAR(255),
  payment_ref VARCHAR(511) NOT NULL,
  settled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  tx_hash VARCHAR(255) NOT NULL,
  chain VARCHAR(50) NOT NULL,
  amount_usd DECIMAL(10, 6),
  amount_units VARCHAR(255),
  accepted BOOLEAN NOT NULL DEFAULT true,
  
  -- Agent and service information
  agent_id VARCHAR(255),
  agent VARCHAR(255),
  service VARCHAR(255),
  service_id VARCHAR(255),
  
  -- Passport and reputation metadata
  passport_verified BOOLEAN DEFAULT true,
  reputation_tier VARCHAR(50),
  
  -- Indexes for common queries
  CONSTRAINT valid_tx_hash CHECK (
    chain = 'stellar' AND (
      tx_hash ~ '^0x[a-fA-F0-9]{64}$' OR 
      tx_hash ~ '^[a-fA-F0-9]{64}$' OR 
      tx_hash ~ '^[A-Z0-9]{64}$'
    ) OR
    chain IN ('bnb', 'base') AND tx_hash ~ '^0x[a-fA-F0-9]{64}$'
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_x402_receipts_agent_id ON x402_receipts(agent_id);
CREATE INDEX IF NOT EXISTS idx_x402_receipts_service_id ON x402_receipts(service_id);
CREATE INDEX IF NOT EXISTS idx_x402_receipts_chain ON x402_receipts(chain);
CREATE INDEX IF NOT EXISTS idx_x402_receipts_settled_at ON x402_receipts(settled_at DESC);
CREATE INDEX IF NOT EXISTS idx_x402_receipts_payment_ref ON x402_receipts(payment_ref);
CREATE INDEX IF NOT EXISTS idx_x402_receipts_quote_id ON x402_receipts(quote_id);

-- Composite index for agent-specific queries with pagination
CREATE INDEX IF NOT EXISTS idx_x402_receipts_agent_settled ON x402_receipts(agent_id, settled_at DESC);

-- Composite index for service-specific queries with pagination
CREATE INDEX IF NOT EXISTS idx_x402_receipts_service_settled ON x402_receipts(service_id, settled_at DESC);
