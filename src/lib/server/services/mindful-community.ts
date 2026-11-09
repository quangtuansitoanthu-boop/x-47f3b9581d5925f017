import { MINDFUL_POST_KINDS, MINDFUL_REACTION_TEMPLATES, type MindfulPostDraft, type MindfulPostKind,
  type MindfulPostPage, type MindfulReactionPage } from '../../contracts/mindful-community';
import type { CloudflareRequestContext } from '../cloudflare-context';
import { ServerInputError } from '../errors';
import { createMindfulCommunityRepository, mindfulPostDto, type MindfulCursor } from '../repositories/mindful-community-repository';
import { publicPracticeCommunityEnabled, requirePublicPracticeCommunity } from './practice-community-gate';
import type { MindfulNotificationPage } from '../../contracts/mindful-notifications';
import { createMindfulNotificationsRepository } from '../repositories/mindful-notifications-repository';

const validId = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/u.test(value)) {
    throw new ServerInputError(400, 'invalid_mindful_id', 'Mã bài chia sẻ không hợp lệ.');
  }
  return value;
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ServerInputError(400, 'invalid_mindful_content', 'Nội dung không hợp lệ.');
  return value as Record<string, unknown>;
};
function nickname(value: unknown): string {
  if (typeof value !== 'string') throw new ServerInputError(400, 'invalid_nickname', 'Vui lòng nhập biệt danh.');
  const result = value.normalize('NFC').trim();
  if (!result || result.length > 40 || /[\u0000-\u001f\u007f@]/u.test(result)) {
    throw new ServerInputError(400, 'invalid_nickname', 'Biệt danh dài tối đa 40 ký tự, không dùng email hoặc ký tự điều khiển.');
  }
  return result;
}
const encodeCursor = (cursor: MindfulCursor): string => btoa(JSON.stringify(cursor)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
function decodeCursor(value: string | null): MindfulCursor | null {
  if (value === null) return null;
  try {
    if (value.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('cursor');
    const parsed = JSON.parse(atob(value.replaceAll('-', '+').replaceAll('_', '/')));
    if (!parsed || typeof parsed.at !== 'string' || !Number.isFinite(Date.parse(parsed.at))) throw new Error('cursor');
    return { at: parsed.at, id: validId(parsed.id) };
  } catch { throw new ServerInputError(400, 'invalid_cursor', 'Vị trí danh sách không hợp lệ.'); }
}
function vietnamDayBounds(now: Date) {
  const day = new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00+07:00`);
  return { start: start.toISOString(), end: new Date(start.getTime() + 86400000).toISOString() };
}

export function createMindfulCommunityService(context: CloudflareRequestContext, dependencies: {
  repository?: ReturnType<typeof createMindfulCommunityRepository>; now?: () => Date; createId?: () => string;
  notificationRepository?: ReturnType<typeof createMindfulNotificationsRepository>;
} = {}) {
  const repository = dependencies.repository ?? createMindfulCommunityRepository(context.env);
  const notifications = dependencies.notificationRepository ?? createMindfulNotificationsRepository(context.env);
  const clock = dependencies.now ?? (() => new Date());
  const id = dependencies.createId ?? (() => crypto.randomUUID());
  const owner = () => {
    const value = context.principal?.appUserId;
    if (!value) throw new ServerInputError(401, 'authentication_required', 'Cần đăng nhập để chia sẻ.');
    return value;
  };
  return {
    async notifications(after: string | null): Promise<MindfulNotificationPage> {
      const principal = owner();
      const cursor = decodeCursor(after);
      if (!publicPracticeCommunityEnabled(context.env)) return { enabled: false, items: [], nextCursor: null };
      const rows = await notifications.list(principal, cursor);
      const scanned = rows.slice(0, 20);
      const last = scanned.at(-1);
      return { enabled: true, items: scanned.filter(row => row.visible === 1).map(row => ({
        id: row.cursor_id, postId: row.post_id, kind: row.kind, nickname: row.nickname,
        templateId: row.template_id,
        text: MINDFUL_REACTION_TEMPLATES[row.kind].find(template => template.id === row.template_id)?.text ?? '',
        createdAt: row.created_at,
      })), nextCursor: rows.length > 20 && last ? encodeCursor({ at: last.created_at, id: last.cursor_id }) : null };
    },
    async get(postId: string, reactionId: string | null = null) {
      const principal = owner();
      requirePublicPracticeCommunity(context.env);
      const result = await repository.getOwned(principal, validId(postId), reactionId === null ? null : validId(reactionId));
      if (!result) throw new ServerInputError(404, 'mindful_post_unavailable', 'Bài chia sẻ không còn khả dụng.');
      return result;
    },
    async list(kindInput: string | null, mine: boolean, after: string | null, periodInput: string | null = null): Promise<MindfulPostPage> {
      const kind = kindInput ?? 'repentance';
      if (!MINDFUL_POST_KINDS.includes(kind as MindfulPostKind)) throw new ServerInputError(400, 'invalid_post_kind', 'Loại bài chia sẻ không hợp lệ.');
      const period = periodInput ?? 'all';
      if (period !== 'all' && period !== 'today') throw new ServerInputError(400, 'invalid_mindful_period', 'Khoảng thời gian không hợp lệ.');
      const viewer = mine ? owner() : context.principal?.appUserId ?? null;
      const cursor = decodeCursor(after);
      if (!publicPracticeCommunityEnabled(context.env)) return { enabled: false, items: [], nextCursor: null };
      const rows = await repository.list(viewer, kind as MindfulPostKind, mine, cursor, period === 'today' ? vietnamDayBounds(clock()) : null);
      const items = rows.slice(0, 20).map(mindfulPostDto);
      const last = items.at(-1);
      return { enabled: true, items, nextCursor: rows.length > 20 && last ? encodeCursor({ at: last.createdAt, id: last.id }) : null };
    },
    async create(input: unknown) {
      requirePublicPracticeCommunity(context.env);
      const principal = owner();
      const body = object(input);
      if (!MINDFUL_POST_KINDS.includes(body.kind as MindfulPostKind) || typeof body.content !== 'string') {
        throw new ServerInputError(400, 'invalid_mindful_content', 'Nội dung chia sẻ không hợp lệ.');
      }
      const content = body.content.normalize('NFC').trim();
      if (!content || content.length > 3000 || content.includes('\u0000')) throw new ServerInputError(400, 'invalid_mindful_content', 'Nội dung dài từ 1 đến 3.000 ký tự.');
      const draft: MindfulPostDraft = { clientPostId: validId(body.clientPostId), kind: body.kind as MindfulPostKind,
        nickname: nickname(body.nickname), content };
      const now = clock();
      const range = vietnamDayBounds(now);
      const post = await repository.create(principal, draft, id(), now.toISOString(), range.start, range.end);
      if (!post) throw new ServerInputError(429, 'mindful_daily_limit', 'Mỗi ngày anh/chị có thể chia sẻ tối đa 2 bài.');
      if (post.kind !== draft.kind || (post.status !== 'removed' && post.content !== draft.content)) {
        throw new ServerInputError(409, 'mindful_post_id_conflict', 'Mã bài đã được dùng cho nội dung khác.');
      }
      return { post };
    },
    async react(postId: string, input: unknown) {
      requirePublicPracticeCommunity(context.env);
      const principal = owner();
      const body = object(input);
      const templates = [...MINDFUL_REACTION_TEMPLATES.repentance, ...MINDFUL_REACTION_TEMPLATES.good_deed];
      if (typeof body.templateId !== 'string' || !templates.some(template => template.id === body.templateId)) {
        throw new ServerInputError(400, 'invalid_reaction_template', 'Vui lòng chọn lời nguyện mẫu có sẵn.');
      }
      const result = await repository.react(principal, validId(postId), body.templateId, nickname(body.nickname), clock().toISOString(), id());
      if (!result) throw new ServerInputError(404, 'mindful_post_unavailable', 'Bài chia sẻ hoặc lời nguyện không còn khả dụng.');
      return result;
    },
    async reactions(postId: string, after: string | null): Promise<MindfulReactionPage> {
      validId(postId);
      const cursor = decodeCursor(after);
      if (!publicPracticeCommunityEnabled(context.env)) return { items: [], nextCursor: null };
      const rows = await repository.reactions(context.principal?.appUserId ?? null, postId, cursor);
      const visible = rows.slice(0, 20);
      const last = visible.at(-1);
      return { items: visible.map(row => ({ nickname: row.nickname, templateId: row.template_id,
        text: MINDFUL_REACTION_TEMPLATES[row.kind].find(template => template.id === row.template_id)?.text ?? '', createdAt: row.created_at })),
      nextCursor: rows.length > 20 && last ? encodeCursor({ at: last.created_at, id: last.cursor_id }) : null };
    },
    async remove(postId: string) {
      // Own deletion stays available even while the public community flag is off.
      if (!await repository.remove(owner(), validId(postId), context.principal?.role === 'admin')) {
        throw new ServerInputError(404, 'mindful_post_unavailable', 'Bài chia sẻ không còn khả dụng.');
      }
      return { removed: true as const };
    },
  };
}
