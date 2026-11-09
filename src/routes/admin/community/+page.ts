import type { AdminCommunityData } from '$lib/server/services/admin-community';
import type { PageLoad } from './$types';
import { error, isHttpError } from '@sveltejs/kit';
import { resolveApiUrl, readApiJson } from '$lib/browser/native-api';
import { ADMIN_OVERVIEW_LOAD_MESSAGES as messages } from '$lib/i18n/admin-access';

export const ssr = false;
export const prerender = false;

export const load: PageLoad = async ({ fetch, url }) => {
  const period = url.searchParams.get('period') || 'month';
  try {
    const response = await fetch(resolveApiUrl(`/api/admin/community?period=${encodeURIComponent(period)}`), {
      headers: { accept: 'application/json' },
      credentials: 'include',
    });
    if (!response.ok) {
      const status = response.status === 401 || response.status === 403 ? response.status : 503;
      error(status, status === 401 ? messages.authenticationRequired : status === 403 ? messages.forbidden : messages.unavailable);
    }
    return { community: await readApiJson<AdminCommunityData>(response, messages.unavailable) };
  } catch (cause) {
    if (isHttpError(cause)) throw cause;
    error(503, messages.unavailable);
  }
};
