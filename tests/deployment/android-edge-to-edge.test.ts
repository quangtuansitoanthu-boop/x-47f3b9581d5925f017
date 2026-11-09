import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import config from '../../capacitor.config';

it('keeps Android native insets with all existing functional plugins and leaves iOS discovery unchanged', () => {
  expect(config.android?.adjustMarginsForEdgeToEdge).toBe('disable');
  expect(config.android?.includePlugins).toEqual([
    '@capacitor-community/apple-sign-in', '@capacitor-community/facebook-login',
    '@capacitor/app', '@capacitor/filesystem', '@capacitor/local-notifications',
    '@codetrix-studio/capacitor-google-auth',
  ]);
  expect(config.ios?.includePlugins).toBeUndefined();
  expect(config.includePlugins).toBeUndefined();
});

it('enables compatible edge-to-edge on both application windows before creating their content', () => {
  for (const name of ['MainActivity', 'StartupActivity']) {
    const java = readFileSync(`android/app/src/main/java/vn/quangtu/tutam/${name}.java`, 'utf8');
    expect(java.indexOf('EdgeToEdge.enable(this)')).toBeGreaterThan(0);
    expect(java.indexOf('EdgeToEdge.enable(this)')).toBeLessThan(java.indexOf('super.onCreate(savedInstanceState)'));
  }
  const main = readFileSync('android/app/src/main/java/vn/quangtu/tutam/MainActivity.java', 'utf8');
  expect(main).toContain('registerPlugin(AppSystemBarsPlugin.class)');
  expect(main).toContain('ViewCompat.setOnApplyWindowInsetsListener(webView');
  expect(main).toContain('WindowInsetsCompat.Type.ime()');
  expect(main).toContain('WindowInsetsCompat.Type.displayCutout()');
  expect(main).toContain('WindowInsetsCompat.CONSUMED');
});

it('styles system bar icons without directly using deprecated window color or overlay APIs', () => {
  const java = readFileSync('android/app/src/main/java/vn/quangtu/tutam/AppSystemBarsPlugin.java', 'utf8');
  expect(java).toContain('setAppearanceLightStatusBars(!dark)');
  expect(java).toContain('setAppearanceLightNavigationBars(!dark)');
  expect(java).not.toMatch(/setStatusBarColor|setNavigationBarColor|setSystemUiVisibility|setDecorFitsSystemWindows/u);
});
