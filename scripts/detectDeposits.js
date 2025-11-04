/**
 * Deposit Detection Script
 * Detects deposits to user wallets using Alchemy webhooks or polling
 * Can be run as a cron job or called via webhook
 */

const pool = require('../config/database');
const { getAlchemyApiKey, getTokenBalance, getTokenContractAddress } = require('../utils/alchemy');
const axios = require('axios');

/**
 * Process deposit transaction
 */
async function processDeposit(depositData) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { userId, walletId, chain, token, txHash, amount, fromAddress, toAddress, blockNumber, confirmations } = depositData;
    
    // Check if deposit already exists
    const [existing] = await connection.execute(
      'SELECT id, status FROM crypto_deposits WHERE tx_hash = ? AND chain = ?',
      [txHash, chain]
    );
    
    if (existing.length > 0) {
      // Update existing deposit if needed
      if (existing[0].status !== 'credited') {
        await connection.execute(
          `UPDATE crypto_deposits 
           SET status = ?, confirmations = ?, updated_at = NOW() 
           WHERE id = ?`,
          [confirmations >= 12 ? 'confirmed' : 'pending', confirmations, existing[0].id]
        );
      }
      await connection.commit();
      return { success: true, message: 'Deposit already exists', depositId: existing[0].id };
    }
    
    // Convert amount to USDT (assuming 1:1 for now, adjust based on actual rates)
    const amountUsdt = parseFloat(amount);
    
    // Insert deposit record
    const [result] = await connection.execute(
      `INSERT INTO crypto_deposits 
       (user_id, wallet_id, chain, token, tx_hash, amount, amount_usdt, status, confirmations, 
        block_number, from_address, to_address) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        walletId,
        chain,
        token,
        txHash,
        amount,
        amountUsdt,
        confirmations >= 12 ? 'confirmed' : 'pending',
        confirmations,
        blockNumber,
        fromAddress,
        toAddress
      ]
    );
    
    const depositId = result.insertId;
    
    // If confirmed, credit user's wallet
    if (confirmations >= 12) {
      await creditUserWallet(connection, userId, amountUsdt, depositId);
    }
    
    await connection.commit();
    return { success: true, depositId: depositId };
    
  } catch (error) {
    await connection.rollback();
    console.error('Error processing deposit:', error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Credit user's wallet balance
 */
async function creditUserWallet(connection, userId, amount, depositId) {
  try {
    // Update deposit status
    await connection.execute(
      'UPDATE crypto_deposits SET status = ?, credited_at = NOW() WHERE id = ?',
      ['credited', depositId]
    );
    
    // Note: This assumes the main database has a wallets table
    // For Railway MySQL, we need to make an API call to the PHP backend
    // or use a shared database connection
    
    // For now, log the credit action
    // TODO: Integrate with PHP API to credit user wallet
    console.log(`Crediting user ${userId} with ${amount} USDT from deposit ${depositId}`);
    
    // Make API call to PHP backend to credit wallet
    const phpApiUrl = process.env.PHP_API_URL || 'https://checkers.zatamtech.xyz/api';
    try {
      await axios.post(`${phpApiUrl}/crypto/credit_wallet`, {
        user_id: userId,
        amount: amount,
        deposit_id: depositId,
        source: 'crypto_deposit'
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.PHP_API_KEY || ''}`
        }
      });
    } catch (apiError) {
      console.error('Error crediting wallet via API:', apiError);
      // Don't throw - log and continue
    }
    
  } catch (error) {
    console.error('Error crediting user wallet:', error);
    throw error;
  }
}

/**
 * Detect deposits for a specific wallet by polling
 */
