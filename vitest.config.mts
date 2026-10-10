import { defineConfig } from 'vitest/config';

// Convex function tests run in an edge-like runtime via convex-test.
export default defineConfig({
  test: {
    include: ['tests/convex/**/*.test.ts'],
    environment: 'edge-runtime',
    server: { deps: { inline: ['convex-test'] } },
  },
});
