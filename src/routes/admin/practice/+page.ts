import type { PracticeCampaignListData } from '$lib/browser/practice-community';
import type { PageLoad } from './$types';
import { resolveApiUrl, isHtmlResponse } from '$lib/browser/native-api';

export const ssr = false;
export const prerender = false;

export const load: PageLoad = async ({ fetch, parent }) => {
  const { session } = await parent();
  try {
    const response = await fetch(resolveApiUrl('/api/practice/campaigns?includeDrafts=1'), {
      headers: { accept: 'application/json' },
      credentials: 'include',
    });
    if (response.ok && !isHtmlResponse(response)) {
      const campaigns = (await response.json()) as PracticeCampaignListData;
      return {
        campaigns,
        userId: session.user?.id ?? '',
      };
    }
  } catch {}
  return {
    campaigns: { campaigns: [] } as PracticeCampaignListData,
    userId: session.user?.id ?? '',
  };
};
