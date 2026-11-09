-- Password authentication has been retired. Remove every password-backed session
-- before deleting the internal credentials; Google users and sessions are untouched.
DELETE FROM auth_sessions WHERE legacy_account_id IS NOT NULL;
DELETE FROM legacy_accounts;
