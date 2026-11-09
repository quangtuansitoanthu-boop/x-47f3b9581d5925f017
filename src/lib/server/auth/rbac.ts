const RANK = { guest: 0, user: 1, ctv: 2, admin: 3 } as const;

export function hasRole(session: { role?: string | null } | null | undefined, minimum: 'guest' | 'user' | 'ctv' | 'admin'): boolean {
  const role = session?.role === 'user' || session?.role === 'ctv' || session?.role === 'admin'
    ? session.role
    : 'guest';
  return RANK[role] >= RANK[minimum];
}

export function can(session: { role?: string | null } | null | undefined, capability: string): boolean {
  const role = session?.role === 'user' || session?.role === 'ctv' || session?.role === 'admin'
    ? session.role
    : 'guest';
  const matrix: Record<string, Array<'guest' | 'user' | 'ctv' | 'admin'>> = {
    'articles:read': ['guest', 'user', 'ctv', 'admin'],
    'articles:write': ['ctv', 'admin'],
    'articles:delete': ['admin'],
    'comments:create': ['guest', 'user', 'ctv', 'admin'],
    'comments:contact': ['admin'],
    'talks:read-private': ['ctv', 'admin'],
    'talks:write': ['ctv', 'admin'],
    'talks:delete': ['admin'],
    'talks:drive-scan': ['admin'],
    'downloads:use': ['user', 'ctv', 'admin'],
    'sync:own': ['user', 'ctv', 'admin'],
    'media:upload': ['ctv', 'admin'],
    'media:delete': ['admin'],
    'admin:dashboard': ['admin'],
    'members:manage': ['admin'],
    'notifications:read': ['ctv', 'admin'],
  };
  return matrix[capability]?.includes(role) === true;
}
