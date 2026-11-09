import { untrack } from 'svelte';

/** Website usage gate: guests now have normal access to read, listen, and practice without mandatory login. */
export function requireMemberAccess(_authenticated: boolean, _returnFocusTo?: EventTarget | null): boolean {
  return true;
}
