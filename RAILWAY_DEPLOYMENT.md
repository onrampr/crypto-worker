# 🚂 Railway Deployment Guide for Crypto Worker

Step-by-step guide to deploy the crypto-worker Node.js service to Railway.

## 📋 Prerequisites

1. **Railway Account** - Sign up at https://railway.com
2. **GitHub Account** - Your code should be in a GitHub repository
3. **Database Access** - Your MySQL database credentials

## 🚀 Step 1: Prepare Your Repository

### 1.1 Push crypto-worker to GitHub

Make sure your `crypto-worker` folder is in your GitHub repository:

```bash
cd c:\Projects\DRAFT
git add crypto-worker/
git commit -m "Add crypto-worker service"
git push origin main
```

## 🚀 Step 2: Deploy to Railway

### 2.1 Create New Project on Railway

1. Go to https://railway.com
2. Click **"New Project"**
3. Select **"Deploy from GitHub Repo"**
4. Select your repository
5. Railway will detect it's a Node.js project

### 2.2 Configure Service

1. Railway will create a service automatically
2. Click on the service
3. Go to **Settings** tab
4. Set **Root Directory** to: `crypto-worker`
5. Set **Start Command** to: `node index.js`

### 2.3 Set Environment Variables

Go to **Variables** tab and add:

```env
# Database Configuration
DB_HOST=your_mysql_host
DB_USER=your_db_user
DB_PASS=your_db_password
DB_NAME=ysdkgzpgms_checkers

# Encryption Key (generate one!)
# Run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your_32_byte_hex_key_here

# Port (Railway sets this automatically)
PORT=3000

# Node Environment
NODE_ENV=production
```

**Important**: 
- Generate encryption key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Copy the output and paste as `ENCRYPTION_KEY`

### 2.4 Get Railway Service URL

1. Go to **Settings** → **Networking**
2. Railway will generate a public URL like: `https://crypto-worker-production.up.railway.app`
3. Copy this URL - you'll need it for your PHP API

## 🚀 Step 3: Update PHP API Configuration

### 3.1 Add Railway URL to Your PHP Config

Edit `config/config.php` and add:

```php
// Crypto Worker (Railway) Configuration
define('CRYPTO_WORKER_URL', $_ENV['CRYPTO_WORKER_URL'] ?? 'https://your-service-name.up.railway.app');
```

### 3.2 Add to .env File

Add to your main `.env` file (not in crypto-worker):

```env
CRYPTO_WORKER_URL=https://your-service-name.up.railway.app
```

Replace `your-service-name` with your actual Railway service URL.

## 🚀 Step 4: Verify Deployment

### 4.1 Test Health Endpoint

Visit: `https://your-service-name.up.railway.app/health`

Should return:
```json
{
  "status": "ok",
  "service": "crypto-worker"
}
```

### 4.2 Test from PHP API

Test wallet generation via your PHP API:
```bash
curl -X POST https://your-domain.com/api/crypto/generate_wallet \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"chain":"polygon","token":"USDC"}'
```

## 🔧 Step 5: Railway Configuration Details

### File Structure Railway Expects:

```
crypto-worker/
├── package.json          ✅ (has dependencies)
├── index.js              ✅ (main entry point)
├── railway.json          ✅ (optional config)
├── config/
│   └── database.js       ✅ (database connection)
├── utils/
│   ├── encryption.js      ✅ (encryption utilities)
│   └── walletGenerators.js ✅ (wallet generation)
└── scripts/
    └── generateWallet.js  ✅ (called by index.js)
```

### Railway Auto-Detection:

Railway will automatically:
- ✅ Detect Node.js from `package.json`
- ✅ Run `npm install` (installs ethers.js, tronweb, @solana/web3.js, etc.)
- ✅ Start service with `node index.js`
- ✅ Expose port automatically

## 🔒 Step 6: Security Best Practices

1. **Never commit `.env` file** - Already in `.gitignore`
2. **Use Railway Secrets** - Store sensitive data in Railway Variables
3. **Enable HTTPS** - Railway provides HTTPS automatically
4. **Monitor Logs** - Check Railway logs for errors

## 📊 Step 7: Monitor Your Service

### View Logs:
1. Go to Railway dashboard
2. Click on your service
3. Go to **Deployments** tab
4. Click on a deployment to see logs

### Check Health:
- Railway automatically monitors `/health` endpoint
- Service will restart if it crashes

## 🐛 Troubleshooting

### Service Won't Start
- Check logs in Railway dashboard
- Verify all environment variables are set
- Ensure database is accessible from Railway

### Database Connection Failed
- Check DB_HOST allows connections from Railway IPs
- Verify DB_USER, DB_PASS, DB_NAME are correct
- Test connection from Railway service logs

### Wallet Generation Fails
- Check Railway logs for errors
- Verify encryption key is set correctly
- Ensure all npm packages installed successfully

### Dependencies Not Installing
- Check `package.json` is valid
- Railway should auto-install on deploy
- Check build logs for errors

## 📝 Railway Service URL Format

Your Railway service will have a URL like:
```
https://crypto-worker-production-xxxx.up.railway.app
```

Or you can set a custom domain in Railway Settings.

## ✅ Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] Railway project created
- [ ] Root directory set to `crypto-worker`
- [ ] Environment variables configured
- [ ] Service URL copied
- [ ] PHP config updated with Railway URL
- [ ] Health endpoint working
- [ ] Test wallet generation works

## 🎉 Success!

Once deployed, your crypto-worker will:
- ✅ Generate wallets for Polygon, BSC, Solana, TRON
- ✅ Encrypt private keys securely
- ✅ Store in your MySQL database
- ✅ Only return addresses (never private keys)

Your PHP API will call the Railway service automatically when users request wallet addresses!

---

**Need Help?**
- Railway Docs: https://docs.railway.app
- Check Railway logs for errors
- Verify all environment variables are set

