const CryptoJS = require('crypto-js');

const SECRET_KEY = process.env.ENCRYPTION_KEY || 'smart-autofill-secret-key-2024-change-in-prod';

/**
 * Encrypt sensitive data
 */
function encrypt(data) {
  if (!data) return data;
  const str = typeof data === 'object' ? JSON.stringify(data) : String(data);
  return CryptoJS.AES.encrypt(str, SECRET_KEY).toString();
}

/**
 * Decrypt sensitive data
 */
function decrypt(encryptedData) {
  if (!encryptedData) return encryptedData;
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, SECRET_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  } catch (err) {
    console.error('Decryption error:', err);
    return null;
  }
}

/**
 * Encrypt sensitive fields in profile object
 * Fields: name, dob, address, phone, id_number, email
 */
function encryptProfile(profile) {
  const sensitiveFields = ['name', 'dob', 'address', 'phone', 'id_number', 'email', 'aadhaar', 'pan'];
  const encrypted = { ...profile };

  sensitiveFields.forEach(field => {
    if (encrypted[field]) {
      encrypted[field] = encrypt(encrypted[field]);
    }
  });

  encrypted._encrypted = true;
  return encrypted;
}

/**
 * Decrypt sensitive fields in profile object
 */
function decryptProfile(profile) {
  if (!profile || !profile._encrypted) return profile;

  const sensitiveFields = ['name', 'dob', 'address', 'phone', 'id_number', 'email', 'aadhaar', 'pan'];
  const decrypted = { ...profile };

  sensitiveFields.forEach(field => {
    if (decrypted[field]) {
      decrypted[field] = decrypt(decrypted[field]);
    }
  });

  delete decrypted._encrypted;
  return decrypted;
}

module.exports = { encrypt, decrypt, encryptProfile, decryptProfile };
