import type { PageLoad } from './$types';
import { resolveApiUrl, isHtmlResponse } from '$lib/browser/native-api';

export const ssr = false;
export const prerender = false;

export const load: PageLoad = async ({ fetch, url, parent }) => {
  const { session } = await parent();
  const selectedBookId = String(url.searchParams.get('book') ?? '').slice(0, 200);
  const requestedMode = url.searchParams.get('mode');
  const initialMode: 'import' | 'create' | null = requestedMode === 'import' || requestedMode === 'create' ? requestedMode : null;

  try {
    const response = await fetch(resolveApiUrl('/api/articles?select=*&order=created_at.desc'), {
      headers: { accept: 'application/json' },
      credentials: 'include',
    });
    if (response.ok && !isHtmlResponse(response)) {
      const books = await response.json();
      return { books, session, selectedBookId, initialMode };
    }
  } catch {}

  return { books: [], session, selectedBookId, initialMode };
};
