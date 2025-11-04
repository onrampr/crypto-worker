/**
 * Encryption Utilities for Private Keys
 * Uses AES-256-GCM encryption
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Master encryption key (should be stored securely, not in code)
// In production, load from secure environment variable or key management service
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a string (private key)
 */
function encrypt(text) {
  if (!text) return null;
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

/**
 * Decrypt an encrypted string
 */
function decrypt(encryptedData) {
  if (!encryptedData || !encryptedData.encrypted) return null;
  
  try {
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
}

/**
 * Encrypt and format for database storage
 */
function encryptForStorage(text) {
  const encrypted = encrypt(text);
  if (!encrypted) return null;
  
  // Store as JSON string in database
  return JSON.stringify(encrypted);
}

/**
 * Decrypt from database storage format
 */
function decryptFromStorage(encryptedString) {
  if (!encryptedString) return null;
  
  try {
    const encryptedData = JSON.parse(encryptedString);
    return decrypt(encryptedData);
  } catch (error) {
    console.error('Decrypt from storage error:', error);
    return null;
  }
}

module.exports = {
  encrypt,
  decrypt,
  encryptForStorage,
  decryptFromStorage
};

