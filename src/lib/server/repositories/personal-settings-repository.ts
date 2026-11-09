import type { CloudflareEnvLike } from '../cloudflare-context';

export interface PersonalSettingsRow { snapshot_json: string; revision: number; updated_at: string }

export function createPersonalSettingsRepository(env: CloudflareEnvLike) {
  return {
    read(owner: string) {
      return env.DB.prepare('SELECT snapshot_json, revision, updated_at FROM practice_personal_settings WHERE owner_id = ?')
        .bind(owner).first<PersonalSettingsRow>();
    },
    write(owner: string, snapshot: string, revision: number, now: string) {
      // One atomic CAS statement, including the absent-row case. Same-content retry
      // with its original revision returns the receipt without advancing revision.
      return env.DB.prepare(`INSERT INTO practice_personal_settings (owner_id, snapshot_json, revision, updated_at)
        SELECT ?, ?, 1, ? WHERE ? = 0 OR EXISTS (SELECT 1 FROM practice_personal_settings WHERE owner_id = ?)
        ON CONFLICT(owner_id) DO UPDATE SET
          snapshot_json = excluded.snapshot_json,
          revision = CASE WHEN practice_personal_settings.snapshot_json = excluded.snapshot_json THEN practice_personal_settings.revision ELSE practice_personal_settings.revision + 1 END,
          updated_at = CASE WHEN practice_personal_settings.snapshot_json = excluded.snapshot_json THEN practice_personal_settings.updated_at ELSE excluded.updated_at END
        WHERE practice_personal_settings.revision = ? OR (practice_personal_settings.revision = ? + 1 AND practice_personal_settings.snapshot_json = excluded.snapshot_json)
        RETURNING snapshot_json, revision, updated_at`)
        .bind(owner, snapshot, now, revision, owner, revision, revision).first<PersonalSettingsRow>();
    },
  };
}
