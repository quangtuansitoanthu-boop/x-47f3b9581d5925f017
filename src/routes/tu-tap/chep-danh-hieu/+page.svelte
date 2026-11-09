<script lang="ts">
  import NameCopying from '$lib/components/practice/name-copying/NameCopying.svelte';
  import { getSessionContext } from '$lib/stores/session.svelte';
  import { NAME_COPYING_COPY as copy } from '$lib/domain/practice/name-copying-copy';
  import { createInterfaceTranslator } from '$lib/i18n/copying-interface';
  const t = createInterfaceTranslator();
  const session = getSessionContext();
  const principal = $derived(session.value.authenticated ? session.value.user?.id ?? null : null);
</script>

<svelte:head><title>{t(copy.title)} · Tu tập</title></svelte:head>

{#key principal}
  <NameCopying {principal} />
{/key}
