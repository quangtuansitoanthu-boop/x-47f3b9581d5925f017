import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page, type Response, type TestInfo } from '@playwright/test';
import type { ReadingAnnotationRecord, ReadingProgressRecord } from '../../src/lib/browser/reading-activity-client';
import { loginAsAdmin, settleClient } from './runtime-helpers';

const baseURL = process.env.SVELTEKIT_BASE_URL || 'http://localhost:8787';

interface OwnedArticle { id: string; title: string; version: string }

async function account(page: Page): Promise<{ csrfToken: string; user: { id: string } }> {
  const response = await page.request.get('/api/session');
  expect(response.ok()).toBeTruthy();
  const session = await response.json();
  expect(session.authenticated).toBe(true);
  expect(session.csrfToken).toBeTruthy();
  expect(session.user.id).toBeTruthy();
  return session;
}

async function createArticle(page: Page, token: string, title: string, content: string): Promise<OwnedArticle> {
  const response = await page.request.post('/api/articles', {
    headers: { 'x-csrf-token': token, origin: baseURL },
    data: {
      id: randomUUID(), tieu_de: title, tom_tat: 'Nội dung kiểm thử riêng cho hành trình đọc.',
      noi_dung: content, danh_muc: 'KHÁC', tac_gia: 'Kiểm thử đọc', tags: '',
      trang_thai: 'Hoàn thành', has_muc_luc: false, so_tap: 0, noi_bat: false,
      ngay_dang: new Date().toISOString(),
    },
  });
  expect(response.ok()).toBeTruthy();
  const [created] = await response.json();
  expect(created.id).toBeTruthy();
  expect(created.noi_dung).toBe(content);
  expect(created.updated_at).toBeTruthy();
  return { id: created.id, title: created.tieu_de, version: created.updated_at };
}

function responseFor(page: Page, path: string, method: string): Promise<Response> {
  return page.waitForResponse((response) => new URL(response.url()).pathname === path
    && response.request().method() === method);
}

async function openArticle(page: Page, article: OwnedArticle): Promise<Locator> {
  await page.goto('/kinh-sach');
  await settleClient(page);
  const progress = responseFor(page, `/api/reading/progress/article/${article.id}`, 'GET');
  const chapters = responseFor(page, `/api/articles/${article.id}/chapters`, 'GET');
  await page.getByRole('button', { name: `Đọc ngay ${article.title}`, exact: true }).click();
  expect((await progress).ok()).toBeTruthy();
  expect((await chapters).ok()).toBeTruthy();
  const reader = page.getByRole('dialog', { name: article.title, exact: true });
  await expect(reader.locator('.reader-content')).not.toBeEmpty();
  return reader;
}

async function selectQuote(content: Locator, quote: string): Promise<void> {
  await content.evaluate((element, text) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const start = node.data.indexOf(text);
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + text.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return;
    }
    throw new Error('The intended quote is missing from the rendered article');
  }, quote);
  await content.page().locator('.quote-floating-bar').getByRole('button', { name: /Ghi chú/u }).click();
}

