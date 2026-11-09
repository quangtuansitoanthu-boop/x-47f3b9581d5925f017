/** The signed-in role comes from the existing server session, never a local preference. */
export function canPasteCopy(authenticated: boolean, role?: string): boolean {
  return authenticated && role === 'admin';
}
