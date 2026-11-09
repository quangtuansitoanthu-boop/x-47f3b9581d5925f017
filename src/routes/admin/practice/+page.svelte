<script lang="ts">
  import AdminPracticeCampaigns from '$lib/components/admin/practice/AdminPracticeCampaigns.svelte';
  let { data } = $props();
</script>

<svelte:head>
  <title>Chiến dịch tu tập — Quản trị Quang Từ</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<AdminPracticeCampaigns initialCampaigns={data.campaigns} userId={data.userId} />
