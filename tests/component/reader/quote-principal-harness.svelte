<script lang="ts">
  import QuotesPage from '../../../src/routes/trich-dan-cua-toi/+page.svelte';
  import ReadingAnnotations from '$lib/components/reader/ReadingAnnotations.svelte';
  import { setSessionContext, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import type { PageSessionDTO } from '$lib/server/auth/types';

  let { mode = 'quotes', targetAnnotationId = null }: { mode?: 'quotes' | 'inline'; targetAnnotationId?: string | null } = $props();
  let content = $state<HTMLElement | null>(null);
  function session(id: string | null): PageSessionDTO {
    return {
      authenticated: id !== null,
      csrfToken: id ? 'test-csrf' : null,
      expiresAt: null,
      user: id ? { id, email: '', displayName: id, avatarUrl: '', role: 'user' } : null,
    };
  }
  const store = setSessionContext(session('quote-owner-a'));
  export function changePrincipal(id: string | null) {
    const next = session(id);
    store.set(next);
    window.dispatchEvent(new CustomEvent(SESSION_CHANGE_EVENT, { detail: next }));
  }
</script>

{#if mode === 'quotes'}
  <QuotesPage />
{:else}
  <div bind:this={content}>Private quote from owner A</div>
  <ReadingAnnotations contentElement={content} contentId="principal-test-book" contentKind="article" session={store.value} {targetAnnotationId} />
{/if}
