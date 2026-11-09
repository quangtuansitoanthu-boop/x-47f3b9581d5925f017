<script lang="ts">
  import AppDialogHost from '$lib/components/layout/AppDialogHost.svelte';
  import { setLocaleContext } from '$lib/stores/locale.svelte';

  setLocaleContext('vi');
</script>

<button type="button" data-dialog-opener>Mở hộp thoại</button>
<AppDialogHost />
