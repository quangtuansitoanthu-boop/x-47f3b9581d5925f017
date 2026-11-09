import type { LayoutServerLoad } from './$types';
import { publicSession } from '$lib/server/auth/sessions';

const loadWebSession: LayoutServerLoad = ({ locals, setHeaders }) => {
  // Chỉ phiên riêng cấm cache; vỏ khách cần được service worker giữ lại cho offline.
  setHeaders({ 'cache-control': locals.session ? 'private, no-store' : 'no-cache' });
  return { session: publicSession(locals.session ?? null), sessionVerified: true };
};

// An undefined native load is omitted from the client manifest: the static SPA
// must never request a root __data.json from its local asset server.
export const load = import.meta.env.VITE_CAPACITOR_BUILD === '1' ? undefined : loadWebSession;
