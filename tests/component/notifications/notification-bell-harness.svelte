<script lang="ts">
  import { setContext, untrack } from 'svelte';
  import { setQueryClientContext, type QueryClient } from '@tanstack/svelte-query';
  import { SESSION_CONTEXT } from '$lib/stores/session.svelte';
  import NotificationBell from '$lib/components/notifications/NotificationBell.svelte';
  type Session = { authenticated: boolean; user: null | { id: string; displayName: string; role: 'user' | 'ctv' | 'admin' } };
  let { client, initial, ready = true }: { client: QueryClient; initial: Session; ready?: boolean } = $props();
  let session = $state(untrack(() => initial));
  let resolved = $state(untrack(() => ready));
  setQueryClientContext(untrack(() => client));
  setContext(SESSION_CONTEXT, { get initialResolutionComplete() { return resolved; } });
  export function select(next: Session) { session = next; }
  export function resolve() { resolved = true; }
</script>
<NotificationBell {session} />
