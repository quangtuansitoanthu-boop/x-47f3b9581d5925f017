import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('preserves campaign members, contributions, triggers and totals while anonymizing a deleted creator', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for (const name of ['0001-application-schema.sql', '0002-auth-and-session-schema.sql', '0008-active-visitors.sql', '0013-admin-dashboard-analytics.sql', '0017-user-activity-foundations.sql']) {
      db.exec(readFileSync(`migrations/${name}`, 'utf8'));
    }
    db.exec(readFileSync('migrations/0020-practice-community-achievements.sql', 'utf8'));
    db.exec(readFileSync('migrations/0022-comment-replies-and-album-plays.sql', 'utf8'));
    db.exec(readFileSync('migrations/0025-performance-checkpoints.sql', 'utf8'));
    db.exec(`INSERT INTO app_users(id,role) VALUES ('creator','user'),('member','user');
      INSERT INTO practice_campaigns VALUES ('campaign','Title','','count',100,'2026-01-01','2099-01-01','active','creator','now','now');
      INSERT INTO practice_campaign_members VALUES ('campaign','member','now',NULL);
      INSERT INTO practice_sessions(id,owner_id,client_session_id,activity_type,status,accepted_count,verification_result,started_at,completed_at,idempotency_key,created_at,updated_at)
        VALUES ('session','member','client','rosary','completed',7,'accepted','2026-01-01','2026-01-02','mutation','now','now');
      INSERT INTO practice_campaign_contributions VALUES ('campaign','session','member',7,'now');`);
    const revision = db.prepare('SELECT revision FROM practice_public_revision').get()!.revision;
    const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
    db.exec('BEGIN');
    db.exec(readFileSync('migrations/0039-account-deletion.sql', 'utf8'));
    db.exec('COMMIT');
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) AS total FROM practice_campaign_members').get()!.total).toBe(1);
    expect(db.prepare('SELECT SUM(contribution_value) AS total FROM practice_campaign_contributions').get()!.total).toBe(7);
    expect(db.prepare('SELECT revision FROM practice_public_revision').get()!.revision).toBe(revision);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name").all()).toEqual(triggers);
    db.exec("DELETE FROM app_users WHERE id='creator'");
    expect(db.prepare('SELECT created_by FROM practice_campaigns').get()!.created_by).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS total FROM app_users').get()!.total).toBe(1);
    expect(db.prepare('SELECT SUM(contribution_value) AS total FROM practice_campaign_contributions').get()!.total).toBe(7);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    db.exec("DELETE FROM practice_campaigns WHERE id='campaign'");
    expect(db.prepare('SELECT COUNT(*) AS total FROM practice_campaign_members').get()!.total).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS total FROM practice_campaign_contributions').get()!.total).toBe(0);
  } finally { db.close(); }
});
