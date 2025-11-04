# Crypto Deposit Detection System

This document explains how the deposit detection and consolidation system works.

## Overview

The crypto deposit system consists of:
1. **Wallet Generation**: Creates unique wallets for each user per chain/token
2. **Deposit Detection**: Monitors wallets for incoming deposits
3. **Balance Crediting**: Credits user's main wallet when deposits are confirmed
4. **Consolidation**: Moves funds from user wallets to master wallets

## Deposit Detection Methods

### 1. Webhook-Based (Recommended)

Alchemy sends webhooks when transactions occur on monitored addresses.

**Setup:**
1. Configure Alchemy webhook in Alchemy dashboard
2. Set webhook URL to: `https://yourdomain.com/api/crypto/webhook`
3. PHP endpoint forwards to crypto-worker: `POST /webhook`

**Flow:**
```
Alchemy → PHP API (/api/crypto/webhook) → Crypto Worker (/webhook) → Process Deposit
```

### 2. Polling-Based (Fallback)

If webhooks aren't available, use polling to check wallet balances.

**Setup:**
Run as cron job or scheduled task:
```bash
# Check all wallets
node scripts/detectDeposits.js

# Check specific wallet
node scripts/detectDeposits.js wallet <walletId>
```

**Or via API:**
```bash
curl -X POST https://your-crypto-worker.com/check-deposits
```

## Deposit Processing

### Status Flow

1. **pending**: Deposit detected, waiting for confirmations
2. **confirmed**: Deposit has 12+ confirmations
3. **credited**: User's wallet has been credited
4. **failed**: Processing error

### Confirmation Requirements

- **EVM Chains (Polygon, BSC)**: 12 confirmations
- **Solana**: 1 confirmation (instant finality)
- **TRON**: 20 confirmations

### Credit Process

When a deposit reaches `confirmed` status:
1. Create transaction record in main database
2. Update user's wallet balance
3. Mark deposit as `credited`

The credit is done via API call to PHP backend:
```javascript
POST /api/crypto/credit_wallet
{
  "user_id": 123,
  "amount": 100.50,
  "deposit_id": 456,
  "source": "crypto_deposit"
}
```

## Consolidation

Consolidation moves funds from user wallets to master wallets for easier management.

### Manual Consolidation

```bash
# Consolidate all wallets
node scripts/consolidate.js

# Consolidate specific wallet
node scripts/consolidate.js wallet <walletId>

# Consolidate specific amount
node scripts/consolidate.js wallet <walletId> <amount>
```

### Via API

```bash
# Consolidate all wallets
curl -X POST https://your-crypto-worker.com/consolidate

# Consolidate specific wallet
curl -X POST https://your-crypto-worker.com/consolidate \
  -H "Content-Type: application/json" \
  -d '{"walletId": 123}'
```

### Consolidation Logs

All consolidation attempts are logged in `consolidation_logs` table:
- `pending`: Initial log entry
- `processing`: Consolidation in progress
- `completed`: Successfully consolidated
- `failed`: Error occurred

## Environment Variables

Add to `.env`:

```env
# PHP API URL (for crediting wallets)
PHP_API_URL=https://yourdomain.com/api
PHP_API_KEY=your-secret-api-key

# RPC URLs (optional, uses public RPCs if not set)
POLYGON_RPC_URL=https://polygon-rpc.com
BSC_RPC_URL=https://bsc-dataseed.binance.org
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

## Database Schema

### crypto_deposits
Stores all detected deposits:
- `tx_hash`: Transaction hash (unique per chain)
- `amount`: Deposit amount
- `amount_usdt`: Converted USDT amount
- `status`: pending/confirmed/credited/failed
- `confirmations`: Number of confirmations

### crypto_wallets
User wallet addresses:
- One wallet per user per chain/token combination
- Private keys encrypted and stored securely
- Never exposed to frontend

### master_wallets
Master wallets for consolidation:
- One per chain/token combination
- Funds consolidated from user wallets

### consolidation_logs
Consolidation history:
- Tracks all consolidation attempts
- Includes transaction hashes
- Stores error messages on failure

## Security Notes

1. **Private Keys**: Never exposed to frontend or API responses
2. **Encryption**: All private keys encrypted with AES-256-GCM
3. **API Keys**: Store Alchemy API keys encrypted in database
4. **Webhook Validation**: Add signature verification (TODO)
5. **Rate Limiting**: Implement rate limiting on webhook endpoints

## Testing

### Test Deposit Detection

```bash
# Check all wallets
npm run detect-deposits

# Check specific wallet
node scripts/detectDeposits.js wallet 1
```

### Test Consolidation

```bash
# Consolidate all
npm run consolidate

# Consolidate specific wallet
node scripts/consolidate.js wallet 1
```

## Troubleshooting

### Deposits Not Detected

1. Check Alchemy API key is configured
2. Verify webhook URL is correct
3. Check wallet addresses are correct
4. Review `crypto_deposits` table for errors

### Consolidation Fails

1. Check master wallet is configured
2. Verify sufficient gas/native token for fees
3. Check private keys are decryptable
4. Review `consolidation_logs` for error messages

### Wallet Not Credited

1. Check deposit status is `confirmed`
2. Verify PHP API is accessible
3. Check `PHP_API_KEY` is correct
4. Review PHP API logs

