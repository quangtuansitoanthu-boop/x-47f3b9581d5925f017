import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: './.cache/vitest-unit',
  plugins: [sveltekit()],
  resolve: {
    alias: {
      $lib: new URL('../../src/lib', import.meta.url).pathname
    }
  },
  test: {
    environment: 'node',
    testTimeout: 10000,
    include: ['tests/unit/**/*.test.ts', 'tests/component/**/*.test.ts']
  }
});
