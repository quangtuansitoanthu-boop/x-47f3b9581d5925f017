<script lang="ts">
  import { untrack } from 'svelte';
  import RichCopyEditor from '$lib/components/RichCopyEditor.svelte';
  import type { TypedRun } from '$lib/domain/practice/copying-typed-format';
  let { allowPaste = false, initial = '', readonly = false, ghostRuns = [], showGhost = false } = $props<{ allowPaste?: boolean; initial?: string; readonly?: boolean; ghostRuns?: TypedRun[]; showGhost?: boolean }>();
  let value = $state(untrack(() => initial));
  let formatRevision = $state(0);
  let editorVisible = $state(true);
  let composing = $state(false);
  let editingContext = $state('guest:dia-tang:1:0:0');
  const commits: { context: string; value: string }[] = [];
  function acceptValue(next: string) { commits.push({ context: editingContext, value: next }); value = next; }
  const runs = $derived.by(() => { void formatRevision; return [{ text: value, bold: false, align: 'left' as const, line: 0 }]; });
  export function text() { return value; }
  export function refreshFormatting() { formatRevision++; }
  export function closeEditor() { editorVisible = false; }
  export function openEditor() { editorVisible = true; }
  export function isComposing() { return composing; }
  export function switchEditingContext(next: string, nextText = value) { editingContext = next; value = nextText; }
  export function committedValues() { return commits.slice(); }
</script>
{#if editorVisible}<RichCopyEditor {value} {runs} {editingContext} {allowPaste} {readonly} {ghostRuns} {showGhost} label="Bản chép thử" placeholder="Gõ kinh" invalid={false} maxlength={1000} font="serif" onvalue={acceptValue} onbeforeinput={() => {}} ondisallow={event => event.preventDefault()} oncaret={() => {}} oncomposing={active => composing = active} />{/if}
