<script lang="ts">
  import AdminSettingsTable from '$lib/components/admin/settings/AdminSettingsTable.svelte';
  import FacebookImportSettings from '$lib/components/admin/settings/FacebookImportSettings.svelte';
  import '$lib/styles/admin-content-management.css';
  import '$lib/styles/admin-member-management.css';
  let { data } = $props();
</script>

<svelte:head><title>Cài đặt hệ thống — Quang Từ</title><meta name="robots" content="noindex,nofollow" /></svelte:head>
<AdminSettingsTable system={data.system}>
  {#key data.ownerId}
    <FacebookImportSettings initial={data.facebook} ownerId={data.ownerId} />
  {/key}
</AdminSettingsTable>

