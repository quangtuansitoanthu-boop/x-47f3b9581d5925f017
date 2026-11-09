import type { LayoutLoad } from './$types';
import type { PageSessionDTO } from '$lib/server/auth/types';

export const ssr = import.meta.env.VITE_CAPACITOR_BUILD !== '1';
export const prerender = false;

export const load: LayoutLoad = async ({ data }) => {
  const session: PageSessionDTO = {
    authenticated: false,
    user: null,
    csrfToken: null,
    expiresAt: null,
  };
  return { session: data?.session ?? session, sessionVerified: data?.sessionVerified === true };
};
