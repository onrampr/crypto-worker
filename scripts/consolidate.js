/**
 * Consolidation Script
 * Consolidates funds from user wallets to master wallets
 * Can be run as a cron job or manually
 */

const pool = require('../config/database');
const { decryptFromStorage } = require('../utils/encryption');
const { ethers } = require('ethers');
const TronWeb = require('tronweb');
const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createTransferInstruction, getAccount } = require('@solana/spl-token');

/**
 * Get master wallet for chain/token
 */
async function getMasterWallet(chain, token) {
  const connection = await pool.getConnection();
  
  try {
    const [wallets] = await connection.execute(
      'SELECT * FROM master_wallets WHERE chain = ? AND token = ? AND is_active = 1',
      [chain, token]
    );
    
    if (wallets.length === 0) {
      throw new Error(`No master wallet configured for ${chain}/${token}`);
    }
    
    return wallets[0];
  } finally {
    connection.release();
  }
}

/**
 * Consolidate funds from EVM wallet (Polygon, BSC)
 */
async function consolidateEVM(fromWallet, masterWallet, amount, chain, token) {
  try {
    // Decrypt private keys
    const fromPrivateKey = decryptFromStorage(fromWallet.private_key_encrypted);
    const masterPrivateKey = decryptFromStorage(masterWallet.private_key_encrypted);
    
    if (!fromPrivateKey || !masterPrivateKey) {
      throw new Error('Failed to decrypt private keys');
    }
    
    // Get RPC URL (use Alchemy or public RPC)
    const rpcUrl = process.env[`${chain.toUpperCase()}_RPC_URL`] || 
                   (chain === 'polygon' ? 'https://polygon-rpc.com' : 'https://bsc-dataseed.binance.org/');
    
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const fromWalletSigner = new ethers.Wallet(fromPrivateKey, provider);
    
    // Get token contract address
    const tokenContractAddress = getTokenContractAddress(chain, token);
    if (!tokenContractAddress) {
      throw new Error(`Unsupported token ${token} on ${chain}`);
    }
    
    // Create token contract
    const abi = [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function balanceOf(address owner) view returns (uint256)',
      'function decimals() view returns (uint8)'
    ];
    
    const tokenContract = new ethers.Contract(tokenContractAddress, abi, fromWalletSigner);
    
    // Get balance and decimals
    const [balance, decimals] = await Promise.all([
      tokenContract.balanceOf(fromWallet.address),
      tokenContract.decimals()
    ]);
    
    // Calculate amount to transfer (use specified amount or full balance minus gas)
    const transferAmount = amount ? 
      ethers.parseUnits(amount.toString(), decimals) : 
      balance;
    
    // Estimate gas (approximate)
    const gasEstimate = await tokenContract.transfer.estimateGas(masterWallet.address, transferAmount);
    
    // Check if we have enough balance for gas
    const nativeBalance = await provider.getBalance(fromWallet.address);
    const gasPrice = await provider.getFeeData();
    const gasCost = gasEstimate * gasPrice.gasPrice;
    
    if (nativeBalance < gasCost) {
      throw new Error('Insufficient native token for gas');
    }
    
    // Execute transfer
    const tx = await tokenContract.transfer(masterWallet.address, transferAmount, {
      gasLimit: gasEstimate * BigInt(2) // Add 100% buffer
    });
    
    // Wait for confirmation
    const receipt = await tx.wait();
    
    return {
      success: true,
      txHash: receipt.hash,
      amount: ethers.formatUnits(transferAmount, decimals),
      blockNumber: receipt.blockNumber
    };
    
  } catch (error) {
    console.error(`Error consolidating ${chain} ${token}:`, error);
    throw error;
  }
}

/**
 * Consolidate funds from TRON wallet
 */
