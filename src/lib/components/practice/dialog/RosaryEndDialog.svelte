<script lang="ts">
  import PracticeConfirmDialog from './PracticeConfirmDialog.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { practiceUi } from '$lib/i18n/practice-ui';

  interface Props {
    count: number;
    phrase: string;
    completed: boolean;
    error: string;
    onCancel: () => void;
    onConfirm: () => void;
    onClose: () => void;
  }
  let { count, phrase, completed, error, onCancel, onConfirm, onClose }: Props = $props();
  const locale = getLocaleContext();
  const isEn = $derived(locale.current === 'en');
</script>

<PracticeConfirmDialog
  open={true}
  practiceTheme="rosary"
  title={practiceUi(isEn, completed ? 'Đã kết thúc phiên lần hạt' : 'Kết thúc phiên lần hạt')}
  hideTitle={!completed}
  showCancel={!completed}
  description={practiceUi(isEn, completed ? 'Tổng số đã niệm trong phiên' : 'Bạn có muốn thoát và chốt sổ công phu của phiên này không?')}
  cancelLabel={practiceUi(isEn, 'Tiếp tục niệm')}
  confirmLabel={practiceUi(isEn, completed ? 'Về Tu tập' : 'Chốt sổ và thoát')}
  onCancel={completed ? onClose : onCancel}
  onConfirm={completed ? onClose : onConfirm}
>
  {#if !completed}<p class="session-label">{practiceUi(isEn, 'Đã niệm trong phiên này')}</p>{/if}
  <p class="session-count"><strong>{count.toLocaleString(isEn ? 'en-US' : 'vi-VN')}</strong> {practiceUi(isEn, 'biến')}</p>
  {#if phrase}<p class="session-phrase">{phrase}</p>{/if}
  {#if completed}<p class="session-status" role="status">{practiceUi(isEn, count > 0 ? 'Đã chốt sổ công phu của phiên này.' : 'Phiên này chưa có biến niệm để ghi sổ.')}</p>{/if}
  {#if error}<p class="session-error" role="alert">{error}</p>{/if}
</PracticeConfirmDialog>

<style>
  p{margin:0 0 var(--radius);font-size:var(--font-size-label);line-height:1.5;color:var(--text2)}
  .session-count{font-size:var(--font-size-dialog-count);line-height:1.3;color:var(--text);font-variant-numeric:tabular-nums}
  .session-phrase{overflow-wrap:anywhere}
  .session-error{color:var(--danger-text)}
</style>
