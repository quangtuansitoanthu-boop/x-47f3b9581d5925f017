interface ContentAccessSession {
  authenticated: boolean;
  user: null | { id: string; role?: string | null };
}

export interface SessionContentToken {
  generation: number;
  identity: string;
}

export function createSessionContentGuard(initial: ContentAccessSession) {
  let identity = contentAccessIdentity(initial);
  let generation = 0;
  return {
    capture(): SessionContentToken {
      return { generation, identity };
    },
    isCurrent(token: SessionContentToken): boolean {
      return token.generation === generation && token.identity === identity;
    },
    transition(next: ContentAccessSession): boolean {
      const nextIdentity = contentAccessIdentity(next);
      if (nextIdentity === identity) return false;
      identity = nextIdentity;
      generation += 1;
      return true;
    },
  };
}

function contentAccessIdentity(session: ContentAccessSession): string {
  const principalId = session.authenticated && session.user?.id ? session.user.id : 'anonymous';
  const role = session.user?.role === 'admin' || session.user?.role === 'ctv' || session.user?.role === 'user'
    ? session.user.role
    : 'guest';
  return `${encodeURIComponent(principalId)}:${role}`;
}
