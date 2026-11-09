import type { CloudflareEnvLike, D1RunResult } from '../cloudflare-context';

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_MAX_BATCHES = 10;
const DEFAULT_MAX_DURATION_MS = 5_000;
const CONSUMED_OAUTH_RETENTION_MS = 60 * 60 * 1000;

export interface AuthRetentionSummary {
  hasMore: boolean;
  oauthStatesPurged: number;
  rateLimitBucketsPurged: number;
  sessionsPurged: number;
}

interface AuthRetentionOptions {
  batchSize?: number;
  maxBatches?: number;
  maxDurationMs?: number;
}

export async function purgeExpiredAuthRecords(
  env: CloudflareEnvLike,
  now: Date,
  options: AuthRetentionOptions = {},
): Promise<AuthRetentionSummary> {
  const batchSize = boundedInteger(options.batchSize, DEFAULT_BATCH_SIZE, DEFAULT_BATCH_SIZE);
  const maxBatches = boundedInteger(options.maxBatches, DEFAULT_MAX_BATCHES, DEFAULT_MAX_BATCHES);
  const maxDurationMs = boundedInteger(options.maxDurationMs, DEFAULT_MAX_DURATION_MS, DEFAULT_MAX_DURATION_MS);
  const startedAt = Date.now();
  const nowIso = now.toISOString();
  const consumedCutoffIso = new Date(now.getTime() - CONSUMED_OAUTH_RETENTION_MS).toISOString();
  let oauthStatesPurged = 0;
  let rateLimitBucketsPurged = 0;
  let sessionsPurged = 0;

  for (let batch = 0; batch < maxBatches && Date.now() - startedAt < maxDurationMs; batch += 1) {
    const results = await env.DB.batch([
      deleteByIndexedCutoff(env, 'oauth_states', 'state_hash', 'expires_at', nowIso, batchSize),
      deleteByIndexedCutoff(env, 'oauth_states', 'state_hash', 'consumed_at', consumedCutoffIso, batchSize),
      deleteByIndexedCutoff(env, 'auth_sessions', 'id', 'expires_at', nowIso, batchSize),
      deleteByIndexedCutoff(env, 'auth_sessions', 'id', 'revoked_at', nowIso, batchSize),
      deleteByIndexedCutoff(env, 'oauth_start_rate_limits', 'bucket', 'expires_at', nowIso, batchSize),
    ]);
    const changes = results.map(changedRows);
    oauthStatesPurged += changes[0] + changes[1];
    sessionsPurged += changes[2] + changes[3];
    rateLimitBucketsPurged += changes[4];
    if (changes.every((count) => count < batchSize)) break;
  }

  const backlog = await env.DB.batch([
    hasRowsBefore(env, 'oauth_states', 'expires_at', nowIso),
    hasRowsBefore(env, 'oauth_states', 'consumed_at', consumedCutoffIso),
    hasRowsBefore(env, 'auth_sessions', 'expires_at', nowIso),
    hasRowsBefore(env, 'auth_sessions', 'revoked_at', nowIso),
    hasRowsBefore(env, 'oauth_start_rate_limits', 'expires_at', nowIso),
  ]);
  return {
    hasMore: backlog.some((result) => Array.isArray(result.results) && result.results.length > 0),
    oauthStatesPurged,
    rateLimitBucketsPurged,
    sessionsPurged,
  };
}

function deleteByIndexedCutoff(
  env: CloudflareEnvLike,
  table: 'auth_sessions' | 'oauth_start_rate_limits' | 'oauth_states',
  primaryKey: 'bucket' | 'id' | 'state_hash',
  cutoffColumn: 'consumed_at' | 'expires_at' | 'revoked_at',
  cutoff: string,
  limit: number,
) {
  return env.DB.prepare(`
    DELETE FROM ${table}
    WHERE ${primaryKey} IN (
      SELECT ${primaryKey} FROM ${table}
      WHERE ${cutoffColumn} IS NOT NULL AND ${cutoffColumn} <= ?
      ORDER BY ${cutoffColumn} ASC
      LIMIT ?
    )
  `).bind(cutoff, limit);
}

function hasRowsBefore(
  env: CloudflareEnvLike,
  table: 'auth_sessions' | 'oauth_start_rate_limits' | 'oauth_states',
  cutoffColumn: 'consumed_at' | 'expires_at' | 'revoked_at',
  cutoff: string,
) {
  return env.DB.prepare(`
    SELECT 1 FROM ${table}
    WHERE ${cutoffColumn} IS NOT NULL AND ${cutoffColumn} <= ?
    LIMIT 1
  `).bind(cutoff);
}

function changedRows(result: D1RunResult | undefined): number {
  return Number(result?.meta?.changes || 0);
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) return fallback;
  return Math.min(Number(value), maximum);
}
