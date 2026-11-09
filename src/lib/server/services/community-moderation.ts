import type { CloudflareRequestContext } from '../cloudflare-context';
import { ServerInputError } from '../errors';
import { COMMUNITY_REPORT_REASONS, type CommunityReportInput } from '../../contracts/community-moderation';
import { createCommunityModerationRepository } from '../repositories/community-moderation-repository';

type Repository = Pick<ReturnType<typeof createCommunityModerationRepository>,
  'listComments' | 'createComment' | 'createComments' | 'getOwnProfile' | 'submitProfile' | 'report' | 'block' | 'unblock' | 'listBlocks'>;
function commentDraft(input: unknown): { content: string; parentId: number | null; phone?: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ServerInputError(400, 'invalid_comment', 'Bình luận không hợp lệ.');
  const body = input as Record<string, unknown>;
  const content = typeof body.noi_dung === 'string' ? body.noi_dung.replaceAll('\u0000', '').trim() : '';
  if (!content || typeof body.noi_dung !== 'string' || body.noi_dung.length > 5000
    || (body.parent_id != null && (!Number.isSafeInteger(body.parent_id) || Number(body.parent_id) < 1))) {
    throw new ServerInputError(400, 'invalid_comment', 'Bình luận không hợp lệ.');
  }
  return { content, parentId: body.parent_id == null ? null : Number(body.parent_id),
    ...(body.dien_thoai == null ? {} : { phone: String(body.dien_thoai).replaceAll('\u0000', '').trim().slice(0, 40) }) };
}
const opaqueId = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u.test(value)) {
    throw new ServerInputError(400, 'invalid_target', 'Nội dung không hợp lệ.');
  }
  return value;
};

export function createCommunityModerationService(
  context: CloudflareRequestContext,
  dependencies: { repository?: Repository; createId?: () => string; now?: () => Date } = {},
) {
  const repository = dependencies.repository ?? createCommunityModerationRepository(context.env);
  const createId = dependencies.createId ?? (() => crypto.randomUUID());
  const now = () => (dependencies.now?.() ?? new Date()).toISOString();
  const owner = () => {
    const id = context.principal?.appUserId;
    if (!id) throw new ServerInputError(401, 'authentication_required', 'Cần đăng nhập.');
    return id;
  };
  return {
    listComments(articleId: string, options: { after?: number | null; limit?: number; includeOwn?: boolean } = {}) {
      opaqueId(articleId);
      if (options.after != null && (!Number.isSafeInteger(options.after) || options.after < 1)) {
        throw new ServerInputError(400, 'invalid_cursor', 'Vị trí bình luận không hợp lệ.');
      }
      const pagination = {
        after: options.after ?? null, limit: Math.min(50, Math.max(1, Math.floor(options.limit ?? 50))),
      };
      return repository.listComments(articleId, context.principal?.appUserId ?? null, pagination,
        context.principal?.role === 'admin', options.includeOwn === true);
    },
    async submitComment(articleId: string, input: unknown) {
      const principal = owner();
      opaqueId(articleId);
      const result = await repository.createComment(principal, articleId, commentDraft(input), createId(), now());
      if (!result) throw new ServerInputError(404, 'comment_target_not_found', 'Bài viết hoặc bình luận gốc không còn tồn tại.');
      return result;
    },
    async submitLegacyComments(input: unknown) {
      const principal = owner();
      const rows = Array.isArray(input) ? input : [input];
      if (!rows.length) throw new ServerInputError(400, 'empty_payload', 'Không có dữ liệu.');
      if (rows.length > 100) throw new ServerInputError(413, 'too_many_rows', 'Mỗi yêu cầu chỉ được ghi tối đa 100 bản ghi.');
      const drafts = rows.map(row => {
        const draft = commentDraft(row);
        return { ...draft, articleId: opaqueId((row as Record<string, unknown>).bai_viet_id) };
      });
      const result = await repository.createComments(principal, drafts, createId(), now());
      if (!result) throw new ServerInputError(404, 'comment_target_not_found', 'Bài viết hoặc bình luận gốc không còn tồn tại.');
      return result;
    },
    async getOwnProfile() { return { profile: await repository.getOwnProfile(owner()) }; },
    async submitOwnProfile() { return { profile: await repository.submitProfile(owner(), createId(), now()) }; },
    async listBlocks(options: { after?: string | null; limit?: number } = {}) {
      const principal = owner();
      if (options.limit != null && (!Number.isSafeInteger(options.limit) || options.limit < 1)) {
        throw new ServerInputError(400, 'invalid_limit', 'Giới hạn không hợp lệ.');
      }
      return repository.listBlocks(principal, { after: options.after ?? null, limit: Math.min(50, options.limit ?? 50) });
    },
    async report(input: unknown) {
      const principal = owner();
      const body = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
      if (!['comment', 'profile'].includes(String(body.targetType))
        || !COMMUNITY_REPORT_REASONS.includes(body.reason as CommunityReportInput['reason'])
        || (body.details != null && (typeof body.details !== 'string' || body.details.length > 1000))) {
        throw new ServerInputError(400, 'invalid_report', 'Báo cáo không hợp lệ.');
      }
      const targetId = opaqueId(body.targetId);
      if (body.targetType === 'comment' && !/^[1-9]\d*$/u.test(targetId)) throw new ServerInputError(400, 'invalid_target', 'Nội dung không hợp lệ.');
      const report: CommunityReportInput = { targetType: body.targetType as CommunityReportInput['targetType'], targetId,
        reason: body.reason as CommunityReportInput['reason'], details: typeof body.details === 'string' ? body.details.trim() : '' };
      if (!await repository.report(principal, report, createId(), now())) throw new ServerInputError(404, 'report_target_not_found', 'Nội dung không còn khả dụng.');
      return { reported: true as const };
    },
    async block(authorId: string) {
      if (!await repository.block(owner(), opaqueId(authorId), now())) throw new ServerInputError(404, 'profile_not_found', 'Thành viên không còn khả dụng.');
      return { blocked: true as const };
    },
    async unblock(authorId: string) {
      if (!await repository.unblock(owner(), opaqueId(authorId))) throw new ServerInputError(404, 'profile_not_found', 'Thành viên không còn khả dụng.');
      return { blocked: false as const };
    },
  };
}
