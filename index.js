/**
 * Crypto Worker Main Entry Point
 * Runs on Railway to handle wallet operations
 */

const express = require('express');
const pool = require('./config/database');
const { generateUserWallet } = require('./scripts/generateWallet');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'crypto-worker' });
});

// Generate wallet endpoint (called by PHP API)
app.post('/generate-wallet', async (req, res) => {
  try {
    const { userId, chain, token } = req.body;
    
    if (!userId || !chain || !token) {
      return res.status(400).json({ 
        error: true, 
        message: 'Missing required fields: userId, chain, token' 
      });
    }
    
    const result = await generateUserWallet(userId, chain, token);
    
    res.json({
      wallet_id: result.wallet_id,
      address: result.address,
      chain: result.chain,
      token: result.token
    });
  } catch (error) {
    console.error('Generate wallet error:', error);
    res.status(500).json({ 
      error: true, 
      message: error.message || 'Failed to generate wallet' 
    });
  }
});

// Webhook endpoint (called by PHP API or Alchemy directly)
app.post('/webhook', async (req, res) => {
  try {
    const webhookData = req.body;
    
    // Process webhook using deposit detection script
    const { processWebhook } = require('./scripts/detectDeposits');
    const result = await processWebhook(webhookData);
    
    res.json({
      success: true,
      message: 'Webhook processed',
      data: result
    });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ 
      error: true, 
      message: error.message || 'Failed to process webhook' 
    });
  }
});

// Manual deposit check endpoint (for testing/cron)
app.post('/check-deposits', async (req, res) => {
  try {
    const { walletId } = req.body;
    const { detectDepositsForWallet, checkAllWallets } = require('./scripts/detectDeposits');
    
    let result;
    if (walletId) {
      result = await detectDepositsForWallet(walletId);
    } else {
      result = await checkAllWallets();
    }
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Deposit check error:', error);
    res.status(500).json({ 
      error: true, 
      message: error.message || 'Failed to check deposits' 
    });
  }
});

// Consolidation endpoint
app.post('/consolidate', async (req, res) => {
  try {
    const { walletId, amount } = req.body;
    const { consolidateWallet, consolidateAll } = require('./scripts/consolidate');
    
    let result;
    if (walletId) {
      result = await consolidateWallet(walletId, amount);
    } else {
      result = await consolidateAll(amount || 0);
    }
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Consolidation error:', error);
    res.status(500).json({ 
      error: true, 
      message: error.message || 'Failed to consolidate funds' 
    });
  }
});

// Test database connection on startup
async function testDatabaseConnection() {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    console.log('✅ Database connected successfully');
    console.log(`🔗 Database: ${process.env.DB_HOST || process.env.MYSQL_HOST || 'not configured'}`);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('\n📋 Missing Environment Variables:');
    
    const required = [
      { env: 'DB_HOST', alt: 'MYSQL_HOST', set: !!(process.env.DB_HOST || process.env.MYSQL_HOST) },
      { env: 'DB_USER', alt: 'MYSQLUSER', set: !!(process.env.DB_USER || process.env.MYSQLUSER) },
      { env: 'DB_PASS', alt: 'MYSQLPASSWORD', set: !!(process.env.DB_PASS || process.env.MYSQLPASSWORD) },
      { env: 'DB_NAME', alt: 'MYSQLDATABASE', set: !!(process.env.DB_NAME || process.env.MYSQLDATABASE) },
      { env: 'DB_PORT', alt: 'MYSQLPORT', set: !!(process.env.DB_PORT || process.env.MYSQLPORT) }
    ];
    
    required.forEach(({ env, alt, set }) => {
      const value = process.env[env] || process.env[alt];
      // Check if value is literally the variable name (common mistake)
      const isLiteral = value === env || value === alt;
      
      if (isLiteral) {
        console.error(`   ❌ ${env}: LITERAL VALUE "${value}" (should be reference, not plain variable!)`);
      } else {
        console.error(`   ${set ? '✅' : '❌'} ${env} (or ${alt}): ${set ? `Set (${value?.substring(0, 10)}...)` : 'MISSING'}`);
      }
    });
    
    console.error('\n⚠️  IMPORTANT: The error shows username is "DB_USER" - this means:');
    console.error('   - You set DB_USER as a PLAIN variable with value "DB_USER"');
    console.error('   - You need to use REFERENCE VARIABLE instead!');
    console.error('\n📖 See RAILWAY_ENV_SETUP.md for detailed setup instructions');
    console.error('💡 Delete the plain variables and add Reference Variables in Railway!');
  }
}

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Crypto Worker running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 Database: ${process.env.DB_HOST || process.env.MYSQL_HOST || 'not configured'}`);
  
  // Test database connection
  await testDatabaseConnection();
});

