/**
 * Wallet Generators for Different Blockchains
 * Uses ethers.js for EVM chains, tronweb for TRON, @solana/web3.js for Solana
 */

const { ethers } = require('ethers');
const TronWeb = require('tronweb');
const { Keypair } = require('@solana/web3.js');

/**
 * Generate wallet for EVM-compatible chains (Polygon, BSC)
 */
function generateEVMWallet(chain) {
  try {
    // Generate random wallet
    const wallet = ethers.Wallet.createRandom();
    
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
      publicKey: wallet.publicKey,
      chain: chain,
      mnemonic: wallet.mnemonic?.phrase || null
    };
  } catch (error) {
    console.error(`Error generating ${chain} wallet:`, error);
    throw error;
  }
}

/**
 * Generate wallet for TRON
 */
function generateTronWallet() {
  try {
    // Generate random account
    const account = TronWeb.utils.accounts.generateAccount();
    
    return {
      address: account.address.base58,
      privateKey: account.privateKey,
      publicKey: account.publicKey,
      chain: 'tron'
    };
  } catch (error) {
    console.error('Error generating TRON wallet:', error);
    throw error;
  }
}

/**
 * Generate wallet for Solana
 */
function generateSolanaWallet() {
  try {
    // Generate random keypair
    const keypair = Keypair.generate();
    
    return {
      address: keypair.publicKey.toBase58(),
      privateKey: Buffer.from(keypair.secretKey).toString('hex'),
      publicKey: keypair.publicKey.toBase58(),
      chain: 'solana'
    };
  } catch (error) {
    console.error('Error generating Solana wallet:', error);
    throw error;
  }
}

/**
 * Generate wallet based on chain
 */
function generateWallet(chain) {
  switch (chain.toLowerCase()) {
    case 'polygon':
    case 'bsc':
      return generateEVMWallet(chain);
    case 'tron':
      return generateTronWallet();
    case 'solana':
      return generateSolanaWallet();
    default:
      throw new Error(`Unsupported chain: ${chain}`);
  }
}

module.exports = {
  generateEVMWallet,
  generateTronWallet,
  generateSolanaWallet,
  generateWallet
};

