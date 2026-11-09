<script lang="ts">
  import type { AnalyticsIconDimension } from './analytics-breakdown';
  import { countryFlag, getBrandIcon, getLucideIcon, resolveAnalyticsIcon } from './analytics-row-icon-registry';

  interface Props {
    dimension: AnalyticsIconDimension;
    label: string;
  }

  let { dimension, label }: Props = $props();
  const normalized = $derived(label.trim().toLocaleLowerCase('vi-VN'));
  const icon = $derived(resolveAnalyticsIcon(dimension, normalized));
  const flag = $derived(dimension === 'country' ? countryFlag(label) : '');
  const brandIcon = $derived(getBrandIcon(icon));
  const lucideIcon = $derived(getLucideIcon(icon));
</script>

<span class={`analytics-row-icon analytics-row-icon--${icon}`} aria-hidden="true" data-icon={icon}>
  {#if flag}
    <span class="analytics-row-icon__flag">{flag}</span>
  {:else if brandIcon}
    {@const BrandIcon = brandIcon.component}
    <BrandIcon color={brandIcon.color} size={18} title="" />
  {:else if lucideIcon}
    {@const LucideIcon = lucideIcon.component}
    <LucideIcon color={lucideIcon.color} size={18} strokeWidth={1.8} />
  {/if}
</span>