async function detectDepositsForWallet(walletId) {
  const connection = await pool.getConnection();
  
  try {
    // Get wallet info
    const [wallets] = await connection.execute(
      'SELECT * FROM crypto_wallets WHERE id = ? AND is_active = 1',
      [walletId]
    );
    
    if (wallets.length === 0) {
      throw new Error(`Wallet ${walletId} not found`);
    }
    
    const wallet = wallets[0];
    const { chain, token, address, user_id } = wallet;
    
    // Get Alchemy API key
    let apiKey;
    try {
      apiKey = await getAlchemyApiKey(chain, pool);
    } catch (error) {
      console.error(`No Alchemy API key for ${chain}, skipping...`);
      return { success: false, message: `No API key configured for ${chain}` };
    }
    
    // Get current balance
    const balanceInfo = await getTokenBalance(chain, address, token, apiKey, pool);
    const currentBalance = parseFloat(balanceInfo.balance);
    
    // Get last checked balance from database
    // Calculate from deposits (since we don't have a balance column in crypto_wallets)
    const [deposits] = await connection.execute(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM crypto_deposits 
       WHERE wallet_id = ? AND status = 'credited'`,
      [walletId]
    );
    
    const lastBalance = parseFloat(deposits[0]?.total || 0);
    
    // If balance increased, process new deposits
    if (currentBalance > lastBalance) {
      const difference = currentBalance - lastBalance;
      
      // Create a synthetic transaction for the deposit
      // In production, you'd fetch actual transaction data from blockchain
      const depositData = {
        userId: user_id,
        walletId: walletId,
        chain: chain,
        token: token,
        txHash: `poll-${Date.now()}-${walletId}`, // Synthetic hash for polling
        amount: difference.toString(),
        fromAddress: null,
        toAddress: address,
        blockNumber: null,
        confirmations: 12 // Assume confirmed for polling
      };
      
      await processDeposit(depositData);
      
      // Note: We don't store balance in crypto_wallets table
      // Balance is calculated from crypto_deposits table
      
      return { success: true, newDeposit: difference };
    }
    
    return { success: true, message: 'No new deposits' };
    
  } catch (error) {
    console.error(`Error detecting deposits for wallet ${walletId}:`, error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Process Alchemy webhook payload
 */
async function processWebhook(webhookData) {
  try {
    // Alchemy webhook format varies by chain
    // This is a generic handler - adjust based on actual webhook format
    
    const { event, activity } = webhookData;
    
    if (event?.type !== 'ADDRESS_ACTIVITY') {
      return { success: false, message: 'Unsupported webhook event type' };
    }
    
    // Extract transaction data from webhook
    const transactions = activity || [];
    
    for (const tx of transactions) {
      // Find matching wallet
      const connection = await pool.getConnection();
      try {
        const [wallets] = await connection.execute(
          'SELECT * FROM crypto_wallets WHERE address = ? AND chain = ? AND is_active = 1',
          [tx.to, tx.network || 'polygon'] // Adjust network detection
        );
        
        if (wallets.length === 0) {
          continue; // Not our wallet
        }
        
        const wallet = wallets[0];
        
        // Process deposit
        const depositData = {
          userId: wallet.user_id,
          walletId: wallet.id,
          chain: wallet.chain,
          token: wallet.token,
          txHash: tx.hash,
          amount: tx.value || '0',
          fromAddress: tx.from,
          toAddress: tx.to,
          blockNumber: tx.blockNumber || null,
          confirmations: tx.confirmations || 0
        };
        
        await processDeposit(depositData);
        
      } finally {
        connection.release();
      }
    }
    
    return { success: true, processed: transactions.length };
    
  } catch (error) {
    console.error('Error processing webhook:', error);
    throw error;
  }
}

/**
 * Check all active wallets for deposits
 */
async function checkAllWallets() {
  const connection = await pool.getConnection();
  
  try {
    // Get all active wallets
    const [wallets] = await connection.execute(
      'SELECT id FROM crypto_wallets WHERE is_active = 1'
    );
    
    let processed = 0;
    let errors = 0;
    
    for (const wallet of wallets) {
      try {
        await detectDepositsForWallet(wallet.id);
        processed++;
      } catch (error) {
        console.error(`Error checking wallet ${wallet.id}:`, error);
        errors++;
      }
    }
    
    return {
      success: true,
      processed,
      errors,
      total: wallets.length
    };
    
  } finally {
    connection.release();
  }
}

// If run directly (for testing or cron)
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Check all wallets
    checkAllWallets()
      .then(result => {
        console.log('Deposit detection complete:', result);
        process.exit(0);
      })
      .catch(error => {
        console.error('Error:', error);
        process.exit(1);
      });
  } else if (args[0] === 'wallet' && args[1]) {
    // Check specific wallet
    detectDepositsForWallet(parseInt(args[1]))
      .then(result => {
        console.log('Wallet check complete:', result);
        process.exit(0);
      })
      .catch(error => {
        console.error('Error:', error);
        process.exit(1);
      });
  } else {
    console.log('Usage:');
    console.log('  node detectDeposits.js              # Check all wallets');
    console.log('  node detectDeposits.js wallet <id>  # Check specific wallet');
    process.exit(1);
  }
}

module.exports = {
  processDeposit,
  detectDepositsForWallet,
  processWebhook,
  checkAllWallets
};

