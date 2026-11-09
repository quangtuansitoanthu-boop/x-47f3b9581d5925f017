import { refreshBrowserSession } from '$lib/stores/session.svelte';
import type { LayoutLoad } from './$types';

export const ssr = false;
export const prerender = false;

export const load: LayoutLoad = async () => {
  // On a direct visit the root store has not mounted yet. Resolve the cookie
  // session before the guard or child loaders capture an anonymous snapshot.
  const session = await refreshBrowserSession();
  return { session };
};
