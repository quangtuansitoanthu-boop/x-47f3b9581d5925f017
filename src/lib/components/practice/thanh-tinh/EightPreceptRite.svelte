<script lang="ts">
  import type { RiteBlock } from '$lib/content/eight-precept-rite';
  let { blocks, language }: { blocks: readonly RiteBlock[]; language: 0 | 1 } = $props();

  function parts(text: string) {
    // Giữ cả dấu ngoặc trong phần in nghiêng, không dựng HTML từ nội dung.
    const result: { value: string; italic: boolean }[] = [];
    let value = '';
    let depth = 0;
    for (const character of text.replace(/\(C\)/g, '')) {
      if (character === '(' && depth === 0 && value) { result.push({ value, italic: false }); value = ''; }
      if (character === '(') depth += 1;
      value += character;
      if (character === ')' && depth > 0) {
        depth -= 1;
        if (depth === 0) { result.push({ value, italic: true }); value = ''; }
      }
    }
    if (value) result.push({ value, italic: depth > 0 });
    return result;
  }
</script>

{#snippet text(value: string)}
  {#each parts(value) as part, index (index)}{#if part.italic}<em>{part.value}</em>{:else}{part.value}{/if}{/each}
{/snippet}

<section class="eight-rite-content">
  {#each blocks as block (block.id)}
    {#if block.kind === 'title'}
      <h3>{@render text(block.text[language])}</h3>
    {:else if block.kind === 'verse'}
      <p class="verse">{#each block.lines as line, index (index)}<span>{@render text(line[language])}</span>{/each}</p>
    {:else if block.kind === 'instruction'}
      <p class="instruction"><em>{block.text[language].replace(/\(C\)/g, '')}</em></p>
    {:else}
      <p>{@render text(block.text[language])}</p>
    {/if}
  {/each}
</section>

<style>
  .eight-rite-content { display: grid; gap: var(--radius-card); font-family: var(--font-reader); line-height: 1.8; overflow-wrap: anywhere; }
  h3 { margin: var(--space-page) 0 0; padding-bottom: var(--radius-control); border-bottom: 1px solid var(--border); text-align: center; font-size: inherit; font-weight: 700; }
  h3:first-child { margin-top: 0; }
  p { margin: 0; text-align: justify; }
  .verse { text-align: center; }
  .verse span { display: block; }
  .instruction { color: var(--text2); }
</style>
