<script lang="ts">
  import { QueryClientProvider, type QueryClient } from '@tanstack/svelte-query';
  import { untrack } from 'svelte';
  import MindfulCommunity from '$lib/components/practice/community/MindfulCommunity.svelte';
  let { client, target = null, reaction = null, onClose = () => {} }: { client: QueryClient; target?: string | null; reaction?: string | null; onClose?: () => void } = $props();
  let principal = $state<string | null>('A');
  let postId = $state(untrack(() => target));
  let intent = $state(1);
  let reactionId = $state(untrack(() => reaction));
  export function openTarget(value: string | null, eventId: string | null = null) { postId = value; reactionId = eventId; intent++; }
  export function selectPrincipal(value: string | null) { principal = value; }
</script>
<QueryClientProvider {client}>
  <MindfulCommunity principalId={principal} nickname="Đồng Tu" targetPostId={postId} targetReactionId={reactionId} targetIntent={intent} onTargetClose={onClose} />
</QueryClientProvider>
