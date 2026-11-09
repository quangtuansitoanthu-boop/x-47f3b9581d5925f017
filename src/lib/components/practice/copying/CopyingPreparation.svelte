<script lang="ts">
  import { ChevronDown, ChevronUp } from '@lucide/svelte';
  import { createInterfaceTranslator } from '$lib/i18n/copying-interface';
  const localizeUi = createInterfaceTranslator();
  import { COPYING_PREPARATION_SECTIONS as sections } from '$lib/i18n/copying-preparation';
  let expanded = $state(false);
</script>

<div class="preparation" data-testid="copying-preparation">
  <button class="preparation-toggle" type="button" aria-expanded={expanded} aria-controls="copying-preparation-content" onclick={() => expanded = !expanded}>
    <span>{localizeUi(expanded ? 'Thu gọn' : 'Xem hướng dẫn')}</span>
    {#if expanded}<ChevronUp size={20} aria-hidden="true" />{:else}<ChevronDown size={20} aria-hidden="true" />{/if}
  </button>
  <div class="preparation-content" id="copying-preparation-content" hidden={!expanded}>
  <p class="preparation-context">{localizeUi('Hướng dẫn dành cho việc tự gõ kinh trên điện thoại, máy tính bảng hoặc máy tính.')}</p>
  <p class="preparation-intro">{localizeUi('Bạn có thể chép vào thời gian thuận tiện, tại bất cứ nơi nào giữ được sạch sẽ và trang nghiêm. Điều quan trọng là sự chuẩn bị, lòng cung kính và tâm chuyên chú.')}</p>
  {#each sections as section, index (section.title)}
    <section aria-labelledby={`copy-preparation-${index}`}>
      <h2 id={`copy-preparation-${index}`}>{index + 1}. {localizeUi(section.title)}</h2>
      {#each section.paragraphs as paragraph (paragraph)}<p>{localizeUi(paragraph)}</p>{/each}
    </section>
  {/each}
  </div>
</div>

<style>
  .preparation{display:grid;gap:var(--radius-control);margin-bottom:var(--radius-feature);color:var(--text);font-family:var(--font-app)}
  .preparation-toggle{display:flex;align-items:center;justify-content:space-between;gap:var(--radius-control);width:100%;min-height:44px;padding:var(--radius-control) var(--space-page);border:1px solid var(--border);border-radius:var(--radius-card);background:var(--gold-light);color:var(--text);font:inherit;font-weight:600;text-align:left;cursor:pointer}
  .preparation-content{font-family:var(--font-reader)}
  .preparation-content:not([hidden]){display:grid;gap:var(--radius-control)}
  section,.preparation-intro{padding:var(--space-page);border:1px solid var(--border);border-radius:var(--radius-card);background:var(--card)}
  .preparation-intro{margin:0;background:var(--gold-light);color:var(--text);font-size:var(--font-size-body);line-height:1.8}
  h2{margin:0 0 var(--radius-control);font-size:var(--font-size-card-title);line-height:1.5;font-weight:700;text-align:center}
  p{margin:var(--radius-sm) 0 0;color:var(--text2);font-size:var(--font-size-body);line-height:1.85;overflow-wrap:anywhere;text-align:justify}
  @media(max-width:700px){section,.preparation-intro{padding:var(--radius-control)}}
</style>
