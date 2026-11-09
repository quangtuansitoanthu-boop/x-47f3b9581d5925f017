import type { CloudflareEnvLike } from '../cloudflare-context';
import { ServerInputError } from '../errors';

export function publicPracticeCommunityEnabled(bindings: CloudflareEnvLike): boolean {
  return String(bindings.PRACTICE_COMMUNITY_ENABLED || '').trim().toLowerCase() === 'true';
}

export function requirePublicPracticeCommunity(bindings: CloudflareEnvLike): void {
  if (!publicPracticeCommunityEnabled(bindings)) {
    throw new ServerInputError(
      503,
      'practice_community_disabled',
      'Tính năng cộng đồng tu tập đang tạm dừng.',
    );
  }
}
