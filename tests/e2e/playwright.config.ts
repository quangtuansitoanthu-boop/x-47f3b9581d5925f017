import { defineConfig } from '@playwright/test';

import { LEGACY_VISUAL_BASELINES } from '../../src/lib/contracts/legacy-compatibility';
import { LOCAL_ONLY_PROXY } from './global-network-guard';

const externalBaseUrl = process.env.SVELTEKIT_BASE_URL;
const baseURL = externalBaseUrl || 'http://localhost:8787';
const crossViewportTests = /(?:audio|mobile-layout|tracker-visual|visual-baseline)\.spec\.ts/;
const localOnly = process.env.TUTAM_E2E_LOCAL_ONLY === '1';

export default defineConfig({
  globalSetup: localOnly ? './global-network-guard.ts' : undefined,
  fullyParallel: false,
  reporter: 'line',
  retries: 0,
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  timeout: 30_000,
  workers: 1,
  webServer: externalBaseUrl ? undefined : {
    command: 'node start-local-runtime.mjs',
    reuseExistingServer: false,
    timeout: 120_000,
    url: `${baseURL}/api/health`,
  },
  use: {
    baseURL,
    ...(localOnly ? { proxy: LOCAL_ONLY_PROXY, launchOptions: { proxy: LOCAL_ONLY_PROXY } } : {}),
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: LEGACY_VISUAL_BASELINES.projects.map((project) => ({
    name: project.id,
    // Stateful API/PWA scenarios run once. Visual, responsive, and persistent
    // player contracts run across every production viewport/theme baseline.
    testMatch: project.id === 'desktop-1440-light' ? /.*\.spec\.ts/ : crossViewportTests,
    use: {
      colorScheme: project.colorScheme,
      storageState: project.colorScheme === 'dark' ? {
        cookies: [],
        origins: [{
          origin: baseURL,
          localStorage: [{ name: 'tutam_dark_mode', value: '1' }],
        }],
      } : undefined,
      viewport: project.viewport,
    },
  })),
});
