import adapter from '@sveltejs/adapter-cloudflare';
import adapterStatic from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const { CLOUDFLARE_ENV: cloudflareEnvironment } = process.env;
const capacitorBuild = process.env.CAPACITOR_BUILD === '1';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: capacitorBuild
      ? adapterStatic({
        pages: 'build',
        assets: 'build',
        fallback: 'index.html',
        strict: false,
      })
      : adapter({
        config: 'wrangler.sveltekit.jsonc',
        platformProxy: {
          configPath: 'wrangler.sveltekit.jsonc',
          ...(cloudflareEnvironment ? { environment: cloudflareEnvironment } : {}),
        },
      }),
    alias: {
      $browser: 'src/lib/browser',
      $contracts: 'src/lib/contracts',
    },
    // Registration is handled by src/lib/browser/pwa-registration.ts so the
    // update banner and user-approved activation have one authoritative flow.
    serviceWorker: {
      register: false,
    },
  },
};

export default config;
