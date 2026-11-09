import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/state', () => ({
  page: {
    url: new URL('https://quangtu.vn/')
  }
}));

import Layout from '../../src/routes/+layout.svelte';

describe('master layout scaffold', () => {
  it('imports and renders during SSR without browser globals', () => {
    const source = readFileSync('src/routes/+layout.svelte', 'utf8');
    const { body, head } = render(Layout, {
      props: {},
    });

    expect(head).toContain('Tu tập cùng Quang Từ');
    expect(source).not.toContain('@fontsource/be-vietnam-pro');
    expect(source).not.toContain('@fontsource/lora');
    expect(head).not.toContain('fonts.googleapis.com');
    expect(head).not.toContain('fonts.gstatic.com');
    expect(body).toContain('data-layout-id="quangtu-master-layout"');
    expect(body).toContain('data-mounted="0"');
  });
});
