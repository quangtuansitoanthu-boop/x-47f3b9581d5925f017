import { describe, expect, it } from 'vitest';
import { createSessionContentGuard } from '$lib/browser/session-content-guard';

const session = (id: string | null, role: 'guest' | 'user' | 'ctv' | 'admin') => id
  ? { authenticated: true, user: { id, role } }
  : { authenticated: false, user: null };

describe('session content guard', () => {
  it('rejects deferred privileged content after a principal or role transition', async () => {
    const guard = createSessionContentGuard(session('staff-a', 'ctv'));
    const token = guard.capture();
    let publish!: (value: string) => void;
    const response = new Promise<string>((resolve) => { publish = resolve; });
    let visible = 'review article';
    const pending = response.then((value) => {
      if (guard.isCurrent(token)) visible = value;
    });

    expect(guard.transition(session(null, 'guest'))).toBe(true);
    visible = '';
    publish('late private article');
    await pending;

    expect(visible).toBe('');
  });

  it('also invalidates same-role account switches but not credential refreshes', () => {
    const guard = createSessionContentGuard(session('staff-a', 'admin'));
    const token = guard.capture();
    expect(guard.transition(session('staff-a', 'admin'))).toBe(false);
    expect(guard.isCurrent(token)).toBe(true);
    expect(guard.transition(session('staff-b', 'admin'))).toBe(true);
    expect(guard.isCurrent(token)).toBe(false);
  });

  it('does not publish a deferred account-A delete into account B article state', async () => {
    const guard = createSessionContentGuard(session('staff-a', 'admin'));
    const token = guard.capture();
    let resolveDelete!: () => void;
    const response = new Promise<void>((resolve) => { resolveDelete = resolve; });
    let selectedArticle = 'shared-article';
    let notice = '';
    let invalidations = 0;
    const pending = response.then(() => {
      if (!guard.isCurrent(token)) return;
      selectedArticle = '';
      notice = 'Đã xóa';
      invalidations += 1;
    });

    expect(guard.transition(session('staff-b', 'admin'))).toBe(true);
    selectedArticle = 'shared-article';
    resolveDelete();
    await pending;

    expect(selectedArticle).toBe('shared-article');
    expect(notice).toBe('');
    expect(invalidations).toBe(0);
  });
});
