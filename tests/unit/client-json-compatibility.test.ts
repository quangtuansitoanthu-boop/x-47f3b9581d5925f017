import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/browser/ios-content-policy', () => ({
  isContentAvailable: () => false, blockedContentRequest: () => true,
  availableContent: <T>(value: T) => value,
}));
vi.mock('../../src/lib/browser/native-platform', () => ({ isNativeApp: () => true }));
vi.mock('../../src/lib/browser/admin-access', () => ({ blocksNativeAdminWrite: async () => true }));

import { fetchEnglishChapters } from '../../src/lib/browser/english-pack';
import { resolveOfflineBundledResponse } from '../../src/lib/browser/offline-bundled-resolver';
import { readUpdatedContentResponse } from '../../src/lib/browser/offline-content-packages';
import { fetchWithSessionRefresh } from '../../src/lib/browser/session-csrf';

afterEach(() => vi.restoreAllMocks());

it.each(['english', 'bundled', 'saved', 'native-write'])('keeps the %s refusal status and JSON body without Response.json static API', async kind => {
  vi.spyOn(Response, 'json').mockImplementation(() => { throw new TypeError('Response.json unavailable'); });
  const response = kind === 'english' ? await fetchEnglishChapters('/offline-data/chapters-en/blocked.json')
    : kind === 'bundled' ? await resolveOfflineBundledResponse('/api/articles/blocked')
    : kind === 'saved' ? await readUpdatedContentResponse(new URL('https://test/api/articles/blocked'))
    : await fetchWithSessionRefresh('/api/admin/settings', { method: 'POST' });
  expect(response?.status).toBe(kind === 'native-write' ? 403 : 404);
  expect(response?.headers.get('content-type')).toMatch(/^application\/json\b/u);
  expect(await response?.json()).toEqual(kind === 'native-write'
    ? { error: { code: 'native_admin_read_only', message: expect.any(String) } } : null);
});
