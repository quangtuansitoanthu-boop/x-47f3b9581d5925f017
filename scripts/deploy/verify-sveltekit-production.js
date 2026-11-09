import { verifySvelteKitRuntime } from './verify-sveltekit-runtime.js';

const baseUrl = new URL(process.argv[2] || 'https://quangtu.vn');

verifySvelteKitRuntime({
  baseUrl,
  expectedAppOrigin: baseUrl.origin,
  label: 'production',
}).then(() => {
  process.stdout.write('Production health, auth, download gate, presence, manifest and PWA checks passed.\n');
}).catch((error) => {
  process.stderr.write(`Production verification failed: ${error.message}\n`);
  process.exitCode = 1;
});
