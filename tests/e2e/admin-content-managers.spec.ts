import { expect, test, type Locator, type Page, type Dialog } from '@playwright/test';
import { loginAsAdmin, settleClient } from './runtime-helpers';

async function openSavedLibrary(page: Page) {
  // Full document navigation still uses the browser-owned unload protection.
  const discard = (confirmation: Dialog) => {
    expect(confirmation.type()).toBe('beforeunload');
    return confirmation.accept();
  };
  page.on('dialog', discard);
  try { await page.goto('/kinh-sach'); }
  finally { page.off('dialog', discard); }
}

async function selectEditorText(editor: Locator, value: string, collapseToEnd = false): Promise<void> {
  await editor.evaluate((element, selectionTarget) => {
    (element as HTMLElement).focus();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let node = walker.nextNode();
    while (node) {
      nodes.push(node as Text);
      node = walker.nextNode();
    }
    const fullText = nodes.map((item) => item.data).join('');
    const matchStart = fullText.indexOf(selectionTarget.value);
    if (matchStart < 0) throw new Error(`Text not found in editor: ${selectionTarget.value}`);
    const matchEnd = matchStart + selectionTarget.value.length;
    let consumed = 0;
    let startNode = nodes[0];
    let startOffset = 0;
    let endNode = nodes.at(-1) as Text;
    let endOffset = endNode.data.length;
    for (const item of nodes) {
      const next = consumed + item.data.length;
      if (matchStart >= consumed && matchStart <= next) {
        startNode = item;
        startOffset = matchStart - consumed;
      }
      if (matchEnd >= consumed && matchEnd <= next) {
        endNode = item;
        endOffset = matchEnd - consumed;
        break;
      }
      consumed = next;
    }
    const range = document.createRange();
    if (selectionTarget.collapseToEnd) range.setStart(endNode, endOffset);
    else range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    element.dispatchEvent(new Event('mouseup', { bubbles: true }));
  }, { value, collapseToEnd });
}

