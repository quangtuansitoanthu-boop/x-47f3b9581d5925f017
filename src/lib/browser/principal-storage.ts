import type { StorageLike } from './storage-contract';

const STORAGE_NAMESPACE_VERSION = 'quangtu_principal_v1';
const LEGACY_MIGRATION_LEDGER_KEY = `${STORAGE_NAMESPACE_VERSION}:legacy-migrated-keys`;
export const ANONYMOUS_STORAGE_PRINCIPAL = 'anonymous';

function normalizePrincipal(principalId: string | null | undefined): string {
  const value = String(principalId ?? '').trim();
  return value || ANONYMOUS_STORAGE_PRINCIPAL;
}

export function principalStoragePrefix(principalId: string | null | undefined): string {
  return `${STORAGE_NAMESPACE_VERSION}:${encodeURIComponent(normalizePrincipal(principalId))}:`;
}

export function principalStorageKey(principalId: string | null | undefined, key: string): string {
  return `${principalStoragePrefix(principalId)}${key}`;
}

export function createPrincipalStorage(
  storage: StorageLike,
  principalId: string | null | undefined,
): StorageLike {
  const prefix = principalStoragePrefix(principalId);
  const visibleKeys = () => {
    const keys: string[] = [];
    const total = storage.length ?? 0;
    for (let index = 0; index < total; index += 1) {
      const key = storage.key?.(index);
      if (key?.startsWith(prefix)) keys.push(key.slice(prefix.length));
    }
    return keys;
  };

  return {
    get length() {
      return visibleKeys().length;
    },
    getItem(key: string) {
      return storage.getItem(`${prefix}${key}`);
    },
    key(index: number) {
      return visibleKeys()[index] ?? null;
    },
    removeItem(key: string) {
      storage.removeItem?.(`${prefix}${key}`);
    },
    setItem(key: string, value: string) {
      storage.setItem(`${prefix}${key}`, value);
    },
  };
}

export function copyLegacyKeysToAnonymousNamespace(
  storage: StorageLike,
  keys: readonly string[],
  prefixes: readonly string[] = [],
): number {
  const anonymous = createPrincipalStorage(storage, ANONYMOUS_STORAGE_PRINCIPAL);
  const migrated = readLegacyMigrationLedger(storage);

  const copyOnce = (key: string, value: string | null): boolean => {
    if (value === null || migrated.has(key)) return false;
    const destinationExists = anonymous.getItem(key) !== null;
    if (!destinationExists) anonymous.setItem(key, value);
    try {
      migrated.add(key);
      storage.setItem(LEGACY_MIGRATION_LEDGER_KEY, JSON.stringify([...migrated].sort()));
    } catch (cause) {
      migrated.delete(key);
      if (!destinationExists) anonymous.removeItem?.(key);
      throw cause;
    }
    return !destinationExists;
  };

  let copied = 0;
  for (const key of keys) {
    let value: string | null;
    try { value = storage.getItem(key); }
    catch {
      // Chưa đọc được thì giữ nguyên nguồn và ledger để lần sau thử lại riêng khóa này.
      continue;
    }
    if (copyOnce(key, value)) copied += 1;
  }

  const total = storage.length ?? 0;
  const legacyKeys = Array.from({ length: total }, (_, index) => storage.key?.(index) ?? null)
    .filter((key): key is string => Boolean(key));
  for (const key of legacyKeys) {
    if (!prefixes.some((prefix) => key.startsWith(prefix))) continue;
    let value: string | null;
    try { value = storage.getItem(key); }
    catch {
      // Một khóa bị chặn không được ngăn di chuyển các khóa còn đọc được.
      continue;
    }
    if (copyOnce(key, value)) copied += 1;
  }
  return copied;
}

function readLegacyMigrationLedger(storage: StorageLike): Set<string> {
  try {
    const parsed = JSON.parse(storage.getItem(LEGACY_MIGRATION_LEDGER_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : []);
  } catch {
    return new Set();
  }
}

export function adoptAnonymousKeysForPrincipal(
  storage: StorageLike,
  principalId: string,
  keys: readonly string[],
  prefixes: readonly string[] = [],
): number {
  const source = createPrincipalStorage(storage, ANONYMOUS_STORAGE_PRINCIPAL);
  const target = createPrincipalStorage(storage, principalId);
  let adopted = 0;

  const candidateKeys = new Set(keys);
  const total = source.length ?? 0;
  for (let index = 0; index < total; index += 1) {
    const key = source.key?.(index);
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) candidateKeys.add(key);
  }

  for (const key of candidateKeys) {
    const value = source.getItem(key);
    if (value === null || target.getItem(key) !== null) continue;
    target.setItem(key, value);
    adopted += 1;
  }
  return adopted;
}
