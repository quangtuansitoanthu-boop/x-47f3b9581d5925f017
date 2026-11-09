interface PrivateReadingSession {
  authenticated: boolean;
  user?: null | { id: string };
}

export interface PrivateReadingPrincipalToken {
  readonly generation: number;
  readonly principalId: string | null;
}

function principalId(session: PrivateReadingSession): string | null {
  return session.authenticated && session.user?.id ? String(session.user.id) : null;
}

export function createPrivateReadingPrincipalGuard(initialSession: PrivateReadingSession) {
  let activePrincipalId = principalId(initialSession);
  let generation = 0;

  return {
    capture(): PrivateReadingPrincipalToken {
      return { generation, principalId: activePrincipalId };
    },

    invalidate(): void {
      generation += 1;
    },

    isCurrent(token: PrivateReadingPrincipalToken): boolean {
      return token.generation === generation && token.principalId === activePrincipalId;
    },

    transition(nextSession: PrivateReadingSession): boolean {
      const nextPrincipalId = principalId(nextSession);
      if (nextPrincipalId === activePrincipalId) return false;
      activePrincipalId = nextPrincipalId;
      generation += 1;
      return true;
    },
  };
}
