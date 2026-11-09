/** Only origins that serve the API directly may own native session cookies. */
export const NATIVE_BACKEND_STORAGE_KEY = 'quangtu_active_url';
export const NATIVE_BACKEND_ORIGINS = [
  'https://quangtu-web.quangtu-ansitoanthu.workers.dev',
  'https://quangtu.vn',
] as const;

export function normalizeNativeBackendOrigin(saved: string | null): string {
  const origin = String(saved ?? '').trim().replace(/\/+$/, '');
  // Vercel now returns 308, which Android's native POST transport does not follow.
  // Resolve the known retired alias before sending tokens or selecting a cookie jar.
  if (origin === 'https://quangtu.vercel.app') return 'https://quangtu.vn';
  return NATIVE_BACKEND_ORIGINS.find(candidate => candidate === origin) ?? NATIVE_BACKEND_ORIGINS[0];
}
