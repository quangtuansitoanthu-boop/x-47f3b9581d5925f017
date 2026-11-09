const RANK = { guest: 0, user: 1, ctv: 2, admin: 3 };

export function hasRole(session, minimum) {
  const role = session?.role || 'guest';
  return RANK[role] >= RANK[minimum];
}

export function can(session, capability) {
  const role = session?.role || 'guest';
  const matrix = {
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
  };
  return matrix[capability]?.includes(role) === true;
}
