import { purgeAlbumPlayEvents } from '../lib/server/services/album-plays';
import { createPresenceService } from '../lib/server/services/presence';
import { createMediaService } from '../lib/server/services/media';
import { createArticlesService } from '../lib/server/services/articles';
import type { CloudflareEnvLike } from '../lib/server/cloudflare-context';
import { runScheduledCleanup, type JobsEnvLike } from './cleanup-runner';
import { purgeExpiredAuthRecords } from '../lib/server/auth/auth-retention';
import { migrationIsSealed } from '../lib/server/http/runtime';
import {
  createFacebookIntegrationService,
  type FacebookImportSummary,
} from '../lib/server/services/facebook-integration';

interface ScheduledControllerLike {
  cron: string;
  scheduledTime: number;
}

interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

interface JobsWorkerEnv extends CloudflareEnvLike, JobsEnvLike {
  ENV?: string;
  JOBS_ENABLED?: string;
  WORKER_NAME?: string;
  CF_VERSION_METADATA?: { id?: string };
}

type CleanupDependencyFactory = (
  env: JobsWorkerEnv,
  eventId: string,
) => {
  purgeExpiredAuth(now: Date): Promise<{
    hasMore: boolean;
    oauthStatesPurged: number;
    rateLimitBucketsPurged: number;
    sessionsPurged: number;
  }>;
  drainArticleMediaCleanup(): Promise<{
    cleanupErrors: string[];
    failed: number;
    processed: number;
    retained: number;
    tombstoned: number;
  }>;
  purgeExpiredMedia(now: Date): Promise<{
    cleanupErrors: string[];
    failedUploadsPurged: number;
    purged: number;
  }>;
  purgeExpiredPresence(nowEpochMs: number): Promise<{ hasMore: boolean; purged: number }>;
};

type SchemaReadinessCheck = (env: JobsWorkerEnv) => Promise<boolean>;
type FacebookImportRunner = (env: JobsWorkerEnv, now: Date) => Promise<FacebookImportSummary>;

export function createJobsWorker(
  dependencyFactory: CleanupDependencyFactory = createCleanupDependencies,
  schemaIsReady: SchemaReadinessCheck = migrationIsSealed,
  facebookImportRunner: FacebookImportRunner = runFacebookImports,
) {
  return {
    async scheduled(controller: ScheduledControllerLike, env: JobsWorkerEnv, ctx: ExecutionContextLike): Promise<void> {
      const eventId = `jobs-${controller.cron}-${controller.scheduledTime}`;
      const schemaReady = await schemaIsReady(env);
      if (!schemaReady) {
        console.error(JSON.stringify({
          eventId,
          level: 'error',
          message: 'jobs-schema-not-ready',
          versionId: String(env.CF_VERSION_METADATA?.id || 'unknown'),
          workerName: String(env.WORKER_NAME || 'quangtu-jobs'),
        }));
        throw new Error(`jobs-schema-not-ready:${eventId}`);
      }
      const summary = await runScheduledCleanup(env, dependencyFactory(env, eventId), {
        eventId,
        now: new Date(controller.scheduledTime),
      });
      const facebook = summary.skipped
        ? { attempted: 0, imported: 0, updated: 0, detached: 0, removed: 0, skipped: true, errors: [] }
        : await facebookImportRunner(env, new Date(controller.scheduledTime)).catch((error: unknown) => ({
            attempted: 0,
            imported: 0,
            updated: 0,
            detached: 0,
            removed: 0,
            skipped: false,
            errors: [{ connectionId: 'runner', code: errorCode(error) }],
          }));
      const ok = summary.ok && facebook.errors.length === 0;

      ctx.waitUntil(Promise.resolve().then(() => {
        const evidence = {
          ...summary,
          facebook,
          ok,
          versionId: String(env.CF_VERSION_METADATA?.id || 'unknown'),
          workerName: String(env.WORKER_NAME || 'quangtu-jobs'),
        };
        if (summary.skipped) {
          console.info(JSON.stringify({ ...evidence, level: 'info', message: 'jobs-disabled' }));
          return;
        }
        if (ok) {
          console.info(JSON.stringify({ ...evidence, level: 'info', message: 'jobs-cleanup-complete' }));
          return;
        }
        console.error(JSON.stringify({ ...evidence, level: 'error', message: 'jobs-cleanup-partial-failure' }));
      }));

      if (!ok) {
        throw new Error(`jobs-cleanup-partial-failure:${summary.eventId}`);
      }
    },
  };
}

function runFacebookImports(env: JobsWorkerEnv, now: Date): Promise<FacebookImportSummary> {
  return createFacebookIntegrationService(env, { now: () => now }).syncDueConnections(now);
}

function errorCode(error: unknown): string {
  const candidate = error as { code?: unknown };
  return typeof candidate?.code === 'string' ? candidate.code.slice(0, 120) : 'facebook_import_failed';
}

function createCleanupDependencies(env: JobsWorkerEnv, eventId: string) {
    const articlesService = createArticlesService({
      env,
      principal: null,
      requestId: eventId,
    });
    const mediaService = createMediaService({
      env,
      principal: null,
      requestId: eventId,
    });
    const presenceService = createPresenceService({
      env,
      principal: null,
      requestId: eventId,
    });

    return {
      purgeExpiredAuth: (now) => purgeExpiredAuthRecords(env, now),
      drainArticleMediaCleanup: () => articlesService.drainMediaCleanupQueue(),
      purgeExpiredMedia: (now) => mediaService.purgeExpiredMedia(now),
      purgeExpiredPresence: async (nowEpochMs) => { await purgeAlbumPlayEvents(env, nowEpochMs); return presenceService.purgeExpired(nowEpochMs); },
    };
}

const worker = createJobsWorker();
export default worker;
