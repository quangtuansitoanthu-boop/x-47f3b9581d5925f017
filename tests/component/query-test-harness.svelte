<script lang="ts">
  import type { Component } from 'svelte';
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';

  interface Props {
    Target: Component;
    targetProps?: Record<string, unknown>;
  }

  let { Target, targetProps = {} }: Props = $props();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { enabled: false, retry: false } },
  });
</script>

<QueryClientProvider client={queryClient}>
  <Target {...targetProps} />
</QueryClientProvider>
