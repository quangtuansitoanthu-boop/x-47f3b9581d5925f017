import { fetchAdminTalkAlbums } from '$lib/browser/content-catalogs';
import type { PageLoad } from './$types';

export const ssr = false;
export const prerender = false;

export const load: PageLoad = async ({ fetch, parent }) => {
  const { session } = await parent();
  try {
    const albums = await fetchAdminTalkAlbums(fetch);
    return {
      albums,
      role: session.user?.role === 'admin' ? ('admin' as const) : ('ctv' as const),
      userId: session.user?.id ?? '',
    };
  } catch {
    return {
      albums: [],
      role: session.user?.role === 'admin' ? ('admin' as const) : ('ctv' as const),
      userId: session.user?.id ?? '',
    };
  }
};
