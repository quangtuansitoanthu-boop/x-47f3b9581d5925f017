import type { PageLoad } from './$types';
import { getBrowserSessionSnapshot } from '$lib/stores/session.svelte';

export const ssr = false;
export const prerender = false;

export const load: PageLoad = async () => {
  const session = getBrowserSessionSnapshot();
  return { session };
};
