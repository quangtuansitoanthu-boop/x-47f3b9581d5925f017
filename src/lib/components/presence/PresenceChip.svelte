<script lang="ts">
  interface Props {
    count?: number | null;
    hidden?: boolean;
    label?: string;
  }

  let { count = null, hidden = false, label = 'đang xem' }: Props = $props();

  const formatCount = (value: number) => (value > 999 ? '999+' : String(Math.max(0, value)));
</script>

{#if !hidden && count !== null}
  <span class="presence-chip" aria-label={`Khoảng ${formatCount(count)} người đang truy cập`}>
    <span class="presence-dot" aria-hidden="true"></span>
    <span>{formatCount(count)} {label}</span>
  </span>
{/if}

<style>
  .presence-chip {
    display: inline-flex;
    min-height: 28px;
    align-items: center;
    gap: 6px;
    padding: 0 9px;
    border: 1px solid var(--border2);
    border-radius: 999px;
    background: var(--gold-light);
    color: var(--brown);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    white-space: nowrap;
  }

  .presence-dot {
    width: 7px;
    height: 7px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--green-ok);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--green-ok) 18%, transparent);
  }

  @media (max-width: 480px) {
    .presence-chip {
      min-height: 30px;
      font-size: 10px;
    }
  }
</style>
