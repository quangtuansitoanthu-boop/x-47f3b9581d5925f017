<script lang="ts">
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  interface Props {
    year?: number;
  }

  let { year = new Date().getFullYear() }: Props = $props();
  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t);
</script>

<footer class="qts-footer">
  <div class="qts-footer__inner">
    <div class="qts-footer__brand">
      <img src="/assets/branding/tu-tap-logo.png" alt="" width="36" height="36" />
      <div>
        <div class="qts-footer__name">{t.footer.brandName}</div>
        <div class="qts-footer__tagline">{t.footer.tagline}</div>
      </div>
    </div>
    <div class="qts-footer__legal">
      <p>{t.footer.copyright(year)}</p>
      <p>{t.footer.moto}</p>
    </div>
  </div>
</footer>