async function consolidateTron(fromWallet, masterWallet, amount, token) {
  try {
    // Decrypt private keys
    const fromPrivateKey = decryptFromStorage(fromWallet.private_key_encrypted);
    const masterPrivateKey = decryptFromStorage(masterWallet.private_key_encrypted);
    
    if (!fromPrivateKey || !masterPrivateKey) {
      throw new Error('Failed to decrypt private keys');
    }
    
    // Initialize TronWeb
    const tronWeb = new TronWeb({
      fullHost: 'https://api.trongrid.io'
    });
    
    // Set private key
    tronWeb.setPrivateKey(fromPrivateKey);
    
    // Get token contract address
    const tokenContractAddress = getTokenContractAddress('tron', token);
    if (!tokenContractAddress) {
      throw new Error(`Unsupported token ${token} on TRON`);
    }
    
    // Get contract instance
    const contract = await tronWeb.contract().at(tokenContractAddress);
    
    // Get balance
    const balance = await contract.balanceOf(fromWallet.address).call();
    const decimals = 6; // TRC20 tokens typically use 6 decimals
    
    // Calculate transfer amount
    const transferAmount = amount ? 
      Math.floor(parseFloat(amount) * Math.pow(10, decimals)) : 
      balance.toString();
    
    // Execute transfer
    const tx = await contract.transfer(masterWallet.address, transferAmount).send();
    
    return {
      success: true,
      txHash: tx,
      amount: (parseInt(transferAmount) / Math.pow(10, decimals)).toFixed(decimals),
      blockNumber: null // TRON doesn't use block numbers the same way
    };
    
  } catch (error) {
    console.error(`Error consolidating TRON ${token}:`, error);
    throw error;
  }
}

/**
 * Consolidate funds from Solana wallet
 */
async function consolidateSolana(fromWallet, masterWallet, amount, token) {
  try {
    // Decrypt private key
    const fromPrivateKey = decryptFromStorage(fromWallet.private_key_encrypted);
    
    if (!fromPrivateKey) {
      throw new Error('Failed to decrypt private key');
    }
    
    // Get RPC URL
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    
    // Create keypair from private key
    const keypair = Keypair.fromSecretKey(Buffer.from(fromPrivateKey, 'hex'));
    
    // Get token mint address
    const tokenMint = new PublicKey(getTokenContractAddress('solana', token));
    
    // Get associated token accounts
    const fromTokenAccount = await getAssociatedTokenAddress(tokenMint, keypair.publicKey);
    const toTokenAccount = await getAssociatedTokenAddress(tokenMint, new PublicKey(masterWallet.address));
    
    // Get balance
    try {
      const accountInfo = await getAccount(connection, fromTokenAccount);
      const balance = accountInfo.amount;
      
      // Calculate transfer amount (in smallest unit)
      const transferAmount = amount ? 
        BigInt(Math.floor(parseFloat(amount) * Math.pow(10, 6))) : 
        balance;
      
      // Create transfer instruction
      const transferInstruction = createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        keypair.publicKey,
        transferAmount
      );
      
      // Create transaction
      const transaction = new Transaction().add(transferInstruction);
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = keypair.publicKey;
      
      // Sign and send
      transaction.sign(keypair);
      const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);
      
      return {
        success: true,
        txHash: signature,
        amount: (Number(transferAmount) / Math.pow(10, 6)).toFixed(6),
        blockNumber: null
      };
      
    } catch (error) {
      if (error.message.includes('could not find account')) {
        throw new Error('No token balance to consolidate');
      }
      throw error;
    }
    
  } catch (error) {
    console.error(`Error consolidating Solana ${token}:`, error);
    throw error;
  }
}

/**
 * Get token contract address helper
 */
function getTokenContractAddress(chain, token) {
  const contracts = {
    polygon: {
      USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
    },
    bsc: {
      USDT: '0x55d398326f99059fF775485246999027B3197955',
      USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'
    },
    solana: {
      USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
    },
    tron: {
      USDT: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
    }
  };
  
  return contracts[chain.toLowerCase()]?.[token.toUpperCase()] || null;
}

/**
 * Consolidate funds from a user wallet
 */
