/**
 * Skills Marketplace Demo
 * 
 * This example demonstrates the complete flow:
 * 1. Agent registers a skill
 * 2. Consumer searches for skills
 * 3. Consumer requests skill invocation (gets payment challenge)
 * 4. Consumer pays and invokes skill
 * 5. Agent receives payment and executes skill
 */

import { registerSkill, searchSkills, getSkill } from '../lib/skills/skills-registry'
import { createX402Quote, settleX402 } from '../lib/protocols/x402'

// ============================================================================
// AGENT SIDE: Register a skill
// ============================================================================

console.log('=== Agent: Registering Skills ===\n')

const agentId = 'agent-demo-001'

// Register multiple skills
const skills = [
  {
    skillId: 'text-translation',
    agentId,
    name: 'Language Translation',
    description: 'Translate text between 50+ languages with high accuracy',
    priceXlm: 2,
    endpoint: 'https://agent-demo-001.example.com/translate',
  },
  {
    skillId: 'sentiment-analysis',
    agentId,
    name: 'Sentiment Analysis',
    description: 'Analyze sentiment and emotional tone in text',
    priceXlm: 3,
    endpoint: 'https://agent-demo-001.example.com/sentiment',
  },
  {
    skillId: 'code-review',
    agentId,
    name: 'AI Code Review',
    description: 'Comprehensive code review with best practice recommendations',
    priceXlm: 10,
    endpoint: 'https://agent-demo-001.example.com/code-review',
  },
]

skills.forEach((skillData) => {
  const skill = registerSkill(skillData)
  console.log(`✓ Registered: ${skill.name} (${skill.priceXlm} XLM)`)
})

console.log('\n')

// ============================================================================
// CONSUMER SIDE: Search for skills
// ============================================================================

console.log('=== Consumer: Searching for Skills ===\n')

// Search all skills
const allSkills = searchSkills()
console.log(`Found ${allSkills.length} total skills:`)
allSkills.forEach((skill) => {
  console.log(`  - ${skill.name}: ${skill.priceXlm} XLM`)
})

console.log('\n')

// Search for affordable analysis skills
const affordableSkills = searchSkills({ q: 'analysis', maxPrice: 5 })
console.log(`Affordable analysis skills (≤5 XLM):`)
affordableSkills.forEach((skill) => {
  console.log(`  - ${skill.name}: ${skill.priceXlm} XLM`)
  console.log(`    ${skill.description}`)
})

console.log('\n')

// ============================================================================
// CONSUMER SIDE: Request skill invocation (payment challenge)
// ============================================================================

console.log('=== Consumer: Requesting Skill Invocation ===\n')

const selectedSkill = getSkill(agentId, 'sentiment-analysis')
if (!selectedSkill) {
  throw new Error('Skill not found')
}

console.log(`Selected skill: ${selectedSkill.name}`)
console.log(`Price: ${selectedSkill.priceXlm} XLM`)
console.log(`Endpoint: ${selectedSkill.endpoint}`)

// Create x402 payment quote
const quote = createX402Quote({
  serviceId: `skill:${selectedSkill.agentId}:${selectedSkill.skillId}`,
  chain: 'stellar',
  payer: 'GCONSUMERADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  units: 1,
  unitPriceUsd: selectedSkill.priceXlm * 0.1, // Assume XLM = $0.10
  ttlSeconds: 300,
})

console.log('\n💰 Payment Required (402):')
console.log(`  Quote ID: ${quote.quoteId}`)
console.log(`  Amount: ${quote.options[0].amount}`)
console.log(`  Pay to: ${quote.address}`)
console.log(`  Payment Ref: ${quote.paymentRef}`)
console.log(`  Expires: ${quote.expiresAt}`)

console.log('\n')

// ============================================================================
// CONSUMER SIDE: Make payment and invoke skill
// ============================================================================

console.log('=== Consumer: Making Payment and Invoking Skill ===\n')

// Simulate payment transaction
const mockTxHash = '0x' + 'a'.repeat(64)
console.log(`📤 Payment sent: ${mockTxHash}`)

// Settle the payment
const settlement = settleX402({
  paymentRef: quote.paymentRef,
  chain: 'stellar',
  txHash: mockTxHash,
  paidBy: 'GCONSUMERADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  agentId: selectedSkill.agentId,
})

if (settlement.ok && settlement.receipt) {
  console.log('✓ Payment verified!')
  console.log(`  Receipt: ${settlement.receipt.txHash}`)
  console.log(`  Amount: ${settlement.receipt.amountUsd} USD`)
  console.log(`  Settled at: ${settlement.receipt.settledAt}`)

  // Now the skill can be invoked (agent endpoint would be called)
  console.log('\n📞 Calling agent endpoint...')
  console.log(`  POST ${selectedSkill.endpoint}`)
  console.log('  Headers:')
  console.log(`    X-Payment-Ref: ${quote.paymentRef}`)
  console.log(`    X-Paid-By: GCONSUMERADDRESS...`)
  console.log(`    X-Skill-Id: ${selectedSkill.skillId}`)
  console.log('  Body:')
  console.log('    { "text": "This product is amazing!" }')
  
  // Mock agent response
  console.log('\n📥 Agent response:')
  console.log('  {')
  console.log('    "sentiment": "positive",')
  console.log('    "confidence": 0.95,')
  console.log('    "emotions": ["joy", "satisfaction"]')
  console.log('  }')

  console.log('\n✅ Skill invocation complete!')
} else {
  console.log(`❌ Payment failed: ${settlement.error}`)
}

console.log('\n')

// ============================================================================
// AGENT SIDE: Revenue tracking
// ============================================================================

console.log('=== Agent: Revenue Summary ===\n')

console.log(`Total skills offered: ${allSkills.length}`)
console.log(`Skill invoked: ${selectedSkill.name}`)
console.log(`Revenue earned: ${selectedSkill.priceXlm} XLM`)
console.log('\nRevenue will appear in x402 receipts and can be tracked via:')
console.log('  GET /api/protocol/x402/receipts?agentId=' + agentId)

console.log('\n=== Demo Complete ===')

/**
 * Example agent endpoint implementation:
 * 
 * ```typescript
 * import express from 'express'
 * const app = express()
 * 
 * app.post('/sentiment', async (req, res) => {
 *   const paymentRef = req.headers['x-payment-ref']
 *   const paidBy = req.headers['x-paid-by']
 *   const skillId = req.headers['x-skill-id']
 *   const { text } = req.body
 * 
 *   // Verify payment (optional - already verified by marketplace)
 *   // Process sentiment analysis
 *   const sentiment = analyzeSentiment(text)
 * 
 *   res.json({
 *     sentiment: sentiment.label,
 *     confidence: sentiment.score,
 *     emotions: sentiment.emotions,
 *     processedBy: skillId,
 *     paidBy: paidBy
 *   })
 * })
 * 
 * app.listen(3000)
 * ```
 */
