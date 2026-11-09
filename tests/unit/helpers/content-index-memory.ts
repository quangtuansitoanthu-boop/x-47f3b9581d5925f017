import type { ContentRow } from '$lib/contracts/content-updates';
import type { ContentIndexSnapshot, IndexedContentItem, SavedContentItem } from '$lib/browser/offline-content-index';

export function contentIndexMemory() {
  let snapshot: ContentIndexSnapshot = { items: [], state: { key: 'state', revision: 0 } };
  return {
    reset() { snapshot = { items: [], state: { key: 'state', revision: 0 } }; },
    async readContentIndex() { return { items: [...snapshot.items], state: { ...snapshot.state } }; },
    async readIndexedContentItem(key: string) { return snapshot.items.find(item => item.itemKey === key) ?? null; },
    indexedItem(item: SavedContentItem, chapters: ContentRow[]) {
      return { ...item, itemKey: `${item.kind}:${item.row.id}`, chapterData: new Blob([JSON.stringify(chapters)], { type: 'application/json' }) };
    },
    async commitContentItem(item: Omit<IndexedContentItem, 'revision'>, expected: number) {
      const current = snapshot.items.find(value => value.itemKey === item.itemKey);
      if (current?.version === item.version) return;
      const incomingTime = Date.parse(String(item.row.updated_at ?? '')) || 0;
      const currentTime = Date.parse(String(current?.row.updated_at ?? '')) || 0;
      if ((incomingTime > 0 && currentTime > incomingTime) || ((current?.revision ?? 0) !== expected && incomingTime <= currentTime)) throw new Error('offline_content_index_commit_failed');
      const revision = ++snapshot.state.revision;
      snapshot.items = [...snapshot.items.filter(value => value.itemKey !== item.itemKey), { ...item, revision }];
    },
    async importLegacyContent(items: Omit<IndexedContentItem, 'revision'>[], fingerprint: string) {
      if (snapshot.state.legacyFingerprint === fingerprint) return;
      const revision = ++snapshot.state.revision;
      for (const item of items) {
        const current = snapshot.items.find(value => value.itemKey === item.itemKey);
        if (!current || (current.version !== item.version && Date.parse(String(item.row.updated_at)) > Date.parse(String(current.row.updated_at)))) {
          snapshot.items = [...snapshot.items.filter(value => value.itemKey !== item.itemKey), { ...item, revision }];
        }
      }
      snapshot.state.legacyFingerprint = fingerprint;
    },
  };
}
