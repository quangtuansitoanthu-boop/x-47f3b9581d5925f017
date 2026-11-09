<script lang="ts">
  import { acquireScrollLock } from '$lib/browser/scroll-lock';
  let releaseBodyScroll: (() => void) | null = null;
  import { onMount } from 'svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import { confirmInApp } from '$lib/browser/app-dialog';
  import { getBrowserSessionSnapshot } from '$lib/stores/session.svelte';
  import { fetchWithSessionRefresh, getBrowserSession } from '$lib/browser/session-csrf';
  import { parseAudioArtwork } from '$lib/domain/audio-artwork';

  import type { TalkAlbum, TalkTrack } from './AudioCatalog.svelte';
  import {
    dragObjectPosition,
    nudgeObjectPosition,
    reorderItems,
    serializeAudioArtwork,
    uploadAudioArtwork,
  } from './audio-admin-editor-helpers';

  interface Props {
    role: 'ctv' | 'admin';
    albums: TalkAlbum[];
    selectedAlbumId?: string;
    onClose?: () => void;
    onChanged?: () => void;
  }

  interface EditorForm {
    id: string;
    title: string;
    description: string;
    topic: string;
    speaker: string;
    visibility: 'public' | 'private';
    publishDate: string;
    artwork: string;
    artworkPosition: string;
    tracksText: string;
    archiveId: string;
  }

  const EMPTY_FORM: EditorForm = {
    id: '',
    title: '',
    description: '',
    topic: 'Pháp ngữ',
    speaker: '',
    visibility: 'public',
    publishDate: '',
    artwork: '',
    artworkPosition: 'center',
    tracksText: '',
    archiveId: '',
  };

  let { role, albums, selectedAlbumId = 'new', onClose = () => {}, onChanged = () => {} }: Props = $props();
  const initialSelectedId = (() => selectedAlbumId || 'new')();
  let selectedId = $state<string>(initialSelectedId);
  let form = $state<EditorForm>({ ...EMPTY_FORM });
  let editorDialog = $state<HTMLElement | null>(null);
  let saving = $state(false);
  let deleting = $state(false);
  let uploadingArtwork = $state(false);
  let status = $state('');
  let editableTracks = $state<TalkTrack[]>([]);
  let draggedTrackIndex = $state<number | null>(null);
  let trackDragOverIndex = $state<number | null>(null);
  let artworkPreview = $state<HTMLImageElement | null>(null);
  let artworkControl = $state<HTMLButtonElement | null>(null);
  let artworkInput = $state<HTMLInputElement | null>(null);
  let artworkDrag = $state<null | {
    pointerId: number;
    startX: number;
    startY: number;
    startPosition: string;
  }>(null);
  let savedSnapshot = $state('');
  let navigationApproved = false;
  let editorGeneration = 0;
  let disposed = false;
  let unsavedConfirmation: Promise<boolean> | null = null;
  let navigationResetTimer: ReturnType<typeof setTimeout> | undefined;

  function principalKey(): string {
    const session = getBrowserSessionSnapshot();
    return JSON.stringify([session.authenticated ? session.user?.id : null, session.user?.role]);
  }

  const sortedAlbums = $derived([...albums].sort((left, right) => left.tieu_de.localeCompare(right.tieu_de, 'vi')));
  const selectedAlbum = $derived(
    selectedId === 'new' ? null : albums.find((album) => album.id === selectedId) ?? null,
  );
  const hasArchiveSource = $derived(Boolean(selectedAlbum?.archive_id));
  const editorBusy = $derived(saving || deleting || uploadingArtwork);

  function slugify(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || `talk-${Date.now()}`;
  }

  function toTracksText(tracks: TalkTrack[]): string {
    return tracks.map((track) => `${track.title} | ${track.url}`).join('\n');
  }

  function snapshotForm(value: EditorForm): string {
    return JSON.stringify({
      id: value.id,
      title: value.title,
      description: value.description,
      topic: value.topic,
      speaker: value.speaker,
      visibility: value.visibility,
      publishDate: value.publishDate,
      artwork: value.artwork,
      artworkPosition: value.artworkPosition,
      tracksText: value.tracksText,
      archiveId: value.archiveId,
    });
  }

  function currentSnapshot(): string {
    return snapshotForm(form);
  }

  function hasUnsavedChanges(): boolean {
    return savedSnapshot !== '' && currentSnapshot() !== savedSnapshot;
  }

  function markSaved(snapshot: string): void {
    savedSnapshot = snapshot;
  }

  function isCurrentTarget(targetId: string, generation: number): boolean {
    return !disposed && selectedId === targetId && editorGeneration === generation;
  }

  async function confirmUnsavedChanges(): Promise<boolean> {
    if (!hasUnsavedChanges()) return true;
    if (unsavedConfirmation) return false;
    const targetId = selectedId;
    const generation = editorGeneration;
    const principal = principalKey();
    unsavedConfirmation = confirmInApp('Bạn có thay đổi chưa lưu. Bạn có chắc muốn rời đi?');
    try {
      return await unsavedConfirmation && isCurrentTarget(targetId, generation)
        && principalKey() === principal && !editorBusy;
    } finally {
      unsavedConfirmation = null;
    }
  }

  async function closeEditor(): Promise<void> {
    if (editorBusy || !await confirmUnsavedChanges() || disposed || editorBusy) return;
    navigationApproved = true;
    onClose();
  }

  function loadForm(album: TalkAlbum | null): void {
    editorGeneration += 1;
    if (!album) {
      const now = new Date();
      const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
      const nextForm = { ...EMPTY_FORM, id: `talk-${Date.now()}`, publishDate: localDate };
      form = nextForm;
      editableTracks = [];
      savedSnapshot = snapshotForm(nextForm);
      return;
    }
    const artwork = parseAudioArtwork(album.anh_dai_dien);
    const nextForm: EditorForm = {
      id: album.id,
      title: album.tieu_de,
      description: album.mo_ta ?? '',
      topic: album.chu_de ?? 'Pháp ngữ',
      speaker: album.dien_gia ?? '',
      visibility: album.visibility === 'private' ? 'private' : 'public',
      publishDate: String(album.ngay_dang ?? '').slice(0, 10),
      artwork: artwork.src,
      artworkPosition: artwork.position,
      tracksText: toTracksText(album.tracks),
      archiveId: album.archive_id ?? '',
    };
    form = nextForm;
    editableTracks = album.tracks.map((track) => ({ ...track }));
    savedSnapshot = snapshotForm(nextForm);
  }

  async function selectAlbum(event: Event): Promise<void> {
    const select = event.currentTarget as HTMLSelectElement;
    const nextId = select.value;
    if (nextId === selectedId) return;
    if (editorBusy) {
      select.value = selectedId;
      return;
    }
    select.value = selectedId;
    if (!await confirmUnsavedChanges() || disposed || editorBusy) {
      select.value = selectedId;
      return;
    }
    selectedId = nextId;
  }

  function isArchiveTrackUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname === 'archive.org' || parsed.hostname.endsWith('.archive.org');
    } catch {
      return false;
    }
  }

  function parseTracks(value: string, existingTracks: readonly TalkTrack[] = editableTracks): TalkTrack[] {
    const lines = value.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) throw new Error('Cần ít nhất một track hợp lệ.');
    return lines.map((line, index) => {
      const [titlePart, ...urlParts] = line.split('|');
      const title = String(titlePart || '').trim();
      const url = urlParts.join('|').trim();
      if (!title || !url) {
        throw new Error(`Track dòng ${index + 1} phải có định dạng "Tên | URL".`);
      }
      if (isArchiveTrackUrl(url) && !form.archiveId) {
        throw new Error('URL Archive.org chỉ được phép trong album đã có nguồn Archive hợp lệ.');
      }
      const existing = existingTracks.find((track) => track.url === url);
      return { ...(existing ?? {}), title, url };
    });
  }

  function parseDraftTracks(value: string): TalkTrack[] {
    return value.split('\n').flatMap((line) => {
      const [titlePart, ...urlParts] = line.split('|');
      const title = String(titlePart || '').trim();
      const url = urlParts.join('|').trim();
      const existing = editableTracks.find((track) => track.url === url);
      return title && url ? [{ ...(existing ?? {}), title, url }] : [];
    });
  }

  function updateTrackDraft(event: Event): void {
    form.tracksText = (event.currentTarget as HTMLTextAreaElement).value;
    editableTracks = parseDraftTracks(form.tracksText);
  }

  function reorderTracks(sourceIndex: number, targetIndex: number): void {
    editableTracks = reorderItems(editableTracks, sourceIndex, targetIndex);
    form.tracksText = toTracksText(editableTracks);
  }

  function startTrackDrag(event: DragEvent, index: number): void {
    draggedTrackIndex = index;
    trackDragOverIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  function dragTrackOver(event: DragEvent, index: number): void {
    event.preventDefault();
    trackDragOverIndex = index;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    if (draggedTrackIndex != null && draggedTrackIndex !== index) {
      reorderTracks(draggedTrackIndex, index);
      draggedTrackIndex = index;
    }
  }

  function dropTrack(event: DragEvent, targetIndex: number): void {
    event.preventDefault();
    const transferredIndex = Number(event.dataTransfer?.getData('text/plain'));
    const sourceIndex = draggedTrackIndex ?? (Number.isInteger(transferredIndex) ? transferredIndex : null);
    if (sourceIndex != null && sourceIndex !== targetIndex) reorderTracks(sourceIndex, targetIndex);
    endTrackDrag();
  }

  function endTrackDrag(): void {
    draggedTrackIndex = null;
    trackDragOverIndex = null;
  }

  function startArtworkDrag(event: PointerEvent): void {
    if (!artworkPreview || !artworkControl) return;
    event.preventDefault();
    artworkDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: form.artworkPosition,
    };
    artworkControl.setPointerCapture(event.pointerId);
  }

  function moveArtwork(event: PointerEvent): void {
    if (!artworkDrag || artworkDrag.pointerId !== event.pointerId || !artworkPreview) return;
    form.artworkPosition = dragObjectPosition(
      artworkDrag.startPosition,
      event.clientX - artworkDrag.startX,
      event.clientY - artworkDrag.startY,
      artworkPreview.clientWidth,
      artworkPreview.clientHeight,
    );
  }

  function stopArtworkDrag(event: PointerEvent): void {
    if (!artworkDrag || artworkDrag.pointerId !== event.pointerId) return;
    if (artworkControl?.hasPointerCapture(event.pointerId)) artworkControl.releasePointerCapture(event.pointerId);
    artworkDrag = null;
  }

  function moveArtworkByKeyboard(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 2;
    form.artworkPosition = nudgeObjectPosition(
      form.artworkPosition,
      event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
      event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0,
    );
  }

  async function uploadArtwork(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || editorBusy) return;
    const targetId = selectedId;
    const generation = editorGeneration;
    const targetForm: EditorForm = { ...form };
    uploadingArtwork = true;
    status = 'Đang tải ảnh bìa…';
    try {
      const token = await csrfToken();
      const artwork = await uploadAudioArtwork(file, token);
      if (!isCurrentTarget(targetId, generation)) return;
      if (form.artwork !== targetForm.artwork || form.artworkPosition !== targetForm.artworkPosition) return;
      form.artwork = artwork;
      form.artworkPosition = 'center';
      status = 'Đã tải ảnh bìa.';
    } catch (error) {
      if (isCurrentTarget(targetId, generation)) {
        status = error instanceof Error ? error.message : 'Không thể tải ảnh bìa.';
      }
    } finally {
      if (!disposed) uploadingArtwork = false;
      input.value = '';
    }
  }

  async function csrfToken(): Promise<string> {
    const session = await getBrowserSession();
    const sessionRole = session?.user?.role;
    if (!session.csrfToken || (sessionRole !== 'ctv' && sessionRole !== 'admin')) {
      throw new Error('Phiên quản trị không hợp lệ.');
    }
    return session.csrfToken;
  }

  async function save(): Promise<void> {
    if (editorBusy) return;
    const targetId = selectedId;
    const generation = editorGeneration;
    const targetForm: EditorForm = { ...form };
    const targetSnapshot = snapshotForm(targetForm);
    const targetTracks = editableTracks.map((track) => ({ ...track }));
    saving = true;
    status = 'Đang lưu album…';
    try {
      const tracks = parseTracks(targetForm.tracksText, targetTracks);
      const payload = {
        id: targetForm.id || slugify(targetForm.title),
        tieu_de: targetForm.title.trim(),
        mo_ta: targetForm.description.trim(),
        chu_de: targetForm.topic.trim() || 'Pháp ngữ',
        dien_gia: targetForm.speaker.trim() || null,
        visibility: targetForm.visibility,
        ngay_dang: targetForm.publishDate || null,
        created_at: new Date().toISOString(),
        anh_dai_dien: serializeAudioArtwork(targetForm.artwork, targetForm.artworkPosition),
        archive_id: targetForm.archiveId || '',
        tracks,
      };
      if (!payload.tieu_de) throw new Error('Tên album là bắt buộc.');

      const isNew = targetId === 'new';
      const token = await csrfToken();
      const response = await fetchWithSessionRefresh(isNew ? '/api/talks' : `/api/talks/${encodeURIComponent(targetId)}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': token,
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error?.message || result?.message || `HTTP ${response.status}`);
      if (!isCurrentTarget(targetId, generation)) return;
      status = isNew ? 'Đã tạo album mới.' : 'Đã lưu thay đổi album.';
      if (currentSnapshot() === targetSnapshot) markSaved(targetSnapshot);
      onChanged();
    } catch (error) {
      if (isCurrentTarget(targetId, generation)) {
        status = error instanceof Error ? error.message : 'Không thể lưu album.';
      }
    } finally {
      if (!disposed) saving = false;
    }
  }

  async function remove(): Promise<void> {
    if (role !== 'admin' || !selectedAlbum || editorBusy) return;
    const targetId = selectedId;
    const targetAlbum = { id: selectedAlbum.id, title: selectedAlbum.tieu_de };
    const generation = editorGeneration;
    const principal = principalKey();
    if (!await confirmInApp(`Xóa album "${targetAlbum.title}"?`)
      || !isCurrentTarget(targetId, generation) || principalKey() !== principal
      || role !== 'admin' || editorBusy) return;
    deleting = true;
    status = 'Đang xóa album…';
    try {
      const token = await csrfToken();
      const response = await fetchWithSessionRefresh(`/api/talks/${encodeURIComponent(targetAlbum.id)}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': token },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error?.message || result?.message || `HTTP ${response.status}`);
      if (!isCurrentTarget(targetId, generation)) return;
      selectedId = 'new';
      loadForm(null);
      status = 'Đã xóa album.';
      onChanged();
    } catch (error) {
      if (isCurrentTarget(targetId, generation)) {
        status = error instanceof Error ? error.message : 'Không thể xóa album.';
      }
    } finally {
      if (!disposed) deleting = false;
    }
  }

  $effect(() => {
    loadForm(selectedAlbum);
  });

  beforeNavigate((navigation) => {
    if (navigationApproved || !hasUnsavedChanges() || navigation.willUnload || !navigation.to) return;
    navigation.cancel();
    const destination = navigation.to.url;
    void (async () => {
      if (editorBusy || !await confirmUnsavedChanges() || disposed || editorBusy) return;
      navigationApproved = true;
      clearTimeout(navigationResetTimer);
      navigationResetTimer = setTimeout(() => { navigationApproved = false; }, 1_000);
      if (navigation.type === 'popstate' && navigation.delta) history.go(navigation.delta);
      else await goto(destination);
    })();
  });

  onMount(() => {
    disposed = false;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    releaseBodyScroll ??= acquireScrollLock();
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      if (!hasUnsavedChanges() || navigationApproved) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const guardNavigation = (event: MouseEvent): void => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>('a[href]');
      if (!link || link.target === '_blank' || link.hasAttribute('download') || link.getAttribute('href')?.startsWith('#')) return;
      if (navigationApproved || !hasUnsavedChanges()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void (async () => {
        if (editorBusy || !await confirmUnsavedChanges() || disposed || editorBusy || !link.isConnected) return;
        navigationApproved = true;
        clearTimeout(navigationResetTimer);
        navigationResetTimer = setTimeout(() => { navigationApproved = false; }, 1_000);
        link.click();
      })();
    };

    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', guardNavigation, true);
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { closeEditor(); return; }
      if (event.key !== 'Tab' || !editorDialog) return;
      const focusable = [...editorDialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handleDialogKeys);
    queueMicrotask(() => editorDialog?.querySelector<HTMLElement>('button,input,select,textarea')?.focus({ preventScroll: true }));
    return () => {
      disposed = true;
      editorGeneration += 1;
      clearTimeout(navigationResetTimer);
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', guardNavigation, true);
      window.removeEventListener('keydown', handleDialogKeys);
      releaseBodyScroll?.(); releaseBodyScroll = null;
      previousFocus?.focus({ preventScroll: true });
    };
  });
</script>

<div
  class="audio-editor-overlay"
  role="presentation"
  onclick={(event) => {
    if (event.target === event.currentTarget) closeEditor();
  }}
>
<div class="editor" data-dialog-glass role="dialog" aria-modal="true" aria-labelledby="talk-editor-title" bind:this={editorDialog}>
  <header>
    <button class="editor-close" type="button" aria-label="Đóng" onclick={closeEditor}>×</button>
    <h2 id="talk-editor-title">✏️ Chỉnh sửa Album</h2>
  </header>

  <div class="editor-scroll">
  <div class="grid">
    <label>
      <span>Album</span>
      <select value={selectedId} disabled={editorBusy} onchange={selectAlbum}>
        <option value="new">+ Album thủ công mới</option>
        {#each sortedAlbums as album}
          <option value={album.id}>{album.tieu_de}</option>
        {/each}
      </select>
    </label>

    <label>
      <span>ID</span>
      <input bind:value={form.id} disabled={selectedId !== 'new'} placeholder="talk-..." />
    </label>

    <label>
      <span>Tên album</span>
      <input bind:value={form.title} placeholder="Tên album pháp thoại" />
    </label>

    <label>
      <span>Chủ đề</span>
      <input bind:value={form.topic} placeholder="Pháp ngữ" />
    </label>

    <label>
      <span>Giảng sư / tác giả</span>
      <input bind:value={form.speaker} placeholder="Không bắt buộc" />
    </label>

    <fieldset class="visibility-field">
      <legend>Chế độ hiển thị</legend>
      <div class="visibility-toggle">
        <button
          class:active-public={form.visibility === 'public'}
          type="button"
          aria-pressed={form.visibility === 'public'}
          onclick={() => form.visibility = 'public'}
        >🌐 Công khai</button>
        <button
          class:active-private={form.visibility === 'private'}
          type="button"
          aria-pressed={form.visibility === 'private'}
          onclick={() => form.visibility = 'private'}
        >🔒 Riêng tư</button>
      </div>
    </fieldset>

    <label>
      <span>Ngày đăng</span>
      <input bind:value={form.publishDate} type="date" />
    </label>

    <label class="wide">
      <span>Mô tả</span>
      <textarea bind:value={form.description} rows="4" placeholder="Mô tả ngắn về album"></textarea>
    </label>

    <div class="wide artwork-editor">
      <span class="field-label">Ảnh Album Art</span>
      <div class="artwork-inputs">
        <input
          aria-label="URL ảnh bìa"
          bind:value={form.artwork}
          placeholder="https://... hoặc tải ảnh lên"
        />
        <input
          class="visually-hidden"
          bind:this={artworkInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          disabled={uploadingArtwork}
          onchange={uploadArtwork}
        />
        <button
          class="upload-button"
          type="button"
          disabled={uploadingArtwork}
          onclick={() => artworkInput?.click()}
        >{uploadingArtwork ? 'Đang tải…' : 'Tải ảnh lên'}</button>
      </div>
      <label>
        <span>Vị trí hiển thị ảnh</span>
        <input
          bind:value={form.artworkPosition}
          placeholder="center hoặc 50% 50%"
        />
      </label>
      {#if form.artwork}
        <button
          class:dragging={Boolean(artworkDrag)}
          class="artwork-preview-control"
          type="button"
          aria-label="Xem trước ảnh bìa — kéo hoặc dùng phím mũi tên để chỉnh vị trí"
          bind:this={artworkControl}
          onpointerdown={startArtworkDrag}
          onpointermove={moveArtwork}
          onpointerup={stopArtworkDrag}
          onpointercancel={stopArtworkDrag}
          onkeydown={moveArtworkByKeyboard}
        >
          <img
            class="artwork-preview"
            src={form.artwork}
            alt=""
            draggable="false"
            style:object-position={form.artworkPosition || 'center'}
            bind:this={artworkPreview}
          />
        </button>
        <small class="artwork-help">Kéo ảnh để canh khung. Phím mũi tên chỉnh 2%; giữ Shift để chỉnh 10%.</small>
      {/if}
    </div>

    <label class="wide">
      <span>Danh sách track — định dạng “Tên bài | URL”</span>
      <textarea
        value={form.tracksText}
        rows="10"
        placeholder="Tên bài | https://media.quangtu.vn/track.mp3"
        oninput={updateTrackDraft}
      ></textarea>
    </label>

    {#if editableTracks.length}
      <div class="wide track-order">
        <span class="field-label">Thứ tự phát — kéo ☰ hoặc dùng nút mũi tên</span>
        <ol aria-label="Sắp xếp thứ tự bài phát">
          {#each editableTracks as track, index (track)}
            <li
              class:dragging={draggedTrackIndex === index}
              class:drag-over={trackDragOverIndex === index && draggedTrackIndex !== index}
              draggable="true"
              ondragstart={(event) => startTrackDrag(event, index)}
              ondragover={(event) => dragTrackOver(event, index)}
              ondrop={(event) => dropTrack(event, index)}
              ondragend={endTrackDrag}
            >
              <span class="drag-handle" aria-hidden="true">☰</span>
              <span class="track-number">{index + 1}</span>
              <span class="track-title">{track.title}</span>
              <span class="track-actions">
                <button
                  type="button"
                  disabled={index === 0}
                  aria-label={`Đưa ${track.title} lên trước`}
                  onclick={() => reorderTracks(index, index - 1)}
                >↑</button>
                <button
                  type="button"
                  disabled={index === editableTracks.length - 1}
                  aria-label={`Đưa ${track.title} xuống sau`}
                  onclick={() => reorderTracks(index, index + 1)}
                >↓</button>
              </span>
            </li>
          {/each}
        </ol>
      </div>
    {/if}
  </div>

  {#if hasArchiveSource}
    <p class="source-note" role="status">Nguồn âm thanh Archive hiện hữu được giữ nguyên khi lưu.</p>
  {/if}

  {#if hasUnsavedChanges()}
    <p class="dirty-status" role="status">Có thay đổi chưa lưu.</p>
  {/if}

  {#if status}
    <p class="status" role="status" aria-live="polite">{status}</p>
  {/if}
  </div>

  <div class="actions" class:dialog-actions-balanced={role === 'admin' && Boolean(selectedAlbum)}>
    <button type="button" disabled={saving || deleting || uploadingArtwork} onclick={save}>{saving ? 'Đang lưu…' : selectedId === 'new' ? 'Tạo album' : 'Lưu thay đổi'}</button>
    {#if role === 'admin' && selectedAlbum}
      <button class="danger" type="button" disabled={saving || deleting} onclick={remove}>{deleting ? 'Đang xóa…' : 'Xóa album'}</button>
    {/if}
  </div>
</div>
</div>

<style>
  .audio-editor-overlay { position:fixed; z-index:1300; inset:0; display:flex; align-items:flex-end; justify-content:center; padding:26px 0 0; background:rgba(28,25,21,.56); backdrop-filter:blur(5px); animation:audio-editor-fade .25s ease-out; }
  .editor { display:flex; width:min(580px,calc(100% - 36px)); max-height:calc(100dvh - 26px); flex-direction:column; overflow:hidden; margin:0 auto; border:1px solid var(--dialog-surface-border,var(--border)); border-radius:20px 20px 0 0; background:var(--dialog-surface-background,var(--card)); box-shadow:var(--dialog-surface-shadow,var(--shadow-xl)); animation:audio-editor-up .32s cubic-bezier(.4,0,.2,1); }
  .editor>header { z-index:3; display:flex; min-height:62px; flex:none; align-items:center; gap:12px; padding:14px 20px; border-bottom:1px solid var(--border2); background:var(--card); }
  h2 { flex:1; margin:0; color:var(--text); font-family:var(--font-app); font-size:15px; font-weight:700; line-height:1.25; }
  .editor-close { display:grid; width:32px; height:32px; min-height:32px; flex:0 0 32px; place-items:center; padding:0; border:0; border-radius:50%; background:var(--bg2); color:var(--text2); font-size:22px; line-height:1; }
  .editor-close:hover:not(:disabled) { background:var(--bg3); color:var(--text); transform:rotate(4deg); }
  .editor-scroll { min-height:0; flex:1; overflow-y:auto; overscroll-behavior:contain; padding:18px 20px; scrollbar-gutter:stable; }
  .grid { display:grid; grid-template-columns:1fr; gap:16px; margin:0; }
  .wide { grid-column:1/-1; }
  label { display:grid; gap:6px; }
  label span,.field-label,legend { color:var(--text2); font-size:11px; font-weight:700; letter-spacing:.8px; line-height:1.35; }
  input,select,textarea { box-sizing:border-box; width:100%; min-height:39px; padding:9px 12px; border:1.5px solid var(--border2); border-radius:8px; outline:none; background:var(--bg); color:var(--text); font:inherit; font-size:13px; line-height:1.45; transition:border-color .18s,background .18s,box-shadow .18s; }
  input:focus,select:focus,textarea:focus { border-color:var(--gold); background:var(--card); box-shadow:0 0 0 3px color-mix(in srgb,var(--gold) 14%,transparent); }
  input:disabled,select:disabled,textarea:disabled { -webkit-text-fill-color:var(--text); color:var(--text); opacity:1; cursor:not-allowed; background:var(--bg2); }
  textarea { min-height:68px; resize:vertical; }
  button { min-height:44px; padding:0 18px; border:1px solid var(--gold); border-radius:999px; background:var(--gold); color:white; cursor:pointer; font:inherit; font-weight:700; transition:background .18s,border-color .18s,color .18s,transform .18s,opacity .18s; }
  button:hover:not(:disabled) { background:var(--brown2); }
  button:disabled { cursor:not-allowed; opacity:.58; }
  .visibility-field { min-width:0; margin:0; padding:0; border:0; }
  .visibility-field legend { margin-bottom:8px; }
  .visibility-toggle { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .visibility-toggle button { min-height:39px; border-color:var(--border2); border-radius:8px; background:var(--bg); color:var(--text2); font-size:13px; }
  .visibility-toggle .active-public { border-color:#22c55e; background:rgba(34,197,94,.1); color:#15803d; }
  .visibility-toggle .active-private { border-color:var(--gold); background:var(--gold-muted); color:var(--brown); }
  .artwork-editor { display:grid; gap:8px; }
  .artwork-inputs { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; }
  .upload-button { padding:0 16px; border-color:var(--border); background:var(--bg3); color:var(--text); }
  .artwork-preview-control { display:block; width:100%; min-height:0; padding:0; overflow:hidden; border:1px solid var(--border2); border-radius:10px; background:var(--bg2); color:inherit; cursor:grab; touch-action:none; user-select:none; transition:box-shadow .18s,opacity .18s; }
  .artwork-preview-control:hover:not(:disabled) { background:var(--bg2); }
  .artwork-preview-control.dragging { cursor:grabbing; opacity:.9; box-shadow:0 0 0 3px color-mix(in srgb,var(--gold) 24%,transparent); }
  .artwork-preview { display:block; width:100%; aspect-ratio:16/7; object-fit:cover; pointer-events:none; }
  .artwork-help { color:var(--muted); font-size:11px; }
  .track-order { display:grid; gap:8px; }
  .track-order ol { display:grid; gap:6px; margin:0; padding:0; list-style:none; }
  .track-order li { display:grid; grid-template-columns:24px 26px minmax(0,1fr) auto; gap:8px; align-items:center; min-height:48px; padding:7px 8px 7px 12px; border:1.5px solid var(--border2); border-radius:9px; background:var(--bg); transition:background .15s,border-color .15s,box-shadow .15s,opacity .15s; }
  .track-order li[draggable="true"] { cursor:grab; }
  .track-order li.drag-over { border-color:var(--gold); background:var(--gold-muted); box-shadow:0 0 0 2px color-mix(in srgb,var(--gold) 20%,transparent); }
  .track-order li.dragging { opacity:.4; }
  .drag-handle { color:var(--muted); font-size:16px; }
  .track-number { color:var(--muted); font-size:11px; font-weight:700; text-align:center; }
  .track-title { overflow:hidden; color:var(--text); font-size:13px; text-overflow:ellipsis; white-space:nowrap; }
  .track-actions { display:flex; gap:4px; }
  .track-actions button { width:38px; min-height:38px; padding:0; border-color:var(--border2); background:var(--card); color:var(--text2); }
  .actions { z-index:4; display:flex; flex:none; gap:10px; padding:14px 20px max(20px,env(safe-area-inset-bottom)); border-top:1px solid var(--border2); background:var(--card); box-shadow:0 -8px 20px rgba(33,28,20,.03); }
  .actions>button:first-child { flex:1; border-radius:10px; font-size:14px; }
  .actions .danger { flex:0 0 auto; border-radius:10px; font-size:13px; }
  .dirty-status { margin:14px 0 0; color:var(--brown); font-size:12px; font-weight:700; }
  .danger { border-color:var(--red); background:transparent; color:var(--red); }
  .source-note { margin:14px 0 0; color:var(--muted); font-size:11px; line-height:1.45; }
  .visually-hidden { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; clip-path:inset(50%); }
  @keyframes audio-editor-fade{from{opacity:0}to{opacity:1}}@keyframes audio-editor-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
  @media(max-width:720px) { .editor{width:min(580px,calc(100% - 36px))}.editor>header{padding-right:20px;padding-left:20px}.editor-scroll{padding-right:20px;padding-left:20px}.actions{padding-right:20px;padding-left:20px}.artwork-inputs{grid-template-columns:1fr}.track-order li{grid-template-columns:20px 22px minmax(0,1fr) auto}.track-actions button{width:36px} }
  @media(max-width:420px) { .audio-editor-overlay{padding-top:14px}.editor{width:calc(100% - 20px);max-height:calc(100dvh - 14px)}.editor>header{padding-right:16px;padding-left:16px}.editor-scroll{padding:18px 16px}.actions{padding-right:16px;padding-left:16px}.actions .danger{padding-right:13px;padding-left:13px} }
  @media(prefers-reduced-motion:reduce) { button,.artwork-preview-control,.track-order li{transition:none} }
</style>
