import { describe, expect, it } from 'vitest';

import {
  adoptAnonymousKeysForPrincipal,
  copyLegacyKeysToAnonymousNamespace,
  createPrincipalStorage,
} from '../../src/lib/browser/principal-storage';
import type { StorageLike } from '../../src/lib/browser/storage-contract';

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe('principal storage', () => {
  it('isolates keys for two authenticated users and anonymous data', () => {
    const storage = memoryStorage();
    const anonymous = createPrincipalStorage(storage, null);
    const userA = createPrincipalStorage(storage, 'user-a');
    const userB = createPrincipalStorage(storage, 'user-b');
    anonymous.setItem('bookmarks', 'guest');
    userA.setItem('bookmarks', 'a');
    userB.setItem('bookmarks', 'b');
    expect(anonymous.getItem('bookmarks')).toBe('guest');
    expect(userA.getItem('bookmarks')).toBe('a');
    expect(userB.getItem('bookmarks')).toBe('b');
  });

  it('copies legacy data to anonymous once and adopts only explicitly', () => {
    const storage = memoryStorage();
    storage.setItem('tutam_bookmarks_v1', '[1]');
    expect(copyLegacyKeysToAnonymousNamespace(storage, ['tutam_bookmarks_v1'])).toBe(1);
    expect(copyLegacyKeysToAnonymousNamespace(storage, ['tutam_bookmarks_v1'])).toBe(0);
    expect(createPrincipalStorage(storage, 'user-a').getItem('tutam_bookmarks_v1')).toBeNull();
    expect(adoptAnonymousKeysForPrincipal(storage, 'user-a', ['tutam_bookmarks_v1'])).toBe(1);
    expect(createPrincipalStorage(storage, 'user-a').getItem('tutam_bookmarks_v1')).toBe('[1]');
  });

  it('copies disjoint legacy key subsets independently regardless of caller order', () => {
    const storage = memoryStorage();
    storage.setItem('tutam_bookmarks_v1', '[{"id":"book"}]');
    storage.setItem('tutam_pt_state', '{"album":"talk"}');

    expect(copyLegacyKeysToAnonymousNamespace(storage, ['tutam_bookmarks_v1'])).toBe(1);
    expect(copyLegacyKeysToAnonymousNamespace(storage, ['tutam_pt_state'])).toBe(1);

    const anonymous = createPrincipalStorage(storage, null);
    expect(anonymous.getItem('tutam_bookmarks_v1')).toBe('[{"id":"book"}]');
    expect(anonymous.getItem('tutam_pt_state')).toBe('{"album":"talk"}');
    expect(copyLegacyKeysToAnonymousNamespace(storage, ['tutam_bookmarks_v1', 'tutam_pt_state'])).toBe(0);
  });

  it('does not resurrect a consumed legacy key while still migrating a newly seen key', () => {
    const storage = memoryStorage();
    storage.setItem('tutam_bookmarks_v1', '[{"id":"legacy-book"}]');
    storage.setItem('tutam_pt_state', '{"album":"legacy-talk"}');
    const anonymous = createPrincipalStorage(storage, null);

    expect(copyLegacyKeysToAnonymousNamespace(storage, ['tutam_bookmarks_v1'])).toBe(1);
    anonymous.removeItem?.('tutam_bookmarks_v1');
    expect(copyLegacyKeysToAnonymousNamespace(storage, ['tutam_bookmarks_v1'])).toBe(0);
    expect(anonymous.getItem('tutam_bookmarks_v1')).toBeNull();

    expect(copyLegacyKeysToAnonymousNamespace(storage, ['tutam_pt_state'])).toBe(1);
    expect(anonymous.getItem('tutam_pt_state')).toBe('{"album":"legacy-talk"}');
  });

  it.each(['explicit', 'prefix'] as const)('retries an unreadable %s legacy key without blocking other migrations', (mode) => {
    const storage = memoryStorage();
    const blockedKey = mode === 'explicit' ? 'tutam_thaptrai_collapsed_date' : 'tutam_pt_pos_blocked';
    const ledgerKey = 'quangtu_principal_v1:legacy-migrated-keys';
    storage.setItem(blockedKey, 'keep-legacy-value');
    storage.setItem('tutam_bookmarks_v1', '[1]');
    storage.setItem('tutam_pt_pos_readable', '{"position":12}');
    const read = storage.getItem;
    let blocked = true;
    storage.getItem = (key) => {
      if (blocked && key === blockedKey) throw new DOMException('Preference storage blocked', 'SecurityError');
      return read(key);
    };
    const keys = mode === 'explicit' ? [blockedKey, 'tutam_bookmarks_v1'] : ['tutam_bookmarks_v1'];
    const prefixes = ['tutam_pt_pos_'];
    const anonymous = createPrincipalStorage(storage, null);

    expect(copyLegacyKeysToAnonymousNamespace(storage, keys, prefixes)).toBe(2);
    expect(anonymous.getItem('tutam_bookmarks_v1')).toBe('[1]');
    expect(anonymous.getItem('tutam_pt_pos_readable')).toBe('{"position":12}');
    expect(anonymous.getItem(blockedKey)).toBeNull();
    expect(read(blockedKey)).toBe('keep-legacy-value');
    expect(JSON.parse(read(ledgerKey)!)).not.toContain(blockedKey);

    blocked = false;
    expect(copyLegacyKeysToAnonymousNamespace(storage, keys, prefixes)).toBe(1);
    expect(anonymous.getItem(blockedKey)).toBe('keep-legacy-value');
    expect(read(blockedKey)).toBe('keep-legacy-value');
    expect(JSON.parse(read(ledgerKey)!)).toContain(blockedKey);
    expect(copyLegacyKeysToAnonymousNamespace(storage, keys, prefixes)).toBe(0);
  });

  it('enumerates only keys visible to the selected principal', () => {
    const storage = memoryStorage();
    const userA = createPrincipalStorage(storage, 'user-a');
    const userB = createPrincipalStorage(storage, 'user-b');
    userA.setItem('position:1', 'a');
    userB.setItem('position:2', 'b');
    expect(userA.length).toBe(1);
    expect(userA.key?.(0)).toBe('position:1');
  });
});
