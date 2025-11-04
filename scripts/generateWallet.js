/**
 * Generate Crypto Wallet Script
 * Called via API endpoint to generate unique wallets for users
 */

const pool = require('../config/database');
const { generateWallet } = require('../utils/walletGenerators');
const { encryptForStorage } = require('../utils/encryption');

/**
 * Generate wallet for user
 */
async function generateUserWallet(userId, chain, token) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Check if wallet already exists
    const [existing] = await connection.execute(
      'SELECT id FROM crypto_wallets WHERE user_id = ? AND chain = ? AND token = ?',
      [userId, chain, token]
    );
    
    if (existing.length > 0) {
      // Return existing wallet (address only, never private key)
      const [wallet] = await connection.execute(
        'SELECT id, address FROM crypto_wallets WHERE id = ?',
        [existing[0].id]
      );
      await connection.commit();
      return {
        wallet_id: wallet[0].id,
        address: wallet[0].address,
        chain: chain,
        token: token
      };
    }
    
    // Generate new wallet
    const walletData = generateWallet(chain);
    
    // Encrypt private key
    const encryptedPrivateKey = encryptForStorage(walletData.privateKey);
    
    // Store in database
    const [result] = await connection.execute(
      `INSERT INTO crypto_wallets 
       (user_id, chain, token, address, private_key_encrypted, public_key) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        chain,
        token,
        walletData.address,
        encryptedPrivateKey,
        walletData.publicKey || null
      ]
    );
    
    await connection.commit();
    
    // Return only address (NEVER return private key)
    return {
      wallet_id: result.insertId,
      address: walletData.address,
      chain: chain,
      token: token
    };
    
  } catch (error) {
    await connection.rollback();
    console.error('Error generating wallet:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// If run directly (for testing)
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.log('Usage: node generateWallet.js <userId> <chain> <token>');
    console.log('Example: node generateWallet.js 1 polygon USDC');
    process.exit(1);
  }
  
  generateUserWallet(parseInt(args[0]), args[1], args[2])
    .then(result => {
      console.log('Wallet generated:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}

module.exports = { generateUserWallet };

