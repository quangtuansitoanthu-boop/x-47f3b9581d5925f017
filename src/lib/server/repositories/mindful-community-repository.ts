import type { CloudflareEnvLike, D1ResultRow } from '../cloudflare-context';
import { MINDFUL_REACTION_TEMPLATES, type MindfulPost, type MindfulPostDraft, type MindfulPostKind, type MindfulReactionResult } from '../../contracts/mindful-community';
import type { MindfulPostContext } from '../../contracts/mindful-notifications';

interface PostRow extends D1ResultRow {
  id: string; kind: MindfulPostKind; nickname: string; content: string; created_at: string;
  reaction_count: number; viewer_reacted: number; is_own: number; status: MindfulPost['status'];
}
interface PostContextRow extends PostRow {
  notification_id?: string | null;
  notification_nickname?: string;
  notification_template_id?: string;
  notification_created_at?: string;
}
export interface MindfulCursor { at: string; id: string }
export interface MindfulDateRange { start: string; end: string }
export interface ReactionRow extends D1ResultRow { nickname: string; template_id: string; created_at: string; cursor_id: string; kind: MindfulPostKind }
const postColumns = `p.id, p.kind, p.nickname, p.content, p.created_at, p.reaction_count, p.status,
  EXISTS (SELECT 1 FROM mindful_reactions r WHERE r.post_id = p.id AND r.owner_id = ?) AS viewer_reacted,
  CASE WHEN p.owner_id = ? THEN 1 ELSE 0 END AS is_own`;
const available = `p.status = 'published' AND EXISTS (SELECT 1 FROM app_users author WHERE author.id = p.owner_id AND author.status = 'active')
  AND NOT EXISTS (SELECT 1 FROM ugc_user_blocks block WHERE block.blocker_id = ? AND block.blocked_owner_id = p.owner_id)`;
export const mindfulPostDto = (row: PostRow): MindfulPost => ({
  id: row.id, kind: row.kind, nickname: row.nickname, content: row.content, createdAt: row.created_at,
  reactionCount: Number(row.reaction_count), viewerReacted: Boolean(row.viewer_reacted), isOwn: Boolean(row.is_own), status: row.status,
});

