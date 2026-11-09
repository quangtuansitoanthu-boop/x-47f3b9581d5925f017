import type { PageSessionDTO } from '$lib/server/auth/types';

let principalGeneration = 0;

export function announceOfflinePdfPrincipal(
  session: Pick<PageSessionDTO, 'authenticated' | 'user'>,
  target?: Pick<ServiceWorker, 'postMessage'> | null,
): number {
  principalGeneration += 1;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return principalGeneration;
  const worker = target ?? navigator.serviceWorker.controller;
  worker?.postMessage({
    type: 'OFFLINE_PDF_PRINCIPAL',
    generation: principalGeneration,
    principalId: session.authenticated && session.user?.id ? String(session.user.id) : 'anonymous',
  });
  return principalGeneration;
}
