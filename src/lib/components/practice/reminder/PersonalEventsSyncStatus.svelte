<script lang="ts">
  import { onMount } from 'svelte';
  import { getPersonalEventsSyncStatus, getPersonalEventsSyncError, getPersonalEventsConflict, syncPersonalLunarEventsWithServer, resolvePersonalEventsConflict } from '$lib/browser/personal-lunar-events';
  let { isEn = false }: { isEn?: boolean } = $props();
  let status = $state(getPersonalEventsSyncStatus());
  let conflict = $state(getPersonalEventsConflict());
  let syncError = $state(getPersonalEventsSyncError());
  onMount(() => {
    const refresh = () => { status = getPersonalEventsSyncStatus(); conflict = getPersonalEventsConflict(); syncError = getPersonalEventsSyncError(); };
    refresh();
    window.addEventListener('quangtu:personal-events-changed', refresh);
    return () => window.removeEventListener('quangtu:personal-events-changed', refresh);
  });
</script>

{#if status === 'pending' || status === 'syncing'}
  <p class="sync-note" role="status">{isEn ? 'Saved on this device. Waiting to sync.' : 'Đã lưu trên thiết bị. Đang chờ đồng bộ.'}</p>
{:else if status === 'error'}
  <div class="sync-note" role="status">
    <p>{isEn ? 'Sync failed. Your changes are still saved on this device.' : 'Chưa đồng bộ được. Thay đổi vẫn được giữ trên thiết bị.'}</p>
    {#if syncError?.status === 401 || syncError?.code === 'invalid_csrf'}
      <p>{isEn ? 'Please sign in again, then retry syncing.' : 'Vui lòng đăng nhập lại, sau đó thử đồng bộ lại.'}</p>
    {:else if syncError?.status === 403}
      <p>{isEn ? 'The server rejected this request. Please contact support.' : 'Máy chủ từ chối yêu cầu này. Vui lòng liên hệ hỗ trợ.'}</p>
    {:else if syncError && syncError.status >= 500}
      <p>{isEn ? 'The server is temporarily unavailable. Please try again later.' : 'Máy chủ tạm thời gặp lỗi. Vui lòng thử lại sau.'}</p>
    {/if}
    <button type="button" onclick={() => void syncPersonalLunarEventsWithServer()}>{isEn ? 'Retry' : 'Thử lại'}</button>
  </div>
{:else if status === 'conflict'}
  <div class="sync-note" role="status">
    <p>{isEn ? 'Another device changed the same anniversary. Both copies are kept. Choose which list to use.' : 'Thiết bị khác đã sửa cùng ngày lễ. Hai bản vẫn được giữ. Hãy chọn danh sách muốn dùng.'}</p>
    {#if conflict}
      <details>
        <summary>{isEn ? 'Compare lists' : 'Đối chiếu hai danh sách'}</summary>
        <p>{isEn ? 'This device' : 'Trên máy này'} ({conflict.local.length})</p>
        <ul>{#each conflict.local as event}<li>{event.title}</li>{/each}</ul>
        <p>{isEn ? 'Your account' : 'Trên tài khoản'} ({conflict.remote.length})</p>
        <ul>{#each conflict.remote as event}<li>{event.title}</li>{/each}</ul>
      </details>
    {/if}
    <button type="button" onclick={() => void resolvePersonalEventsConflict('local')}>{isEn ? 'Use this device’s list' : 'Dùng danh sách trên máy này'}</button>
    <button type="button" onclick={() => void resolvePersonalEventsConflict('server')}>{isEn ? 'Use the account’s list' : 'Dùng danh sách trên tài khoản'}</button>
  </div>
{/if}

<style>
  .sync-note { margin:10px 0; color:var(--text2, #6b5b45); font-size:13px; line-height:1.5; }
  .sync-note p { margin:0 0 8px; }
  button { min-height:40px; margin:0 8px 6px 0; padding:6px 12px; border:1px solid currentColor; border-radius:8px; background:transparent; color:inherit; cursor:pointer; font:inherit; }
</style>
