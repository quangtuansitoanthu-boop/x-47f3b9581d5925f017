<script lang="ts">
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import { onMount } from 'svelte';
  import { setSessionContext, registerBrowserSessionStore } from '$lib/stores/session.svelte';
  import { setLocaleContext } from '$lib/stores/locale.svelte';
  import ContentUpdateControl from '$lib/components/home/ContentUpdateControl.svelte';
  const user = (id: string) => ({ authenticated: true, user: { id, displayName: id, role: 'user' as const, email: '' }, csrfToken: 'csrf', expiresAt: null });
  const store = setSessionContext(user('a'), true);
  onMount(() => registerBrowserSessionStore(store));
  setLocaleContext('vi');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
</script>
<QueryClientProvider client={client}><ContentUpdateControl /></QueryClientProvider>
<button id="switch-account" onclick={() => store.set(user('b'))}>Switch</button>

<button id="aba-account" onclick={() => { store.set(user('b')); store.set(user('a')); }}>Switch back</button>
