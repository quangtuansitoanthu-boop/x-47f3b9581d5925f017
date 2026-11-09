import { replaceEqualDeep } from '@tanstack/svelte-query';
import { getBrowserSessionSnapshot } from '$lib/stores/session.svelte';

interface Session { authenticated: boolean; user: { id: string; role?: string } | null; }
interface Album { id: string; tracks: readonly { url: string }[]; visibility?: string; }
interface Proof { identity: string; id: string; urls: string; visibility: string; }
const VERIFIED_CATALOG = Symbol('verified-talk-catalog');
type Verified = Album & { [VERIFIED_CATALOG]?: Proof };
const identity = (session: Session) => JSON.stringify([session.authenticated ? session.user?.id ?? null : null, session.user?.role ?? 'guest']);
const urls = (album: Album) => JSON.stringify(album.tracks.map(track => track.url));
function matching(album: Verified, proof: Proof | undefined): proof is Proof {
  return Boolean(proof && proof.id === album.id && proof.urls === urls(album) && proof.visibility === album.visibility);
}

/** Chỉ owner nhận catalog đã kiểm tra session được cấp dấu; JSON/cache không có dấu này. */
export function markVerifiedTalkCatalog<T extends Album>(album: T, session: Session): T {
  (album as Verified)[VERIFIED_CATALOG] = { identity: identity(session), id: album.id, urls: urls(album), visibility: album.visibility ?? '' };
  return album;
}
export function hasVerifiedTalkCatalog(album: Album, session: Session = getBrowserSessionSnapshot()): boolean {
  const proof = (album as Verified)[VERIFIED_CATALOG];
  return matching(album, proof) && proof.identity === identity(session);
}
export function copyVerifiedTalkCatalog<T extends Album>(target: T, source: Album, session: Session = getBrowserSessionSnapshot()): T {
  const proof = (source as Verified)[VERIFIED_CATALOG];
  if (matching(source, proof) && matching(target, proof) && proof.identity === identity(session)) (target as Verified)[VERIFIED_CATALOG] = proof;
  else delete (target as Verified)[VERIFIED_CATALOG];
  return target;
}
function isAlbum(value: unknown): value is Album {
  return Boolean(value && typeof value === 'object' && 'id' in value && typeof value.id === 'string'
    && 'tracks' in value && Array.isArray(value.tracks) && value.tracks.every(track => track && typeof track.url === 'string'));
}

/** Query-core chỉ chia sẻ Object.keys; phục hồi dấu mới mà vẫn giữ reference không đổi. */
export function shareVerifiedTalkCatalog(previous: unknown, next: unknown): unknown {
  const shared = replaceEqualDeep(previous, next);
  if (Array.isArray(shared) && Array.isArray(next)) {
    for (let index = 0; index < shared.length; index++) if (isAlbum(shared[index]) && isAlbum(next[index])) {
      copyVerifiedTalkCatalog(shared[index], next[index]);
    }
  }
  return shared;
}