async function capture(page: Page, testInfo: TestInfo, name: string, evidence: unknown): Promise<void> {
  const evidencePath = testInfo.outputPath(`${name}.json`);
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
  await testInfo.attach(`${name}.json`, { path: evidencePath, contentType: 'application/json' });
  await expect.poll(() => page.locator('.reader-modal').evaluateAll((readers) =>
    readers.reduce((count, reader) => count + reader.getAnimations().filter((animation) =>
      animation.playState === 'running').length, 0))).toBe(0);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function cleanupAfterTest(
  page: Page, token: string, article: OwnedArticle, annotationIds: string[], testInfo: TestInfo, completed: boolean,
): Promise<void> {
  try {
    await cleanupArticle(page, token, article, annotationIds);
  } catch (cause) {
    const path = testInfo.outputPath('cleanup-required.json');
    await writeFile(path, JSON.stringify({
      articleId: article.id, annotationIds, progress: { contentKind: 'article', contentId: article.id },
      error: cause instanceof Error ? cause.message : String(cause),
    }, null, 2));
    await testInfo.attach('cleanup-required', { path, contentType: 'application/json' });
    // A timed-out browser may already be closed. Keep its primary failure and
    // record exact cleanup targets; a cleanup failure after success still fails.
    if (completed) throw cause;
  }
}

async function cleanupArticle(page: Page, token: string, article: OwnedArticle, annotationIds: string[] = []): Promise<void> {
  // Unmount the reader before deleting only the records this test created.
  await page.goto('/trich-dan-cua-toi');
  const headers = { 'x-csrf-token': token, origin: baseURL };
  for (const id of annotationIds) {
    const deleted = await page.request.delete(`/api/reading/annotations/${id}`, { headers });
    expect([200, 204, 404]).toContain(deleted.status());
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const state = await page.request.get(`/api/reading/progress/article/${article.id}`);
    expect(state.ok()).toBeTruthy();
    const { progress } = await state.json() as { progress: ReadingProgressRecord | null };
    if (!progress) break;
    const deleted = await page.request.delete('/api/reading/progress', {
      headers,
      data: {
        contentKind: 'article', contentId: article.id, baseRevision: progress.revision,
        epoch: progress.epoch, deviceId: `cleanup:${randomUUID()}`, deviceSequence: 1,
      },
    });
    // A final reader-unmount write can advance the revision; reread that exact record.
    if (deleted.status() === 409 && attempt < 2) continue;
    expect(deleted.ok()).toBeTruthy();
    break;
  }
  const deleted = await page.request.delete(`/api/articles/${article.id}`, { headers });
  expect(deleted.ok()).toBeTruthy();
  const remaining = await page.request.get(`/api/articles/${article.id}`);
  expect(await remaining.json()).toEqual([]);
}

test('authenticated reading position crosses contexts through Continue Reading and resumes at the saved text', async ({ page, browser }, testInfo) => {
  test.setTimeout(60_000);
  await loginAsAdmin(page);
  const session = await account(page);
  const title = `Tiếp tục đọc ${randomUUID()}`;
  const content = Array.from({ length: 80 }, (_, index) =>
    `<p>Đoạn ${index + 1}. Khi đọc, chúng ta dừng lại để suy ngẫm về ý nghĩa của từng câu và giữ sự chú tâm trong từng bước thực hành. Đây là phần nội dung riêng để kiểm chứng vị trí đọc được lưu.</p>`).join('');
  const article = await createArticle(page, session.csrfToken, title, content);
  const second = await browser.newContext({ baseURL, serviceWorkers: 'block', viewport: page.viewportSize()! });
  let completed = false;
  try {
    expect((await second.storageState()).origins).toEqual([]);
    const reader = await openArticle(page, article);
    const scroll = reader.getByRole('region', { name: 'Nội dung bài đọc', exact: true });
    await expect.poll(() => scroll.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(2500);
    const saved = page.waitForResponse((response) => {
      if (new URL(response.url()).pathname !== '/api/reading/progress' || response.request().method() !== 'PUT') return false;
      const input = response.request().postDataJSON();
      return input.contentId === article.id && input.position.scrollTop > 800;
    });
    const bounds = await scroll.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    await page.mouse.wheel(0, 1400);
    const accepted = await saved;
    expect(accepted.ok()).toBeTruthy();
    const { progress: firstWrite } = await accepted.json() as { progress: ReadingProgressRecord };
    expect(firstWrite.contentId).toBe(article.id);
    expect(firstWrite.revision).toBeGreaterThan(0);
    expect(firstWrite.percent).toBeGreaterThan(0);
    expect(firstWrite.percent).toBeLessThan(100);
    expect(firstWrite.position.scrollTop).toBeGreaterThan(800);
    expect(Math.abs(await scroll.evaluate((element) => element.scrollTop) - firstWrite.position.scrollTop!)).toBeLessThanOrEqual(2);
    // The reader intentionally hides its header while scrolling down. Escape
    // closes it without changing the saved reading position.
    await page.keyboard.press('Escape');
    await expect(reader).toHaveCount(0);

    const other = await second.newPage();
    const listed = responseFor(other, '/api/reading/progress', 'GET');
    await loginAsAdmin(other);
    await other.goto('/kinh-sach');
    await settleClient(other);
    expect((await account(other)).user.id).toBe(session.user.id);
    const listResponse = await listed;
    expect(listResponse.ok()).toBeTruthy();
    const records = (await listResponse.json()).progress as ReadingProgressRecord[];
    const remote = records.find((row) => row.contentId === article.id && row.contentKind === 'article');
    expect(remote).toBeTruthy();
    expect(remote!.position.scrollTop).toBe(firstWrite.position.scrollTop);
    expect(remote!.deviceId).toBe(firstWrite.deviceId);

    await other.locator('.library-disclosure > summary').click();
    await expect(other.locator('.library-disclosure')).toHaveAttribute('open', '');
    const shelf = other.getByRole('region', { name: 'Tiếp tục đọc', exact: true });
    const card = shelf.locator('article').filter({ hasText: title });
    await expect(card).toBeVisible();
    await expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(Math.round(remote!.percent)));
    const fetched = responseFor(other, `/api/reading/progress/article/${article.id}`, 'GET');
    await card.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    const restoredResponse = await fetched;
    expect(restoredResponse.ok()).toBeTruthy();
    const restored = (await restoredResponse.json()).progress as ReadingProgressRecord;
    expect(restored.position).toEqual(remote!.position);
    const resumedReader = other.getByRole('dialog', { name: title, exact: true });
    const resumedScroll = resumedReader.getByRole('region', { name: 'Nội dung bài đọc', exact: true });
    await expect.poll(async () => Math.abs(await resumedScroll.evaluate((element) => element.scrollTop) - remote!.position.scrollTop!)).toBeLessThanOrEqual(2);
    await expect(other.locator('.reader-toast')).toContainText('Tiếp tục từ vị trí đã đọc');
    await capture(other, testInfo, 'authenticated-reading-resume', {
      articleId: article.id, firstWrite, listed: remote, restored,
      visibleScrollTop: await resumedScroll.evaluate((element) => element.scrollTop),
    });
    completed = true;
  } finally {
    await second.close();
    await cleanupAfterTest(page, session.csrfToken, article, [], testInfo, completed);
  }
});

test('a real source revision orphans a saved quote without marking replacement text and preserves its note', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await loginAsAdmin(page);
  const { csrfToken } = await account(page);
  const title = `Trích dẫn đổi nguồn ${randomUUID()}`;
  const quote = 'Tâm lắng dịu khi ta biết dừng lại và lắng nghe từng hơi thở.';
  const note = `Suy ngẫm cần được giữ nguyên ${randomUUID()}`;
  const content = `<p>Đoạn mở đầu để định vị trích dẫn.</p><p>${quote}</p><p>Đoạn kết nguyên bản của bài đọc.</p>`;
  const revised = '<p>Đoạn mở đầu đã được biên tập.</p><p>Nội dung thay thế hoàn toàn bàn về việc quan sát cảnh vật và thực hành lòng biết ơn trong đời sống hằng ngày.</p><p>Đoạn kết mới không chứa câu được trích dẫn.</p>';
  const article = await createArticle(page, csrfToken, title, content);
  const annotationIds: string[] = [];
  let completed = false;
  try {
    let reader = await openArticle(page, article);
    await selectQuote(reader.locator('.reader-content'), quote);
    const composer = reader.getByRole('complementary', { name: 'Tạo trích dẫn' });
    await expect(composer).toBeVisible();
    await composer.getByLabel('Ghi chú riêng', { exact: true }).fill(note);
    const createdResponse = responseFor(page, '/api/reading/annotations', 'POST');
    await composer.getByRole('button', { name: 'Lưu trích dẫn', exact: true }).click();
    const created = await createdResponse;
    expect(created.ok()).toBeTruthy();
    const annotation = (await created.json()).annotation as ReadingAnnotationRecord;
    annotationIds.push(annotation.id);
    expect(annotation.quoteText).toBe(quote);
    expect(annotation.note).toBe(note);
    expect(annotation.anchorStatus).toBe('active');
    expect(annotation.contentVersion).toBe(`${article.version}:root`);
    await expect(reader.locator(`mark[data-reading-annotation="${annotation.id}"]`)).toHaveText(quote);
    await reader.getByRole('button', { name: 'Quay lại', exact: true }).click();

    // The saved source link must resolve and focus its actual annotation before
    // the source revision below deliberately makes that same anchor orphaned.
    await page.goto('/trich-dan-cua-toi');
    await settleClient(page);
    const activeSource = page.locator('.quotes-list article').filter({ hasText: note }).getByRole('link');
    await expect(activeSource).toHaveAttribute('href', `/?article=${encodeURIComponent(article.id)}&annotation=${encodeURIComponent(annotation.id)}`);
    await activeSource.click();
    reader = page.getByRole('dialog', { name: article.title, exact: true });
    const targetMark = reader.locator(`mark[data-reading-annotation="${annotation.id}"]`);
    await expect(targetMark).toHaveText(quote);
    await expect(targetMark).toBeFocused();
    await reader.getByRole('button', { name: 'Quay lại', exact: true }).click();

    const updated = await page.request.patch(`/api/articles/${article.id}`, {
      headers: { 'x-csrf-token': csrfToken, origin: baseURL },
      data: { noi_dung: revised, trang_thai: 'Hoàn thành' },
    });
    expect(updated.ok()).toBeTruthy();
    const sourceResponse = await page.request.get(`/api/articles/${article.id}`);
    expect(sourceResponse.ok()).toBeTruthy();
    const [changedSource] = await sourceResponse.json();
    expect(changedSource.noi_dung).toBe(revised);
    expect(changedSource.noi_dung).not.toContain(quote);
    expect(changedSource.updated_at).not.toBe(article.version);

    const reconciliationResponse = responseFor(page, `/api/reading/annotations/${annotation.id}`, 'PATCH');
    reader = await openArticle(page, article);
    await expect(reader.locator('.reader-content')).toContainText('Nội dung thay thế hoàn toàn');
    await expect(reader.locator('.reader-content')).not.toContainText(quote);
    const reconciliation = await reconciliationResponse;
    expect(reconciliation.ok()).toBeTruthy();
    expect(reconciliation.request().postDataJSON().anchorStatus).toBe('orphaned');
    const orphan = (await reconciliation.json()).annotation as ReadingAnnotationRecord;
    expect(orphan.anchorStatus).toBe('orphaned');
    expect(orphan.note).toBe(note);
    expect(orphan.quoteText).toBe(quote);
    expect(orphan.contentVersion).toBe(`${changedSource.updated_at}:root`);
    await expect(reader.locator('mark[data-reading-annotation]')).toHaveCount(0);
    await expect(reader.locator('.annotation-orphan-notice')).toContainText('1 trích dẫn không còn khớp');
    await capture(page, testInfo, 'source-revision-orphan-reader', { articleId: article.id, before: annotation, after: orphan });

    await page.goto('/trich-dan-cua-toi');
    await settleClient(page);
    const card = page.locator('.quotes-list article').filter({ hasText: note });
    await expect(card.locator('blockquote')).toHaveText(quote);
    await expect(card.locator('.quote-note')).toContainText(note);
    await expect(card.getByRole('status')).toContainText('không còn khớp với phiên bản nội dung hiện tại');
    const anchorFilter = page.getByRole('combobox', { name: 'Liên kết', exact: true });
    await anchorFilter.selectOption('active', { timeout: 5_000 });
    await expect(card).toHaveCount(0);
    await anchorFilter.selectOption('orphaned', { timeout: 5_000 });
    await expect(card).toBeVisible();
    await page.reload();
    await settleClient(page);
    await anchorFilter.selectOption('orphaned', { timeout: 5_000 });
    await expect(card.locator('blockquote')).toHaveText(quote);
    await expect(card.locator('.quote-note')).toContainText(note);
    await expect(card.getByRole('status')).toContainText('không còn khớp');
    await capture(page, testInfo, 'source-revision-orphan-quotes', { articleId: article.id, annotationId: annotation.id, quote, note });
    const source = card.getByRole('link', { name: new RegExp(title, 'u') });
    await expect(source).toHaveAttribute('href', `/?article=${article.id}&annotation=${annotation.id}`);
    await source.click();
    reader = page.getByRole('dialog', { name: title, exact: true });
    await expect(reader.locator('.reader-content')).toContainText('Nội dung thay thế hoàn toàn');
    await expect(reader.locator('mark[data-reading-annotation]')).toHaveCount(0);
    await expect(reader.locator('.annotation-orphan-notice')).toContainText('không còn khớp');
    const persistedResponse = await page.request.get(`/api/reading/annotations/${annotation.id}`);
    expect(persistedResponse.ok()).toBeTruthy();
    const persisted = (await persistedResponse.json()).annotation as ReadingAnnotationRecord;
    expect(persisted).toMatchObject({ anchorStatus: 'orphaned', note, quoteText: quote, contentVersion: `${changedSource.updated_at}:root` });
    completed = true;
  } finally {
    await cleanupAfterTest(page, csrfToken, article, annotationIds, testInfo, completed);
  }
});
