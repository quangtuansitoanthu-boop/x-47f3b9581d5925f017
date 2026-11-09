import type { CloudflareEnvLike } from '../cloudflare-context';

export interface AuthCookiePolicy {
  name: string;
  secure: boolean;
}

export function resolveAuthCookiePolicy(
  env: CloudflareEnvLike,
  secureName: string,
  loopbackName: string,
): AuthCookiePolicy {
  const origin = parseOrigin(env.APP_ORIGIN);
  if (origin?.protocol === 'http:' && isLoopbackHost(origin.hostname)) {
    return { name: loopbackName, secure: false };
  }
  return { name: secureName, secure: true };
}

function parseOrigin(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]'
    || hostname === '::1';
}
