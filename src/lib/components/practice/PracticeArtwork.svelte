<script lang="ts">
  import AppArtwork from '$lib/components/icons/AppArtwork.svelte';

  let { kind, size = 48 }: { kind: string; size?: number } = $props();

  const names: Record<string, string> = {
    'thien-dinh': 'meditation',
    'tung-kinh': 'recitation',
    'tri-chu': 'chanting',
    'le-phat': 'bowing',
    'thanh-tinh': 'abstinence',
    rosary: 'rosary',
    'nghi-thuc': 'ritual'
  };
  const name = $derived(names[kind] ?? 'ritual');
</script>

<AppArtwork {name} {size} />
