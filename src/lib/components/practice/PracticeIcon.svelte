<script lang="ts">
  let { index, size = 60 }: { index: number; size?: number } = $props();
</script>
<span class="practice-icon" aria-hidden="true" style:width={`${size}px`} style:height={`${size}px`} style:min-width={`${size}px`} style:max-width={`${size}px`} style:flex-grow={0} style:flex-shrink={0} style:background-position={`${(index % 5) * 25}% ${Math.floor(index / 5) * 25}%`}></span>
<style>
  .practice-icon{display:inline-block;aspect-ratio:1;background-image:url('/images/practice/practice-icons.webp?v=aligned-2');background-size:500% 500%;background-repeat:no-repeat;vertical-align:middle;border-radius:50%}
</style>
