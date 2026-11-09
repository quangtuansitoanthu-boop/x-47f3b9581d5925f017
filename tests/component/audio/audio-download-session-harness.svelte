<script lang="ts">
  import { onMount } from 'svelte';
  import AudioCatalog from '$lib/components/audio/AudioCatalog.svelte';
  import { setLocaleContext } from '$lib/stores/locale.svelte';
  import { registerBrowserSessionStore, setSessionContext } from '$lib/stores/session.svelte';

  setLocaleContext('vi');
  const session = setSessionContext({ authenticated: true, csrfToken: 'test', expiresAt: null,
    user: { id: 'download-owner-a', email: '', avatarUrl: '', displayName: 'Owner A', role: 'admin' } });
  const role = $derived(session.value.user?.role ?? 'guest');
  const album = { id: 'pending-private', tieu_de: 'Owner A private album', visibility: 'private', tracks: [
    { title: 'Saved first track', url: '/audio/first-private.mp3' }, { title: 'Pending private track', url: '/audio/pending-private.mp3' },
  ] };
  let selectedAlbumId = $state<string | null>(album.id);
  let catalogAlbums = $state([album]);
  onMount(() => registerBrowserSessionStore(session));
  export function showAdditionalAlbum() {
    const additionalAlbum = { ...album, id: 'new-album', tieu_de: 'Newly visible album' };
    catalogAlbums = [album, additionalAlbum];
    selectedAlbumId = additionalAlbum.id;
  }
  export function changeSession(mode: 'logout' | 'account' | 'role' | 'token' | 'remembered') {
    if (mode === 'logout') session.clear();
    else if (mode === 'account') session.set({ ...session.value, user: { ...session.value.user!, id: 'download-owner-b' } });
    else if (mode === 'role') session.set({ ...session.value, user: { ...session.value.user!, role: 'user' } });
    else session.set({ ...session.value, csrfToken: mode === 'remembered' ? null : 'refreshed-token' });
  }
</script>

<AudioCatalog albums={catalogAlbums} {role} {selectedAlbumId} onSelectAlbum={value => { selectedAlbumId = value?.id ?? null; }} />
