import { defineConfig } from 'vitest/config';

// The web app under web/ has its own toolchain and test run; the root run covers the ledger flows only.
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], exclude: ['web/**', 'node_modules/**'] },
});
