import { defineConfig } from 'vitest/config';

// Password hashing (scrypt) is deliberately slow; give tests room on a busy machine.
export default defineConfig({ test: { testTimeout: 20_000 } });
