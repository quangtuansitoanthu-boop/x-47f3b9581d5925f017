<script lang="ts">
  import type { AdminTrafficInterval } from '$lib/domain/admin-date-range';
  import { onMount } from 'svelte';
  import TrafficMetricTabs from './TrafficMetricTabs.svelte';
  import type { TrafficChartMetric, TrafficChartPoint, TrafficMetricFormat, TrafficMetricKey } from './traffic-chart-types';

  interface Props {
    compact?: boolean;
    daily: TrafficChartPoint[];
    interval?: AdminTrafficInterval;
    metrics?: TrafficChartMetric[];
    panelId?: string;
    periodLabel?: string;
  }

  let {
    compact = false, daily, interval = 'day', metrics = [],
    panelId = 'traffic-chart-panel', periodLabel = '14 ngày gần nhất',
  }: Props = $props();

  let width = $state(760);
  let canvasElement: HTMLDivElement | undefined;
  const height = 260;
  const inset = { top: 24, right: 20, bottom: 38, left: 42 };
  const chartBottom = height - inset.bottom;
  const numberFormat = new Intl.NumberFormat('vi-VN');
  const decimalFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
  const dateFormat = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
  const defaultMetric: TrafficChartMetric = { format: 'number', key: 'visitors', label: 'Khách duy nhất', value: '' };
  let selectedMetric = $state<TrafficMetricKey>('visitors');
  let activePointIndex = $state<number | null>(null);

  const hasMetricTabs = $derived(metrics.length > 0);
  const selectedConfig = $derived(metrics.find((metric) => metric.key === selectedMetric) ?? defaultMetric);
  const selectedValues = $derived(daily.map((point) => metricValue(point, selectedMetric)));
  const hasPageviews = $derived(!hasMetricTabs && daily.some((point) => point.pageviews !== undefined));
  const maxValue = $derived(Math.max(1, ...selectedValues, ...(hasPageviews ? daily.map((point) => point.pageviews ?? 0) : [])));
  const gridRatios = $derived(maxValue === 1 ? [0, 1] : [0, .5, 1]);
  const points = $derived(daily.map((point, index) => ({
    ...point,
    value: selectedValues[index] ?? 0,
    x: inset.left + (daily.length <= 1 ? 0 : index * (width - inset.left - inset.right) / (daily.length - 1)),
    y: chartBottom - (selectedValues[index] ?? 0) * (chartBottom - inset.top) / maxValue,
  })));
  const linePath = $derived(points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' '));
  const pageviewPoints = $derived(daily.map((point, index) => ({
    ...point,
    x: inset.left + (daily.length <= 1 ? 0 : index * (width - inset.left - inset.right) / (daily.length - 1)),
    y: chartBottom - (point.pageviews ?? 0) * (chartBottom - inset.top) / maxValue,
  })));
  const pageviewPath = $derived(pageviewPoints.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' '));
  const areaPath = $derived(points.length
    ? `M ${points[0].x} ${chartBottom} ${points.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')} L ${points[points.length - 1]?.x} ${chartBottom} Z`
    : '');
  const hasTraffic = $derived(selectedValues.some((value) => value > 0) || (hasPageviews && daily.some((point) => (point.pageviews ?? 0) > 0)));
  const activePoint = $derived(activePointIndex === null ? null : points[activePointIndex] ?? null);
  const chartAriaLabel = $derived(`Biểu đồ ${selectedConfig.label.toLocaleLowerCase('vi')} theo ${interval === 'month' ? 'tháng' : 'ngày'} trong ${periodLabel}`);
  const tickCapacity = $derived(Math.max(2, Math.min(10, Math.floor(width / 72))));
  const tickStep = $derived(Math.max(interval === 'month' ? 2 : 1, Math.ceil(daily.length / tickCapacity)));
  const pointStep = $derived(interval === 'month' ? 1 : Math.max(1, Math.ceil(daily.length / 60)));
  const trend = $derived.by(() => {
    const midpoint = Math.floor(daily.length / 2);
    const previous = aggregate(daily.slice(0, midpoint), selectedMetric);
    const current = aggregate(daily.slice(midpoint), selectedMetric);
    if (!previous && !current) return 'Chưa có đủ dữ liệu để nhận diện xu hướng.';
    if (!previous) return `Nửa khoảng thời gian gần nhất ghi nhận ${formatMetricValue(current, selectedConfig.format)}.`;
    const change = Math.round((current - previous) / previous * 100);
    if (!change) return 'Nửa khoảng thời gian gần nhất ổn định so với nửa trước.';
    return `Nửa khoảng thời gian gần nhất ${change > 0 ? 'tăng' : 'giảm'} ${numberFormat.format(Math.abs(change))}% so với nửa trước.`;
  });
  const dateLabel = (value: string) => {
    if (interval !== 'month') return dateFormat.format(new Date(`${value}T00:00:00+07:00`));
    const [year, month] = value.split('-');
    return `Tháng ${Number(month)}, ${year}`;
  };

  $effect(() => {
    if (metrics.length && !metrics.some((metric) => metric.key === selectedMetric)) selectedMetric = metrics[0].key;
  });
  $effect(() => { if (activePointIndex !== null && activePointIndex >= points.length) activePointIndex = null; });

  onMount(() => {
    if (!canvasElement) return;
    const element = canvasElement;
    const measure = () => {
      const nextWidth = Math.min(760, Math.round(element.getBoundingClientRect().width));
      if (nextWidth > 0 && nextWidth !== width) width = nextWidth;
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  });

  function selectMetric(key: TrafficMetricKey): void { selectedMetric = key; activePointIndex = null; }

  function activateNearestPoint(event: PointerEvent): void {
    if (!points.length) return;
    const rect = (event.currentTarget as SVGGraphicsElement).getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    activePointIndex = Math.round(ratio * (points.length - 1));
  }

  function handlePointKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Escape') { activePointIndex = null; return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activePointIndex = index; return; }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const interactiveIndexes = points.flatMap((_, pointIndex) => pointIndex % pointStep === 0 || pointIndex === points.length - 1 ? [pointIndex] : []);
    const currentPosition = interactiveIndexes.indexOf(index);
    const nextPosition = Math.min(interactiveIndexes.length - 1, Math.max(0, currentPosition + (event.key === 'ArrowRight' ? 1 : -1)));
    const next = interactiveIndexes[nextPosition] ?? index;
    activePointIndex = next;
    const nextPoint = document.querySelector<SVGGElement>(`#${panelId} [data-point-index="${next}"]`);
    nextPoint?.focus();
  }

  function metricValue(point: TrafficChartPoint, key: TrafficMetricKey): number {
    const value = Number(point[key] ?? 0);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }

  function aggregate(pointsInRange: TrafficChartPoint[], key: TrafficMetricKey): number {
    if (!pointsInRange.length) return 0;
    if (key === 'viewsPerVisit') {
      const visits = pointsInRange.reduce((sum, point) => sum + metricValue(point, 'visits'), 0);
      const pageviews = pointsInRange.reduce((sum, point) => sum + metricValue(point, 'pageviews'), 0);
      return visits ? pageviews / visits : 0;
    }
    if (key === 'bounceRate' || key === 'averageDurationSeconds') {
      const visits = pointsInRange.reduce((sum, point) => sum + metricValue(point, 'visits'), 0);
      const weighted = pointsInRange.reduce((sum, point) => sum + metricValue(point, key) * metricValue(point, 'visits'), 0);
      return visits ? weighted / visits : 0;
    }
    return pointsInRange.reduce((sum, point) => sum + metricValue(point, key), 0);
  }

  function formatMetricValue(value: number, format: TrafficMetricFormat): string {
    if (format === 'duration') {
      const seconds = Math.round(value);
      if (seconds < 60) return `${seconds} giây`;
      return `${Math.floor(seconds / 60)} phút ${seconds % 60} giây`;
    }
    if (format === 'percent') return `${decimalFormat.format(value)}%`;
    if (format === 'decimal') return decimalFormat.format(value);
    return numberFormat.format(Math.round(value));
  }

  function formatAxisValue(value: number, format: TrafficMetricFormat): string {
    if (format === 'duration') return value >= 60 ? `${decimalFormat.format(value / 60)}p` : `${numberFormat.format(Math.round(value))}s`;
    return formatMetricValue(value, format);
  }
