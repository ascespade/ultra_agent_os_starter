const crypto = require('crypto');

class SecurityManager {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.secretKey = this.getOrCreateSecretKey();
    this.keyLength = 32; // 256 bits
    this.ivLength = 16; // 128 bits
    this.tagLength = 16; // 128 bits
  }

  getOrCreateSecretKey() {
    // Try to get from environment first
    if (process.env.ENCRYPTION_SECRET) {
      return Buffer.from(process.env.ENCRYPTION_SECRET, 'hex');
    }
    
    // Fallback to a generated key (should be persisted in production)
    const envFile = '.env.encryption';
    let secretKey;
    
    try {
      const fs = require('fs');
      if (fs.existsSync(envFile)) {
        secretKey = fs.readFileSync(envFile, 'hex');
      } else {
        secretKey = crypto.randomBytes(this.keyLength).toString('hex');
        fs.writeFileSync(envFile, secretKey, { mode: 0o600 }); // Read/write for owner only
        console.log('[SECURITY] Generated new encryption key');
      }
    } catch (error) {
      console.error('[SECURITY] Failed to handle encryption key:', error);
      // Last resort - generate in memory (not recommended for production)
      secretKey = crypto.randomBytes(this.keyLength).toString('hex');
    }
    
    return Buffer.from(secretKey, 'hex');
  }

  encrypt(text) {
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipher(this.algorithm, this.secretKey);
      cipher.setAAD(Buffer.from('ultra-agent-os')); // Additional authenticated data
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      // Combine IV + tag + encrypted data
      const combined = iv.toString('hex') + tag.toString('hex') + encrypted;
      
      return combined;
    } catch (error) {
      console.error('[SECURITY] Encryption failed:', error);
      throw new Error('Encryption failed');
    }
  }

  decrypt(encryptedData) {
    try {
      // Extract IV, tag, and encrypted data
      const iv = Buffer.from(encryptedData.slice(0, this.ivLength * 2), 'hex');
      const tag = Buffer.from(encryptedData.slice(this.ivLength * 2, (this.ivLength + this.tagLength) * 2), 'hex');
      const encrypted = encryptedData.slice((this.ivLength + this.tagLength) * 2);
      
      const decipher = crypto.createDecipher(this.algorithm, this.secretKey);
      decipher.setAAD(Buffer.from('ultra-agent-os'));
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('[SECURITY] Decryption failed:', error);
      throw new Error('Decryption failed');
    }
  }

  // Encrypt API keys in settings
  encryptSettings(settings) {
    const encryptedSettings = JSON.parse(JSON.stringify(settings)); // Deep clone
    
    // Encrypt sensitive fields
    if (encryptedSettings.llm) {
      if (encryptedSettings.llm.apiKey) {
        encryptedSettings.llm.apiKey = this.encrypt(encryptedSettings.llm.apiKey);
        encryptedSettings.llm.apiKeyEncrypted = true;
      }
      
      if (encryptedSettings.llm.provider === 'openai' && encryptedSettings.llm.apiKey) {
        encryptedSettings.llm.apiKey = this.encrypt(encryptedSettings.llm.apiKey);
        encryptedSettings.llm.apiKeyEncrypted = true;
      }
      
      if (encryptedSettings.llm.provider === 'gemini' && encryptedSettings.llm.apiKey) {
        encryptedSettings.llm.apiKey = this.encrypt(encryptedSettings.llm.apiKey);
        encryptedSettings.llm.apiKeyEncrypted = true;
      }
      
      if (encryptedSettings.llm.provider === 'claude' && encryptedSettings.llm.apiKey) {
        encryptedSettings.llm.apiKey = this.encrypt(encryptedSettings.llm.apiKey);
        encryptedSettings.llm.apiKeyEncrypted = true;
      }
    }
    
    return encryptedSettings;
  }

  // Decrypt API keys in settings
  decryptSettings(settings) {
    const decryptedSettings = JSON.parse(JSON.stringify(settings)); // Deep clone
    
    // Decrypt sensitive fields
    if (decryptedSettings.llm) {
      if (decryptedSettings.llm.apiKeyEncrypted && decryptedSettings.llm.apiKey) {
        try {
          decryptedSettings.llm.apiKey = this.decrypt(decryptedSettings.llm.apiKey);
          delete decryptedSettings.llm.apiKeyEncrypted;
        } catch (error) {
          console.error('[SECURITY] Failed to decrypt API key:', error);
          // Keep encrypted value if decryption fails
        }
      }
    }
    
    return decryptedSettings;
  }

  // Hash sensitive data for audit logs (one-way)
  hashForAudit(data) {
    return crypto.createHash('sha256')
      .update(data + process.env.JWT_SECRET + 'audit')
      .digest('hex');
  }

  // Generate secure random token
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  // Validate API key format without exposing the key
  validateApiKeyFormat(key, provider) {
    const patterns = {
      openai: /^sk-[a-zA-Z0-9]{48}$/,
      gemini: /^AIza[a-zA-Z0-9_-]{35}$/,
      claude: /^sk-ant-[a-zA-Z0-9_-]{95}$/
    };
    
    const pattern = patterns[provider];
    if (!pattern) return true; // No validation for unknown providers
    
    return pattern.test(key);
  }

  // Mask API key for display (show only first and last 4 characters)
  maskApiKey(key) {
    if (!key || key.length < 8) return '***';
    return key.substring(0, 4) + '***' + key.substring(key.length - 4);
  }
}

module.exports = SecurityManager;
