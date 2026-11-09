<script lang="ts">
  interface Props { today: number; thisMonth: number; thisYear: number; }
  let { today, thisMonth, thisYear }: Props = $props();
  const format = (value: number) => new Intl.NumberFormat('vi-VN').format(value);
  const metrics = $derived([
    { label: 'Hôm nay', value: today, note: 'khách duy nhất' },
    { label: 'Tháng này', value: thisMonth, note: 'khách duy nhất' },
    { label: 'Năm nay', value: thisYear, note: 'khách duy nhất' },
  ]);
</script>

<section class="traffic-summary" aria-labelledby="traffic-summary-title">
  <div class="traffic-summary__intro">
    <span>Truy cập</span>
    <h2 id="traffic-summary-title">Nhịp ghé thăm</h2>
    <p>Đếm theo trình duyệt, loại bỏ lượt heartbeat lặp.</p>
  </div>
  <dl>
    {#each metrics as metric}
      <div><dt>{metric.label}</dt><dd>{format(metric.value)}</dd><small>{metric.note}</small></div>
    {/each}
  </dl>
</section>
