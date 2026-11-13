import { describe, it, expect } from 'vitest';
import {
  encryptWithGoogleId,
  decryptWithGoogleId,
  uint8ArrayToBase64,
  base64ToUint8Array,
} from '../../src/lib/driveCrypto';

describe('Google ID-Derived AES-256-GCM Zero-Knowledge Encryption', () => {
  const googleId = '109283748192837482910';
  const sampleDatabasePayload = JSON.stringify({
    app: 'RentFlow',
    properties: [{ id: 'p1', name: 'Oakridge Townhomes', units_count: 8 }],
    tenants: [{ id: 't1', name: 'Eleanor Vance', rent_minor: 185000 }],
  });

  it('encrypts database payload with 12-byte IV prepended', async () => {
    const encrypted = await encryptWithGoogleId(sampleDatabasePayload, googleId);
    expect(encrypted.length).toBeGreaterThan(12);
    // Base64 conversion roundtrip
    const b64 = uint8ArrayToBase64(encrypted);
    expect(typeof b64).toBe('string');
    const restoredBytes = base64ToUint8Array(b64);
    expect(restoredBytes.length).toBe(encrypted.length);
  });

  it('decrypts encrypted payload cleanly with the correct Google ID', async () => {
    const encrypted = await encryptWithGoogleId(sampleDatabasePayload, googleId);
    const decrypted = await decryptWithGoogleId(encrypted, googleId);
    expect(decrypted).toBe(sampleDatabasePayload);

    const parsed = JSON.parse(decrypted);
    expect(parsed.app).toBe('RentFlow');
    expect(parsed.properties[0].name).toBe('Oakridge Townhomes');
  });

  it('fails decryption authentication if Google ID does not match (Zero-Knowledge)', async () => {
    const encrypted = await encryptWithGoogleId(sampleDatabasePayload, googleId);
    const wrongGoogleId = 'wrong_google_user_999999999';

    await expect(decryptWithGoogleId(encrypted, wrongGoogleId)).rejects.toThrow();
  });
});
