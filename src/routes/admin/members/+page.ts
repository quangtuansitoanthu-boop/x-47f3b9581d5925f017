import type { AdminMember } from '$lib/components/admin/members/admin-member-types';
import type { PageLoad } from './$types';
import { resolveApiUrl, isHtmlResponse } from '$lib/browser/native-api';

export const ssr = false;
export const prerender = false;

export const load: PageLoad = async ({ fetch }) => {
  try {
    const response = await fetch(resolveApiUrl('/api/admin/members'), {
      headers: { accept: 'application/json' },
      credentials: 'include',
    });
    if (response.ok && !isHtmlResponse(response)) {
      const payload = (await response.json()) as { members?: AdminMember[] };
      return { members: Array.isArray(payload.members) ? payload.members : [] };
    }
  } catch {}
  return { members: [] };
};
