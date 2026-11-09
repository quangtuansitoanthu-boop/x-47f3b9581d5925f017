<script lang="ts">
  import AnalyticsRowIcon from './AnalyticsRowIcon.svelte';
  import type { AnalyticsBreakdownRowView, AnalyticsIconDimension } from './analytics-breakdown';

  interface Props {
    emptyMessage: string;
    iconDimension?: AnalyticsIconDimension;
    rows: AnalyticsBreakdownRowView[];
  }

  let { emptyMessage, iconDimension, rows }: Props = $props();
  const numberFormat = new Intl.NumberFormat('vi-VN');
  const max = $derived(Math.max(1, ...rows.map((row) => row.value)));
</script>

{#if rows.length}
  <ol class="analytics-breakdown__list">
    {#each rows as row}
      <li>
        <span class="analytics-breakdown__bar" aria-hidden="true" style={`width:${Math.max(2, row.value / max * 100)}%`}></span>
        <div class="analytics-breakdown__row">
          <span class="analytics-breakdown__label">
            {#if iconDimension}<AnalyticsRowIcon dimension={iconDimension} label={row.label} />{/if}
            <span class="analytics-breakdown__label-copy">
              <span class="analytics-breakdown__label-text">{row.label}</span>
              {#if row.note}<small class="analytics-breakdown__note">{row.note}</small>{/if}
            </span>
          </span>
          <strong>{numberFormat.format(row.value)}</strong>
        </div>
      </li>
    {/each}
  </ol>
{:else}
  <p class="analytics-breakdown__empty">{emptyMessage}</p>
{/if}
