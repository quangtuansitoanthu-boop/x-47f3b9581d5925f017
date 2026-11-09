<script lang="ts">
  import GuideBlocks from './GuideBlocks.svelte';
  import type { GuideSection as GuideSectionData } from '$lib/content/guide-content';

  interface Props {
    section: GuideSectionData;
    open: boolean;
    openFaqIds: ReadonlySet<string>;
    onToggle: (id: string, open: boolean) => void;
    onFaqToggle: (id: string, open: boolean) => void;
  }

  let { section, open, openFaqIds, onToggle, onFaqToggle }: Props = $props();
</script>

<details
  id={section.id}
  class="guide-section guide-focus-target"
  {open}
  ontoggle={(event) => onToggle(section.id, event.currentTarget.open)}
>
  <summary class="guide-section__summary">
    <span class="guide-section__title-group">
      <span class="guide-icon-badge" aria-hidden="true">{section.icon}</span>
      <span class="guide-section__title-text">{section.title}</span>
    </span>
    <span class="guide-section__chevron" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m6 9 6 6 6-6"/>
      </svg>
    </span>
  </summary>
  <div class="guide-section__body">
    {#each section.introduction as paragraph}<p class="guide-introduction">{paragraph}</p>{/each}

    {#each section.topics as topic}
      <section id={topic.id} class="guide-topic guide-focus-target" tabindex="-1">
        <h3>{topic.title}</h3>
        <GuideBlocks blocks={topic.blocks} />
      </section>
    {/each}

    {#if section.faqs?.length}
      <div class="guide-faq-list">
        {#each section.faqs as faq}
          <details
            id={faq.id}
            class="guide-faq guide-focus-target"
            open={openFaqIds.has(faq.id)}
            ontoggle={(event) => onFaqToggle(faq.id, event.currentTarget.open)}
          >
            <summary class="guide-faq__summary">
              <span class="guide-faq__q-text">{faq.question}</span>
              <span class="guide-faq__toggle" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </span>
            </summary>
            <div class="guide-faq__answer">
              {#each faq.answer as paragraph}<p>{paragraph}</p>{/each}
            </div>
          </details>
        {/each}
      </div>
    {/if}
  </div>
</details>
