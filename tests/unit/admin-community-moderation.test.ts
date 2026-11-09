import { describe, expect, it, vi } from 'vitest';
import { createAdminCommunityModerationService } from '../../src/lib/server/services/admin-community-moderation';

const repository = () => ({ listModerationQueue: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  moderate: vi.fn().mockResolvedValue(true) });
const service = (role: string | null = 'admin', repo = repository()) => createAdminCommunityModerationService({
  env: { DB: { prepare: vi.fn() } }, principal: role ? { appUserId: 'admin-a', role } : null,
} as never, { repository: repo as never, now: () => new Date('2026-11-04T00:00:00Z') });
describe('admin moderation authorization and stale-decision boundaries', () => {
  it.each([null, 'user', 'ctv'])('rejects queue reads and decisions for %s before SQL', async role => {
    const repo = repository();
    await expect(service(role, repo).list('comments')).rejects.toMatchObject({ status: role ? 403 : 401 });
    await expect(service(role, repo).decide('comments', '1', { action: 'approve', revision: 1 })).rejects.toMatchObject({ status: role ? 403 : 401 });
    expect(repo.listModerationQueue).not.toHaveBeenCalled(); expect(repo.moderate).not.toHaveBeenCalled();
  });
  it('passes a bounded admin queue and the current actor without fetching each row', async () => {
    const repo = repository();
    await expect(service('admin', repo).list('comments', { limit: 1000 })).resolves.toEqual({ items: [], nextCursor: null });
    expect(repo.listModerationQueue).toHaveBeenCalledExactlyOnceWith('comments', 'admin-a', { after: null, limit: 50 });
  });
  it.each([
    ['reports', { action: 'approve', revision: 1 }],
    ['comments', { action: 'resolve', revision: 1 }],
    ['profiles', { action: 'reject', revision: 1, reason: '' }],
    ['comments', { action: 'approve', revision: 0 }],
  ])('rejects incompatible action or missing explanation %s %j', async (kind, input) => {
    const repo = repository();
    await expect(service('admin', repo).decide(kind, '1', input)).rejects.toMatchObject({ status: 400 });
    expect(repo.moderate).not.toHaveBeenCalled();
  });
  it('uses optimistic revision and does not silently approve a replaced candidate', async () => {
    const repo = repository(); repo.moderate.mockResolvedValue(false);
    await expect(service('admin', repo).decide('profiles', 'public-a', { action: 'approve', revision: 1 })).rejects.toMatchObject({ status: 409 });
    expect(repo.moderate).toHaveBeenCalledExactlyOnceWith('profiles', 'public-a', { action: 'approve', revision: 1, reason: '' }, 'admin-a', '2026-11-04T00:00:00.000Z');
  });
  it.each([undefined, null, ''])('accepts the approved hide confirmation with optional reason %j', async reason => {
    const repo = repository();
    await expect(service('admin', repo).decide('comments', '1', { action: 'hide', revision: 1, reason })).resolves.toEqual({ updated: true });
    expect(repo.moderate).toHaveBeenCalledExactlyOnceWith('comments', '1', { action: 'hide', revision: 1, reason: '' }, 'admin-a', '2026-11-04T00:00:00.000Z');
  });
});