</script>

<figure
  class:traffic-chart--compact={compact}
  class:traffic-chart--metrics={hasMetricTabs}
  class="traffic-chart"
  data-active-metric={selectedMetric}
  aria-labelledby="traffic-chart-title"
  aria-describedby="traffic-chart-summary"
>
  <figcaption class:visually-hidden={hasMetricTabs}>
    <div><span>{periodLabel}</span><h2 id="traffic-chart-title">Nhịp truy cập</h2></div>
    <p id="traffic-chart-summary">{trend}</p>
  </figcaption>
  {#if hasMetricTabs}
    <TrafficMetricTabs metrics={metrics} onSelect={selectMetric} {panelId} selected={selectedMetric} />
  {/if}
  {#if hasPageviews}<div class="traffic-chart__legend" aria-label="Chú thích biểu đồ"><span><i></i>Khách duy nhất</span><span><i class="pageviews"></i>Lượt xem trang</span></div>{/if}
  <div
    id={panelId}
    class="traffic-chart__panel"
    role={hasMetricTabs ? 'tabpanel' : undefined}
    aria-labelledby={hasMetricTabs ? `${panelId}-tab-${selectedMetric}` : undefined}
  >
    {#if hasMetricTabs}<p class="traffic-chart__sr-status" aria-live="polite">Đang hiển thị {selectedConfig.label}: {selectedConfig.value}</p>{/if}
    <div bind:this={canvasElement} class="traffic-chart__canvas">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={chartAriaLabel} preserveAspectRatio="xMidYMid meet">
        {#each gridRatios as ratio}
          {@const y = chartBottom - ratio * (chartBottom - inset.top)}
          <line class="traffic-chart__grid" x1={inset.left} x2={width - inset.right} y1={y} y2={y} />
          <text class="traffic-chart__axis" x={inset.left - 10} y={y + 4} text-anchor="end">{formatAxisValue(maxValue * ratio, selectedConfig.format)}</text>
        {/each}
        {#if areaPath}<path class="traffic-chart__area" d={areaPath} />{/if}
        {#if linePath}<path class="traffic-chart__line" d={linePath} />{/if}
        {#if hasPageviews && pageviewPath}<path class="traffic-chart__line traffic-chart__line--pageviews" d={pageviewPath} />{/if}
        <rect
          class="traffic-chart__hit-surface"
          role="presentation"
          aria-hidden="true"
          x={inset.left}
          y={inset.top}
          width={width - inset.left - inset.right}
          height={chartBottom - inset.top}
          onpointermove={(event) => { if (event.pointerType === 'mouse') activateNearestPoint(event); }}
          onpointerdown={activateNearestPoint}
          onpointerleave={(event) => { if (event.pointerType === 'mouse') activePointIndex = null; }}
        />
        {#if activePoint}<line class="traffic-chart__guide" x1={activePoint.x} x2={activePoint.x} y1={inset.top} y2={chartBottom} />{/if}
        {#each points as point, index}
          {#if index % pointStep === 0 || index === points.length - 1}
            <g
              class:active={activePointIndex === index}
              class="traffic-chart__point"
              data-point-index={index}
              role="button"
              tabindex="0"
              aria-label={`${dateLabel(point.date)}: ${selectedConfig.label} ${formatMetricValue(point.value, selectedConfig.format)}`}
              aria-describedby={activePointIndex === index ? `${panelId}-tooltip` : undefined}
              onmouseenter={() => activePointIndex = index}
              onmouseleave={() => activePointIndex = null}
              onfocus={() => activePointIndex = index}
              onblur={() => activePointIndex = null}
              onpointerdown={() => activePointIndex = index}
              onkeydown={(event) => handlePointKeydown(event, index)}
            >
              <circle class="traffic-chart__point-hit" cx={point.x} cy={point.y} r="12" />
              <circle class="traffic-chart__dot" cx={point.x} cy={point.y} r="4" />
            </g>
          {/if}
          {#if index % tickStep === 0 || (interval === 'day' && index === points.length - 1)}
            <text class="traffic-chart__axis traffic-chart__date" x={point.x} y={height - 12} text-anchor="middle">{dateLabel(point.date)}</text>
          {/if}
        {/each}
      </svg>
      {#if activePoint}
        <div
          id={`${panelId}-tooltip`}
          class:traffic-chart__tooltip--left={activePoint.x > width * .66}
          class:traffic-chart__tooltip--below={activePoint.y < height * .38}
          class="traffic-chart__tooltip"
          role="tooltip"
          style={`--traffic-tooltip-x:${activePoint.x / width * 100}%;--traffic-tooltip-y:${activePoint.y / height * 100}%`}
        >
          <strong>{selectedConfig.label}</strong>
          <div><span><i aria-hidden="true"></i>{dateLabel(activePoint.date)}</span><b>{formatMetricValue(activePoint.value, selectedConfig.format)}</b></div>
          {#if hasPageviews}<div><span><i class="pageviews" aria-hidden="true"></i>Lượt xem trang</span><b>{numberFormat.format(activePoint.pageviews ?? 0)}</b></div>{/if}
        </div>
      {/if}
      {#if !hasTraffic}<p class="traffic-chart__empty">Chưa có dữ liệu {selectedConfig.label.toLocaleLowerCase('vi')} trong khoảng thời gian này.</p>{/if}
    </div>
    {#if !compact}
      <details class="traffic-chart__details">
        <summary>{interval === 'month' ? 'Xem dữ liệu theo tháng' : 'Xem dữ liệu từng ngày'}</summary>
        <div class="traffic-chart__table-wrap">
          <table>
            <caption class="visually-hidden">Dữ liệu {selectedConfig.label.toLocaleLowerCase('vi')} theo {interval === 'month' ? 'tháng' : 'ngày'} trong {periodLabel}</caption>
            <thead><tr><th scope="col">{interval === 'month' ? 'Tháng' : 'Ngày'}</th><th scope="col">{selectedConfig.label}</th>{#if hasPageviews}<th scope="col">Lượt xem trang</th>{/if}</tr></thead>
            <tbody>{#each points as point}<tr><td>{dateLabel(point.date)}</td><td>{formatMetricValue(point.value, selectedConfig.format)}</td>{#if hasPageviews}<td>{numberFormat.format(point.pageviews ?? 0)}</td>{/if}</tr>{/each}</tbody>
          </table>
        </div>
      </details>
    {/if}
  </div>
</figure>
