/**
 * Vitest configuration for the backend.
 * Tests run in Node environment with ESM support.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    globals: false,
    // Each test file gets its own environment
    isolate: true,
    // Shorter timeout for unit tests
    testTimeout: 10_000,
    // Provide required env vars for tests so requireEnv('JWT_SECRET') does not throw.
    // This is a test-only non-secret string; it is NOT a production credential.
    env: {
      JWT_SECRET: 'vitest-test-signing-secret-not-for-production',
    },
  },
});
