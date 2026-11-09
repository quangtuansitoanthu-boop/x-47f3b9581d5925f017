import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireMemberAccess } from '$lib/browser/member-access';

afterEach(() => { vi.unstubAllGlobals(); });

describe('website member access', () => {
  it('allows authenticated use without prompting', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    expect(requireMemberAccess(true)).toBe(true);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('allows guests to access content normally without blocking or prompting', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    expect(requireMemberAccess(false)).toBe(true);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('works safely without browser globals', () => {
    vi.stubGlobal('window', undefined);
    expect(requireMemberAccess(false)).toBe(true);
  });
});
