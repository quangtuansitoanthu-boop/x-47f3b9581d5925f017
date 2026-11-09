<script lang="ts">
  import RosarySelect from '$lib/components/practice/rosary/RosarySelect.svelte';
  import { CalendarDays, Check, ChevronDown } from '@lucide/svelte';
  import { onMount, tick } from 'svelte';
  import { page } from '$app/state';
  import {
    ADMIN_DATE_RANGE_OPTIONS,
    adminDateRangeLabel,
    type AdminDateRange,
  } from '$lib/domain/admin-date-range';

  interface Props {
    menuId?: string;
    value: AdminDateRange;
  }

  let { menuId = 'admin-date-range-menu', value }: Props = $props();
  let open = $state(false);
  let root: HTMLDivElement;
  let trigger = $state<HTMLButtonElement>();
  const selectedLabel = $derived(adminDateRangeLabel(value));

  onMount(() => {
    const closeOutside = (event: PointerEvent) => {
      if (open && root && !root.contains(event.target as Node)) open = false;
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (!open || event.key !== 'Escape') return;
      event.preventDefault();
      open = false;
      trigger?.focus();
    };
    const closeAfterFocusLeaves = (event: FocusEvent) => {
      if (open && root && !root.contains(event.target as Node)) open = false;
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeWithEscape);
    document.addEventListener('focusin', closeAfterFocusLeaves);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeWithEscape);
      document.removeEventListener('focusin', closeAfterFocusLeaves);
    };
  });

  async function openFromKeyboard(event: KeyboardEvent): Promise<void> {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    await openMenu(event.key === 'ArrowUp');
  }

  async function toggleMenu(): Promise<void> {
    if (open) {
      open = false;
      trigger?.focus();
      return;
    }
    await openMenu();
  }

  async function openMenu(preferLast = false): Promise<void> {
    open = true;
    await tick();
    const items = menuItems();
    const selected = items.find((item) => item.getAttribute('aria-current') === 'page');
    (selected ?? (preferLast ? items[items.length - 1] : items[0]))?.focus();
  }

  function navigateMenu(event: KeyboardEvent): void {
    if (!open || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = menuItems();
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLAnchorElement);
    if (event.key === 'Home') items[0]?.focus();
    else if (event.key === 'End') items[items.length - 1]?.focus();
    else if (event.key === 'ArrowDown') items[(current + 1 + items.length) % items.length]?.focus();
    else items[(current - 1 + items.length) % items.length]?.focus();
  }

  function menuItems(): HTMLAnchorElement[] {
    return root ? Array.from(root.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]')) : [];
  }

  function rangeHref(range: AdminDateRange): string {
    const search = new URLSearchParams(page.url.searchParams);
    search.set('range', range);
    return `${page.url.pathname}?${search.toString()}${page.url.hash}`;
  }
</script>

<div class="admin-date-range" bind:this={root}>
  <button
    class="admin-date-range__trigger"
    type="button"
    bind:this={trigger}
    aria-controls={menuId}
    aria-expanded={open}
    aria-haspopup="dialog"
    aria-label={`Chọn khoảng thời gian. Hiện tại: ${selectedLabel}`}
    onclick={toggleMenu}
    onkeydown={openFromKeyboard}
  >
    <CalendarDays aria-hidden="true" size={17} strokeWidth={1.8} />
    <span>{selectedLabel}</span>
    <ChevronDown class={open ? 'open' : ''} aria-hidden="true" size={14} strokeWidth={2} />
  </button>

  {#if open}
    <RosarySelect anchor={trigger} bind:open label={selectedLabel} accessibleLabel={selectedLabel} value="" options={[]} onChange={() => {}}>
    <div class="admin-date-range__menu" id={menuId} role="menu" tabindex="-1" aria-label="Chọn khoảng thời gian" onkeydown={navigateMenu}
      style:min-height="0" style:overflow-y="auto" style:overscroll-behavior="contain">
      {#each ADMIN_DATE_RANGE_OPTIONS as option, index}
        {#if index > 0 && ADMIN_DATE_RANGE_OPTIONS[index - 1].group !== option.group}
          <div class="admin-date-range__separator" role="separator"></div>
        {/if}
        <a
          href={rangeHref(option.value)}
          role="menuitem"
          aria-current={value === option.value ? 'page' : undefined}
          onclick={() => open = false}
        >
          <span>{option.label}</span>
          {#if value === option.value}
            <Check aria-hidden="true" size={16} strokeWidth={2.2} />
          {/if}
        </a>
      {/each}
    </div>
    </RosarySelect>
  {/if}
</div>
