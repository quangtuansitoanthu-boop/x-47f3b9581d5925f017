<script lang="ts">
  let { name, size = 48 }: { name: string; size?: number } = $props();

  // Một atlas trong suốt dùng chung; khung riêng giữ đủ bóng và ánh vàng của mỗi hình.
  const frames: Record<string, string> = {
    home: '16 62 299 248', books: '332 105 305 205', practice: '637 47 285 263', talks: '936 87 305 223',
    personal: '41 310 259 289', meditation: '322 354 311 245', rosary: '652 310 258 299', bowing: '946 339 275 262',
    precepts: '29 627 258 253', 'eight-precepts': '328 619 309 261', abstinence: '637 609 280 271', recitation: '947 658 285 222',
    'scripture-copying': '22 880 293 293', 'name-copying': '315 880 293 286', chanting: '652 880 283 307', ritual: '935 886 257 292'
  };
  const frame = $derived(frames[name] ?? frames.ritual);
</script>

<svg class="app-artwork" width={size} height={size} viewBox={frame} fill="none" aria-hidden="true" focusable="false">
  <image href="/images/icons/sac-moc-anh-kim-v1.webp" width="1254" height="1254" />
</svg>

<style>
  .app-artwork{display:block;flex-shrink:0;max-width:100%;height:auto;aspect-ratio:1;overflow:hidden}
</style>
