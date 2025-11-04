/**
 * Alchemy API Utilities
 * Handles interactions with Alchemy API for different blockchains
 */

const axios = require('axios');
const { ethers } = require('ethers');
const TronWeb = require('tronweb');
const { Connection, PublicKey } = require('@solana/web3.js');

/**
 * Get Alchemy API key from database
 */
async function getAlchemyApiKey(chain, pool) {
  try {
    const [rows] = await pool.execute(
      'SELECT api_key, api_key_encrypted FROM alchemy_settings WHERE chain = ? AND is_active = 1',
      [chain]
    );
    
    if (rows.length === 0) {
      throw new Error(`No Alchemy API key configured for ${chain}`);
    }
    
    // For now, assume api_key is stored directly (in production, decrypt api_key_encrypted)
    // TODO: Implement decryption if using encrypted API keys
    return rows[0].api_key || rows[0].api_key_encrypted;
  } catch (error) {
    console.error(`Error getting Alchemy API key for ${chain}:`, error);
    throw error;
  }
}

/**
 * Get Alchemy RPC URL based on chain
 */
function getAlchemyRpcUrl(chain, apiKey) {
  const baseUrls = {
    polygon: `https://polygon-mainnet.g.alchemy.com/v2/${apiKey}`,
    bsc: `https://bsc-mainnet.g.alchemy.com/v2/${apiKey}`, // Note: Alchemy may not support BSC directly
    solana: `https://solana-mainnet.g.alchemy.com/v2/${apiKey}`,
    // TRON is not supported by Alchemy, use TronGrid
    tron: null
  };
  
  return baseUrls[chain.toLowerCase()] || null;
}

/**
 * Get token contract address for chain/token pair
 */
function getTokenContractAddress(chain, token) {
  const contracts = {
    polygon: {
      USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // Polygon USDC
      USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'  // Polygon USDT
    },
    bsc: {
      USDT: '0x55d398326f99059fF775485246999027B3197955', // BSC USDT
      USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'  // BSC USDC
    },
    solana: {
      USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Solana USDC
      USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'  // Solana USDT
    },
    tron: {
      USDT: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' // TRON USDT (TRC20)
    }
  };
  
  return contracts[chain.toLowerCase()]?.[token.toUpperCase()] || null;
}

/**
 * Get token balance for EVM chains (Polygon, BSC)
 */
async function getEVMTokenBalance(chain, address, token, apiKey) {
  try {
    const rpcUrl = getAlchemyRpcUrl(chain, apiKey);
    if (!rpcUrl) {
      throw new Error(`Unsupported chain for Alchemy: ${chain}`);
    }
    
    const contractAddress = getTokenContractAddress(chain, token);
    if (!contractAddress) {
      throw new Error(`Unsupported token ${token} on ${chain}`);
    }
    
    // Create provider and contract
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const abi = [
      'function balanceOf(address owner) view returns (uint256)',
      'function decimals() view returns (uint8)'
    ];
    const contract = new ethers.Contract(contractAddress, abi, provider);
    
    // Get balance and decimals
    const [balance, decimals] = await Promise.all([
      contract.balanceOf(address),
      contract.decimals()
    ]);
    
    // Convert to readable format
    const balanceFormatted = ethers.formatUnits(balance, decimals);
    
    return {
      balance: balanceFormatted,
      balanceRaw: balance.toString(),
      decimals: decimals
    };
  } catch (error) {
    console.error(`Error getting ${token} balance on ${chain}:`, error);
    throw error;
  }
}

/**
 * Get token balance for Solana
 */
async function getSolanaTokenBalance(address, token, apiKey) {
  try {
    const rpcUrl = getAlchemyRpcUrl('solana', apiKey);
    if (!rpcUrl) {
      throw new Error('Solana RPC URL not configured');
    }
    
    const connection = new Connection(rpcUrl, 'confirmed');
    const tokenMint = getTokenContractAddress('solana', token);
    
    if (!tokenMint) {
      throw new Error(`Unsupported token ${token} on Solana`);
    }
    
    // Get token accounts for the address
    const publicKey = new PublicKey(address);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
      mint: new PublicKey(tokenMint)
    });
    
    // Sum up all token account balances
    let totalBalance = 0;
    for (const accountInfo of tokenAccounts.value) {
      const parsedInfo = accountInfo.account.data.parsed.info;
      totalBalance += parseFloat(parsedInfo.tokenAmount.uiAmount);
    }
    
    return {
      balance: totalBalance.toString(),
      balanceRaw: totalBalance.toString(),
      decimals: 6 // USDC/USDT on Solana typically use 6 decimals
    };
  } catch (error) {
    console.error(`Error getting ${token} balance on Solana:`, error);
    throw error;
  }
}

/**
 * Get token balance for TRON (using TronGrid, not Alchemy)
 */
async function getTronTokenBalance(address, token) {
  try {
    const contractAddress = getTokenContractAddress('tron', token);
    if (!contractAddress) {
      throw new Error(`Unsupported token ${token} on TRON`);
    }
    
    // Use TronWeb to get balance
    const tronWeb = new TronWeb({
      fullHost: 'https://api.trongrid.io'
    });
    
    // Get TRC20 token balance
    const contract = await tronWeb.contract().at(contractAddress);
    const balance = await contract.balanceOf(address).call();
    
    // TRC20 tokens typically have 6 decimals
    const decimals = 6;
    const balanceFormatted = (parseInt(balance.toString()) / Math.pow(10, decimals)).toFixed(decimals);
    
    return {
      balance: balanceFormatted,
      balanceRaw: balance.toString(),
      decimals: decimals
    };
  } catch (error) {
    console.error(`Error getting ${token} balance on TRON:`, error);
    throw error;
  }
}

/**
 * Get token balance for any chain
 */
async function getTokenBalance(chain, address, token, apiKey, pool) {
  switch (chain.toLowerCase()) {
    case 'polygon':
    case 'bsc':
      return await getEVMTokenBalance(chain, address, token, apiKey);
    case 'solana':
      return await getSolanaTokenBalance(address, token, apiKey);
    case 'tron':
      return await getTronTokenBalance(address, token);
    default:
      throw new Error(`Unsupported chain: ${chain}`);
  }
}

/**
 * Get recent transactions for an address (EVM chains)
 */
async function getEVMTransactions(chain, address, apiKey, fromBlock = 'latest') {
  try {
    const rpcUrl = getAlchemyRpcUrl(chain, apiKey);
    if (!rpcUrl) {
      throw new Error(`Unsupported chain for Alchemy: ${chain}`);
    }
    
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Get current block number
    const currentBlock = await provider.getBlockNumber();
    
    // Get transactions from last 1000 blocks (adjust as needed)
    const fromBlockNumber = fromBlock === 'latest' ? Math.max(0, currentBlock - 1000) : fromBlock;
    
    // Note: For production, use Alchemy's getAssetTransfers API for better transaction history
    // This is a simplified version
    const filter = {
      address: address,
      fromBlock: fromBlockNumber,
      toBlock: currentBlock
    };
    
    // Get logs for token transfers
    const logs = await provider.getLogs(filter);
    
    return logs;
  } catch (error) {
    console.error(`Error getting transactions for ${chain}:`, error);
    throw error;
  }
}

module.exports = {
  getAlchemyApiKey,
  getAlchemyRpcUrl,
  getTokenContractAddress,
  getTokenBalance,
  getEVMTokenBalance,
  getSolanaTokenBalance,
  getTronTokenBalance,
  getEVMTransactions
};

