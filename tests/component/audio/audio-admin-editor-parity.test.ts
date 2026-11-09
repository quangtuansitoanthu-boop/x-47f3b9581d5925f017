import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import AudioAdminEditor from '../../../src/lib/components/audio/AudioAdminEditor.svelte';

describe('audio admin editor parity', () => {
  const editor = readFileSync('src/lib/components/audio/AudioAdminEditor.svelte', 'utf8');
  const helpers = readFileSync('src/lib/components/audio/audio-admin-editor-helpers.ts', 'utf8');

  it('compiles and renders the editor contract', () => {
    const { body } = render(AudioAdminEditor, { props: { role: 'admin', albums: [] } });
    expect(body).toContain('Chỉnh sửa Album');
    expect(body).not.toContain('CTV / ADMIN');
    expect(body).toContain('Tạo album');
  });

  it('keeps the legacy editor sheet anatomy and a fixed action footer', () => {
    expect(editor.indexOf('class="editor-close"')).toBeLessThan(editor.indexOf('id="talk-editor-title"'));
    expect(editor).toContain('class="editor-scroll"');
    expect(editor).toContain('class="actions"');
    expect(editor).toContain('width:min(580px,calc(100% - 36px))');
    expect(editor).toContain('max-height:calc(100dvh - 26px)');
    expect(editor).toContain('font-family:var(--font-app); font-size:15px;');
    expect(editor).toContain('width:32px; height:32px; min-height:32px; flex:0 0 32px;');
  });

  it('keeps the compact legacy form density', () => {
    expect(editor).toContain('.editor-scroll { min-height:0; flex:1; overflow-y:auto; overscroll-behavior:contain; padding:18px 20px;');
    expect(editor).toContain('.grid { display:grid; grid-template-columns:1fr; gap:16px;');
    expect(editor).toContain('font-size:11px; font-weight:700; letter-spacing:.8px;');
    expect(editor).toContain('min-height:39px; padding:9px 12px;');
    expect(editor).toContain('font-size:13px; line-height:1.45;');
    expect(editor).toContain('textarea { min-height:68px;');
  });

  it('keeps ordering, visibility and publication date controls editable', () => {
    expect(editor).toContain('draggable="true"');
    expect(editor).toContain('reorderTracks(index, index - 1)');
    expect(editor).toContain('form.visibility = \'public\'');
    expect(editor).toContain('bind:value={form.publishDate}');
    expect(editor).toContain('ngay_dang: targetForm.publishDate || null');
  });

  it('edits normalized speaker metadata without forcing a value onto legacy albums', () => {
    expect(editor).toContain('bind:value={form.speaker}');
    expect(editor).toContain('album.dien_gia ?? \'\'');
    expect(editor).toContain('dien_gia: targetForm.speaker.trim() || null');
  });

  it('uploads artwork through the hardened media API and preserves crop position', () => {
    expect(helpers).toContain("fetchWithSessionRefresh('/api/media'");
    expect(helpers).toContain("'x-content-sha256': base64Url(digest)");
    expect(helpers).toContain("'x-media-prefix': 'covers'");
    expect(editor).toContain('onpointermove={moveArtwork}');
    expect(editor).toContain('onkeydown={moveArtworkByKeyboard}');
    expect(editor).toContain('serializeAudioArtwork(targetForm.artwork, targetForm.artworkPosition)');
  });

  it('keeps existing Archive albums editable without enabling unrestricted Archive authoring', () => {
    expect(editor).toContain('const hasArchiveSource = $derived(Boolean(selectedAlbum?.archive_id))');
    expect(editor).toContain("archive_id: targetForm.archiveId || ''");
    expect(editor).not.toContain('disabled={archiveLocked}');
    expect(editor).not.toContain('if (archiveLocked || editorBusy) return;');
    expect(editor).not.toContain('SvelteKit rewrite không còn cho tạo hoặc sửa album theo luồng Archive.org.');
    expect(editor).not.toContain('/api/admin/archive');
  });

  it('guards album selection and navigation while edits are unsaved', () => {
    expect(editor).toContain('function currentSnapshot()');
    expect(editor).toContain('function hasUnsavedChanges()');
    expect(editor).toContain('Bạn có thay đổi chưa lưu. Bạn có chắc muốn rời đi?');
    expect(editor).toContain('onchange={selectAlbum}');
    expect(editor).toContain("window.addEventListener('beforeunload', beforeUnload)");
    expect(editor).toContain("document.addEventListener('click', guardNavigation, true)");
  });

  it('resets the dirty baseline after loading or successfully saving an album', () => {
    expect(editor).toContain('savedSnapshot = snapshotForm(nextForm)');
    expect(editor).toContain('if (currentSnapshot() === targetSnapshot) markSaved(targetSnapshot);');
    expect(editor).toContain('Có thay đổi chưa lưu.');
  });

  it('snapshots async targets and ignores stale completions', () => {
    expect(editor).toContain('const targetForm: EditorForm = { ...form };');
    expect(editor).toContain('const targetAlbum = { id: selectedAlbum.id, title: selectedAlbum.tieu_de };');
    expect(editor).toContain('if (!isCurrentTarget(targetId, generation)) return;');
    expect(editor).toContain('<select value={selectedId} disabled={editorBusy} onchange={selectAlbum}>');
  });
});
