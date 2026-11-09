import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';
import { PRECEPT_PRACTICE_COPY } from '../../src/lib/i18n/precept-practice-ui';
const copy = PRECEPT_PRACTICE_COPY.vi;

async function openPrecepts(page: import('@playwright/test').Page) {
  await page.goto('/tu-tap'); await settleClient(page);
  await page.getByRole('button', { name: /Giữ giới thanh tịnh/ }).click();
  await expect(page.getByTestId('precept-practice-screen')).toBeVisible();
}

test('daily guidance and observance stay separate from the Eight Precepts entry', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await openPrecepts(page);
  const screen = page.getByTestId('precept-practice-screen');
  await expect(screen.getByRole('tab')).toHaveText([copy.guidanceTab, copy.observanceTab]);
  await expect(screen.getByRole('heading', { name: copy.featureTitle, exact: true })).toBeVisible();
  await expect(screen.locator('.precept-group')).toHaveCount(2);
  await expect(screen.locator('input[name="five-life"]')).toHaveCount(0);
  await screen.getByRole('tab', { name: copy.observanceTab, exact: true }).click();
  await expect(screen.getByTestId('daily-combined')).toBeVisible();
  await screen.getByRole('button', { name: copy.back, exact: true }).click();
  await expect(screen).toHaveCount(0);
  await page.getByRole('button', { name: new RegExp(copy.tabEight) }).click();
  await expect(screen.getByRole('heading', { name: copy.tabEight, exact: true })).toBeVisible();
  await expect(page.getByTestId('eight-prepare')).toBeVisible();
  await expect(screen.locator('.practice-group')).toHaveCount(0);
  await expect(screen.getByRole('tab')).toHaveCount(0);
});

for (const mode of ['daily', 'eight'] as const) {
  test(`${mode} deep link opens its own companion directly`, async ({ page }) => {
    await page.goto(`/tu-tap?action=${mode === 'daily' ? 'giu-gioi' : 'bat-quan-trai'}`);
    await settleClient(page);
    const screen = page.getByTestId('precept-practice-screen');
    await expect(screen.getByRole('heading', { name: mode === 'daily' ? copy.featureTitle : copy.tabEight, exact: true })).toBeVisible();
    await expect(screen.getByRole('tab')).toHaveCount(mode === 'daily' ? 2 : 0);
    if (mode === 'daily') {
      await expect(screen.locator('.precept-group')).toHaveCount(2);
      await expect(page.getByTestId('eight-prepare')).toHaveCount(0);
    } else {
      await expect(page.getByTestId('eight-prepare')).toBeVisible();
      await expect(screen.locator('.practice-group')).toHaveCount(0);
    }
  });
}

test('old abstinence card opens its existing tools directly', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap'); await settleClient(page);
  await page.getByRole('button', { name: /Tiết dục bảo thân/ }).click();
  await expect(page.locator('.btn-onboarding-join')).toBeVisible();
  await expect(page.locator('.abstinence-overview')).toHaveCount(0);
  await expect(page.getByTestId('precept-practice-screen')).toHaveCount(0);
});

test('returning after midnight preserves the 24-hour observance and old reflection storage', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-28T16:59:00Z'));
  await openPrecepts(page);
  await page.getByRole('tab', { name: copy.observanceTab, exact: true }).click();
  const daily = page.getByTestId('daily-combined');
  await daily.getByRole('checkbox').check();
  await daily.getByRole('button', { name: 'Phát nguyện', exact: true }).click();
  await page.getByRole('dialog', { name: 'Phát nguyện', exact: true }).getByRole('button', { name: 'Xác nhận phát nguyện', exact: true }).click();
  const before = await page.evaluate(() => localStorage.getItem('tutam_precept_companion_v1'));
  await page.clock.setFixedTime(new Date('2026-10-28T17:01:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('daily-combined-tracking')).toBeVisible();
  await expect(daily.getByRole('button', { name: 'Xả giới', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('tutam_precept_companion_v1'))).toBe(before);
  expect(await page.evaluate(() => localStorage.getItem('tutam_precept_reflections_v1'))).toBeNull();
});

test('restored rosary keeps settings available without resetting choices or count', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/tu-tap'); await settleClient(page);
  await page.locator('.tt-mode-card--chuoi').click();
  await page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true }).click();
  const settings = page.locator('.tt-rosary__settings');
  await expect(settings).toBeHidden();
  await page.locator('.tt-rosary').getByRole('button', { name: 'Tùy chọn', exact: true }).click();
  await expect(settings).toBeVisible();
  const phrase = page.getByRole('combobox', { name: 'Danh hiệu trì niệm' });
  const selected = await phrase.innerText();
  await phrase.click();
  const picker = page.getByRole('dialog', { name: 'Chọn bài thực hành', exact: true });
  const selectedValue = await picker.locator('.rosary-select__option[aria-pressed="true"]').getAttribute('data-value');
  expect(selectedValue).toBeTruthy();
  await picker.press('Escape');
  await page.locator('.tt-rosary__count-button').click();
  await expect(settings).toBeVisible();
  await expect(page.getByText('1/108', { exact: true })).toBeVisible();
  await expect(phrase).toHaveText(selected);
  await phrase.click();
  await expect(picker.locator('.rosary-select__option[aria-pressed="true"]')).toHaveAttribute('data-value', selectedValue!);
  await picker.press('Escape');
});

