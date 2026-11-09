import { expect, it } from 'vitest';
import { runWrangler } from '../../scripts/deploy/release-preflight.js';

it('runs the installed Wrangler CLI without a Windows cmd shim or network access', async () => {
  const output = await runWrangler(['--version']);
  expect(output).toMatch(/\b4\.\d+\.\d+\b/);
}, 20_000);
