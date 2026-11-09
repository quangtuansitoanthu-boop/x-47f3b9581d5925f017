export interface JobsEnvLike {
  JOBS_ENABLED?: string;
  ENV?: string;
}

export interface CleanupDependencies {
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
}

export interface CleanupControl {
  eventId: string;
  now?: Date;
}

export interface CleanupSummary {
  auth: {
    hasMore: boolean;
    oauthStatesPurged: number;
    rateLimitBucketsPurged: number;
    sessionsPurged: number;
  };
  articles: {
    cleanupErrors: string[];
    failed: number;
    processed: number;
    retained: number;
    tombstoned: number;
  };
  environment: string;
  errors: Array<{ domain: 'articles' | 'auth' | 'media' | 'presence'; message: string }>;
  eventId: string;
  media: {
    cleanupErrors: string[];
    failedUploadsPurged: number;
    purged: number;
  };
  ok: boolean;
  presence: {
    hasMore: boolean;
    purged: number;
  };
  ranAt: string;
  skipped: boolean;
}

export async function runScheduledCleanup(
  env: JobsEnvLike,
  dependencies: CleanupDependencies,
  control: CleanupControl,
): Promise<CleanupSummary> {
  const now = control.now ?? new Date();
  const summary: CleanupSummary = {
    auth: {
      hasMore: false,
      oauthStatesPurged: 0,
      rateLimitBucketsPurged: 0,
      sessionsPurged: 0,
    },
    articles: {
      cleanupErrors: [],
      failed: 0,
      processed: 0,
      retained: 0,
      tombstoned: 0,
    },
    environment: String(env.ENV || 'unknown'),
    errors: [],
    eventId: control.eventId,
    media: {
      cleanupErrors: [],
      failedUploadsPurged: 0,
      purged: 0,
    },
    ok: true,
    presence: {
      hasMore: false,
      purged: 0,
    },
    ranAt: now.toISOString(),
    skipped: !jobsEnabled(env.JOBS_ENABLED),
  };

  if (summary.skipped) {
    return summary;
  }

  const [authResult, articleResult, mediaResult, presenceResult] = await Promise.allSettled([
    dependencies.purgeExpiredAuth(now),
    dependencies.drainArticleMediaCleanup(),
    dependencies.purgeExpiredMedia(now),
    dependencies.purgeExpiredPresence(now.getTime()),
  ]);
  if (authResult.status === 'fulfilled') {
    summary.auth = authResult.value;
  } else {
    summary.errors.push({ domain: 'auth', message: errorMessage(authResult.reason) });
  }
  if (articleResult.status === 'fulfilled') {
    summary.articles = {
      ...articleResult.value,
      cleanupErrors: [...articleResult.value.cleanupErrors].sort(),
    };
  } else {
    summary.errors.push({ domain: 'articles', message: errorMessage(articleResult.reason) });
  }
  if (mediaResult.status === 'fulfilled') {
    summary.media = {
      ...mediaResult.value,
      cleanupErrors: [...mediaResult.value.cleanupErrors].sort(),
    };
  } else {
    summary.errors.push({ domain: 'media', message: errorMessage(mediaResult.reason) });
  }
  if (presenceResult.status === 'fulfilled') {
    summary.presence = presenceResult.value;
  } else {
    summary.errors.push({ domain: 'presence', message: errorMessage(presenceResult.reason) });
  }
  summary.errors.sort((left, right) => left.domain.localeCompare(right.domain) || left.message.localeCompare(right.message));
  summary.ok = summary.errors.length === 0 &&
    !summary.auth.hasMore &&
    !summary.presence.hasMore &&
    summary.articles.cleanupErrors.length === 0 &&
    summary.media.cleanupErrors.length === 0;

  return summary;
}

export function jobsEnabled(value: string | undefined): boolean {
  return String(value || '').toLowerCase() === 'true';
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message.slice(0, 240) : String(value).slice(0, 240);
}
