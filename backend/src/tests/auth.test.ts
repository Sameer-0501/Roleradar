/**
 * Authentication Unit Tests.
 *
 * Tests password hashing, JWT generation/verification, and auth endpoints/middleware.
 */

import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { generateToken, verifyToken } from '../auth/token.js';

describe('Authentication Foundation', () => {
  // ── Password Hashing ───────────────────────────────────────────────────────

  describe('Password hashing & verification', () => {
    it('hashes passwords with a unique salt each time', async () => {
      const hash1 = await hashPassword('SecretPassword123');
      const hash2 = await hashPassword('SecretPassword123');

      expect(hash1).not.toBe(hash2);
      expect(hash1).toContain(':');
      expect(hash2).toContain(':');
    });

    it('successfully verifies a correct password', async () => {
      const hash = await hashPassword('MySecurePass!99');
      const isValid = await verifyPassword('MySecurePass!99', hash);
      expect(isValid).toBe(true);
    });

    it('rejects an incorrect password', async () => {
      const hash = await hashPassword('CorrectPassword');
      const isValid = await verifyPassword('WrongPassword', hash);
      expect(isValid).toBe(false);
    });

    it('rejects malformed hashes gracefully', async () => {
      expect(await verifyPassword('test', '')).toBe(false);
      expect(await verifyPassword('test', 'invalid-format-no-colon')).toBe(false);
    });
  });

  // ── JWT Tokens ─────────────────────────────────────────────────────────────

  describe('JWT token utilities', () => {
    it('generates and verifies a valid token', () => {
      const payload = {
        userId: 'user-uuid-123',
        email: 'test@example.com',
        name: 'Test User',
      };

      const token = generateToken(payload, 3600);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);

      const decoded = verifyToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe('user-uuid-123');
      expect(decoded?.email).toBe('test@example.com');
      expect(decoded?.name).toBe('Test User');
    });

    it('rejects an expired token', async () => {
      const payload = {
        userId: 'user-uuid-123',
        email: 'test@example.com',
      };

      // Generate a token that expired 10 seconds ago
      const token = generateToken(payload, -10);
      const decoded = verifyToken(token);
      expect(decoded).toBeNull();
    });

    it('rejects a tampered token signature', () => {
      const payload = {
        userId: 'user-uuid-123',
        email: 'test@example.com',
      };

      const token = generateToken(payload, 3600);
      const parts = token.split('.');
      // Tamper payload
      const tampered = `${parts[0]}.${Buffer.from(JSON.stringify({ userId: 'hacker', email: 'hacker@evil.com' })).toString('base64')}.${parts[2]}`;

      const decoded = verifyToken(tampered);
      expect(decoded).toBeNull();
    });

    it('rejects malformed token strings', () => {
      expect(verifyToken('')).toBeNull();
      expect(verifyToken('not.a.valid.jwt.token')).toBeNull();
      expect(verifyToken('invalid')).toBeNull();
    });
  });
});
