import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

describe('meditation fullscreen resilience and native status bar integration', () => {
  it('MeditationScreen.svelte uses the native-fullscreen abstraction with fallback support', () => {
    const code = readFileSync('src/lib/components/practice/meditation/MeditationScreen.svelte', 'utf8');
    expect(code).toContain("from '$lib/browser/native-fullscreen'");
    // Must not rely on raw screen?.requestFullscreen without fallback
    expect(code).not.toMatch(/else\s+if\s*\(\s*screen\?\.requestFullscreen\s*\)\s*\{\s*await\s+screen\.requestFullscreen\(\);\s*fullscreen\s*=\s*true;\s*\}\s*\}\s*catch\s*\{\s*fullscreen\s*=\s*false;\s*\}/);
  });

  it('setImmersiveFullscreen handles web and fallback when requestFullscreen throws or is unavailable', async () => {
    const { setImmersiveFullscreen } = await import('../../../src/lib/browser/native-fullscreen');
    
    // Simulate mobile environment where requestFullscreen throws or is undefined
    const mockElement = {} as HTMLElement;
    const result = await setImmersiveFullscreen(true, mockElement);
    expect(result).toBe(true);

    const exitResult = await setImmersiveFullscreen(false, mockElement);
    expect(exitResult).toBe(false);
  });
});
