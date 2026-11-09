import type { CloudflareRequestContext } from '../cloudflare-context';
import { ServerInputError } from '../errors';
import type { ModerationDecision, ModerationQueueKind } from '../../contracts/community-moderation';
import { createCommunityModerationRepository } from '../repositories/community-moderation-repository';

type Repository = Pick<ReturnType<typeof createCommunityModerationRepository>, 'listModerationQueue' | 'moderate'>;
export function createAdminCommunityModerationService(
  context: CloudflareRequestContext,
  dependencies: { repository?: Repository; now?: () => Date } = {},
) {
  const repository = dependencies.repository ?? createCommunityModerationRepository(context.env);
  const actor = () => {
    if (!context.principal?.appUserId) throw new ServerInputError(401, 'authentication_required', 'Cần đăng nhập.');
    if (context.principal.role !== 'admin') throw new ServerInputError(403, 'forbidden', 'Không đủ quyền.');
    return context.principal.appUserId;
  };
  const queueKind = (value: unknown): ModerationQueueKind => {
    if (value !== 'comments' && value !== 'profiles' && value !== 'reports') throw new ServerInputError(400, 'invalid_queue', 'Hàng đợi không hợp lệ.');
    return value;
  };
  return {
    async list(kind: unknown, options: { after?: string | null; limit?: number } = {}) {
      const adminId = actor();
      if (options.limit != null && (!Number.isFinite(options.limit) || options.limit < 1)) throw new ServerInputError(400, 'invalid_limit', 'Giới hạn không hợp lệ.');
      return repository.listModerationQueue(queueKind(kind), adminId, {
        after: options.after ?? null, limit: Math.min(50, Math.floor(options.limit ?? 50)),
      });
    },
    async decide(kind: unknown, id: string, input: unknown) {
      const adminId = actor();
      const targetKind = queueKind(kind);
      const body = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
      const validAction = targetKind === 'reports' ? body.action === 'resolve' : ['approve', 'reject', 'hide'].includes(String(body.action));
      if (!validAction || !Number.isSafeInteger(body.revision) || Number(body.revision) < 1
        || Object.keys(body).some(key => !['action', 'revision', 'reason'].includes(key))
        || (body.reason != null && (typeof body.reason !== 'string' || body.reason.length > 1000))
        || (body.action === 'reject' && (typeof body.reason !== 'string' || !body.reason.trim()))
        || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u.test(id)
        || (targetKind === 'comments' && !/^[1-9]\d*$/u.test(id))) {
        throw new ServerInputError(400, 'invalid_moderation_decision', 'Quyết định kiểm duyệt không hợp lệ.');
      }
      const decision: ModerationDecision & { reason: string } = { action: body.action as ModerationDecision['action'],
        revision: Number(body.revision), reason: typeof body.reason === 'string' ? body.reason.trim() : '' };
      if (!await repository.moderate(targetKind, id, decision, adminId, (dependencies.now?.() ?? new Date()).toISOString())) {
        throw new ServerInputError(409, 'moderation_conflict', 'Nội dung đã thay đổi. Vui lòng tải lại hàng đợi.');
      }
      return { updated: true as const };
    },
  };
}
