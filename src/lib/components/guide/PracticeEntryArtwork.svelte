<script lang="ts">
  let { name }: { name: 'beginner' | 'dharma' | 'study' | 'reminder' } = $props();
  const frames = {
    beginner: '0 0 512 512',
    dharma: '512 0 512 512',
    study: '0 512 512 512',
    reminder: '512 512 512 512',
  };
</script>

<svg class="practice-entry-artwork" viewBox={frames[name]} fill="none" aria-hidden="true" focusable="false">
  <image href="/images/icons/practice-entry-gold-v1.webp" width="1024" height="1024" />
</svg>

<style>
  .practice-entry-artwork { display:block; width:100%; height:100%; aspect-ratio:1; overflow:hidden; pointer-events:none; }
</style>
