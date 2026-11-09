<script lang="ts">
  import PracticeIcon from '../PracticeIcon.svelte';
  import { ChevronRight, LockKeyhole } from '@lucide/svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { PRECEPT_UI } from '$lib/i18n/precept-interface';
  import { thanhTinhTranslations } from '$lib/i18n/thanh-tinh-translations';
  let { days, onOpen, onCheckIn }: { days: number; onOpen: (tab: 'overview' | 'progress' | 'sos' | 'audio' | 'diet' | 'repentance') => void; onCheckIn: () => void } = $props();
  const locale=getLocaleContext();
  const tt=$derived(locale.current==='en'?thanhTinhTranslations.en:thanhTinhTranslations.vi);
  const ui=(text:string)=>locale.current==='en'?text:PRECEPT_UI[text]??text;
  const tools=$derived([{tab:'sos',icon:18,title:tt.audio.tabSos,description:'Pause, breathe and redirect your attention'},{tab:'audio',icon:17,title:tt.audio.tabAudio,description:'Settle your mind for a few minutes'},{tab:'diet',icon:19,title:tt.tabs.diet,description:'Nurture wholesome daily habits'},{tab:'repentance',icon:20,title:tt.tabs.repentance,description:'Reflect gently and continue practising'}] as const);
</script>
<section class="abstinence-overview">
  <div class="landscape"><span><LockKeyhole size={14}/>{ui('Only for you')}</span></div>
  <article class="journey"><div><p>{ui('Your abstinence journey')}</p><strong>{days} {ui('days')}</strong></div><button onclick={()=>onOpen('progress')}>{ui('View progress')} <ChevronRight size={18}/></button></article>
  <h2>{ui('Tools to support you')}</h2>
  {#each tools as tool (tool.tab)}<button class="tool" onclick={()=>onOpen(tool.tab)}><PracticeIcon index={tool.icon}/><span><strong>{tool.title}</strong><small>{ui(tool.description)}</small></span><ChevronRight size={20}/></button>{/each}
  <button class="primary" onclick={onCheckIn}>{ui('Record today')}</button>
  <p class="note">{ui('Abstinence is a voluntary practice, tracked separately from the five precepts.')}</p>
  <button class="history" onclick={()=>onOpen('overview')}>{ui('All tools and existing history')} <ChevronRight size={18}/></button>
</section>
<style>
  .abstinence-overview{max-width:var(--practice-dialog-width);padding:var(--space-page);margin:auto;color:var(--text);font-family:var(--font-app)}
  .landscape{height:140px;margin:calc(-1 * var(--space-page)) calc(-1 * var(--space-page)) 0;background:url('/images/practice/clarity-lotus-pond.webp') center/cover;position:relative;border-radius:var(--radius-card)}.landscape>span{position:absolute;right:var(--radius-card);top:var(--radius-card);display:flex;align-items:center;gap:.4em;padding:.5em;background:var(--card);border-radius:var(--radius-control);color:var(--brown);font-size:.8rem}
  .journey{position:relative;display:flex;align-items:center;justify-content:space-between;gap:.7em;background:var(--card);border:1px solid var(--border);border-radius:var(--radius-card);padding:var(--space-page);margin-top:-1em;box-shadow:var(--shadow)}.journey p{margin:0;color:var(--brown);font-weight:600}.journey strong{font-size:2rem;color:var(--brown)}h2{font-size:1.15rem;margin:1.2em 0 .7em}
  button{font:inherit;cursor:pointer;border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:var(--radius-control);min-height:44px;padding:.7em}.journey button{display:flex;align-items:center;color:var(--brown);font-size:.85rem;gap:.3em}
  .tool{display:flex;align-items:center;gap:.8em;width:100%;padding:.8em;min-height:96px;margin:.6em 0;box-shadow:var(--shadow);text-align:left}.tool span{flex:1;min-width:0}.tool strong{display:block;color:var(--brown);font-size:1.05rem}.tool small{display:block;margin-top:.4em;color:var(--text2);line-height:1.6}.tool :global(svg){flex-shrink:0;color:var(--brown)}
  .primary{width:100%;background:linear-gradient(110deg,var(--gold2),var(--gold));color:var(--on-gold);font-weight:700;margin-top:.6em}.note{background:var(--gold-light);padding:.7em;border-radius:var(--radius-control);font-size:.8rem;color:var(--text2);line-height:1.6}.history{display:flex;width:100%;align-items:center;justify-content:center;gap:.4em;color:var(--brown)}
</style>
