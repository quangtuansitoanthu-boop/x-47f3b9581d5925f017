import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { MindfulPost, MindfulPostKind } from '../../src/lib/contracts/mindful-community';
import { getVietnamIsoDate, shiftVietnamDate } from '../../src/lib/domain/practice/stats';
import { loginAsMember, settleClient } from './runtime-helpers';

const postsPath = '/api/practice/mindful-posts';

test('mobile community periods keep newest posts first and reuse cached pages without reaction refetches', async ({ page }) => {
  await loginAsMember(page);
  await page.setViewportSize({ width: 375, height: 844 });
  const today = getVietnamIsoDate();
  const yesterday = shiftVietnamDate(today, -1);
  const reads: string[] = [];
  const writes: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/practice/mindful-posts?**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    expect(request.method()).toBe('GET');
    reads.push(url.search);
    const kind = (url.searchParams.get('kind') ?? 'repentance') as MindfulPostKind;
    const period = url.searchParams.get('period') ?? 'all';
    const after = url.searchParams.get('after');
    expect(['today', 'all']).toContain(period);
    const make = (id: string, date: string, hour: string): MindfulPost => ({
      id: `${kind}-${id}`, kind, nickname: `Đồng Tu ${id}`, content: `${kind}: ${id}\nDòng quán chiếu giữ đúng xuống hàng.`,
      createdAt: new Date(`${date}T${hour}:00+07:00`).toISOString(), reactionCount: 0,
      viewerReacted: false, isOwn: false, status: 'published',
    });
    const items = after ? [make('yesterday', yesterday, '20:00')]
      // Reverse fixture order deliberately checks rendering order across loaded data.
      : [make('earlier', today, '08:00'), make('newest', today, '12:00')];
    await route.fulfill({ json: { enabled: true, items, nextCursor: period === 'all' && !after ? 'bounded-next-page' : null } });
  });
  await page.route('**/api/practice/mindful-posts/*/reactions', async route => {
    const request = route.request();
    expect(request.method()).toBe('POST');
    writes.push(request.url());
    const postId = new URL(request.url()).pathname.split('/').at(-2)!;
    await route.fulfill({ json: { postId, reactionCount: 1, viewerReacted: true, templateId: request.postDataJSON().templateId } });
  });
  await page.goto('/tu-tap');
  await settleClient(page);
  expect(reads).toHaveLength(0);
  await openReflection(page);
  await page.getByRole('textbox', { name: 'Biệt danh đồng tu', exact: true }).fill('Đồng Tu Bộ Lọc');
  expect(reads).toHaveLength(0);
  await page.getByRole('button', { name: 'Cộng đồng', exact: true }).click();
  const community = page.locator('.mindful-community');
  const periods = community.getByRole('combobox', { name: 'Thời gian bài chia sẻ', exact: true });
  const articles = community.locator('article');
  await expect(periods).toHaveText('Tất cả');
  await expect(articles).toHaveCount(2);
  expect(reads).toHaveLength(1);
  expect(new URLSearchParams(reads[0]).has('period')).toBe(false);
  await expect(articles.first()).toContainText('repentance: newest');
  await expect(articles.last()).toContainText('repentance: earlier');
  await expect(community).not.toContainText('repentance: yesterday');
  expect(await periods.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  const typography = await articles.first().locator('.content').evaluate(element => {
    const style = getComputedStyle(element);
    return { size: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight), whiteSpace: style.whiteSpace, font: style.fontFamily };
  });
  expect(typography.size).toBeGreaterThanOrEqual(16);
  expect(typography.lineHeight / typography.size).toBeCloseTo(1.75, 1);
  expect(typography.whiteSpace).toBe('pre-wrap');
  expect(typography.font).toContain('Bookerly');
  await expect(articles.first().locator('.post-author')).toContainText('Biệt danh cộng đồng');
  await expect(articles.first().locator('.post-kind')).toHaveText('Phát lồ sám hối');
  await expect(articles.first().locator('time')).toContainText('12:00');
  await mkdir('.artifacts', { recursive: true });
  await page.evaluate(async () => { await document.fonts.ready; });
  await articles.first().screenshot({ path: '.artifacts/community-post-bookerly-light.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Giao diện Sáng/Tối', exact: true }).click();
  await articles.first().screenshot({ path: '.artifacts/community-post-bookerly-dark.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Giao diện Sáng/Tối', exact: true }).click();

  await community.getByRole('button', { name: 'Xem thêm', exact: true }).click();
  await expect(articles).toHaveCount(3);
  expect(reads).toHaveLength(2);
  expect(reads[1]).toContain('after=bounded-next-page');
  await expect(articles.first()).toContainText('repentance: newest');
  await expect(articles.last()).toContainText('repentance: yesterday');
  await choosePeriod(page, 'Hôm nay');
  await expect(articles).toHaveCount(2);
  await expect.poll(() => reads.length).toBe(3);
  expect(reads[2]).toContain('period=today');
  await choosePeriod(page, 'Tất cả');
  await expect(articles).toHaveCount(3);
  expect(reads).toHaveLength(3);

  await community.getByRole('button', { name: 'Tùy hỷ thiện lành', exact: true }).click();
  await expect(periods).toHaveText('Tất cả');
  await expect(articles.first()).toContainText('good_deed: newest');
  await expect.poll(() => reads.length).toBe(4);
  await choosePeriod(page, 'Hôm nay');
  await expect(articles).toHaveCount(2);
  await expect.poll(() => reads.length).toBe(5);
  await expect(articles.first()).toContainText('good_deed: newest');
  await expect(community).not.toContainText('good_deed: yesterday');
  await choosePeriod(page, 'Tất cả');
  await expect(articles).toHaveCount(2);
  expect(reads).toHaveLength(5);
  await articles.first().getByRole('button', { name: 'Tùy hỷ công đức', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Tùy hỷ công đức', exact: true });
  await confirmation.getByRole('button', { name: 'Gửi', exact: true }).click();
  await expect(articles.first().getByRole('button', { name: 'Đã tùy hỷ', exact: true })).toBeDisabled();
  expect(writes).toHaveLength(1);
  expect(reads).toHaveLength(5);
  await choosePeriod(page, 'Hôm nay');
  await expect(articles.first().getByRole('button', { name: 'Đã tùy hỷ', exact: true })).toBeDisabled();
  expect(reads).toHaveLength(5);
  await page.getByRole('button', { name: 'Sổ quán chiếu', exact: true }).click();
  await page.getByRole('button', { name: 'Cộng đồng', exact: true }).click();
  await expect(periods).toHaveText('Tất cả');
  await expect(articles.first()).toContainText('repentance: newest');
  expect(reads).toHaveLength(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});

async function openReflection(page: Page) {
  await page.getByRole('button', { name: 'Quán chiếu việc thiện ác trong ngày', exact: true }).click();
  const guide = page.getByTestId('reflection-guide');
  if (await guide.isVisible()) await guide.getByRole('button', { name: 'Tôi đã hiểu, Bắt đầu quán chiếu →', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Biệt danh đồng tu', exact: true })).toBeVisible();
}

async function choosePeriod(page: Page, label: 'Hôm nay' | 'Tất cả') {
  await page.locator('.mindful-community').getByRole('combobox', { name: 'Thời gian bài chia sẻ', exact: true }).click();
  await page.getByRole('dialog', { name: 'Thời gian bài chia sẻ', exact: true }).getByRole('button', { name: label, exact: true }).click();
}
