/**
 * Client-Side AES-256-GCM Zero-Knowledge Encryption for Google Drive AppData
 * Key is derived from user's Google ID using PBKDF2 with 100,000 iterations of SHA-256.
 * Zero-knowledge: Google never sees plaintext or the key.
 */

const SALT_BYTES = new TextEncoder().encode('rentflow_appdata_gcm_salt_v2');

function getCrypto(): Crypto {
  if (typeof window !== 'undefined' && window.crypto) {
    return window.crypto;
  }
  return globalThis.crypto;
}

/**
 * Derives a 256-bit AES-GCM CryptoKey from the user's Google ID.
 */
async function deriveKey(googleId: string): Promise<CryptoKey> {
  const crypto = getCrypto();
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(googleId),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: SALT_BYTES,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Prepends the 12-byte IV to the ciphertext.
 */
export async function encryptWithGoogleId(plaintext: string, googleId: string): Promise<Uint8Array> {
  const crypto = getCrypto();
  const key = await deriveKey(googleId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    encoded
  );

  const ciphertextArray = new Uint8Array(ciphertextBuffer);
  const result = new Uint8Array(iv.length + ciphertextArray.length);
  result.set(iv, 0);
  result.set(ciphertextArray, iv.length);

  return result;
}

/**
 * Decrypts an encrypted payload (12-byte IV + ciphertext) using AES-256-GCM.
 */
export async function decryptWithGoogleId(encryptedPayload: Uint8Array, googleId: string): Promise<string> {
  if (encryptedPayload.length < 12) {
    throw new Error('Encrypted payload too short (missing 12-byte IV)');
  }

  const crypto = getCrypto();
  const key = await deriveKey(googleId);
  const iv = encryptedPayload.slice(0, 12);
  const ciphertext = encryptedPayload.slice(12);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decryptedBuffer);
}

/**
 * Helper: Convert Uint8Array to Base64 (isomorphic Node and Browser)
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Helper: Convert Base64 to Uint8Array (isomorphic Node and Browser)
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
