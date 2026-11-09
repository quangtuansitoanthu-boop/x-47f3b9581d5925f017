import { verifySvelteKitRuntime } from './verify-sveltekit-runtime.js';

const baseUrl = new URL(process.argv[2] || 'https://staging.quangtu.vn');
const expectedAppOrigin = process.argv[3] || baseUrl.origin;

verifySvelteKitRuntime({
  baseUrl,
  expectedAppOrigin,
  label: 'staging',
}).then(() => {
  process.stdout.write('Staging health, auth, download gate, presence, manifest and PWA checks passed.\n');
}).catch((error) => {
  process.stderr.write(`Staging verification failed: ${error.message}\n`);
  process.exitCode = 1;
});
