import type { MindfulPostKind } from '../../contracts/mindful-community';
import type { CloudflareEnvLike, D1ResultRow } from '../cloudflare-context';
import type { MindfulCursor } from './mindful-community-repository';

export interface MindfulInboxRow extends D1ResultRow {
  cursor_id: string; created_at: string; visible: number;
  post_id: string; kind: MindfulPostKind; nickname: string; template_id: string;
}

export function createMindfulNotificationsRepository(env: CloudflareEnvLike) {
  return {
    async list(recipientId: string, cursor: MindfulCursor | null): Promise<MindfulInboxRow[]> {
      // Giới hạn candidate trước mọi JOIN/lọc: không quét lịch sử để lấp đầy trang.
      const rows = await env.DB.prepare(`WITH candidates AS MATERIALIZED (
        SELECT reaction_id, recipient_id, created_at FROM mindful_reaction_inbox
        WHERE recipient_id = ? ${cursor ? 'AND (created_at, reaction_id) < (?, ?)' : ''}
        ORDER BY created_at DESC, reaction_id DESC LIMIT 21
      )
      SELECT n.reaction_id AS cursor_id, n.created_at, p.id AS post_id, p.kind, r.nickname, r.template_id,
        CASE WHEN p.owner_id = n.recipient_id AND p.status = 'published'
          AND author.status = 'active' AND reactor.status = 'active' AND r.owner_id <> n.recipient_id
          AND NOT EXISTS (SELECT 1 FROM ugc_user_blocks b
            WHERE b.blocker_id = n.recipient_id AND b.blocked_owner_id = r.owner_id)
          THEN 1 ELSE 0 END AS visible
      FROM candidates n
      LEFT JOIN mindful_reactions r ON r.id = n.reaction_id
      LEFT JOIN mindful_posts p ON p.id = r.post_id
      LEFT JOIN app_users author ON author.id = p.owner_id
      LEFT JOIN app_users reactor ON reactor.id = r.owner_id
      ORDER BY n.created_at DESC, n.reaction_id DESC`)
        .bind(recipientId, ...(cursor ? [cursor.at, cursor.id] : [])).all<MindfulInboxRow>();
      return rows.results ?? [];
    },
  };
}
