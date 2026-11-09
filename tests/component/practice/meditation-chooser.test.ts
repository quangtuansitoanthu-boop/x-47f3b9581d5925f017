import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

describe('meditation chooser hydration', () => {
  it('keeps music and ambient download controls in valid server-rendered HTML', () => {
    const filename = 'src/lib/components/practice/dialog/MeditationChooser.svelte';
    const result = compile(readFileSync(filename, 'utf8'), { filename, generate: 'server' });
    expect(result.warnings.filter(warning => warning.code === 'node_invalid_placement_ssr')).toEqual([]);
  });
});
