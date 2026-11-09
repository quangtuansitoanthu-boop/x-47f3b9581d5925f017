import type { InternalSession } from './lib/server/auth/types';

declare global {
  type WorkerRateLimiter = {
    limit: (options: { key: string }) => Promise<{ success: boolean }>;
  };

  type WorkerAssetBinding = {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  };

  type WorkerExecutionContext = {
    waitUntil: (promise: Promise<unknown>) => void;
    passThroughOnException?: () => void;
  };

  type WorkerD1Binding = {
    prepare: (query: string) => unknown;
  };

  type WorkerR2Binding = {
    head: (key: string) => Promise<unknown>;
    get: (key: string) => Promise<unknown>;
    put: (key: string, value: BodyInit | null, options?: unknown) => Promise<unknown>;
    delete: (key: string) => Promise<void>;
  };

  namespace App {
    interface Locals {
      session: InternalSession | null;
    }

    interface Platform {
      context?: WorkerExecutionContext;
      env: {
        APP_ORIGIN: string;
        ASSETS: WorkerAssetBinding;
        AUTH_RATE_LIMITER?: WorkerRateLimiter;
        COMMENT_RATE_LIMITER?: WorkerRateLimiter;
        DB: WorkerD1Binding;
        ENVIRONMENT: 'local' | 'staging' | 'production' | string;
        GOOGLE_DRIVE_ROOT_FOLDER_ID?: string;
        GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?: string;
        MEDIA: WorkerR2Binding;
        MEDIA_PUBLIC_BASE_URL: string;
        MIGRATION_SEAL_REQUIRED?: string;
        PRESENCE_ENABLED?: string;
        PRESENCE_RATE_LIMITER?: WorkerRateLimiter;
        RATE_LIMIT_SALT?: string;
        UPLOAD_RATE_LIMITER?: WorkerRateLimiter;
        VIEW_RATE_LIMITER?: WorkerRateLimiter;
      };
    }
  }
}

export {};
