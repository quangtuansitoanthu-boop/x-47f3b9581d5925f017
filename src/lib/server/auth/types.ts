export type SessionRole = 'user' | 'ctv' | 'admin';

export interface InternalSession {
  id: string;
  userId: string;
  appUserId: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  role: SessionRole;
  expiresAt: string;
  csrfToken: string;
  rawToken: string;
  identityId: string | null;
  authProvider: 'google' | 'facebook' | null;
}

export interface PageSessionDTO {
  authenticated: boolean;
  user: null | {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string;
    role: Exclude<SessionRole, 'guest'>;
  };
  csrfToken: string | null;
  expiresAt: string | null;
}
