<script lang="ts">
  import { Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward } from '@lucide/svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { talkVideoText } from '$lib/i18n/talk-video';
  import { audioPlayer, getAudioPlayer } from '$lib/stores/audio-player.svelte';

  let { title }: { title: string } = $props();
  const localeStore = getLocaleContext();
  const text = $derived(talkVideoText[localeStore.current === 'en' ? 'en' : 'vi']);
  let commandError = $state('');
  const duration = $derived(Math.max(0, $audioPlayer.duration));
  const position = $derived(Math.min(duration, Math.max(0, $audioPlayer.currentTime)));
  const trackCount = $derived($audioPlayer.album?.tracks.length ?? 0);

  function time(value: number): string {
    const seconds = Math.max(0, Math.floor(value));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  async function control(action: 'previous' | 'next' | 'toggle' | 'rewind' | 'forward' | 'seek', seconds = 0): Promise<void> {
    commandError = '';
    try {
      const player = await getAudioPlayer();
      if (action === 'previous') {
        const { album, trackIndex } = player.snapshot;
        if (album && trackIndex > 0) await player.playTrack(album, trackIndex - 1);
      } else if (action === 'next') await player.next();
      else if (action === 'toggle') {
        if (player.snapshot.playing) player.pause();
        else await player.play();
      } else if (action === 'seek') player.seek(seconds);
      else player.seekBy(action === 'rewind' ? -10 : 30);
    } catch { commandError = text.controlError; }
  }
</script>

<div class="video-transport" role="group" aria-label={title}>
  <span class="track-count">{text.track} {$audioPlayer.trackIndex + 1} / {trackCount}</span>
  <strong>{title}</strong>
  <div class="seek-row">
    <span>{time(position)}</span>
    <input type="range" min="0" max={duration || 1} step="0.1" value={position} disabled={!duration}
      aria-label={text.seek} aria-valuetext={`${time(position)} / ${time(duration)}`}
      oninput={(event) => void control('seek', Number(event.currentTarget.value))} />
    <span>{time(duration)}</span>
  </div>
  <div class="transport-buttons">
    <button type="button" aria-label={text.previous} disabled={$audioPlayer.trackIndex <= 0} onclick={() => void control('previous')}><SkipBack size={24} aria-hidden="true" /></button>
    <button type="button" class="time-skip" aria-label={text.rewind} onclick={() => void control('rewind')}><RotateCcw size={30} aria-hidden="true" /><span aria-hidden="true">10</span></button>
    <button type="button" class="toggle" aria-label={$audioPlayer.playing ? text.pause : text.play} onclick={() => void control('toggle')}>
      {#if $audioPlayer.playing}<Pause size={32} aria-hidden="true" />{:else}<Play size={32} aria-hidden="true" />{/if}
    </button>
    <button type="button" class="time-skip" aria-label={text.forward} onclick={() => void control('forward')}><RotateCw size={30} aria-hidden="true" /><span aria-hidden="true">30</span></button>
    <button type="button" aria-label={text.next} disabled={$audioPlayer.trackIndex >= trackCount - 1 && $audioPlayer.repeat !== 2} onclick={() => void control('next')}><SkipForward size={24} aria-hidden="true" /></button>
  </div>
  {#if commandError || $audioPlayer.error}<p role="alert">{commandError || $audioPlayer.error}</p>{/if}
</div>

<style>
  .video-transport { display: grid; gap: .5em; padding: 2em 1em max(1em, env(safe-area-inset-bottom, 0px)); color: var(--video-ink); background: linear-gradient(transparent, var(--video-surface)); }
  .track-count { font-size: .75em; opacity: .8; }
  strong { font-size:var(--font-size-body); line-height: 1.4; overflow-wrap: anywhere; }
  .seek-row { display: flex; align-items: center; gap: .75em; font-size: .75em; font-variant-numeric: tabular-nums; }
  input { min-width: 0; min-height: 44px; flex: 1; margin: 0; accent-color: var(--gold2); cursor: pointer; }
  .transport-buttons { display: flex; align-items: center; justify-content: space-between; gap: .5em; }
  button { display: grid; place-items: center; position: relative; min-width: 44px; min-height: 44px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; touch-action: manipulation; }
  .toggle { width: 64px; height: 64px; background: var(--gold); color: var(--on-gold); }
  .time-skip span { position: absolute; font-size: .65em; font-weight: 700; }
  button:disabled { opacity: .35; cursor: default; }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--gold2); outline-offset: 2px; }
  p { margin: 0; font-size:var(--font-size-body); }
  @media (orientation: landscape) and (max-height: 500px) {
    .video-transport { gap: 0; padding: .5em 1em max(.5em, env(safe-area-inset-bottom, 0px)); }
    .toggle { width: 44px; height: 44px; }
  }
</style>

