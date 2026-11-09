<script lang="ts">
  import type { TrafficChartMetric, TrafficMetricKey } from './traffic-chart-types';

  interface Props {
    metrics: TrafficChartMetric[];
    onSelect: (key: TrafficMetricKey) => void;
    panelId: string;
    selected: TrafficMetricKey;
  }

  let { metrics, onSelect, panelId, selected }: Props = $props();

  function handleKeydown(event: KeyboardEvent, index: number): void {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % metrics.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + metrics.length) % metrics.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = metrics.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const next = metrics[nextIndex];
    onSelect(next.key);
    requestAnimationFrame(() => document.getElementById(`${panelId}-tab-${next.key}`)?.focus());
  }
</script>

<div class="traffic-chart__metrics" role="tablist" aria-label="Chỉ số biểu đồ" aria-orientation="horizontal">
  {#each metrics as metric, index}
    <button
      id={`${panelId}-tab-${metric.key}`}
      type="button"
      role="tab"
      aria-controls={panelId}
      aria-selected={selected === metric.key}
      tabindex={selected === metric.key ? 0 : -1}
      onclick={() => onSelect(metric.key)}
      onkeydown={(event) => handleKeydown(event, index)}
    >
      <span>{metric.label}</span>
      <strong>{metric.value}</strong>
    </button>
  {/each}
</div>
