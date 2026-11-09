import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommunityModerationService } from '../../src/lib/server/services/community-moderation';

const principal = { appUserId: 'owner-a', userId: 'owner-a', role: 'user' as const };
const makeRepository = () => ({
  listComments: vi.fn().mockResolvedValue([]),
  createComment: vi.fn().mockResolvedValue({ id: 1, moderationStatus: 'pending' }),
  createComments: vi.fn().mockResolvedValue([]),
  getOwnProfile: vi.fn().mockResolvedValue(null),
  submitProfile: vi.fn().mockResolvedValue({ authorId: 'public-a', moderationStatus: 'pending', revision: 1 }),
  report: vi.fn().mockResolvedValue(true),
  block: vi.fn().mockResolvedValue(true),
  unblock: vi.fn().mockResolvedValue(true),
  listBlocks: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
});
let repository: ReturnType<typeof makeRepository>;
const service = (owner: typeof principal | null = principal) => createCommunityModerationService(
  { env: { DB: { prepare: vi.fn() } }, principal: owner } as never,
  { repository, createId: () => 'opaque-new-id', now: () => new Date('2026-11-04T00:00:00Z') },
);
beforeEach(() => { repository = makeRepository(); });

describe('community moderation boundaries', () => {
  it('uses one repository read with viewer scope and bounded pagination for public comments', async () => {
    await service().listComments('article-a', { after: 2, limit: 500 });
    expect(repository.listComments).toHaveBeenCalledExactlyOnceWith('article-a', 'owner-a', { after: 2, limit: 50 }, false, false);
    expect(repository.getOwnProfile).not.toHaveBeenCalled();
  });
  it('does not assign a guest the preceding account scope', async () => {
    await service(null).listComments('article-a');
    expect(repository.listComments).toHaveBeenCalledExactlyOnceWith('article-a', null, { after: null, limit: 50 }, false, false);
  });
  it('preserves the historical contact projection only for an admin caller', async () => {
    await service({ ...principal, role: 'admin' } as never).listComments('article-a');
    expect(repository.listComments).toHaveBeenCalledExactlyOnceWith('article-a', 'owner-a', { after: null, limit: 50 }, true, false);
  });
  it('requires the new explicit capability before returning private own pending state', async () => {
    await service().listComments('article-a', { includeOwn: true });
    expect(repository.listComments).toHaveBeenCalledExactlyOnceWith('article-a', 'owner-a', { after: null, limit: 50 }, false, true);
  });
  it.each([NaN, Infinity, 0, -1, 1.5])('rejects an invalid blocked-list limit %s before SQL', async limit => {
    await expect(service().listBlocks({ limit })).rejects.toMatchObject({ status: 400 });
    expect(repository.listBlocks).not.toHaveBeenCalled();
  });
  it('bounds an explicit blocked-list page to fifty rows in the current principal', async () => {
    await service().listBlocks({ limit: 1000 });
    expect(repository.listBlocks).toHaveBeenCalledExactlyOnceWith('owner-a', { after: null, limit: 50 });
  });
  it('submits a new comment through the pending-only owner without trusting client approval or identity', async () => {
    await service().submitComment('article-a', { noi_dung: 'A useful comment', moderationStatus: 'approved', authorId: 'other-owner', ten: 'Forged name' });
    expect(repository.createComment).toHaveBeenCalledExactlyOnceWith('owner-a', 'article-a', {
      content: 'A useful comment', parentId: null,
    }, 'opaque-new-id', '2026-11-04T00:00:00.000Z');
  });
  it('validates the entire legacy array before requesting an atomic pending batch', async () => {
    await expect(service().submitLegacyComments([
      { bai_viet_id: 'article-a', noi_dung: 'Valid' }, { bai_viet_id: 'article-a', noi_dung: '' },
    ])).rejects.toMatchObject({ status: 400 });
    expect(repository.createComments).not.toHaveBeenCalled();
    await service().submitLegacyComments([{ bai_viet_id: 'article-a', noi_dung: 'Valid', ten: 'Forged' }]);
    expect(repository.createComments).toHaveBeenCalledExactlyOnceWith('owner-a', [{ articleId: 'article-a', content: 'Valid', parentId: null }], 'opaque-new-id', '2026-11-04T00:00:00.000Z');
  });
  it.each([null, {}, { noi_dung: '' }, { noi_dung: '\u0000' }, { noi_dung: 'x'.repeat(5001) }, { noi_dung: 'Text', parent_id: -1 }])('rejects malformed comment %j before writing', async input => {
    await expect(service().submitComment('article-a', input)).rejects.toMatchObject({ status: 400 });
    expect(repository.createComment).not.toHaveBeenCalled();
  });
  it('does not allow anonymous submission or block/report writes', async () => {
    for (const action of [
      () => service(null).submitComment('article-a', { noi_dung: 'Text' }),
      () => service(null).report({ targetType: 'comment', targetId: '1', reason: 'spam' }),
      () => service(null).block('public-b'),
      () => service(null).submitOwnProfile(),
    ]) await expect(action()).rejects.toMatchObject({ status: 401 });
    expect(repository.createComment).not.toHaveBeenCalled();
    expect(repository.report).not.toHaveBeenCalled();
    expect(repository.block).not.toHaveBeenCalled();
  });
  it('acknowledges a report without returning moderator or author-private state', async () => {
    const input = { targetType: 'comment', targetId: '1', reason: 'harassment', details: '  Context  ' } as const;
    await expect(service().report(input)).resolves.toEqual({ reported: true });
    expect(repository.report).toHaveBeenCalledExactlyOnceWith('owner-a', { ...input, details: 'Context' }, 'opaque-new-id', '2026-11-04T00:00:00.000Z');
  });
  it.each([
    { targetType: 'account', targetId: '1', reason: 'spam' },
    { targetType: 'comment', targetId: '1', reason: 'unvalidated' },
    { targetType: 'profile', targetId: '', reason: 'other' },
    { targetType: 'profile', targetId: 'public-b', reason: 'other', details: 'x'.repeat(1001) },
  ])('rejects invalid report data before SQL %j', async input => {
    await expect(service().report(input)).rejects.toMatchObject({ status: 400 });
    expect(repository.report).not.toHaveBeenCalled();
  });
  it('does not acknowledge a missing or ineligible report target', async () => {
    repository.report.mockResolvedValue(false);
    await expect(service().report({ targetType: 'profile', targetId: 'private-b', reason: 'spam' })).rejects.toMatchObject({ status: 404 });
  });
  it('keeps block and unblock writes scoped to the authenticated principal and opaque target', async () => {
    await expect(service().block('public-b')).resolves.toEqual({ blocked: true });
    await expect(service().unblock('public-b')).resolves.toEqual({ blocked: false });
    expect(repository.block).toHaveBeenCalledExactlyOnceWith('owner-a', 'public-b', '2026-11-04T00:00:00.000Z');
    expect(repository.unblock).toHaveBeenCalledExactlyOnceWith('owner-a', 'public-b');
  });
  it('rejects an invalid or self-block target without acknowledging a block', async () => {
    repository.block.mockResolvedValue(false);
    await expect(service().block('public-a')).rejects.toMatchObject({ status: 404 });
  });
  it('submits only the server-owned current identity, without caller-controlled name or avatar', async () => {
    await expect(service().submitOwnProfile()).resolves.toEqual({ profile: { authorId: 'public-a', moderationStatus: 'pending', revision: 1 } });
    expect(repository.submitProfile).toHaveBeenCalledExactlyOnceWith('owner-a', 'opaque-new-id', '2026-11-04T00:00:00.000Z');
  });
});