export function createMindfulCommunityRepository(env: CloudflareEnvLike) {
  return {
    async getOwned(ownerId: string, postId: string, reactionId: string | null = null): Promise<MindfulPostContext | null> {
      // Cold deep link lấy đúng tương tác bằng PK trong cùng query, không dò các trang.
      const row = await env.DB.prepare(`SELECT ${postColumns}${reactionId ? `,
          focus.id AS notification_id, focus.nickname AS notification_nickname,
          focus.template_id AS notification_template_id, focus.created_at AS notification_created_at` : ''}
        FROM mindful_posts p ${reactionId ? `
          LEFT JOIN mindful_reaction_inbox n ON n.reaction_id = ? AND n.recipient_id = ?
          LEFT JOIN mindful_reactions focus ON focus.id = n.reaction_id AND focus.post_id = p.id
            AND focus.owner_id <> p.owner_id
            AND EXISTS (SELECT 1 FROM app_users reactor WHERE reactor.id = focus.owner_id AND reactor.status = 'active')
            AND NOT EXISTS (SELECT 1 FROM ugc_user_blocks b WHERE b.blocker_id = p.owner_id AND b.blocked_owner_id = focus.owner_id)` : ''}
        WHERE p.id = ? AND p.owner_id = ? AND ${available}`)
        .bind(ownerId, ownerId, ...(reactionId ? [reactionId, ownerId] : []), postId, ownerId, ownerId).first<PostContextRow>();
      if (!row) return null;
      const result: MindfulPostContext = { post: mindfulPostDto(row) };
      if (reactionId) result.notification = row.notification_id ? {
        id: row.notification_id, postId: row.id, kind: row.kind,
        nickname: row.notification_nickname ?? '', templateId: row.notification_template_id ?? '',
        text: MINDFUL_REACTION_TEMPLATES[row.kind].find(template => template.id === row.notification_template_id)?.text ?? '',
        createdAt: row.notification_created_at ?? '',
      } : null;
      return result;
    },
    async list(viewerId: string | null, kind: MindfulPostKind, mine: boolean, cursor: MindfulCursor | null, range: MindfulDateRange | null = null) {
      // Own feed uses its owner/time index; public feed uses kind/status/time. No N+1 per card.
      const predicate = mine
        ? `p.owner_id = ? AND p.status <> 'removed'`
        : `p.kind = ? AND ${available}`;
      const binds = mine ? [viewerId] : [kind, viewerId];
      const rows = await env.DB.prepare(`SELECT ${postColumns} FROM mindful_posts p
        WHERE ${predicate} ${range ? 'AND p.created_at >= ? AND p.created_at < ?' : ''}
          ${cursor ? 'AND (p.created_at, p.id) < (?, ?)' : ''}
        ORDER BY p.created_at DESC, p.id DESC LIMIT 21`)
        .bind(viewerId, viewerId, ...binds, ...(range ? [range.start, range.end] : []), ...(cursor ? [cursor.at, cursor.id] : [])).all<PostRow>();
      return rows.results ?? [];
    },

    async create(ownerId: string, draft: MindfulPostDraft, id: string, now: string, dayStart: string, dayEnd: string) {
      const results = await env.DB.batch([
        env.DB.prepare(`INSERT INTO mindful_posts (id, owner_id, client_post_id, kind, nickname, content, created_at)
          SELECT ?, u.id, ?, ?, ?, ?, ? FROM app_users u
          WHERE u.id = ? AND u.status = 'active'
            AND (SELECT COUNT(*) FROM (SELECT 1 FROM mindful_posts daily
              WHERE daily.owner_id = u.id AND daily.created_at >= ? AND daily.created_at < ? LIMIT 2)) < 2
          ON CONFLICT(owner_id, client_post_id) DO NOTHING`)
          .bind(id, draft.clientPostId, draft.kind, draft.nickname, draft.content, now, ownerId, dayStart, dayEnd),
        env.DB.prepare(`SELECT ${postColumns} FROM mindful_posts p WHERE p.owner_id = ? AND p.client_post_id = ?`)
          .bind(ownerId, ownerId, ownerId, draft.clientPostId),
      ]);
      const row = results[1].results?.[0] as PostRow | undefined;
      return row ? mindfulPostDto(row) : null;
    },

    async react(ownerId: string, postId: string, templateId: string, nickname: string, now: string, reactionId: string): Promise<MindfulReactionResult | null> {
      const results = await env.DB.batch([
        env.DB.prepare(`INSERT INTO mindful_reactions (id, post_id, owner_id, template_id, nickname, created_at)
          SELECT ?, p.id, u.id, ?, ?, ? FROM mindful_posts p JOIN app_users u ON u.id = ? AND u.status = 'active'
          WHERE p.id = ? AND ${available}
            AND ((p.kind = 'repentance' AND ? IN ('tam-bao', 'bo-de', 'quan-am'))
              OR (p.kind = 'good_deed' AND ? IN ('hoan-hy', 'thien-can')))
          ON CONFLICT(post_id, owner_id) DO NOTHING`)
          .bind(reactionId, templateId, nickname, now, ownerId, postId, ownerId, templateId, templateId),
        // changes() refers to the immediately preceding statement in this atomic batch.
        env.DB.prepare(`UPDATE mindful_posts SET reaction_count = reaction_count + 1
          WHERE id = ? AND changes() = 1`).bind(postId),
        env.DB.prepare(`SELECT p.id AS postId, p.reaction_count AS reactionCount, r.template_id AS templateId
          FROM mindful_posts p JOIN mindful_reactions r ON r.post_id = p.id AND r.owner_id = ?
          WHERE p.id = ? AND ${available}`).bind(ownerId, postId, ownerId),
      ]);
      const row = results[2].results?.[0];
      return row ? { postId: String(row.postId), reactionCount: Number(row.reactionCount), viewerReacted: true,
        templateId: String(row.templateId) } : null;
    },

    async reactions(viewerId: string | null, postId: string, cursor: MindfulCursor | null) {
      const results = await env.DB.prepare(`SELECT r.nickname, r.template_id, r.created_at, r.id AS cursor_id, p.kind
        FROM mindful_reactions r JOIN mindful_posts p ON p.id = r.post_id
        JOIN app_users reactor ON reactor.id = r.owner_id AND reactor.status = 'active'
        WHERE r.post_id = ? AND ${available}
          AND NOT EXISTS (SELECT 1 FROM ugc_user_blocks block WHERE block.blocker_id = ? AND block.blocked_owner_id = r.owner_id)
          ${cursor ? 'AND (r.created_at, r.id) < (?, ?)' : ''}
        ORDER BY r.created_at DESC, r.id DESC LIMIT 21`)
        .bind(postId, viewerId, viewerId, ...(cursor ? [cursor.at, cursor.id] : [])).all<ReactionRow>();
      return results.results ?? [];
    },

    async remove(ownerId: string, postId: string, admin: boolean) {
      const result = await env.DB.prepare(`UPDATE mindful_posts SET status = 'removed', content = '', nickname = 'Đồng Tu'
        WHERE id = ? AND (owner_id = ? OR ? = 1)
          AND EXISTS (SELECT 1 FROM app_users actor WHERE actor.id = ? AND actor.status = 'active')
        RETURNING id`).bind(postId, ownerId, Number(admin), ownerId).first();
      return Boolean(result);
    },
  };
}
