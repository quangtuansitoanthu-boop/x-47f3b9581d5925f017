<script lang="ts">
  interface Props {
    message: string;
    visible: boolean;
  }

  let { message, visible }: Props = $props();
  const assertive = $derived(message.startsWith('❌'));
</script>

<div class:show={visible} class="reader-toast" role={assertive ? 'alert' : 'status'} aria-live={assertive ? 'assertive' : 'polite'} aria-atomic="true">
  {message}
</div>

<style>
  .reader-toast{position:fixed;z-index:9999;bottom:28px;left:50%;max-width:calc(100vw - 32px);overflow:hidden;padding:11px 22px;border-radius:30px;background:var(--brown-dark);box-shadow:var(--shadow-xl);color:#fff;font-size:var(--font-size-meta);font-weight:500;opacity:0;pointer-events:none;text-overflow:ellipsis;transform:translateX(-50%) translateY(10px);transition:opacity .25s,transform .25s;white-space:nowrap}
  .reader-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
  @media(max-width:480px){.reader-toast{bottom:18px;max-width:calc(100vw - 24px);padding:10px 16px;white-space:normal;text-align:center}}
  @media(prefers-reduced-motion:reduce){.reader-toast{transition:none;transform:translateX(-50%)}.reader-toast.show{transform:translateX(-50%)}}
</style>