async function consolidateWallet(walletId, amount = null) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Get wallet info
    const [wallets] = await connection.execute(
      'SELECT * FROM crypto_wallets WHERE id = ? AND is_active = 1',
      [walletId]
    );
    
    if (wallets.length === 0) {
      throw new Error(`Wallet ${walletId} not found or inactive`);
    }
    
    const wallet = wallets[0];
    const { chain, token } = wallet;
    
    // Get master wallet
    const masterWallet = await getMasterWallet(chain, token);
    
    // Create consolidation log entry
    const [logResult] = await connection.execute(
      `INSERT INTO consolidation_logs 
       (master_wallet_id, from_address, to_address, amount, status) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        masterWallet.id,
        wallet.address,
        masterWallet.address,
        amount || '0',
        'processing'
      ]
    );
    
    const logId = logResult.insertId;
    
    try {
      // Perform consolidation based on chain
      let result;
      switch (chain.toLowerCase()) {
        case 'polygon':
        case 'bsc':
          result = await consolidateEVM(wallet, masterWallet, amount, chain, token);
          break;
        case 'tron':
          result = await consolidateTron(wallet, masterWallet, amount, token);
          break;
        case 'solana':
          result = await consolidateSolana(wallet, masterWallet, amount, token);
          break;
        default:
          throw new Error(`Unsupported chain: ${chain}`);
      }
      
      // Update consolidation log
      await connection.execute(
        `UPDATE consolidation_logs 
         SET status = ?, tx_hash = ?, updated_at = NOW() 
         WHERE id = ?`,
        ['completed', result.txHash, logId]
      );
      
      // Update master wallet stats
      await connection.execute(
        `UPDATE master_wallets 
         SET total_consolidated = total_consolidated + ?, 
             last_consolidation = NOW() 
         WHERE id = ?`,
        [result.amount, masterWallet.id]
      );
      
      await connection.commit();
      
      return {
        success: true,
        logId: logId,
        txHash: result.txHash,
        amount: result.amount
      };
      
    } catch (error) {
      // Update log with error
      await connection.execute(
        `UPDATE consolidation_logs 
         SET status = ?, error_message = ?, updated_at = NOW() 
         WHERE id = ?`,
        ['failed', error.message, logId]
      );
      
      await connection.commit();
      throw error;
    }
    
  } catch (error) {
    await connection.rollback();
    console.error(`Error consolidating wallet ${walletId}:`, error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Consolidate all wallets with balance above threshold
 */
async function consolidateAll(threshold = 0) {
  const connection = await pool.getConnection();
  
  try {
    // Get all wallets with balance > threshold
    // Note: This assumes a balance column exists in crypto_wallets
    // If not, we'd need to check balances via API calls
    
    const [wallets] = await connection.execute(
      `SELECT cw.* FROM crypto_wallets cw
       WHERE cw.is_active = 1
       AND (
         SELECT COALESCE(SUM(cd.amount), 0) 
         FROM crypto_deposits cd 
         WHERE cd.wallet_id = cw.id AND cd.status = 'credited'
       ) > ?`,
      [threshold]
    );
    
    let processed = 0;
    let errors = 0;
    
    for (const wallet of wallets) {
      try {
        await consolidateWallet(wallet.id);
        processed++;
      } catch (error) {
        console.error(`Error consolidating wallet ${wallet.id}:`, error);
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
    // Consolidate all wallets
    consolidateAll(0)
      .then(result => {
        console.log('Consolidation complete:', result);
        process.exit(0);
      })
      .catch(error => {
        console.error('Error:', error);
        process.exit(1);
      });
  } else if (args[0] === 'wallet' && args[1]) {
    // Consolidate specific wallet
    const amount = args[2] ? parseFloat(args[2]) : null;
    consolidateWallet(parseInt(args[1]), amount)
      .then(result => {
        console.log('Wallet consolidation complete:', result);
        process.exit(0);
      })
      .catch(error => {
        console.error('Error:', error);
        process.exit(1);
      });
  } else {
    console.log('Usage:');
    console.log('  node consolidate.js                    # Consolidate all wallets');
    console.log('  node consolidate.js wallet <id>        # Consolidate specific wallet');
    console.log('  node consolidate.js wallet <id> <amt>   # Consolidate specific amount');
    process.exit(1);
  }
}

module.exports = {
  consolidateWallet,
  consolidateAll
};

