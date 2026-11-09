import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/migrate.ts', 'src/types/**'],
      reporter: ['text-summary', 'lcov', 'json-summary'],
      thresholds: { lines: 70, functions: 70, branches: 60, statements: 70 },
    },
  },
});
