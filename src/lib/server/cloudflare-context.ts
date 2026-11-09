export type PrincipalRole = 'guest' | 'user' | 'ctv' | 'admin';

export interface AuthPrincipal {
  userId?: string | null;
  appUserId?: string | null;
  email?: string | null;
  displayName?: string | null;
  role?: PrincipalRole | null;
  csrfToken?: string | null;
}

export interface D1ResultRow {
  [key: string]: unknown;
}

export interface D1RunMeta {
  changes?: number;
}

export interface D1RunResult {
  success?: boolean;
  meta?: D1RunMeta;
  results?: D1ResultRow[];
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = D1ResultRow>(): Promise<T | null>;
  run(): Promise<D1RunResult>;
  all<T = D1ResultRow>(): Promise<{ results?: T[] }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1RunResult[]>;
}

export interface R2ObjectLike {
  size: number;
  httpEtag?: string;
  body?: ReadableStream<Uint8Array> | null;
  range?: { offset?: number; length?: number } | null;
  writeHttpMetadata(headers: Headers): void;
}

export interface R2PutOptionsLike {
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
  };
  customMetadata?: Record<string, string>;
  sha256?: ArrayBuffer;
}

export interface R2BucketLike {
  head(key: string): Promise<R2ObjectLike | null>;
  put(
    key: string,
    body: ReadableStream<Uint8Array>,
    options?: R2PutOptionsLike,
  ): Promise<{ size: number } | null>;
  get(
    key: string,
    options?: { range?: Headers },
  ): Promise<R2ObjectLike | null>;
  delete(key: string): Promise<void>;
}

export interface RateLimiterBinding {
  limit(input: { key: string }): Promise<{ success?: boolean }>;
}

export interface CloudflareEnvLike {
  GOOGLE_NATIVE_CLIENT_IDS?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  APPLE_TOKEN_ENCRYPTION_KEY?: string;
  APPLE_TOKEN_ENCRYPTION_KEY_PREVIOUS?: string;
  APPLE_TOKEN_KEY_VERSION?: string;
  APPLE_TOKEN_PREVIOUS_KEY_VERSION?: string;
  AUTH_RATE_LIMITER?: RateLimiterBinding;
  DB: D1DatabaseLike;
  MEDIA?: R2BucketLike;
  MEDIA_PUBLIC_BASE_URL?: string;
  APP_ORIGIN?: string;
  RATE_LIMIT_SALT?: string;
  PRESENCE_ENABLED?: string;
  AUTOMATIC_PRACTICE_ENABLED?: string;
  PRACTICE_COMMUNITY_ENABLED?: string;
  PRESENCE_RATE_LIMITER?: RateLimiterBinding;
  GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_DRIVE_ROOT_FOLDER_ID?: string;
  FACEBOOK_APP_ID?: string;
  FACEBOOK_APP_SECRET?: string;
  FACEBOOK_TOKEN_ENCRYPTION_KEY?: string;
  FACEBOOK_TOKEN_ENCRYPTION_KEY_PREVIOUS?: string;
  FACEBOOK_TOKEN_KEY_VERSION?: string;
  FACEBOOK_TOKEN_PREVIOUS_KEY_VERSION?: string;
  FACEBOOK_GRAPH_API_VERSION?: string;
  FACEBOOK_IMPORT_ENABLED?: string;
  FACEBOOK_IMPORT_SOURCE_URL?: string;
  FACEBOOK_IMPORT_MAX_PAGES?: string;
  FACEBOOK_RECONCILE_BATCH?: string;
}

export interface CloudflareRequestContext {
  env: CloudflareEnvLike;
  principal: AuthPrincipal | null;
  requestId: string;
}

export function principalRole(principal: AuthPrincipal | null | undefined): PrincipalRole {
  return principal?.role ?? 'guest';
}
