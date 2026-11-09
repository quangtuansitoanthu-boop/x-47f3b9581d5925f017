import type { AdminDashboardData } from '$lib/server/services/admin-dashboard';
import type { FacebookAdminData } from '$lib/server/services/facebook-integration';
import type { PageLoad } from './$types';
import { error, isHttpError } from '@sveltejs/kit';
import { resolveApiUrl, readApiJson } from '$lib/browser/native-api';
import { ADMIN_OVERVIEW_LOAD_MESSAGES as messages } from '$lib/i18n/admin-access';

export const ssr = false;
export const prerender = false;

export const load: PageLoad = async ({ fetch, parent }) => {
  const { session } = await parent();
  try {
    const [dashboardResponse, facebookResponse] = await Promise.all([
      fetch(resolveApiUrl('/api/admin/dashboard'), { headers: { accept: 'application/json' }, credentials: 'include' }),
      fetch(resolveApiUrl('/api/admin/facebook'), { headers: { accept: 'application/json' }, credentials: 'include' }),
    ]);
    for (const response of [dashboardResponse, facebookResponse]) {
      if (!response.ok) {
        const status = response.status === 401 || response.status === 403 ? response.status : 503;
        error(status, status === 401 ? messages.authenticationRequired : status === 403 ? messages.forbidden : messages.unavailable);
      }
    }
    const [dashboard, facebook] = await Promise.all([
      readApiJson<AdminDashboardData>(dashboardResponse, messages.unavailable),
      readApiJson<FacebookAdminData>(facebookResponse, messages.unavailable),
    ]);
    return { system: dashboard.system, facebook, ownerId: session.user?.id ?? '' };
  } catch (cause) {
    if (isHttpError(cause)) throw cause;
    error(503, messages.unavailable);
  }
};
