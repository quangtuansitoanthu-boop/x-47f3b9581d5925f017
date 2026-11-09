import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/lib/components/guide/DharmaGivingGuidePrompt.svelte', 'utf8');
const tuTapPageSource = readFileSync('src/routes/tu-tap/+page.svelte', 'utf8');

describe('DharmaGivingGuidePrompt contract', () => {
  it('contains proper messaging for Dharma giving guide prompt', () => {
    expect(source).toContain('Bố thí máy nghe pháp');
    expect(source).toContain('Xem hướng dẫn');
    expect(source).toContain('Để sau');
    expect(source).toContain('/huong-dan?phan=tu-hoc#bo-thi-may-nghe-phap');
    expect(source).toContain('thẻ nhớ 4G (FAT32)');
  });

  it('displays for visitors who have not dismissed the guide', () => {
    expect(source).toContain('!dismissedManually');
    expect(source).toContain('!isStoredDismissed()');
    expect(source).toContain('tutam_dharma_giving_seen_guest');
  });

  it('does not display on the guide page itself', () => {
    expect(source).toContain("currentPath.startsWith('/huong-dan')");
  });

  it('marks as dismissed in localStorage per user ID', () => {
    expect(source).toContain('tutam_dharma_giving_seen_');
    expect(source).toContain("localStorage.setItem(storageKey, '1')");
  });

  it('keeps the Dharma giving guide in the tu-tap page', () => {
    expect(tuTapPageSource).toContain('import DharmaGivingGuidePrompt from \'$lib/components/guide/DharmaGivingGuidePrompt.svelte\';');
    const snippetIndex = tuTapPageSource.indexOf('{#snippet dharmaGivingPrompt()}');
    expect(snippetIndex).toBeGreaterThan(-1);
    const snippetContent = tuTapPageSource.slice(snippetIndex, snippetIndex + 300);
    expect(snippetContent).toContain('<DharmaGivingGuidePrompt');
  });

  it('renders dharmaGivingPrompt directly below the newbie guide banner in PracticeCatalog', () => {
    const banners = readFileSync('src/lib/components/guide/FixedPracticeGuideBanners.svelte','utf8');
    const page = readFileSync('src/routes/+page.svelte','utf8');
    expect(page).toContain('<FixedPracticeGuideBanners');
    expect(banners).toContain('href="/huong-dan#bo-thi-may-nghe-phap"');
    expect(banners.indexOf('tt-newbie-guide-banner')).toBeLessThan(banners.indexOf('tt-dharma-giving-banner'));
  });
});

