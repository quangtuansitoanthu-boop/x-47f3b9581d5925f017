import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: './wrangler.sveltekit.jsonc',
      },
      miniflare: {
        d1Databases: ['DB'],
        r2Buckets: ['MEDIA'],
      },
    }),
  ],
  test: {
    include: ['tests/worker/**/*.test.js'],
  },
});
