import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { resolveOrCreateGoogleIdentity } from '$lib/server/auth/google-oauth';

it('updates an existing Google avatar without another profile query or overwriting the chosen name', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE app_users(id TEXT PRIMARY KEY, role TEXT, display_name TEXT, avatar_url TEXT, updated_at TEXT);
    CREATE TABLE auth_identities(id TEXT, user_id TEXT, issuer TEXT, provider TEXT, provider_subject TEXT, updated_at TEXT, last_sign_in_at TEXT);
    INSERT INTO app_users VALUES ('user-1','user','Chosen name','old-photo','2026-01-01');
    INSERT INTO auth_identities VALUES ('identity-1','user-1','https://accounts.google.com','google','subject-1','2026-01-01','2026-01-01');
  `);
  let queryCount = 0;
  const env = { DB: { prepare(sql: string) {
    queryCount++;
    return { bind(...args: Array<string | number | null>) {
      const statement = db.prepare(sql);
      return { first: async () => statement.get(...args) ?? null, run: async () => statement.run(...args) };
    } };
  } } };
  try {
    await resolveOrCreateGoogleIdentity(env as never, { iss: 'https://accounts.google.com', sub: 'subject-1', name: 'Google name', picture: 'https://lh3.googleusercontent.com/new-photo' });
    expect(db.prepare('SELECT display_name, avatar_url FROM app_users').get()).toEqual({ display_name: 'Chosen name', avatar_url: 'https://lh3.googleusercontent.com/new-photo' });
    expect(queryCount).toBe(3); // Existing identity read, combined profile update, sign-in timestamp.
    await resolveOrCreateGoogleIdentity(env as never, { iss: 'https://accounts.google.com', sub: 'subject-1', name: 'Google name' });
    expect(db.prepare('SELECT avatar_url FROM app_users').get()?.avatar_url).toBe('https://lh3.googleusercontent.com/new-photo');
  } finally { db.close(); }
});
