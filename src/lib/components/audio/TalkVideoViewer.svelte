<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, Expand, ListVideo, Smartphone } from '@lucide/svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { talkVideoText } from '$lib/i18n/talk-video';
  import { audioPlayer, getAudioPlayer } from '$lib/stores/audio-player.svelte';
  import { attachTalkVideoMirror } from '$lib/browser/talk-video-mirror';
  import VideoTransport from './VideoTransport.svelte';
  import { resolveApiUrl } from '$lib/browser/native-api';
  import { getOfflineTrack } from '$lib/browser/offline-audio-database';

  let { url, title, expanded = $bindable(true), onBack }: { url: string; title: string; expanded?: boolean; onBack: () => void } = $props();
  const localeStore = getLocaleContext();
  const text = $derived(talkVideoText[localeStore.current === 'en' ? 'en' : 'vi']);
  let video = $state<HTMLVideoElement | null>(null);
  let videoSource = $state('');
  let unavailable = $state(false);
  let mounted = $state(false);
  let hintVisible = $state(false);
  let listButton = $state<HTMLButtonElement | null>(null);
  let expandButton = $state<HTMLButtonElement | null>(null);

  onMount(() => {
    mounted = true;
    let cancelled = false;
    let localUrl: string | undefined;
    async function loadSource(): Promise<void> {
      const saved = await getOfflineTrack(url, { album: $audioPlayer.album ?? undefined }).catch(() => null);
      if (cancelled) return;
      if (saved?.blob) localUrl = URL.createObjectURL(saved.blob);
      videoSource = localUrl ?? resolveApiUrl(url);
    }
    void loadSource();
    return () => {
      cancelled = true;
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  });

  $effect(() => {
    if (mounted) (expanded ? listButton : expandButton)?.focus({ preventScroll: true });
  });

  $effect(() => {
    if (!mounted || !expanded) { hintVisible = false; return; }
    hintVisible = true;
    const timer = setTimeout(() => { hintVisible = false; }, 5_000);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    const surface = video;
    if (!mounted || !surface) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    async function connect(): Promise<void> {
      try {
        const player = await getAudioPlayer();
        if (!cancelled) dispose = attachTalkVideoMirror(player.audio, surface!, document, () => { unavailable = true; });
      } catch { if (!cancelled) unavailable = true; }
    }
    void connect();
    return () => { cancelled = true; dispose?.(); };
  });

  function time(value: number): string {
    const seconds = Math.max(0, Math.floor(value));
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }
</script>

<figure class="talk-video" class:expanded>
  <video bind:this={video} src={videoSource || undefined} muted playsinline preload="metadata" aria-label={title}
    onerror={() => { unavailable = true; }}></video>
  {#if expanded}
    <div class="video-topbar">
      <button type="button" onclick={onBack}><ArrowLeft size={20} aria-hidden="true" />{text.back}</button>
      <button bind:this={listButton} type="button" onclick={() => { expanded = false; }}><ListVideo size={20} aria-hidden="true" />{text.list}</button>
    </div>
    {#if hintVisible}
      <div class="background-hint" role="status">
        <Smartphone size={24} aria-hidden="true" />
        <div><strong>{text.backgroundHint}</strong><small>{text.hintTimeout}</small></div>
      </div>
    {/if}
    {#if unavailable}<p class="video-error" role="status">{text.unavailable}</p>{/if}
  {/if}
  <figcaption>
    {#if expanded}
      <VideoTransport {title} />
    {:else}
      <button bind:this={expandButton} type="button" onclick={() => { expanded = true; }}><Expand size={18} aria-hidden="true" />{text.fullscreen}</button>
      <span class="playing-label">{text.playing} · {text.track} {$audioPlayer.trackIndex + 1}</span>
      <strong>{title}</strong>
      <span class="time-label">{time($audioPlayer.currentTime)} / {time($audioPlayer.duration)}</span>
      <progress max={$audioPlayer.duration || 1} value={$audioPlayer.currentTime} aria-label={text.seek}></progress>
      {#if unavailable}<p role="status">{text.unavailable}</p>{/if}
    {/if}
  </figcaption>
</figure>

<style>
  .talk-video { display: grid; grid-template-columns: minmax(0, 35%) minmax(0, 1fr); flex: none; margin: .5em; border: 1px solid var(--border2); border-radius: var(--radius-card); overflow: hidden; background: var(--bg2); }
  video { display: block; inline-size: 100%; block-size: min(25dvh, 14rem); object-fit: contain; background: var(--video-surface); }
  figcaption { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: .5em; min-inline-size: 0; padding: .75em; }
  button { display: inline-flex; align-items: center; justify-content: center; gap: .5em; min-block-size: 44px; min-inline-size: 44px; padding: .5em .75em; border: 1px solid var(--border2); border-radius: 999px; background: var(--bg); color: var(--text); font: inherit; font-size:var(--font-size-label); cursor: pointer; touch-action: manipulation; }
  button:focus-visible { outline: 2px solid var(--gold); outline-offset: -2px; }
  figcaption > button { align-self: flex-end; }
  figcaption > strong { color: var(--text); font-size:var(--font-size-body); line-height: 1.4; overflow-wrap: anywhere; }
  .playing-label { color: var(--brown); font-size:var(--font-size-meta); }
  .time-label { color: var(--muted); font-size: .75em; font-variant-numeric: tabular-nums; }
  progress { inline-size: 100%; block-size: .35em; accent-color: var(--gold); }
  p { margin: 0; font-size:var(--font-size-body); color: var(--muted); }
  .expanded { position: fixed; inset: 0; z-index: 10; display: block; margin: 0; border: 0; border-radius: 0; background: var(--video-surface); color: var(--video-ink); }
  .expanded video { inline-size: 100%; block-size: 100%; }
  .video-topbar { position: absolute; top: max(.75em, var(--app-safe-top, env(safe-area-inset-top, 0px))); right: max(.75em, env(safe-area-inset-right, 0px)); left: max(.75em, env(safe-area-inset-left, 0px)); display: flex; justify-content: space-between; gap: .5em; }
  .video-topbar button { border-color: color-mix(in srgb, var(--video-ink) 50%, transparent); color: var(--video-ink); background: color-mix(in srgb, var(--video-surface) 70%, transparent); }
  .expanded figcaption { position: absolute; inset-inline: 0; bottom: 0; display: block; padding: 0; }
  .background-hint { position: absolute; top: calc(max(.75em, var(--app-safe-top, env(safe-area-inset-top, 0px))) + 54px); inset-inline: .75em; display: flex; align-items: center; gap: .75em; padding: .75em; border: 1px solid var(--gold); border-radius: var(--radius-control); background: color-mix(in srgb, var(--video-surface) 90%, transparent); color: var(--video-ink); pointer-events: none; }
  .background-hint :global(svg) { flex: none; }
  .background-hint strong { display: block; font-size:var(--font-size-body); line-height: 1.4; }
  .background-hint small { display: block; margin-top: .3em; font-size:var(--font-size-meta); opacity: .8; }
  .video-error { position: absolute; top: 35%; inset-inline: 1em; padding: .75em; color: var(--video-ink); background: var(--video-surface); }
  @media (max-width: 600px) { figcaption { gap: .35em; padding: .5em; } }
  @media (orientation: landscape) and (max-height: 500px) { .background-hint { max-inline-size: 25em; } }
</style>
