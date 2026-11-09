<script lang="ts">
  import AccountPage from '../../../src/routes/ca-nhan/+page.svelte';
  import SessionStatus from '$lib/components/auth/SessionStatus.svelte';
  import { setSessionContext, registerBrowserSessionStore } from '$lib/stores/session.svelte';
  import { setLocaleContext } from '$lib/stores/locale.svelte';
  import { setThemeContext } from '$lib/stores/theme.svelte';
  import { onDestroy, onMount } from 'svelte';
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  onDestroy(() => queryClient.clear());

  setLocaleContext('vi');
  let { showStatus = false }: { showStatus?: boolean } = $props();
  const theme = setThemeContext('light');
  const session = setSessionContext({ authenticated: true, csrfToken: 'csrf-a', expiresAt: null,
    user: { id: 'owner-a', email: '', displayName: 'Owner A', avatarUrl: '', role: 'user' } });
  onMount(() => registerBrowserSessionStore(session));
  export function switchAccount(id = 'owner-b') {
    session.set({ ...session.value, csrfToken: 'csrf-b', user: { ...session.value.user!, id, displayName: id } });
  }
  export function applyTheme() { theme.apply('dark'); }
  export function becomeGuest() { session.clear(); }
</script>

<QueryClientProvider client={queryClient}>
  {#if showStatus}<SessionStatus session={session.value} />{:else}<AccountPage />{/if}
</QueryClientProvider>
