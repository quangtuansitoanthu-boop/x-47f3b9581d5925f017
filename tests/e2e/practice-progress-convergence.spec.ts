import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import type { ReadingProgressRecord } from '../../src/lib/browser/reading-activity-client';
import { loginAsAdmin } from './runtime-helpers';

const baseURL = process.env.SVELTEKIT_BASE_URL || 'http://localhost:8787';

async function startPractice(page: Page, articleId: string): Promise<void> {
  const chapters = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/data/tap_noi_dung' && url.searchParams.get('select') === 'so_thu_tu,tieu_de,tom_tat'
      && Boolean(url.searchParams.get('bai_viet_id')?.endsWith(articleId));
  });
  await page.goto(`/tu-tap?article=${articleId}`, { waitUntil: 'domcontentloaded' });
  expect((await chapters).status()).toBe(200);
  await page.getByRole('button', { name: /(?:Bắt Đầu|Tiếp Tục) Công Phu|Vào chế độ tu tập/u }).click();
  await page.getByRole('dialog', { name: /^(Bắt Đầu|Tiếp Tục) Công Phu\?$/u }).getByRole('button', { name: 'Bắt đầu 🙏' }).click();
  await expect(page.getByRole('region', { name: 'Tu Tập & Niệm Phật' })).toBeVisible();
}

test('practice chapter and scroll resume through typed cloud progress in an independent signed-in context', async ({ page, browser }, testInfo) => {
  test.setTimeout(60_000);
  await loginAsAdmin(page);
  const session = await (await page.request.get('/api/session')).json();
  expect(session.authenticated).toBe(true);
  const headers = { 'x-csrf-token': session.csrfToken, origin: baseURL };
  const articleId = randomUUID();
  const title = `Công phu đồng bộ ${articleId}`;
  const created = await page.request.post('/api/articles', {
    headers,
    data: {
      id: articleId, tieu_de: title, tom_tat: 'Kiểm tra vị trí công phu qua tài khoản.',
      noi_dung: '', danh_muc: 'KINH PHẬT', tac_gia: 'Kiểm thử', tags: '',
      trang_thai: 'Hoàn thành', has_muc_luc: true, so_tap: 2, noi_bat: false,
      ngay_dang: new Date().toISOString(),
    },
  });
  expect(created.ok()).toBe(true);
  const second = await browser.newContext({ baseURL, serviceWorkers: 'block', viewport: page.viewportSize()! });
  let other: Page | null = null;
  try {
    const chapters = await page.request.post('/api/data/tap_noi_dung', {
      headers,
      data: [0, 1].map((index) => ({
        bai_viet_id: articleId, so_thu_tu: index, tieu_de: `Phẩm kiểm thử ${index + 1}`,
        tom_tat: '', noi_dung: Array.from({ length: 60 }, (_, paragraph) =>
          `<p>Phẩm ${index + 1}, đoạn ${paragraph + 1}. Chúng ta giữ tâm an định và chú ý từng lời khi đọc bài kinh, thực hành chậm rãi để hiểu rõ ý nghĩa và nuôi dưỡng lòng từ bi.</p>`).join(''),
      })),
    });
    expect(chapters.ok()).toBe(true);
    const aggregateWrites: Record<string, unknown>[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/sync' && request.method() === 'PUT') {
        aggregateWrites.push(request.postDataJSON());
      }
    });

    await startPractice(page, articleId);
    await expect(page.locator('.ttp-art-title')).toHaveText('Phẩm kiểm thử 1');
    await page.getByRole('button', { name: 'Phẩm sau ↓', exact: true }).click({timeout:10_000});
    await expect(page.locator('.ttp-art-title')).toHaveText('Phẩm kiểm thử 2');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    const saved = page.waitForResponse((response) => {
      if (new URL(response.url()).pathname !== '/api/reading/progress' || response.request().method() !== 'PUT') return false;
      const input = response.request().postDataJSON();
      return input.contentKind === 'practice' && input.contentId === articleId
        && input.position.chapterId === '1' && input.position.scrollTop > 800;
    });
    await page.mouse.move(720, 400);
    await page.mouse.wheel(0, 1200);
    const accepted = await saved;
    expect(accepted.ok()).toBe(true);
    const firstWrite = (await (await page.request.get(`/api/reading/progress/practice/${articleId}`)).json()).progress as ReadingProgressRecord;
    expect(firstWrite.revision).toBeGreaterThan(0);
    expect(firstWrite.position.chapterId).toBe('1');
    expect(firstWrite.position.scrollTop).toBeGreaterThan(800);
    expect(aggregateWrites.every((body) => !Object.hasOwn(body, 'practice_logs') && !Object.hasOwn(body, 'bookmarks'))).toBe(true);

    // An independent context has no source-device localStorage to resume from.
    expect((await second.storageState()).origins).toEqual([]);
    other = await second.newPage();
    await loginAsAdmin(other);
    const otherSession = await (await other.request.get('/api/session')).json();
    expect(otherSession.user.id).toBe(session.user.id);
    await startPractice(other, articleId);
    await expect(other.locator('.ttp-art-title')).toHaveText('Phẩm kiểm thử 2');
    await expect.poll(async () => Math.abs(await other!.evaluate(() => window.scrollY) - firstWrite.position.scrollTop!)).toBeLessThanOrEqual(2);
    const persisted = await (await other.request.get(`/api/reading/progress/practice/${articleId}`)).json();
    expect(persisted.progress.position).toEqual(firstWrite.position);
    await testInfo.attach('practice-typed-roundtrip', {
      contentType: 'application/json',
      body: JSON.stringify({ articleId, firstWrite, restored: persisted.progress, scrollTop: await other.evaluate(() => window.scrollY) }, null, 2),
    });
  } finally {
    // Unmount both writers before deleting this test's exact content and progress.
    await second.close();
    await page.close({runBeforeUnload:false});
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { progress } = await (await page.request.get(`/api/reading/progress/practice/${articleId}`)).json();
      if (!progress) break;
      const deleted = await page.request.delete('/api/reading/progress', {
        headers,
        data: { contentKind: 'practice', contentId: articleId, baseRevision: progress.revision, epoch: progress.epoch, deviceId: `cleanup:${randomUUID()}`, deviceSequence: 1 },
      });
      if (deleted.status() === 409 && attempt < 2) continue;
      expect(deleted.ok()).toBe(true);
      break;
    }
    expect((await page.request.delete(`/api/articles/${articleId}`, { headers })).ok()).toBe(true);
  }
});
