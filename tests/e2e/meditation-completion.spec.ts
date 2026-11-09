import { expect, test } from '@playwright/test';
import { translations } from '../../src/lib/i18n/translations';

for (const locale of ['vi', 'en'] as const) {
  test(`meditation ends with three bells and the ${locale} blessing`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: locale === 'vi' ? 375 : 1440, height: 900 });
    await page.route('**/api/**', route => route.abort('failed'));
    await page.addInitScript((language) => {
      localStorage.setItem('tutam_locale', language);
      localStorage.setItem('tutam_dark_mode', language === 'en' ? '1' : '0');
      const spoken: string[] = [];
      const bells: number[] = [];
      const music: HTMLMediaElement[] = [];
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (this.src.includes('nhac-thien-01.m4a')) music.push(this);
        return play.call(this);
      };
      Object.assign(window, { __meditationMusic: music });
      Object.assign(window, { __meditationSpoken: spoken, __meditationBells: bells });
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class {
        constructor(public text: string) {}
      }, configurable: true });
      Object.defineProperty(window, 'speechSynthesis', { value: {
        cancel() {},
        getVoices: () => [{ lang: language === 'en' ? 'en-US' : 'vi-VN', name: 'Test voice' }],
        speak(utterance: SpeechSynthesisUtterance) {
          if (!utterance.text) return;
          spoken.push(utterance.text);
          setTimeout(() => {
            utterance.onstart?.(new Event('start') as SpeechSynthesisEvent);
            utterance.onend?.(new Event('end') as SpeechSynthesisEvent);
          }, 0);
        },
      }, configurable: true });
      const createOscillator = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function () {
        const oscillator = createOscillator.call(this);
        const start = oscillator.start.bind(oscillator);
        oscillator.start = (when = 0) => { bells.push(when); start(when); };
        return oscillator;
      };
    }, locale);
    await page.goto('/tu-tap?mode=meditation', { waitUntil: 'domcontentloaded' });
    const text = translations[locale].practice;
    const chooser = page.locator('.meditation-chooser');
    await expect(chooser).toBeVisible();
    // The approved chooser exposes music as a tab of selectable tiles, not a native select.
    await expect(chooser.getByRole('button', { name: locale === 'vi' ? '15 phút' : '15 mins', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    const musicTabLabel = locale === 'vi' ? 'Nhạc thiền' : 'Music';
    const musicTab = chooser.getByRole('tab', { name: musicTabLabel, exact: true });
    await musicTab.click();
    await expect(musicTab).toHaveAttribute('aria-selected', 'true');
    const musicPanel = chooser.getByRole('tabpanel', { name: musicTabLabel, exact: true });
    const firstTrack = musicPanel.getByRole('button', {
      name: locale === 'vi' ? 'Nhạc Thiền 1 — Tĩnh lặng' : 'Meditation Music 1 — Stillness', exact: true,
    });
    await firstTrack.click();
    await expect(firstTrack).toHaveAttribute('aria-pressed', 'true');
    const clockStart = new Date('2026-10-25T00:00:00Z');
    await page.clock.install({ time: clockStart });
    await page.clock.pauseAt(clockStart);
    await chooser.getByRole('button', { name: text.startMeditation, exact: true }).click();
    const screen = page.locator('.meditation-screen');
    await expect(screen).toBeVisible();
    await expect.poll(() => page.evaluate(() =>
      (window as typeof window & { __meditationMusic: HTMLMediaElement[] }).__meditationMusic
        .some(audio => !audio.paused && audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA),
    )).toBe(true);
    await page.clock.fastForward(30_000);
    await page.evaluate(() => {
      (window as typeof window & { __meditationBells: number[] }).__meditationBells.length = 0;
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.fastForward(10 * 60_000);
    await expect(screen.locator('.meditation-screen__time')).toHaveText('05:00');
    expect(await page.evaluate(() => (window as typeof window & { __meditationMusic: HTMLMediaElement[] }).__meditationMusic.some(audio => !audio.paused))).toBe(true);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.fastForward(5 * 60_000);
    await expect(screen.locator('.meditation-screen__time')).toHaveText('00:00');
    await expect(screen.locator('.meditation-screen__badge--completed')).toHaveText(`🌸 ${text.sessionCompleted}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('completed.png') });
    const bells = await page.evaluate(() => (window as typeof window & { __meditationBells: number[] }).__meditationBells);
    expect(bells).toHaveLength(6);
    expect(bells[2] - bells[0]).toBeCloseTo(2.5);
    expect(bells[4] - bells[2]).toBeCloseTo(2.5);
    await page.clock.fastForward(8_000);
    await page.clock.runFor(100);
    await expect.poll(() => page.evaluate(() =>
      (window as typeof window & { __meditationSpoken: string[] }).__meditationSpoken.join(' '),
    )).toBe(text.completionAnnouncement);
    await screen.getByRole('button', { name: text.finish, exact: true }).click();
    await expect(screen).toHaveCount(0);
  });
}
