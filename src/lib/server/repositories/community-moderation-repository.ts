import type { CloudflareEnvLike, D1ResultRow } from '../cloudflare-context';
import type { CommunityBlockedProfile, CommunityReportInput, ModeratedComment, OwnCommunityProfile, ModerationDecision, ModerationMember, ModerationQueueItem, ModerationQueueKind, ModerationQueuePage } from '../../contracts/community-moderation';
import { ServerInputError } from '../errors';

interface ProfileRow extends D1ResultRow {
  public_id: string; owner_id: string; submitted_display_name: string; submitted_avatar_url: string;
  approved_display_name: string | null; approved_avatar_url: string | null;
  moderation_status: OwnCommunityProfile['moderationStatus']; moderation_reason: string | null;
  revision: number; submitted_at: string;
}
const PROFILE_COLUMNS = 'public_id, owner_id, submitted_display_name, submitted_avatar_url, approved_display_name, approved_avatar_url, moderation_status, moderation_reason, revision, submitted_at';
const profileDto = (row: ProfileRow): OwnCommunityProfile => ({
  authorId: row.public_id,
  submitted: { displayName: row.submitted_display_name, avatarUrl: row.submitted_avatar_url },
  approved: row.approved_display_name == null ? null : { displayName: row.approved_display_name, avatarUrl: row.approved_avatar_url ?? '' },
  moderationStatus: row.moderation_status, moderationReason: row.moderation_reason,
  revision: row.revision, submittedAt: row.submitted_at,
});
function decodeCursor(value: string | null): { at: string; id: string } | null {
  if (value === null) return null;
  try {
    if (value.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('cursor');
    const [at, id] = JSON.parse(atob(value.replaceAll('-', '+').replaceAll('_', '/')));
    if (typeof at !== 'string' || !Number.isFinite(Date.parse(at)) || typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u.test(id)) throw new Error('cursor');
    return { at, id };
  } catch { throw new ServerInputError(400, 'invalid_cursor', 'Vị trí danh sách không hợp lệ.'); }
}
function encodeCursor(at: string, id: string): string {
  return btoa(JSON.stringify([at, id])).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}
const MEMBER_COLUMNS = 'u.id AS member_id, u.display_name AS member_name, u.role AS member_role, u.status AS member_status';
function memberDto(row: D1ResultRow, adminId: string): ModerationMember | null {
  if (!row.member_id) return null;
  return { id: String(row.member_id), name: String(row.member_name ?? ''), role: row.member_role as ModerationMember['role'],
    status: row.member_status as ModerationMember['status'], isSelf: row.member_id === adminId };
}

export function createCommunityModerationRepository(env: CloudflareEnvLike) {
  return {
    async listComments(articleId: string, viewerId: string | null, options: { after: number | null; limit: number }, includeContact = false, includeOwn = false): Promise<ModeratedComment[]> {
      const result = await env.DB.prepare(`
        SELECT c.id, c.bai_viet_id, c.parent_id, c.noi_dung, c.tao_luc,
          COALESCE(c.approved_author_name, c.ten) AS ten, u.role,
          p.public_id AS authorId,
          CASE WHEN c.author_user_id = ? THEN 1 ELSE 0 END AS isOwnProfile,
          COALESCE(c.moderation_status, 'pending') AS moderationStatus,
        CASE WHEN c.author_user_id = ? AND ? = 1 THEN c.moderation_reason ELSE NULL END AS moderationReason
          ${includeContact ? ', c.email, c.dien_thoai' : ''}
        FROM binh_luan c
        LEFT JOIN app_users u ON u.id = c.author_user_id
        LEFT JOIN ugc_public_profiles p ON p.owner_id = c.author_user_id
        WHERE c.bai_viet_id = ?
          AND ((c.moderation_status = 'approved' AND (c.author_user_id IS NULL OR p.approved_display_name IS NOT NULL))
            OR (? = 1 AND c.author_user_id = ? AND c.moderation_status IN ('pending', 'approved', 'rejected')))
          AND (c.author_user_id IS NULL OR u.status = 'active')
          AND NOT EXISTS (SELECT 1 FROM ugc_user_blocks b WHERE b.blocker_id = ? AND b.blocked_owner_id = c.author_user_id)
          AND (? IS NULL OR (c.tao_luc, c.id) > (SELECT tao_luc, id FROM binh_luan WHERE id = ? AND bai_viet_id = ?))
        ORDER BY c.tao_luc ASC, c.id ASC LIMIT ?
      `).bind(viewerId, viewerId, Number(includeOwn), articleId, Number(includeOwn), viewerId, viewerId, options.after, options.after, articleId, options.limit).all<ModeratedComment & D1ResultRow>();
      return (result.results ?? []).map(row => {
        const { moderationReason, ...publicRow } = row;
        const isOwnProfile = Boolean(row.isOwnProfile);
        return { ...publicRow, isOwnProfile, ...(isOwnProfile && includeOwn ? { moderationReason } : {}) };
      });
    },

    async createComment(ownerId: string, articleId: string, input: { content: string; parentId: number | null; phone?: string }, publicId: string, now: string): Promise<ModeratedComment | null> {
      // One identity row per owner. An unchanged identity causes no write.
      await env.DB.prepare(`
        INSERT INTO ugc_public_profiles (public_id, owner_id, submitted_display_name, submitted_avatar_url, submitted_at)
        SELECT ?, u.id, COALESCE(NULLIF(u.display_name, ''), 'Thành viên'), COALESCE(u.avatar_url, ''), ?
        FROM app_users u WHERE u.id = ? AND u.status = 'active'
        ON CONFLICT(owner_id) DO NOTHING
      `).bind(publicId, now, ownerId).run();
      return env.DB.prepare(`
        INSERT INTO binh_luan (bai_viet_id, ten, dien_thoai, email, noi_dung, tao_luc, author_user_id, parent_id,
          moderation_status, approved_author_name, approved_author_avatar_url)
        SELECT a.id, COALESCE(NULLIF(u.display_name, ''), 'Thành viên'), ?, COALESCE(u.email, ''), ?, ?, u.id,
          CASE WHEN ? IS NULL THEN NULL ELSE COALESCE(parent.parent_id, parent.id) END,
          'pending', COALESCE(NULLIF(u.display_name, ''), 'Thành viên'), COALESCE(u.avatar_url, '')
        FROM app_users u JOIN baiviet a ON a.id = ?
        LEFT JOIN binh_luan parent ON parent.id = ? AND parent.bai_viet_id = a.id
        WHERE u.id = ? AND u.status = 'active'
          AND (? IS NULL OR (parent.id IS NOT NULL AND (parent.moderation_status = 'approved' OR parent.author_user_id = u.id)))
          AND NOT EXISTS (SELECT 1 FROM ugc_user_blocks b WHERE b.blocker_id = u.id AND b.blocked_owner_id = parent.author_user_id)
        RETURNING id, bai_viet_id, parent_id, ten, noi_dung, tao_luc,
          (SELECT role FROM app_users WHERE id = author_user_id) AS role,
          (SELECT public_id FROM ugc_public_profiles WHERE owner_id = author_user_id) AS authorId,
          1 AS isOwnProfile, moderation_status AS moderationStatus
      `).bind(input.phone ?? '', input.content, now, input.parentId, articleId, input.parentId, ownerId, input.parentId).first<ModeratedComment & D1ResultRow>();
    },
    async createComments(ownerId: string, inputs: Array<{ articleId: string; content: string; parentId: number | null; phone?: string }>, publicId: string, now: string): Promise<ModeratedComment[] | null> {
      if (!inputs.length || inputs.length > 100) return null;
      const targets = JSON.stringify(inputs.map(input => ({ articleId: input.articleId, parentId: input.parentId })));
      const checked = await env.DB.prepare(`
        SELECT CAST(requested.key AS INTEGER) AS position, a.id AS article_id,
          COALESCE(parent.parent_id, parent.id) AS parent_id,
          CASE WHEN json_extract(requested.value, '$.parentId') IS NULL THEN 1
            WHEN parent.id IS NOT NULL AND (parent.moderation_status = 'approved' OR parent.author_user_id = u.id)
              AND NOT EXISTS (SELECT 1 FROM ugc_user_blocks b WHERE b.blocker_id = u.id AND b.blocked_owner_id = parent.author_user_id)
            THEN 1 ELSE 0 END AS valid_parent,
          COALESCE(NULLIF(u.display_name, ''), 'Thành viên') AS display_name, COALESCE(u.email, '') AS email,
          COALESCE(u.avatar_url, '') AS avatar_url, u.role, identity.public_id
        FROM app_users u JOIN json_each(?) requested ON 1 = 1
        LEFT JOIN baiviet a ON a.id = json_extract(requested.value, '$.articleId')
        LEFT JOIN binh_luan parent ON parent.id = json_extract(requested.value, '$.parentId') AND parent.bai_viet_id = a.id
        LEFT JOIN ugc_public_profiles identity ON identity.owner_id = u.id
        WHERE u.id = ? AND u.status = 'active' ORDER BY CAST(requested.key AS INTEGER)
      `).bind(targets, ownerId).all<{ position: number; article_id: string | null; parent_id: number | null;
        valid_parent: number; display_name: string; email: string; avatar_url: string; role: ModeratedComment['role']; public_id: string | null }>();
      const rows = checked.results ?? [];
      if (rows.length !== inputs.length || rows.some((row, index) => row.position !== index || row.article_id !== inputs[index].articleId || !row.valid_parent)) return null;
      const author = rows[0];
      const identity = env.DB.prepare(`INSERT INTO ugc_public_profiles
        (public_id, owner_id, submitted_display_name, submitted_avatar_url, submitted_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(owner_id) DO NOTHING`).bind(publicId, ownerId, author.display_name, author.avatar_url, now);
      const statements = inputs.map((input, index) => env.DB.prepare(`INSERT INTO binh_luan
        (bai_viet_id, ten, dien_thoai, email, noi_dung, tao_luc, author_user_id, parent_id,
          moderation_status, approved_author_name, approved_author_avatar_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        RETURNING id, bai_viet_id, ten, noi_dung, tao_luc, parent_id, moderation_status AS moderationStatus`)
        .bind(input.articleId, author.display_name, input.phone ?? '', author.email, input.content, now, ownerId,
          rows[index].parent_id, author.display_name, author.avatar_url));
      const results = await env.DB.batch([identity, ...statements]);
      return results.slice(1).map(result => {
        const row = result.results?.[0];
        if (!row) throw new Error('Missing pending comment batch result');
        return { id: Number(row.id), bai_viet_id: String(row.bai_viet_id), ten: String(row.ten),
          noi_dung: String(row.noi_dung), tao_luc: String(row.tao_luc), parent_id: row.parent_id == null ? null : Number(row.parent_id),
          moderationStatus: 'pending' as const, authorId: author.public_id ?? publicId, role: author.role, isOwnProfile: true };
      });
    },

    async getOwnProfile(ownerId: string): Promise<OwnCommunityProfile | null> {
      const row = await env.DB.prepare(`SELECT ${PROFILE_COLUMNS} FROM ugc_public_profiles WHERE owner_id = ?`).bind(ownerId).first<ProfileRow>();
      return row ? profileDto(row) : null;
    },

    async submitProfile(ownerId: string, publicId: string, now: string): Promise<OwnCommunityProfile | null> {
      const candidate = await env.DB.prepare(`
        SELECT ${PROFILE_COLUMNS.split(', ').map(column => `p.${column}`).join(', ')}, COALESCE(NULLIF(u.display_name, ''), 'Thành viên') AS current_name, COALESCE(u.avatar_url, '') AS current_avatar
        FROM app_users u LEFT JOIN ugc_public_profiles p ON p.owner_id = u.id
        WHERE u.id = ? AND u.status = 'active'
      `).bind(ownerId).first<ProfileRow & { current_name: string; current_avatar: string }>();
      if (!candidate) return null;
      if (candidate.public_id && candidate.moderation_status !== 'rejected'
        && candidate.submitted_display_name === candidate.current_name && candidate.submitted_avatar_url === candidate.current_avatar) return profileDto(candidate);
      const row = await env.DB.prepare(`
        INSERT INTO ugc_public_profiles (public_id, owner_id, submitted_display_name, submitted_avatar_url, submitted_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(owner_id) DO UPDATE SET submitted_display_name = excluded.submitted_display_name,
          submitted_avatar_url = excluded.submitted_avatar_url, submitted_at = excluded.submitted_at,
          moderation_status = 'pending', moderation_reason = NULL, revision = ugc_public_profiles.revision + 1
        RETURNING ${PROFILE_COLUMNS}
      `).bind(publicId, ownerId, candidate.current_name, candidate.current_avatar, now).first<ProfileRow>();
      return row ? profileDto(row) : null;
    },

    async report(reporterId: string, input: CommunityReportInput, id: string, now: string): Promise<boolean> {
      const target = input.targetType === 'comment'
        ? `FROM binh_luan c WHERE c.id = ? AND c.moderation_status = 'approved' AND (c.author_user_id IS NULL OR c.author_user_id <> ?)`
        : `FROM ugc_public_profiles p WHERE p.public_id = ? AND p.owner_id <> ? AND p.approved_display_name IS NOT NULL AND p.approved_revision > 0`;
      const result = await env.DB.prepare(`
        INSERT INTO ugc_reports (id, reporter_id, target_type, target_id, reason, details, created_at, target_revision)
        SELECT ?, ?, ?, ?, ?, ?, ?, ${input.targetType === 'profile' ? 'p.approved_revision' : '0'} ${target}
        ON CONFLICT(reporter_id, target_type, target_id, target_revision) DO NOTHING
      `).bind(id, reporterId, input.targetType, input.targetId, input.reason, input.details ?? '', now, input.targetId, reporterId).run();
      if (Number(result.meta?.changes ?? 0) > 0) return true;
      // An earlier acknowledgement remains idempotent after moderation hides the target.
      const existing = await env.DB.prepare('SELECT 1 AS found FROM ugc_reports WHERE reporter_id = ? AND target_type = ? AND target_id = ?')
        .bind(reporterId, input.targetType, input.targetId).first();
      return Boolean(existing);
    },

    async block(ownerId: string, authorId: string, now: string): Promise<boolean> {
      const row = await env.DB.prepare(`
        INSERT INTO ugc_user_blocks (blocker_id, blocked_owner_id, created_at)
        SELECT ?, p.owner_id, ? FROM ugc_public_profiles p WHERE p.public_id = ? AND p.owner_id <> ?
          AND (p.approved_display_name IS NOT NULL
            OR EXISTS (SELECT 1 FROM binh_luan c WHERE c.author_user_id = p.owner_id AND c.moderation_status = 'approved')
            OR EXISTS (SELECT 1 FROM ugc_user_blocks b WHERE b.blocker_id = ? AND b.blocked_owner_id = p.owner_id))
        ON CONFLICT(blocker_id, blocked_owner_id) DO UPDATE SET created_at = ugc_user_blocks.created_at
        RETURNING blocked_owner_id
      `).bind(ownerId, now, authorId, ownerId, ownerId).first();
      return Boolean(row);
    },

    async unblock(ownerId: string, authorId: string): Promise<boolean> {
      await env.DB.prepare(`DELETE FROM ugc_user_blocks WHERE blocker_id = ?
        AND blocked_owner_id = (SELECT owner_id FROM ugc_public_profiles WHERE public_id = ?)`)
        .bind(ownerId, authorId).run();
      return true;
    },
    async listBlocks(ownerId: string, options: { after: string | null; limit: number }): Promise<{ items: CommunityBlockedProfile[]; nextCursor: string | null }> {
      const cursor = decodeCursor(options.after);
      const rows = await env.DB.prepare(`
        SELECT p.public_id, COALESCE(p.approved_display_name, 'Thành viên') AS display_name,
          COALESCE(p.approved_avatar_url, '') AS avatar_url, b.created_at, b.blocked_owner_id
        FROM ugc_user_blocks b JOIN ugc_public_profiles p ON p.owner_id = b.blocked_owner_id
        WHERE b.blocker_id = ? AND (? IS NULL OR (b.created_at, b.blocked_owner_id) > (?, ?))
        ORDER BY b.created_at ASC, b.blocked_owner_id ASC LIMIT ?
      `).bind(ownerId, cursor?.at ?? null, cursor?.at ?? '', cursor?.id ?? '', options.limit + 1).all<{
        public_id: string; display_name: string; avatar_url: string; created_at: string; blocked_owner_id: string;
      }>();
      const visible = (rows.results ?? []).slice(0, options.limit);
      const last = visible.at(-1);
      return { items: visible.map(row => ({ authorId: row.public_id, displayName: row.display_name, avatarUrl: row.avatar_url, blockedAt: row.created_at })),
        nextCursor: (rows.results?.length ?? 0) > options.limit && last ? encodeCursor(last.created_at, last.blocked_owner_id) : null };
    },
    async listModerationQueue(kind: ModerationQueueKind, adminId: string, options: { after: string | null; limit: number }): Promise<ModerationQueuePage> {
      const cursor = decodeCursor(options.after);
      const query = kind === 'comments' ? `
        SELECT CAST(c.id AS TEXT) AS id, c.moderation_revision AS revision, c.tao_luc AS submitted_at,
          c.approved_author_name AS display_name, c.approved_author_avatar_url AS avatar_url,
          c.noi_dung AS content, c.bai_viet_id AS article_id, c.moderation_status, a.tieu_de AS article_title,
          c.parent_id, parent.noi_dung AS parent_content, ${MEMBER_COLUMNS}
        FROM binh_luan c LEFT JOIN app_users u ON u.id = c.author_user_id
        LEFT JOIN baiviet a ON a.id = c.bai_viet_id LEFT JOIN binh_luan parent ON parent.id = c.parent_id
        WHERE c.moderation_status = 'pending'
          AND (? IS NULL OR (c.tao_luc, c.id) > (?, CAST(? AS INTEGER)))
        ORDER BY c.tao_luc ASC, c.id ASC LIMIT ?
      ` : kind === 'profiles' ? `
        SELECT p.public_id AS id, p.revision, p.submitted_at, p.submitted_display_name AS display_name,
          p.submitted_avatar_url AS avatar_url, p.submitted_display_name AS content, NULL AS article_id,
          p.moderation_status, p.approved_display_name, p.approved_avatar_url, ${MEMBER_COLUMNS}
        FROM ugc_public_profiles p LEFT JOIN app_users u ON u.id = p.owner_id
        WHERE p.moderation_status = 'pending' AND (? IS NULL OR (p.submitted_at, p.public_id) > (?, ?))
        ORDER BY p.submitted_at ASC, p.public_id ASC LIMIT ?
      ` : `
        SELECT r.id, r.revision, r.created_at AS submitted_at, r.details AS content, r.reason AS report_reason,
          COALESCE(c.approved_author_name, p.approved_display_name, '') AS display_name,
          COALESCE(c.approved_author_avatar_url, p.approved_avatar_url, '') AS avatar_url,
          c.bai_viet_id AS article_id, a.tieu_de AS article_title, c.parent_id, parent.noi_dung AS parent_content,
          r.target_type, r.target_id, r.target_revision AS reported_epoch,
          p.approved_revision AS current_publication,
          CASE WHEN p.approved_display_name IS NOT NULL THEN 1 ELSE 0 END AS profile_published,
          COALESCE(c.moderation_revision, p.revision) AS target_cas_revision,
          COALESCE(c.moderation_status, p.moderation_status) AS target_status,
          COALESCE(c.noi_dung, p.approved_display_name, '') AS target_content, ${MEMBER_COLUMNS}
        FROM ugc_reports r
        LEFT JOIN binh_luan c ON r.target_type = 'comment' AND c.id = r.target_id
        LEFT JOIN ugc_public_profiles p ON r.target_type = 'profile' AND p.public_id = r.target_id
        LEFT JOIN app_users u ON u.id = COALESCE(c.author_user_id, p.owner_id)
        LEFT JOIN baiviet a ON a.id = c.bai_viet_id LEFT JOIN binh_luan parent ON parent.id = c.parent_id
        WHERE r.status = 'open' AND (? IS NULL OR (r.created_at, r.id) > (?, ?))
        ORDER BY r.created_at ASC, r.id ASC LIMIT ?
      `;
      const result = await env.DB.prepare(query).bind(cursor?.at ?? null, cursor?.at ?? '', cursor?.id ?? '', options.limit + 1).all<D1ResultRow>();
      const rows = (result.results ?? []).slice(0, options.limit);
      const items: ModerationQueueItem[] = rows.map(row => {
        const member = memberDto(row, adminId);
        const item: ModerationQueueItem = { id: String(row.id), kind, revision: Number(row.revision),
          submittedAt: String(row.submitted_at), displayName: String(row.display_name ?? ''), avatarUrl: String(row.avatar_url ?? ''),
          content: String(row.content ?? ''), articleId: row.article_id == null ? null : String(row.article_id),
          articleTitle: row.article_title == null ? null : String(row.article_title),
          parentId: row.parent_id == null ? null : Number(row.parent_id), parentContent: row.parent_content == null ? null : String(row.parent_content), member };
        if (kind === 'reports') {
          item.reportReason = row.report_reason as CommunityReportInput['reason'];
          // A receipt describes its publication epoch, not a newer candidate or
          // identity. The action revision remains the current optimistic CAS.
          const currentPublication = row.target_type !== 'profile' || (Boolean(row.profile_published)
            && Number(row.reported_epoch) > 0 && Number(row.reported_epoch) === Number(row.current_publication));
          if (!currentPublication) { item.displayName = ''; item.avatarUrl = ''; }
          item.target = row.target_cas_revision == null || !currentPublication ? null : { kind: row.target_type === 'comment' ? 'comments' : 'profiles',
            id: String(row.target_id), revision: Number(row.target_cas_revision), moderationStatus: row.target_status as ModeratedComment['moderationStatus'],
            displayName: item.displayName, avatarUrl: item.avatarUrl, content: String(row.target_content ?? ''),
            articleId: item.articleId, articleTitle: item.articleTitle, parentId: item.parentId, parentContent: item.parentContent, member };
        } else item.moderationStatus = row.moderation_status as ModeratedComment['moderationStatus'];
        if (kind === 'profiles') item.approvedIdentity = row.approved_display_name == null ? null
          : { displayName: String(row.approved_display_name), avatarUrl: String(row.approved_avatar_url ?? '') };
        return item;
      });
      const last = rows.at(-1);
      return { items, nextCursor: (result.results?.length ?? 0) > options.limit && last ? encodeCursor(String(last.submitted_at), String(last.id)) : null };
    },
    async moderate(kind: ModerationQueueKind, id: string, decision: ModerationDecision & { reason: string }, adminId: string, now: string): Promise<boolean> {
      if (kind === 'reports') {
        const row = await env.DB.prepare(`UPDATE ugc_reports SET status = 'resolved', revision = revision + 1,
          moderated_by = ?, moderated_at = ?, moderation_reason = ?
          WHERE id = ? AND revision = ? AND status = 'open' RETURNING id`)
          .bind(adminId, now, decision.reason || null, id, decision.revision).first();
        return Boolean(row);
      }
      if (kind === 'profiles') {
        const approve = decision.action === 'approve';
        const hide = decision.action === 'hide';
        const published = approve ? 'approved_display_name = submitted_display_name, approved_avatar_url = submitted_avatar_url, approved_revision = approved_revision + 1,'
          : hide ? 'approved_display_name = NULL, approved_avatar_url = NULL,' : '';
        const row = await env.DB.prepare(`UPDATE ugc_public_profiles SET ${published}
          moderation_status = ?, moderation_reason = ?, moderated_by = ?, moderated_at = ?, revision = revision + 1
          WHERE public_id = ? AND revision = ?
            AND ${hide ? "(moderation_status <> 'rejected' OR approved_display_name IS NOT NULL)" : "moderation_status = 'pending'"}
          RETURNING public_id`).bind(approve ? 'approved' : 'rejected', approve ? null : decision.reason || null, adminId, now, id, decision.revision).first();
        return Boolean(row);
      }
      const approve = decision.action === 'approve';
      const update = env.DB.prepare(`UPDATE binh_luan SET moderation_status = ?, moderation_reason = ?,
        moderated_by = ?, moderated_at = ?, moderation_revision = moderation_revision + 1
        WHERE id = ? AND moderation_revision = ? AND ${approve ? "moderation_status = 'pending'" : "moderation_status IN ('pending', 'approved')"}
        RETURNING id`).bind(approve ? 'approved' : 'rejected', approve ? null : decision.reason || null, adminId, now, id, decision.revision);
      if (!approve) return Boolean(await update.first());
      // The reviewed comment includes its captured author identity. Publish that
      // snapshot only if no previous identity was hidden/rejected by moderation.
      const publishIdentity = env.DB.prepare(`UPDATE ugc_public_profiles SET
        approved_revision = approved_revision + 1,
        approved_display_name = (SELECT approved_author_name FROM binh_luan WHERE id = ?),
        approved_avatar_url = (SELECT approved_author_avatar_url FROM binh_luan WHERE id = ?)
        WHERE changes() > 0 AND approved_display_name IS NULL AND moderation_status <> 'rejected'
          AND owner_id = (SELECT author_user_id FROM binh_luan WHERE id = ? AND moderation_revision = ? AND moderation_status = 'approved')`)
        .bind(id, id, id, decision.revision + 1);
      const results = await env.DB.batch([update, publishIdentity]);
      return Boolean(results[0]?.results?.length || results[0]?.meta?.changes);
    },
  };
}
