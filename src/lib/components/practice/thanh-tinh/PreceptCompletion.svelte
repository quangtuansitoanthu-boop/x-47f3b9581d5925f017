<script lang="ts">
  let { title, message, dedication, continueLabel, onContinue, complete = true, praiseLabel = '', dedicationLabel = '', note = '' }: {
    title: string;
    message: string;
    dedication: string;
    continueLabel: string;
    onContinue: () => void;
    complete?: boolean;
    praiseLabel?: string;
    dedicationLabel?: string;
    note?: string;
  } = $props();
</script>

<section class="precept-completion" class:celebrating={complete} aria-label={title}>
  {#if complete}
  <div class="sacred-hero">
  <img
    class="precept-completion__lotus"
    src="/images/practice/precept-lotus.webp"
    alt=""
    width="512"
    height="512"
    loading="lazy"
    decoding="async"
  />
  <div class="radiance" aria-hidden="true"></div>
  <div class="sparkles" aria-hidden="true">{#each [1, 2, 3, 4, 5] as star (star)}<span>✦</span>{/each}</div>
  </div>
  {/if}
  <div class="precept-completion__body">
    <div class="precept-completion__message" role="status">
      <h2 tabindex="-1">{title}</h2>
      {#if complete && praiseLabel}<h3>{praiseLabel}</h3>{/if}
      <p>{message}</p>
      {#if note}<p class="completion-note">{note}</p>{/if}
    </div>
    <div class="precept-completion__dedication">{#if dedicationLabel}<h3>{dedicationLabel}</h3>{/if}<p>{dedication}</p></div>
    <button type="button" onclick={onContinue}>{continueLabel}</button>
  </div>
</section>

<style>
  .celebrating{border-color:var(--gold);box-shadow:var(--shadow-lg)}
  .celebrating h2{font-size:1.8em}
  .sacred-hero{position:relative;overflow:hidden;isolation:isolate}
  .radiance{position:absolute;inset:-30%;pointer-events:none;background:conic-gradient(from 0deg,transparent 0deg,color-mix(in srgb,var(--gold-light) 30%,transparent) 12deg,transparent 24deg,transparent 45deg,color-mix(in srgb,var(--gold-light) 20%,transparent) 57deg,transparent 69deg,transparent 90deg);mask-image:radial-gradient(circle,transparent 8%,black 35%,transparent 70%);animation:halo-breath 9s ease-in-out infinite}
  .sparkles{position:absolute;inset:0;pointer-events:none}
  .sparkles span{position:absolute;color:var(--gold-light);font-size:1.3em;text-shadow:0 0 12px var(--gold);animation:sacred-twinkle 3.8s ease-in-out infinite}
  .sparkles span:nth-child(1){left:15%;top:22%}.sparkles span:nth-child(2){right:18%;top:30%;animation-delay:-1s}.sparkles span:nth-child(3){left:24%;bottom:20%;animation-delay:-2s}.sparkles span:nth-child(4){right:24%;bottom:25%;animation-delay:-3s}.sparkles span:nth-child(5){left:47%;top:12%;animation-delay:-1.5s}
  h3{margin:0;text-align:center;font-weight:700;font-size:1em;line-height:1.7;color:var(--brown)}
  .precept-completion__dedication h3{margin-bottom:var(--space-page)}
  .completion-note{font-size:.85em;padding:calc(var(--space-page)/2);background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-control);color:var(--text2)}
  @keyframes sacred-twinkle{0%,100%{opacity:.2;transform:scale(.5)}50%{opacity:1;transform:scale(1.15)}}
  @keyframes halo-breath{0%,100%{opacity:.3;transform:rotate(-8deg)}50%{opacity:.9;transform:rotate(8deg)}}
  @media(prefers-reduced-motion:reduce){.radiance,.sparkles span{animation:none}}
  .precept-completion {
    width: 100%;
    max-width: var(--practice-dialog-width);
    min-width: 0;
    margin-inline: auto;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    background: var(--card);
    color: var(--text);
    font-family: var(--font-app);
  }

  .precept-completion__lotus {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 1;
    object-fit: cover;
  }

  .precept-completion__body,
  .precept-completion__message {
    display: grid;
    gap: var(--space-page);
    min-width: 0;
  }

  .precept-completion__body {
    padding: var(--space-page);
    background: linear-gradient(var(--card), var(--gold-light));
  }

  h2 {
    margin: 0;
    color: var(--brown-dark);
    font-size: 1.4em;
    font-weight: 700;
    line-height: 1.5;
    text-align: center;
    overflow-wrap: anywhere;
  }

  p {
    margin: 0;
    line-height: 1.7;
    text-align: justify;
    overflow-wrap: anywhere;
  }

  .precept-completion__dedication::before {
    content: '';
    display: block;
    width: calc(var(--space-page) * 3);
    height: 1px;
    margin: 0 auto var(--space-page);
    background: var(--gold);
  }

  button {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: var(--radius-control);
    border: 1px solid var(--gold);
    border-radius: var(--radius-control);
    background: var(--gold);
    color: var(--on-gold);
    font: inherit;
    font-weight: 700;
    line-height: 1.6;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
</style>
