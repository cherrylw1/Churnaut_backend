import crypto from 'crypto';

// Dynamically derive a 32-byte key from the environment secret
const getEncryptionKey = (): Buffer => {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY environment variable is not defined.');
  }
  return crypto.createHash('sha256').update(secret).digest();
};

/**
 * Encrypts a plain text string using AES-256-GCM.
 * Returns the output formatted as: ivHex:authTagHex:cipherHex
 */
export function encrypt(text: string): string {
  if (!text) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // Standard IV size for GCM is 12 bytes
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a ciphertext string using AES-256-GCM or falls back to AES-256-CBC for legacy formats.
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';
  try {
    const parts = encryptedText.split(':');
    
    // GCM: ivHex:authTagHex:cipherHex (3 parts)
    if (parts.length === 3) {
      const ivHex = parts[0];
      const authTagHex = parts[1];
      const cipherHex = parts[2];
      
      const key = getEncryptionKey();
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
      
      let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
    
    // CBC (Legacy): ivHex:cipherHex (2 parts)
    if (parts.length === 2) {
      const ivHex = parts[0];
      const cipherHex = parts[1];
      
      const key = getEncryptionKey();
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      
      let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
    
    throw new Error('Invalid encrypted text format');
  } catch (err) {
    console.error('[Crypto Decryption Error] Failed to decrypt:', err);
    throw err;
  }
}
