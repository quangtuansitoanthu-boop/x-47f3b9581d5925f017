<script lang="ts">
  import AnalyticsBreakdownList from './AnalyticsBreakdownList.svelte';
  import type { AnalyticsBreakdownTabView } from './analytics-breakdown';

  interface Props {
    cardId: string;
    label: string;
    tabs: AnalyticsBreakdownTabView[];
  }

  let { cardId, label, tabs }: Props = $props();
  let activeId = $state('');
  const activeTab = $derived(tabs.find((tab) => tab.id === activeId) ?? tabs[0]);

  function selectTab(id: string): void {
    activeId = id;
  }

  function handleTabKeydown(event: KeyboardEvent, index: number): void {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    activeId = tabs[next].id;
    queueMicrotask(() => document.getElementById(`${cardId}-tab-${tabs[next].id}`)?.focus());
  }
</script>

<section class="analytics-breakdown analytics-breakdown--tabs" aria-label={label}>
  <div class="analytics-breakdown__tabs" role="tablist" aria-label={label}>
    {#each tabs as tab, index}
      <button
        id={`${cardId}-tab-${tab.id}`}
        type="button"
        role="tab"
        aria-controls={`${cardId}-panel-${tab.id}`}
        aria-selected={activeTab?.id === tab.id}
        tabindex={activeTab?.id === tab.id ? 0 : -1}
        onclick={() => selectTab(tab.id)}
        onkeydown={(event) => handleTabKeydown(event, index)}
      >{tab.label}</button>
    {/each}
  </div>
  {#if activeTab}
    <div
      class="analytics-breakdown__panel"
      id={`${cardId}-panel-${activeTab.id}`}
      role="tabpanel"
      aria-labelledby={`${cardId}-tab-${activeTab.id}`}
      tabindex="0"
    >
      <AnalyticsBreakdownList rows={activeTab.rows} emptyMessage={activeTab.emptyMessage} iconDimension={activeTab.iconDimension} />
    </div>
  {/if}
</section>
