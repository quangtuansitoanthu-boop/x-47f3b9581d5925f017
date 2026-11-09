<script lang="ts">
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { REFLECTION_GUIDE_SECTIONS } from '$lib/i18n/reflection-guide';
  import { personalPracticeCopy } from '$lib/i18n/personal-practice-copy';
  import { countReflectionWords } from '$lib/domain/practice/personal-practice';

  interface Props {
    onDismiss?: () => void;
    embedded?: boolean;
  }

  let { onDismiss, embedded = false }: Props = $props();
  const locale = getLocaleContext();
  const isEn = $derived(locale.current === 'en');
  const sections = $derived(REFLECTION_GUIDE_SECTIONS[isEn ? 'en' : 'vi']);
  const copy = $derived(personalPracticeCopy[isEn ? 'en' : 'vi']);

  let remember = $state(true);

  function handleContinue() {
    if (typeof localStorage !== 'undefined' && remember) {
      try {
        localStorage.setItem('tt_reflection_guide_seen_v1', '1');
      } catch {
        /* Local storage optional preference */
      }
    }
    onDismiss?.();
  }
</script>

<div class="reflection-guide" class:embedded data-testid="reflection-guide">
  {#if !embedded}
    <header class="guide-header">
      <span class="eyebrow">{isEn ? 'STEP 1 · PREPARATION & MINDFULNESS' : 'BƯỚC 1 · THÂN TÂM TRANG NGHIÊM'}</span>
      <h2>{isEn ? 'Reflection & Repentance Guide' : 'Hướng Dẫn Quán Chiếu Thiện Ác & Sám Hối'}</h2>
      <p class="guide-subtitle">
        {isEn
          ? 'Deeply contemplating actions, speech, and thoughts to purify karma and multiply blessings.'
          : 'Lắng lòng soi rọi ba nghiệp Thân – Khẩu – Ý để tiêu trừ nghiệp chướng và nhân phước vô lượng.'}
      </p>
    </header>

    <ol class="stepper" aria-label={isEn ? 'Practice steps' : 'Các bước thực hành'}>
      <li aria-current="step"><span>1</span>{isEn ? 'Guidance' : 'Hướng dẫn'}</li>
      <li><span>2</span>{isEn ? 'Reflection' : 'Quán chiếu'}</li>
      <li><span>3</span>{isEn ? 'Share & Dedicate' : 'Lưu & Chia sẻ'}</li>
    </ol>
  {/if}

  <div class="guide-content">
    {#each sections as section (section.id)}
      <article class="guide-card" aria-labelledby={`guide-sec-${section.id}`}>
        {#if section.badge}
          <span class="card-badge">{section.badge}</span>
        {/if}
        <h3 id={`guide-sec-${section.id}`}>{section.title}</h3>

        {#if section.scriptureQuote}
          <blockquote class="scripture-quote">
            <p class="quote-text">“{section.scriptureQuote.text}”</p>
            <cite class="quote-source">— {section.scriptureQuote.source}</cite>
          </blockquote>
        {/if}

        {#each section.paragraphs as paragraph (paragraph)}
          <p class="guide-para">{paragraph}</p>
        {/each}

        {#if section.bulletPoints?.length}
          <ul class="guide-bullets">
            {#each section.bulletPoints as point (point)}
              <li>{point}</li>
            {/each}
          </ul>
        {/if}

        {#if section.example}
          <div class="example-box">
            <div class="example-header">
              <span class="example-title">📝 {section.example.title}</span>
              <span class="example-count">{copy.wordsCount.replace('{0}', String(countReflectionWords(section.example.text)))}</span>
            </div>
            <p class="example-text">"{section.example.text}"</p>
            <p class="example-explanation">💡 {section.example.explanation}</p>
          </div>
        {/if}
      </article>
    {/each}
  </div>

  {#if !embedded}
    <footer class="guide-footer">
      <label class="remember-label">
        <input type="checkbox" bind:checked={remember} />
        <span>{copy.guideRemember}</span>
      </label>
      <button type="button" class="start-button" onclick={handleContinue}>
        {copy.startWriting} →
      </button>
    </footer>
  {/if}
</div>

<style>
  .reflection-guide {
    display: grid;
    gap: var(--space-page);
    color: var(--text);
    font-family: var(--font-app);
    max-width: 800px;
    margin-inline: auto;
  }
  .guide-header {
    text-align: center;
    padding-block: calc(var(--space-page) * 0.5);
  }
  .eyebrow {
    display: inline-block;
    font-size: var(--font-size-sm, 0.8rem);
    letter-spacing: 0.08em;
    font-weight: 700;
    color: var(--brown, var(--gold));
    margin-bottom: calc(var(--space-page) * 0.25);
  }
  h2 {
    margin: 0;
    font-size: clamp(1.2rem, 3.5vw, 1.6rem);
    font-weight: 800;
    line-height: 1.4;
    color: var(--text);
  }
  .guide-subtitle {
    margin: calc(var(--space-page) * 0.4) auto 0;
    color: var(--text2);
    font-size: var(--font-size-body);
    line-height: 1.6;
    max-width: 600px;
  }
  .stepper {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: calc(var(--space-page) * 0.6);
    list-style: none;
    margin: 0;
    padding: calc(var(--space-page) * 0.4);
    background: var(--gold-light);
    border-radius: var(--radius-control);
    font-size: var(--font-size-label, 0.85rem);
    font-weight: 700;
    overflow-x: auto;
  }
  .stepper li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text2);
    white-space: nowrap;
  }
  .stepper li span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--card);
    color: var(--text);
    font-size: 0.75rem;
  }
  .stepper li[aria-current='step'] {
    color: var(--brown, var(--text));
  }
  .stepper li[aria-current='step'] span {
    background: var(--gold);
    color: var(--on-gold);
  }
  .guide-content {
    display: grid;
    gap: var(--space-page);
  }
  .guide-card {
    padding: var(--space-page);
    background: var(--dialog-glass-background, var(--card));
    border: 1px solid var(--border2);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.05));
  }
  .card-badge {
    display: inline-block;
    padding: 3px 9px;
    background: var(--gold-light);
    color: var(--brown, var(--gold));
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    margin-bottom: calc(var(--space-page) * 0.4);
  }
  h3 {
    margin: 0 0 calc(var(--space-page) * 0.5);
    font-size: clamp(1.05rem, 2.5vw, 1.25rem);
    font-weight: 700;
    line-height: 1.4;
    color: var(--text);
  }
  .scripture-quote {
    margin: calc(var(--space-page) * 0.5) 0 calc(var(--space-page) * 0.75);
    padding: calc(var(--space-page) * 0.6) var(--space-page);
    background: var(--gold-light);
    border-left: 4px solid var(--gold);
    border-radius: 0 var(--radius-control) var(--radius-control) 0;
  }
  .quote-text {
    margin: 0;
    font-family: var(--font-reader);
    font-style: italic;
    color: var(--text);
    font-size: var(--font-size-body);
    line-height: 1.8;
    text-align: justify;
  }
  .quote-source {
    display: block;
    margin-top: calc(var(--space-page) * 0.3);
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--brown, var(--text2));
    text-align: right;
  }
  .guide-para {
    margin: calc(var(--space-page) * 0.4) 0;
    font-family: var(--font-reader);
    color: var(--text2);
    font-size: var(--font-size-body);
    line-height: 1.85;
    text-align: justify;
    overflow-wrap: anywhere;
  }
  .guide-bullets {
    margin: calc(var(--space-page) * 0.4) 0;
    padding-left: calc(var(--space-page) * 1.2);
    display: grid;
    gap: calc(var(--space-page) * 0.3);
  }
  .guide-bullets li {
    font-family: var(--font-reader);
    color: var(--text2);
    font-size: var(--font-size-body);
    line-height: 1.75;
    text-align: justify;
  }
  .example-box {
    margin-top: calc(var(--space-page) * 0.6);
    padding: calc(var(--space-page) * 0.6);
    border: 1px dashed var(--gold);
    border-radius: var(--radius-control);
    background: var(--bg2, var(--card));
  }
  .example-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: calc(var(--space-page) * 0.3);
  }
  .example-title {
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--text);
  }
  .example-count {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--gold);
    padding: 2px 7px;
    background: var(--gold-light);
    border-radius: var(--radius-sm);
  }
  .example-text {
    margin: 0;
    font-family: var(--font-reader);
    font-style: italic;
    color: var(--text);
    font-size: var(--font-size-body);
    line-height: 1.75;
    text-align: justify;
  }
  .example-explanation {
    margin: calc(var(--space-page) * 0.3) 0 0;
    font-size: 0.82rem;
    color: var(--text2);
    line-height: 1.6;
  }
  .guide-footer {
    display: grid;
    gap: calc(var(--space-page) * 0.5);
    margin-top: calc(var(--space-page) * 0.5);
  }
  .remember-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.88rem;
    color: var(--text2);
    cursor: pointer;
    min-height: 44px;
  }
  .remember-label input[type='checkbox'] {
    width: 18px;
    height: 18px;
    accent-color: var(--gold);
    cursor: pointer;
  }
  .start-button {
    box-sizing: border-box;
    width: 100%;
    min-height: 48px;
    padding: calc(var(--space-page) * 0.6);
    background: var(--gold);
    color: var(--on-gold);
    border: none;
    border-radius: var(--radius-control);
    font: 700 var(--font-size-label) var(--font-app);
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .start-button:focus-visible {
    outline: 3px solid var(--gold);
    outline-offset: 2px;
  }
  @media (max-width: 600px) {
    .guide-card {
      padding: calc(var(--space-page) * 0.8);
    }
  }
</style>
