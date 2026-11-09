import type { CloudflareEnvLike } from '../cloudflare-context';
import type { InternalSession } from '../auth/types';

export interface ApiLocals {
  env: CloudflareEnvLike | null;
  requestId: string;
  session: InternalSession | null;
  migrationSealed: boolean;
}

export interface EventLike {
  request: Request;
  url?: URL;
  params?: Record<string, string>;
  locals: Record<string, unknown>;
  platform?: {
    env?: CloudflareEnvLike;
    context?: unknown;
  } | null;
}

export const REQUIRED_SCHEMA_CAPABILITIES = Object.freeze([
  Object.freeze({ capability: 'user-activity-foundations-v1', minimumSchemaVersion: 17 }),
  Object.freeze({ capability: 'audio-library-and-speaker-v1', minimumSchemaVersion: 18 }),
  Object.freeze({ capability: 'facebook-import-v1', minimumSchemaVersion: 21 }),
  Object.freeze({ capability: 'practice-community-v1', minimumSchemaVersion: 20 }),
] as const);

interface SchemaCapabilityRow {
  capability?: unknown;
  schema_version?: unknown;
}

export function getApiLocals(event: EventLike): ApiLocals {
  return {
    env: (event.locals.env as CloudflareEnvLike | null | undefined) ?? event.platform?.env ?? null,
    requestId: String(event.locals.requestId || crypto.randomUUID()),
    session: (event.locals.session as InternalSession | null | undefined) ?? null,
    migrationSealed: event.locals.migrationSealed === true,
  };
}

let sealedMigrationCache = new WeakSet<CloudflareEnvLike['DB']>();
let pendingSealChecks = new WeakMap<CloudflareEnvLike['DB'], Promise<boolean>>();

export function resetMigrationSealedCache(): void {
  sealedMigrationCache = new WeakSet();
  pendingSealChecks = new WeakMap();
}

export async function migrationIsSealed(env: CloudflareEnvLike): Promise<boolean> {
  if ((env as unknown as Record<string, unknown>).MIGRATION_SEAL_REQUIRED === 'false') return true;
  const cache = sealedMigrationCache;
  const pending = pendingSealChecks;
  if (cache.has(env.DB)) return true;
  const existing = pending.get(env.DB);
  if (existing) return existing;
  const check = (async () => {
    const [sealedMigration, capabilityRows] = await Promise.all([
      env.DB.prepare('SELECT id FROM sealed_migration LIMIT 1').first(),
      env.DB.prepare(
        `SELECT capability, schema_version
         FROM app_schema_capabilities
         WHERE capability IN (${REQUIRED_SCHEMA_CAPABILITIES.map(() => '?').join(', ')})`,
      ).bind(...REQUIRED_SCHEMA_CAPABILITIES.map(({ capability }) => capability)).all<SchemaCapabilityRow>(),
    ]);
    if (!sealedMigration) return false;
    const verified = requiredSchemaCapabilitiesArePresent(capabilityRows.results ?? []);
    if (verified) cache.add(env.DB);
    return verified;
  })();
  pending.set(env.DB, check);
  try { return await check; }
  finally { if (pending.get(env.DB) === check) pending.delete(env.DB); }
}

function requiredSchemaCapabilitiesArePresent(rows: readonly SchemaCapabilityRow[]): boolean {
  if (rows.length !== REQUIRED_SCHEMA_CAPABILITIES.length) return false;
  const requirements = new Map<string, number>(
    REQUIRED_SCHEMA_CAPABILITIES.map(({ capability, minimumSchemaVersion }): [string, number] => (
      [capability, minimumSchemaVersion]
    )),
  );
  const seen = new Set<string>();

  for (const row of rows) {
    if (typeof row.capability !== 'string' || seen.has(row.capability)) return false;
    const minimumSchemaVersion = requirements.get(row.capability);
    const schemaVersion = Number(row.schema_version);
    if (
      minimumSchemaVersion === undefined
      || !Number.isSafeInteger(schemaVersion)
      || schemaVersion < minimumSchemaVersion
    ) return false;
    seen.add(row.capability);
  }

  return seen.size === requirements.size;
}
