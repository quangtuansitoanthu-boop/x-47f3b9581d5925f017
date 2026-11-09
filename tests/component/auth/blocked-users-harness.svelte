<script lang="ts">
  import BlockedUsers from '$lib/components/settings/BlockedUsers.svelte';
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let principalId = $state('owner-a');
  export function switchAccount() { principalId = 'owner-b'; }
  export function queryClient() { return client; }
</script>
<QueryClientProvider {client}><BlockedUsers {principalId} /></QueryClientProvider>
