# Crypto Wallet Worker

Node.js service for managing crypto wallets, deposit detection, and fund consolidation.

## 🚀 Deployment to Railway

See [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) for complete step-by-step guide.

## 📦 Quick Setup

### Local Development

```bash
cd crypto-worker
npm install
cp .env.example .env
# Edit .env with your database credentials
node index.js
```

### Railway Deployment

1. Push code to GitHub
2. Create Railway project from GitHub repo
3. Set root directory to `crypto-worker`
4. Add environment variables in Railway
5. Deploy!

## 📦 Dependencies

- **ethers.js** - EVM chains (Polygon, BSC)
- **tronweb** - TRON blockchain
- **@solana/web3.js** - Solana blockchain
- **mysql2** - Database connection
- **express** - HTTP server (for Railway)
- **crypto** - Encryption utilities

## 🛠️ Usage

### API Endpoints

- `GET /health` - Health check
- `POST /generate-wallet` - Generate wallet for user
  ```json
  {
    "userId": 1,
    "chain": "polygon",
    "token": "USDC"
  }
  ```

## 🔐 Security

- **Private keys are NEVER returned to frontend**
- All private keys are encrypted in database using AES-256-GCM
- Only wallet addresses are exposed to users
- Master wallet keys are encrypted and stored securely

## 📝 Environment Variables

Required variables (set in Railway):
- `DB_HOST` - MySQL host
- `DB_USER` - MySQL username
- `DB_PASS` - MySQL password
- `DB_NAME` - Database name
- `ENCRYPTION_KEY` - 32-byte hex key for encryption
- `PORT` - Server port (Railway sets automatically)

## ⚠️ Important

- Never commit `.env` file to git
- Never log private keys
- Always use encrypted storage for sensitive data
- Test on testnet before production
