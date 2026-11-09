<script lang="ts">
  import SessionStatus from '$lib/components/auth/SessionStatus.svelte';
  import { setLocaleContext } from '$lib/stores/locale.svelte';
  setLocaleContext('vi');
</script>
<SessionStatus session={{ authenticated: false, user: null }} />
