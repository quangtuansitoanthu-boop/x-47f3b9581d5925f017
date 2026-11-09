import { EMPTY_PERSONAL_SETTINGS, normalizePersonalSettings, type PersonalSettingsResponse } from '../../domain/practice/personal-settings';
import type { CloudflareRequestContext } from '../cloudflare-context';
import { ServerInputError } from '../errors';
import { createPersonalSettingsRepository, type PersonalSettingsRow } from '../repositories/personal-settings-repository';

export function createPersonalSettingsService(context: CloudflareRequestContext, dependencies: {
  repository?: ReturnType<typeof createPersonalSettingsRepository>; now?: () => Date;
} = {}) {
  const repository = dependencies.repository ?? createPersonalSettingsRepository(context.env);
  const now = dependencies.now ?? (() => new Date());
  function owner() {
    const id = context.principal?.appUserId;
    if (!id) throw new ServerInputError(401, 'authentication_required', 'Cần đăng nhập.');
    return id;
  }
  function response(row: PersonalSettingsRow | null): PersonalSettingsResponse {
    if (!row) return { snapshot: { ...EMPTY_PERSONAL_SETTINGS, routines: [] }, revision: 0, updatedAt: null };
    try { return { snapshot: normalizePersonalSettings(JSON.parse(row.snapshot_json)), revision: row.revision, updatedAt: row.updated_at }; }
    catch { throw new ServerInputError(500, 'personal_settings_invalid_storage', 'Không thể đọc thời khóa đã lưu.'); }
  }
  return {
    async read() { return response(await repository.read(owner())); },
    async write(input: Record<string, unknown>) {
      const id = owner();
      if (Object.keys(input).some(key => !['snapshot', 'revision'].includes(key))
        || !Number.isSafeInteger(input.revision) || Number(input.revision) < 0) throw invalid();
      let snapshot;
      try { snapshot = normalizePersonalSettings(input.snapshot); } catch (error) {
        if (error instanceof Error && error.message === 'personal_settings_too_large') throw new ServerInputError(413, 'personal_settings_too_large', 'Nội dung vượt giới hạn lưu trữ.');
        throw invalid();
      }
      const saved = await repository.write(id, JSON.stringify(snapshot), Number(input.revision), now().toISOString());
      if (!saved) throw new ServerInputError(409, 'personal_settings_conflict', 'Nội dung đã thay đổi trên thiết bị khác. Bản trên máy được giữ nguyên để đối chiếu.');
      return { ok: true, ...response(saved) };
    },
  };
}
function invalid() { return new ServerInputError(400, 'invalid_personal_settings', 'Nội dung thời khóa không hợp lệ.'); }
