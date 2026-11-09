import { describe, expect, it, vi } from 'vitest';

import { createJobsWorker } from './index';
import { jobsEnabled, runScheduledCleanup } from './cleanup-runner';

describe('jobs cleanup runner', () => {
  it('treats JOBS_ENABLED=false as a hard kill switch', async () => {
    const drainArticleMediaCleanup = vi.fn();
    const purgeExpiredAuth = vi.fn();
    const purgeExpiredMedia = vi.fn();
    const purgeExpiredPresence = vi.fn();

    const summary = await runScheduledCleanup(
      { ENV: 'staging', JOBS_ENABLED: 'false' },
      { drainArticleMediaCleanup, purgeExpiredAuth, purgeExpiredMedia, purgeExpiredPresence },
      { eventId: 'jobs-1', now: new Date('2026-07-31T00:00:00.000Z') },
    );

    expect(summary.skipped).toBe(true);
    expect(summary.ok).toBe(true);
    expect(drainArticleMediaCleanup).not.toHaveBeenCalled();
    expect(purgeExpiredAuth).not.toHaveBeenCalled();
    expect(purgeExpiredMedia).not.toHaveBeenCalled();
    expect(purgeExpiredPresence).not.toHaveBeenCalled();
  });

  it('aggregates bounded idempotent cleanup counts and preserves error ids', async () => {
    const summary = await runScheduledCleanup(
      { ENV: 'staging', JOBS_ENABLED: 'true' },
      {
        purgeExpiredAuth: async () => ({ hasMore: false, oauthStatesPurged: 2, rateLimitBucketsPurged: 1, sessionsPurged: 3 }),
        drainArticleMediaCleanup: async () => ({
          cleanupErrors: ['z-error', 'a-error'],
          failed: 2,
          processed: 4,
          retained: 1,
          tombstoned: 1,
        }),
        purgeExpiredMedia: async () => ({
          cleanupErrors: ['stale-poison'],
          failedUploadsPurged: 2,
          purged: 1,
        }),
        purgeExpiredPresence: async () => ({ hasMore: false, purged: 4 }),
      },
      { eventId: 'jobs-2', now: new Date('2026-07-31T00:00:00.000Z') },
    );

    expect(summary).toMatchObject({
      environment: 'staging',
      eventId: 'jobs-2',
      auth: { hasMore: false, oauthStatesPurged: 2, rateLimitBucketsPurged: 1, sessionsPurged: 3 },
      articles: {
        cleanupErrors: ['a-error', 'z-error'],
        failed: 2,
        processed: 4,
        retained: 1,
        tombstoned: 1,
      },
      media: {
        cleanupErrors: ['stale-poison'],
        failedUploadsPurged: 2,
        purged: 1,
      },
      ok: false,
      presence: { hasMore: false, purged: 4 },
      skipped: false,
    });
  });

  it('continues presence cleanup when media cleanup throws', async () => {
    const purgeExpiredPresence = vi.fn(async () => ({ hasMore: false, purged: 3 }));
    const summary = await runScheduledCleanup(
      { ENV: 'staging', JOBS_ENABLED: 'true' },
      {
        purgeExpiredAuth: async () => ({ hasMore: false, oauthStatesPurged: 0, rateLimitBucketsPurged: 0, sessionsPurged: 0 }),
        drainArticleMediaCleanup: async () => ({
          cleanupErrors: [],
          failed: 0,
          processed: 0,
          retained: 0,
          tombstoned: 0,
        }),
        purgeExpiredMedia: async () => { throw new Error('media-unavailable'); },
        purgeExpiredPresence,
      },
      { eventId: 'jobs-independent', now: new Date('2026-07-31T00:00:00.000Z') },
    );

    expect(purgeExpiredPresence).toHaveBeenCalledOnce();
    expect(summary).toMatchObject({
      errors: [{ domain: 'media', message: 'media-unavailable' }],
      ok: false,
      presence: { hasMore: false, purged: 3 },
    });
  });

  it('continues other cleanup domains when auth retention throws', async () => {
    const drainArticleMediaCleanup = vi.fn(async () => ({
      cleanupErrors: [],
      failed: 0,
      processed: 0,
      retained: 0,
      tombstoned: 0,
    }));
    const purgeExpiredMedia = vi.fn(async () => ({ cleanupErrors: [], failedUploadsPurged: 0, purged: 0 }));
    const purgeExpiredPresence = vi.fn(async () => ({ hasMore: false, purged: 0 }));
    const summary = await runScheduledCleanup(
      { ENV: 'production', JOBS_ENABLED: 'true' },
      {
        purgeExpiredAuth: async () => { throw new Error('auth-retention-unavailable'); },
        drainArticleMediaCleanup,
        purgeExpiredMedia,
        purgeExpiredPresence,
      },
      { eventId: 'jobs-auth-independent', now: new Date('2026-08-06T00:00:00.000Z') },
    );

    expect(drainArticleMediaCleanup).toHaveBeenCalledOnce();
    expect(purgeExpiredMedia).toHaveBeenCalledOnce();
    expect(purgeExpiredPresence).toHaveBeenCalledOnce();
    expect(summary).toMatchObject({
      errors: [{ domain: 'auth', message: 'auth-retention-unavailable' }],
      ok: false,
    });
  });

  it('throws from the scheduled entrypoint when cleanup remains partial', async () => {
    const waitUntil = vi.fn();
    const schemaIsReady = vi.fn(async () => true);
    const worker = createJobsWorker(
      () => ({
        purgeExpiredAuth: async () => ({ hasMore: false, oauthStatesPurged: 0, rateLimitBucketsPurged: 0, sessionsPurged: 0 }),
        drainArticleMediaCleanup: async () => ({
          cleanupErrors: [],
          failed: 0,
          processed: 0,
          retained: 0,
          tombstoned: 0,
        }),
        purgeExpiredMedia: async () => ({
          cleanupErrors: ['stale-poison'],
          failedUploadsPurged: 2,
          purged: 1,
        }),
        purgeExpiredPresence: async () => ({ hasMore: false, purged: 4 }),
      }),
      schemaIsReady,
    );

    await expect(worker.scheduled(
      { cron: '17 3 * * *', scheduledTime: Date.parse('2026-07-31T03:17:00.000Z') },
      { ENV: 'staging', JOBS_ENABLED: 'true' } as never,
      { waitUntil },
    )).rejects.toThrow('jobs-cleanup-partial-failure');

    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(schemaIsReady).toHaveBeenCalledOnce();
  });

  it('fails closed before creating cleanup dependencies when the schema is not ready', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dependencyFactory = vi.fn();
    const schemaIsReady = vi.fn(async () => false);
    const waitUntil = vi.fn();
    const worker = createJobsWorker(dependencyFactory, schemaIsReady);

    await expect(worker.scheduled(
      { cron: '17 3 * * *', scheduledTime: 456 },
      {
        CF_VERSION_METADATA: { id: 'version-blocked' },
        ENV: 'production',
        JOBS_ENABLED: 'true',
        WORKER_NAME: 'quangtu-jobs',
      } as never,
      { waitUntil },
    )).rejects.toThrow('jobs-schema-not-ready:jobs-17 3 * * *-456');

    expect(schemaIsReady).toHaveBeenCalledOnce();
    expect(dependencyFactory).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
    expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toMatchObject({
      eventId: 'jobs-17 3 * * *-456',
      message: 'jobs-schema-not-ready',
      versionId: 'version-blocked',
      workerName: 'quangtu-jobs',
    });
    error.mockRestore();
  });

  it('uses the shared schema gate and rejects duplicate capability rows', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dependencyFactory = vi.fn();
    const rows = [
      { capability: 'user-activity-foundations-v1', schema_version: 17 },
      { capability: 'audio-library-and-speaker-v1', schema_version: 18 },
      { capability: 'facebook-import-v1', schema_version: 21 },
      { capability: 'practice-community-v1', schema_version: 20 },
      { capability: 'audio-library-and-speaker-v1', schema_version: 19 },
    ];
    const worker = createJobsWorker(dependencyFactory);

    await expect(worker.scheduled(
      { cron: '17 3 * * *', scheduledTime: 457 },
      {
        DB: {
          prepare(sql: string) {
            if (sql.includes('sealed_migration')) {
              return { first: async () => ({ id: 'sealed' }) };
            }
            return {
              bind() {
                return {
                  all: async () => ({ results: rows }),
                  first: async () => ({ count: 3 }),
                };
              },
            };
          },
        },
        ENV: 'production',
        JOBS_ENABLED: 'true',
      } as never,
      { waitUntil: vi.fn() },
    )).rejects.toThrow('jobs-schema-not-ready:jobs-17 3 * * *-457');

    expect(dependencyFactory).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('does not starve media or presence when article cleanup throws', async () => {
    const purgeExpiredMedia = vi.fn(async () => ({
      cleanupErrors: [],
      failedUploadsPurged: 1,
      purged: 2,
    }));
    const purgeExpiredPresence = vi.fn(async () => ({ hasMore: false, purged: 3 }));
    const summary = await runScheduledCleanup(
      { ENV: 'staging', JOBS_ENABLED: 'true' },
      {
        purgeExpiredAuth: async () => ({ hasMore: false, oauthStatesPurged: 0, rateLimitBucketsPurged: 0, sessionsPurged: 0 }),
        drainArticleMediaCleanup: async () => { throw new Error('article-queue-unavailable'); },
        purgeExpiredMedia,
        purgeExpiredPresence,
      },
      { eventId: 'jobs-article-independent', now: new Date('2026-07-31T00:00:00.000Z') },
    );

    expect(purgeExpiredMedia).toHaveBeenCalledOnce();
    expect(purgeExpiredPresence).toHaveBeenCalledOnce();
    expect(summary).toMatchObject({
      errors: [{ domain: 'articles', message: 'article-queue-unavailable' }],
      media: { failedUploadsPurged: 1, purged: 2 },
      ok: false,
      presence: { hasMore: false, purged: 3 },
    });
  });

  it('fails the cleanup run while auth retention still has a backlog', async () => {
    const summary = await runScheduledCleanup(
      { ENV: 'production', JOBS_ENABLED: 'true' },
      {
        purgeExpiredAuth: async () => ({ hasMore: true, oauthStatesPurged: 5_000, rateLimitBucketsPurged: 0, sessionsPurged: 0 }),
        drainArticleMediaCleanup: async () => ({ cleanupErrors: [], failed: 0, processed: 0, retained: 0, tombstoned: 0 }),
        purgeExpiredMedia: async () => ({ cleanupErrors: [], failedUploadsPurged: 0, purged: 0 }),
        purgeExpiredPresence: async () => ({ hasMore: false, purged: 0 }),
      },
      { eventId: 'jobs-auth-backlog', now: new Date('2026-08-06T00:00:00.000Z') },
    );

    expect(summary.auth.hasMore).toBe(true);
    expect(summary.ok).toBe(false);
  });

  it('fails the cleanup run while presence analytics still has a backlog', async () => {
    const summary = await runScheduledCleanup(
      { ENV: 'production', JOBS_ENABLED: 'true' },
      {
        purgeExpiredAuth: async () => ({ hasMore: false, oauthStatesPurged: 0, rateLimitBucketsPurged: 0, sessionsPurged: 0 }),
        drainArticleMediaCleanup: async () => ({ cleanupErrors: [], failed: 0, processed: 0, retained: 0, tombstoned: 0 }),
        purgeExpiredMedia: async () => ({ cleanupErrors: [], failedUploadsPurged: 0, purged: 0 }),
        purgeExpiredPresence: async () => ({ hasMore: true, purged: 5_000 }),
      },
      { eventId: 'jobs-presence-backlog', now: new Date('2026-08-06T00:00:00.000Z') },
    );

    expect(summary.presence).toEqual({ hasMore: true, purged: 5_000 });
    expect(summary.ok).toBe(false);
  });

  it('fails closed unless JOBS_ENABLED is explicitly true', () => {
    expect(jobsEnabled(undefined)).toBe(false);
    expect(jobsEnabled('true')).toBe(true);
    expect(jobsEnabled('FALSE')).toBe(false);
  });

  it('emits verifier-ready cleanup evidence with Worker version provenance', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    let deferred: Promise<unknown> | undefined;
    const schemaIsReady = vi.fn(async () => true);
    const worker = createJobsWorker(
      () => ({
        purgeExpiredAuth: async () => ({ hasMore: false, oauthStatesPurged: 0, rateLimitBucketsPurged: 0, sessionsPurged: 0 }),
        drainArticleMediaCleanup: async () => ({ cleanupErrors: [], failed: 0, processed: 0, retained: 0, tombstoned: 0 }),
        purgeExpiredMedia: async () => ({ cleanupErrors: [], failedUploadsPurged: 0, purged: 0 }),
        purgeExpiredPresence: async () => ({ hasMore: false, purged: 0 }),
      }),
      schemaIsReady,
    );
    await worker.scheduled(
      { cron: '17 3 * * *', scheduledTime: 123 },
      {
        CF_VERSION_METADATA: { id: 'version-verified' },
        ENV: 'production',
        JOBS_ENABLED: 'true',
        WORKER_NAME: 'quangtu-jobs',
      } as never,
      { waitUntil: (promise) => { deferred = promise; } },
    );
    await deferred;
    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toMatchObject({
      eventId: 'jobs-17 3 * * *-123',
      message: 'jobs-cleanup-complete',
      ok: true,
      versionId: 'version-verified',
      workerName: 'quangtu-jobs',
    });
    expect(schemaIsReady).toHaveBeenCalledOnce();
    info.mockRestore();
  });

  it('runs Facebook imports after the schema gate without starving cleanup', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const drainArticleMediaCleanup = vi.fn(async () => ({ cleanupErrors: [], failed: 0, processed: 0, retained: 0, tombstoned: 0 }));
    const facebookImportRunner = vi.fn(async () => ({
      attempted: 1, imported: 2, updated: 0, detached: 0, removed: 0, skipped: false, errors: [],
    }));
    let deferred: Promise<unknown> | undefined;
    const worker = createJobsWorker(
      () => ({
        purgeExpiredAuth: async () => ({ hasMore: false, oauthStatesPurged: 0, rateLimitBucketsPurged: 0, sessionsPurged: 0 }),
        drainArticleMediaCleanup,
        purgeExpiredMedia: async () => ({ cleanupErrors: [], failedUploadsPurged: 0, purged: 0 }),
        purgeExpiredPresence: async () => ({ hasMore: false, purged: 0 }),
      }),
      async () => true,
      facebookImportRunner,
    );
    await worker.scheduled(
      { cron: '17 * * * *', scheduledTime: 789 },
      { ENV: 'production', JOBS_ENABLED: 'true' } as never,
      { waitUntil: (promise) => { deferred = promise; } },
    );
    await deferred;
    expect(drainArticleMediaCleanup).toHaveBeenCalledOnce();
    expect(facebookImportRunner).toHaveBeenCalledOnce();
    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toMatchObject({
      ok: true,
      facebook: { attempted: 1, imported: 2, errors: [] },
    });
    info.mockRestore();
  });

  it('surfaces Facebook import failure after cleanup completes', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const drainArticleMediaCleanup = vi.fn(async () => ({ cleanupErrors: [], failed: 0, processed: 0, retained: 0, tombstoned: 0 }));
    const worker = createJobsWorker(
      () => ({
        purgeExpiredAuth: async () => ({ hasMore: false, oauthStatesPurged: 0, rateLimitBucketsPurged: 0, sessionsPurged: 0 }),
        drainArticleMediaCleanup,
        purgeExpiredMedia: async () => ({ cleanupErrors: [], failedUploadsPurged: 0, purged: 0 }),
        purgeExpiredPresence: async () => ({ hasMore: false, purged: 0 }),
      }),
      async () => true,
      async () => { throw Object.assign(new Error('token leaked? no'), { code: 'reauthorization_required' }); },
    );
    await expect(worker.scheduled(
      { cron: '17 * * * *', scheduledTime: 790 },
      { ENV: 'production', JOBS_ENABLED: 'true' } as never,
      { waitUntil: () => undefined },
    )).rejects.toThrow('jobs-cleanup-partial-failure');
    expect(drainArticleMediaCleanup).toHaveBeenCalledOnce();
    expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toMatchObject({
      facebook: { errors: [{ connectionId: 'runner', code: 'reauthorization_required' }] },
    });
    expect(String(error.mock.calls[0]?.[0])).not.toContain('token leaked');
    error.mockRestore();
  });
});
