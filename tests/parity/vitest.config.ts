import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: './.cache/vitest-parity',
  plugins: [sveltekit()],
  test: {
    environment: 'node',
    include: ['tests/parity/**/*.test.ts'],
  },
});
