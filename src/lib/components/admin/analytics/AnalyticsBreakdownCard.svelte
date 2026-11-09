<script lang="ts">
  import AnalyticsBreakdownList from './AnalyticsBreakdownList.svelte';
  import type { AnalyticsBreakdownRowView, AnalyticsIconDimension } from './analytics-breakdown';

  interface Props {
    emptyMessage: string;
    iconDimension?: AnalyticsIconDimension;
    rows: AnalyticsBreakdownRowView[];
    title: string;
  }

  let { emptyMessage, iconDimension, rows, title }: Props = $props();
</script>

<section class="analytics-breakdown" aria-labelledby={`analytics-${title.toLowerCase().replace(/\s+/gu, '-')}`}>
  <header><h2 id={`analytics-${title.toLowerCase().replace(/\s+/gu, '-')}`}>{title}</h2></header>
  <AnalyticsBreakdownList {emptyMessage} {iconDimension} {rows} />
</section>
