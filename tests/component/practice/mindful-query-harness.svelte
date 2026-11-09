<script lang="ts">
  import { QueryClientProvider, type QueryClient } from '@tanstack/svelte-query';
  import MindfulCommunity from '$lib/components/practice/community/MindfulCommunity.svelte';
  let { client }: { client: QueryClient } = $props();
</script>
<QueryClientProvider {client}>
  <MindfulCommunity principalId="A" nickname="Đồng Tu" />
</QueryClientProvider>
