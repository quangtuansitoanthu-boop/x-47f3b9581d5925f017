<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ChevronRight } from '@lucide/svelte';

  let { id, title, description, active = $bindable(''), children }: {
    id: string;
    title: string;
    description: string;
    active?: string;
    children: Snippet;
  } = $props();
</script>

<!-- Giữ nội dung mounted khi đóng để bảo toàn draft và lifecycle của owner. -->
<details id={`settings-${id}`} class="settings-section" open={active === id} ontoggle={(event) => {
  if (event.currentTarget.open) active = id;
  else if (active === id) active = '';
}}>
  <summary>
    <span><strong>{title}</strong><small>{description}</small></span>
    <span class="settings-section-arrow" aria-hidden="true"><ChevronRight size={20} /></span>
  </summary>
  <div class="settings-section-body">{@render children()}</div>
</details>
