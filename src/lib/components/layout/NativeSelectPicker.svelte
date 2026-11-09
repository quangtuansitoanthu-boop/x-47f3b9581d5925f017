<script lang="ts">
  import { onMount } from 'svelte';
  import RosarySelect, { type RosarySelectOption } from '$lib/components/practice/rosary/RosarySelect.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { nativeSelectCopy } from '$lib/i18n/ui-copy';

  let { route = '', principal = null }: { route?: string; principal?: string | null } = $props();
  const locale = getLocaleContext();
  let anchor = $state<HTMLSelectElement>();
  let open = $state(false);
  let value = $state('');
  let label = $state('');
  let options = $state<RosarySelectOption[]>([]);

  function eligible(select: HTMLSelectElement): boolean {
    // Giữ nguyên picker nhiều lựa chọn/listbox và control do editor riêng sở hữu.
    if (!select.isConnected || select.matches(':disabled') || select.multiple || select.size > 1
      || select.closest('[hidden],[inert],[aria-hidden="true"],[aria-disabled="true"],.ck,[data-native-select-picker="off"]')) return false;
    for (let node: HTMLElement | null = select; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  }

  function readOptions(select: HTMLSelectElement): void {
    value = select.value;
    options = [...select.options].filter(option => !option.hidden && !option.parentElement?.hidden).map((option, index) => ({
      key: String(index), value: option.value, label: option.label,
      group: option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : undefined,
      disabled: option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled),
    }));
  }

  function selectLabel(select: HTMLSelectElement): string {
    const labelledBy = select.getAttribute('aria-labelledby')?.split(/\s+/u)
      .map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ');
    const parentLabel = select.labels?.[0]?.cloneNode(true) as HTMLElement | undefined;
    parentLabel?.querySelectorAll('select,button,svg').forEach(node => node.remove());
    return select.getAttribute('aria-label') || labelledBy || select.title || parentLabel?.textContent?.trim()
      || nativeSelectCopy[locale.current === 'en' ? 'en' : 'vi'];
  }

  function show(event: Event): void {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || !eligible(select)) return;
    event.preventDefault();
    select.focus({ preventScroll: true });
    label = selectLabel(select);
    readOptions(select);
    anchor = select;
    open = true;
  }

  function choose(next: string): void | boolean {
    const select = anchor;
    if (!select || !eligible(select)) { open = false; return false; }
    const option = [...select.options].find(item => item.value === next && !item.disabled && !item.hidden && !item.parentElement?.hidden
      && !(item.parentElement instanceof HTMLOptGroupElement && item.parentElement.disabled));
    if (!option) return false;
    // Native select tiếp tục sở hữu bind:value, validation, FormData và callback cũ.
    if (select.value !== next) {
      select.value = next;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    value = next;
  }

  $effect(() => { route; principal; open = false; options = []; anchor = undefined; });
  $effect(() => {
    if (!open || !anchor) return;
    const select = anchor;
    const observer = new MutationObserver(() => {
      if (!eligible(select)) open = false;
      else readOptions(select);
    });
    observer.observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'label', 'value', 'hidden', 'selected', 'multiple', 'size'] });
    const lifecycle = new MutationObserver(() => { if (!eligible(select)) open = false; });
    lifecycle.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'inert', 'aria-hidden', 'aria-disabled', 'style', 'class'] });
    return () => { observer.disconnect(); lifecycle.disconnect(); };
  });

  onMount(() => {
    // Hoàn tất cú chạm/click trước khi mở top layer; phần release không được rơi
    // vào backdrop/option vừa xuất hiện và đóng hoặc chọn hộ người dùng.
    let pressed: { select: HTMLSelectElement; pointerId: number; x: number; y: number; moved: boolean } | null = null;
    let openingClick = false;
    const pointer = (event: PointerEvent) => {
      // Lượt tương tác kế tiếp là của người dùng, không phải click tương thích còn lại.
      openingClick = false;
      pressed = null;
      if (event.button === 0 && event.isPrimary !== false
        && event.target instanceof HTMLSelectElement && eligible(event.target)) {
        event.preventDefault();
        pressed = { select: event.target, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      }
    };
    const move = (event: PointerEvent) => {
      if (pressed?.pointerId === event.pointerId && (Math.abs(event.clientX - pressed.x) > 10 || Math.abs(event.clientY - pressed.y) > 10)) pressed.moved = true;
    };
    const release = (event: PointerEvent) => {
      const current = pressed;
      pressed = null;
      if (!current || current.pointerId !== event.pointerId || current.moved || event.target !== current.select || !eligible(current.select)) return;
      openingClick = true;
      show(event);
    };
    const cancel = () => { pressed = null; };
    const keyboard = (event: KeyboardEvent) => {
      pressed = null; openingClick = false;
      if (!event.isComposing && ['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) show(event);
    };
    const click = (event: MouseEvent) => {
      // WebKit có thể không phát click sau pointerdown bị hủy; không dựa vào nó
      // để mở. Nếu có click tương thích, chỉ chặn phần đuôi của đúng cử chỉ mở.
      if (openingClick && event.detail > 0) {
        openingClick = false; event.preventDefault(); event.stopPropagation(); return;
      }
      if (event.detail === 0 && event.button === 0) show(event);
    };
    const closed = (event: Event) => { if (anchor?.closest('dialog') === event.target) open = false; };
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', cancel, true);
    document.addEventListener('keydown', keyboard, true);
    document.addEventListener('click', click, true);
    document.addEventListener('close', closed, true);
    return () => {
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', release, true);
      document.removeEventListener('pointercancel', cancel, true);
      document.removeEventListener('keydown', keyboard, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('close', closed, true);
    };
  });
</script>

{#if anchor}
  <RosarySelect {anchor} {label} accessibleLabel={label} {value} {options} onChange={choose} bind:open />
{/if}