test.describe('dedicated admin content managers', () => {
  test('admin manages Pháp thoại from the dedicated inventory', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/phap-thoai');
    await settleClient(page);

    await expect(page).toHaveURL(/\/admin\/phap-thoai$/u);
    await expect(page.getByRole('heading', { name: 'Pháp thoại', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Danh sách album' })).toBeVisible();
    await expect(page.getByText('Pháp thoại kiểm thử E2E')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Pháp thoại', exact: true })).toHaveAttribute('aria-current', 'page');

    await page.getByRole('button', { name: '🔒 Riêng tư', exact: true }).click();
    await expect(page.getByText('Không có album phù hợp')).toBeVisible();
    await page.locator('.admin-inventory-empty').getByRole('button', { name: 'Xem tất cả' }).click();
    await expect(page.getByText('Pháp thoại kiểm thử E2E')).toBeVisible();

    await page
      .getByRole('row', { name: /Pháp thoại kiểm thử E2E/u })
      .getByRole('button', { name: 'Chỉnh sửa' })
      .click();
    const editor = page.getByRole('dialog', { name: '✏️ Chỉnh sửa Album' });
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel('Tên album')).toHaveValue('Pháp thoại kiểm thử E2E');
    await editor.getByRole('button', { name: 'Đóng' }).click();
    await expect(editor).toHaveCount(0);
  });

  test('admin creates practice content from a restricted Tu tập form', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/tu-tap');
    await settleClient(page);

    await expect(page).toHaveURL(/\/admin\/tu-tap$/u);
    await expect(page.getByRole('heading', { name: 'Nội dung tu tập' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Danh sách bài tu tập' })).toBeVisible();
    await expect(page.getByText('Kinh kiểm thử E2E')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tu tập', exact: true })).toHaveAttribute('aria-current', 'page');

    await page.getByRole('button', { name: 'Tạo bài tu tập' }).click();
    const editor = page.getByRole('dialog', { name: 'Thêm bài viết mới' });
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel('Danh mục')).toHaveValue('KINH PHẬT');
    await expect(editor.getByLabel('Danh mục').locator('option')).toHaveText(['KINH PHẬT', 'TRÌ CHÚ', 'NGHI THỨC KHÁC']);
    await editor.getByRole('button', { name: 'Đóng' }).click();
    await expect(editor).toHaveCount(0);
  });

  test('article editor persists selected formatting and cleaned Word paste into its public reader', async ({ page }) => {
    test.setTimeout(60_000);
    const title = `Định dạng bài viết E2E ${Date.now()}`;
    await loginAsAdmin(page);
    await page.goto('/admin/books');
    await settleClient(page);
    await page.getByRole('button', { name: 'Thêm bài viết' }).click();
    let dialog = page.getByRole('dialog', { name: 'Thêm bài viết mới' });
    await dialog.getByLabel('Tiêu đề bài viết').fill(title);
    await dialog.getByLabel('Tóm tắt').fill('Bài kiểm thử lưu định dạng và nội dung dán từ Word.');
    const toolbar = dialog.locator('.editor-toolbar');
    const editable = dialog.locator('.editor-input');
    await expect(editable).toHaveAttribute('contenteditable', 'true');
    await editable.fill('Đoạn định dạng được lưu.');
    await selectEditorText(editable, 'định dạng');
    await toolbar.getByRole('button', { name: 'Đậm', exact: true }).click();
    await selectEditorText(editable, 'được lưu');
    await toolbar.getByRole('button', { name: 'Nghiêng', exact: true }).click();
    await selectEditorText(editable, 'Đoạn định dạng được lưu.');
    await dialog.getByRole('button', { name: 'Căn đều', exact: true }).click();
    await selectEditorText(editable, 'Đoạn');
    await toolbar.getByRole('button', { name: 'Liên kết', exact: true }).click();
    const linkPrompt = page.locator('dialog[data-app-message]');
    await expect(linkPrompt).toContainText('Địa chỉ liên kết');
    await linkPrompt.getByRole('textbox').fill('https://example.com/huong-dan');
    await linkPrompt.getByRole('button', { name: 'Đồng ý', exact: true }).click();
    await expect(linkPrompt).toHaveCount(0);
    await expect(editable.getByRole('link', { name: 'Đoạn', exact: true })).toHaveAttribute('href', 'https://example.com/huong-dan');
    expect(await editable.textContent()).toBe('Đoạn định dạng được lưu.');
    await expect(editable.locator('strong, b').filter({ hasText: /^định dạng$/u })).toBeVisible();
    await expect(editable.locator('i, em').filter({ hasText: /^được lưu$/u })).toBeVisible();

    // Deliver a real browser paste event to the editor's input pipeline. The
    // payload is Word-shaped content, not pre-cleaned HTML injected into storage.
    await selectEditorText(editable, 'Đoạn định dạng được lưu.', true);
    await editable.press('End');
    await editable.press('Enter');
    await editable.evaluate((element) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/html', '<html><body><!--StartFragment--><p class="MsoNormal" style="mso-margin-top-alt:auto"><b>Nội dung từ Word</b><span style="mso-bidi-font-weight:normal"> giữ tiếng Việt.</span></p><!--EndFragment--></body></html>');
      clipboardData.setData('text/plain', 'Nội dung từ Word giữ tiếng Việt.');
      element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    });
    await expect(editable).toContainText('Nội dung từ Word');
    await expect(editable.locator('strong, b').filter({ hasText: /^định dạng$/u })).toBeVisible();
    await expect(editable.locator('i, em').filter({ hasText: /^được lưu$/u })).toBeVisible();
    expect(await editable.innerHTML()).not.toMatch(/mso-|MsoNormal|StartFragment/u);
    await dialog.getByRole('button', { name: 'Lưu bài viết' }).click();
    await expect(dialog).toHaveCount(0);

    try {
      await page.reload();
      await settleClient(page);
      const row = page.getByRole('row').filter({ hasText: title });
      await row.getByRole('button', { name: 'Chỉnh sửa' }).click();
      dialog = page.getByRole('dialog', { name: 'Sửa bài viết' });
      const persisted = dialog.locator('.editor-input');
      await expect(persisted.locator('strong, b').filter({ hasText: /^định dạng$/u })).toBeVisible();
      await expect(persisted.locator('i, em').filter({ hasText: /^được lưu$/u })).toBeVisible();
      await expect(persisted).toContainText('Nội dung từ Word');
      await expect(persisted.getByRole('link', { name: 'Đoạn', exact: true })).toHaveAttribute('href', 'https://example.com/huong-dan');
      await expect(persisted.locator('p, div').first()).toHaveCSS('text-align', 'justify');
      await dialog.getByRole('button', { name: 'Đóng' }).click();
      await openSavedLibrary(page);
      await settleClient(page);
      await page.getByRole('searchbox', { name: 'Tìm kiếm bài viết' }).fill(title);
      await page.getByRole('button', { name: `Đọc ngay ${title}`, exact: true }).click();
      const reader = page.getByRole('dialog', { name: title, exact: true });
      await expect(reader.locator('.reader-content strong, .reader-content b').filter({ hasText: /^định dạng$/u })).toBeVisible();
      await expect(reader.locator('.reader-content')).toContainText('Nội dung từ Word');
    } finally {
      await page.goto('/admin/books');
      await settleClient(page);
      const row = page.getByRole('row').filter({ hasText: title });
      await row.getByRole('button', { name: 'Chỉnh sửa' }).click();
      dialog = page.getByRole('dialog', { name: 'Sửa bài viết' });
      await dialog.getByRole('button', { name: 'Xóa', exact: true }).click();
      const confirmation = page.locator('dialog[data-app-message]');
      await expect(confirmation).toContainText(`Xóa “${title}”?`);
      await confirmation.getByRole('button', { name: 'Đồng ý', exact: true }).click();
      await expect(confirmation).toHaveCount(0);
      await expect(row).toHaveCount(0);
    }
  });

  test('admin creates, updates and deletes an article from the books inventory', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/books');
    await settleClient(page);

    await page.getByRole('button', { name: 'Thêm bài viết' }).click();
    let editor = page.getByRole('dialog', { name: 'Thêm bài viết mới' });
    await editor.getByLabel('Tiêu đề bài viết').fill('Bài CRUD kiểm thử E2E');
    await editor.getByLabel('Tóm tắt').fill('Tóm tắt cho luồng CRUD quản trị.');
    const contentEditor = editor.locator('.editor-input');
    await expect(contentEditor).toBeVisible();
    await editor.locator('.article-cover-upload input[type=file]').setInputFiles({
      name: 'ảnh bìa CRUD tiếng Việt.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    });
    await expect(editor.getByText('Tệp đã tải lên an toàn.', { exact: true })).toBeVisible();
    await editor.getByRole('button', { name: 'Lưu bài viết' }).click();

    await expect(editor).toHaveCount(0);
    let row = page.getByRole('row', { name: /Bài CRUD kiểm thử E2E/u });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Chỉnh sửa' }).click();
    editor = page.getByRole('dialog', { name: 'Sửa bài viết' });
    await editor.getByLabel('Tiêu đề bài viết').fill('Bài CRUD đã cập nhật E2E');
    await editor.locator('#article-cover-position').fill('center 25%');
    await editor.getByRole('button', { name: 'Lưu bài viết' }).click();

    await expect(editor).toHaveCount(0);
    row = page.getByRole('row', { name: /Bài CRUD đã cập nhật E2E/u });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Chỉnh sửa' }).click();
    editor = page.getByRole('dialog', { name: 'Sửa bài viết' });
    await expect(editor.locator('.editor-input')).toBeVisible();
    await expect(editor.locator('#article-cover-position')).toHaveValue('center 25%');
    await editor.getByRole('button', { name: 'Xóa', exact: true }).click();
    const confirmation = page.locator('dialog[data-app-message]');
    await expect(confirmation).toContainText('Xóa “Bài CRUD đã cập nhật E2E”?');
    await confirmation.getByRole('button', { name: 'Đồng ý', exact: true }).click();
    await expect(confirmation).toHaveCount(0);

    await expect(editor).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Bài CRUD đã cập nhật E2E/u })).toHaveCount(0);
  });

  test('chapter editor persists headings, lists, links and tables through its real paste pipeline', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsAdmin(page);
    const session = await (await page.request.get('/api/session')).json();
    const original = await (await page.request.get('/api/articles/e2e-ebook/chapters?order=so_thu_tu.asc')).json();
    expect(original).toHaveLength(2);
    try {
      await page.goto('/admin/books');
      await settleClient(page);
      await page.getByRole('row').filter({ hasText: 'Sách nhiều tập E2E' }).getByRole('button', { name: 'Chỉnh sửa' }).click();
      let article = page.getByRole('dialog', { name: 'Sửa bài viết' });
      await article.locator('.toc-editor').getByRole('button', { name: 'Soạn', exact: true }).first().click();
      let chapter = page.getByRole('dialog', { name: 'Phẩm Một', exact: true });
      let editable = chapter.locator('.editor-input');
      await expect(editable).toHaveAttribute('contenteditable', 'true');
      await editable.fill('Nội dung chương để định dạng.');
      const bold = chapter.locator('.editor-toolbar').getByRole('button', { name: 'Đậm', exact: true });
      // The seeded chapter is already bold. Normalize that inherited typing
      // attribute before demonstrating a newly selected formatting operation.
      await selectEditorText(editable, 'Nội dung chương để định dạng.');
      if (await editable.evaluate(() => document.queryCommandState('bold'))) await bold.click();
      await selectEditorText(editable, 'định dạng');
      await bold.click();
      await expect(editable.locator('strong, b').filter({ hasText: /^định dạng$/u })).toBeVisible();
      await selectEditorText(editable, 'Nội dung chương để định dạng.', true);
      await editable.press('End');
      await editable.press('Enter');
      await editable.evaluate((element) => {
        const clipboardData = new DataTransfer();
        clipboardData.setData('text/html', '<html><body><!--StartFragment--><h2 class="MsoHeading2">Hướng dẫn chánh niệm</h2><ul><li>Giữ tâm an</li><li>Thực hành mỗi ngày</li></ul><p><a href="https://example.com/huong-dan">Nguồn tham khảo</a></p><table><tbody><tr><td>Ngày</td><td>Thực hành</td></tr><tr><td>Hôm nay</td><td>Lần chuỗi</td></tr></tbody></table><!--EndFragment--></body></html>');
        clipboardData.setData('text/plain', 'Hướng dẫn chánh niệm\nGiữ tâm an\nThực hành mỗi ngày\nNguồn tham khảo\nNgày\tThực hành\nHôm nay\tLần chuỗi');
        element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
      });
      await expect(editable.getByRole('heading', { name: 'Hướng dẫn chánh niệm', level: 2 })).toBeVisible();
      await expect(editable.locator('li')).toHaveCount(2);
      await expect(editable.locator('a')).toHaveAttribute('href', 'https://example.com/huong-dan');
      await expect(editable.locator('table td')).toHaveCount(4);
      const saved = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/admin/books/e2e-ebook/chapters'
        && response.request().method() === 'PUT');
      await chapter.getByRole('button', { name: 'Lưu tập', exact: true }).click();
      expect((await saved).ok()).toBeTruthy();
      await expect(chapter).toHaveCount(0);
      await page.reload();
      await settleClient(page);
      await page.getByRole('row').filter({ hasText: 'Sách nhiều tập E2E' }).getByRole('button', { name: 'Chỉnh sửa' }).click();
      article = page.getByRole('dialog', { name: 'Sửa bài viết' });
      await article.locator('.toc-editor').getByRole('button', { name: 'Soạn', exact: true }).first().click();
      chapter = page.getByRole('dialog', { name: 'Phẩm Một', exact: true });
      editable = chapter.locator('.editor-input');
      await expect(editable.locator('strong, b').filter({ hasText: /^định dạng$/u })).toBeVisible();
      await expect(editable.locator('h2')).toHaveText('Hướng dẫn chánh niệm');
      await expect(editable.locator('li')).toHaveText(['Giữ tâm an', 'Thực hành mỗi ngày']);
      await expect(editable.locator('table td')).toHaveText(['Ngày', 'Thực hành', 'Hôm nay', 'Lần chuỗi']);
      expect(await editable.innerHTML()).not.toMatch(/MsoHeading|StartFragment/u);
      await openSavedLibrary(page);
      await settleClient(page);
      await page.getByRole('button', { name: 'Đọc ngay Sách nhiều tập E2E', exact: true }).click();
      await page.getByRole('dialog', { name: 'Sách nhiều tập E2E', exact: true }).getByRole('button', { name: /Phẩm Một/u }).click();
      const reader = page.getByRole('dialog', { name: 'Phẩm Một', exact: true });
      await expect(reader.locator('.reader-content h2')).toHaveText('Hướng dẫn chánh niệm');
      await expect(reader.locator('.reader-content table td')).toHaveCount(4);
      await expect(reader.getByRole('link', { name: 'Nguồn tham khảo' })).toHaveAttribute('href', 'https://example.com/huong-dan');
    } finally {
      const restored = await page.request.put('/api/admin/books/e2e-ebook/chapters', {
        data: { chapters: original }, headers: { 'x-csrf-token': session.csrfToken, origin: new URL(page.url()).origin },
      });
      expect(restored.ok()).toBeTruthy();
    }
  });

  test('both managers remain usable through the mobile admin drawer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsAdmin(page);
    await page.goto('/admin/phap-thoai');
    await settleClient(page);

    await page.getByRole('button', { name: 'Mở menu quản trị' }).click();
    await expect(page.locator('#admin-sidebar')).toHaveClass(/admin-sidebar--open/u);
    await page.locator('#admin-sidebar').getByRole('link', { name: 'Tu tập', exact: true }).click();
    await settleClient(page);
    await expect(page).toHaveURL(/\/admin\/tu-tap$/u);
    await expect(page.getByRole('heading', { name: 'Nội dung tu tập' })).toBeVisible();
    await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
  });

  test('closes a clean article editor as soon as SPA navigation starts', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/books');
    await settleClient(page);
    await page.getByRole('button', { name: 'Thêm bài viết' }).click();
    const editor = page.getByRole('dialog', { name: 'Thêm bài viết mới' });
    await expect(editor).toBeVisible();

    await page.locator('#admin-sidebar').getByRole('link', { name: 'Tu tập', exact: true }).evaluate((link: HTMLAnchorElement) => link.click());
    await expect(editor).toHaveCount(0);
    await settleClient(page);
    await expect(page).toHaveURL(/\/admin\/tu-tap$/u);
  });
});
