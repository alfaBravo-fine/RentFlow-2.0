/**
 * Rule 10: Never upload plaintext to Drive. Always AES-256-GCM encrypted.
 * Uses Web Crypto API for secure browser/desktop encryption.
 */

export interface EncryptedPayload {
  version: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptData(plaintext: string, passphrase: string): Promise<EncryptedPayload> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveKey(passphrase, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );

  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join('');
  const ivHex = Array.from(iv).map((b) => b.toString(16).padStart(2, '0')).join('');
  const ciphertextBase64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));

  return {
    version: 1,
    salt: saltHex,
    iv: ivHex,
    ciphertext: ciphertextBase64,
  };
}

export async function decryptData(payload: EncryptedPayload, passphrase: string): Promise<string> {
  const saltBytes = new Uint8Array(payload.salt.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
  const ivBytes = new Uint8Array(payload.iv.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
  
  const binaryString = atob(payload.ciphertext);
  const ciphertextBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    ciphertextBytes[i] = binaryString.charCodeAt(i);
  }

  const key = await deriveKey(passphrase, saltBytes);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    ciphertextBytes
  );

  const dec = new TextDecoder();
  return dec.decode(decrypted);
}
