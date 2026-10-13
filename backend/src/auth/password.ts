/**
 * Password Hashing & Verification Utilities.
 *
 * Uses native Node.js crypto (scrypt) with cryptographically secure random salt
 * and constant-time equality check (timingSafeEqual) to prevent timing attacks.
 * No external C++ or node-gyp dependencies.
 */

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const KEY_LEN = 64;
const SALT_BYTES = 16;

/**
 * Hash a plaintext password.
 * Format returned: `<salt_hex>:<hash_hex>`
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  return `${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

/**
 * Verify a plaintext password against a stored `<salt_hex>:<hash_hex>`.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || typeof storedHash !== 'string' || !storedHash.includes(':')) {
    return false;
  }

  const [saltHex, keyHex] = storedHash.split(':');
  if (!saltHex || !keyHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, 'hex');
  const storedKey = Buffer.from(keyHex, 'hex');

  const derivedKey = (await scryptAsync(password, salt, storedKey.length)) as Buffer;
  return timingSafeEqual(derivedKey, storedKey);
}
