import { expect, test } from "@playwright/test";
import { principalStorageKey } from "../../src/lib/browser/principal-storage";
import { READING_PROGRESS_CACHE_KEY } from "../../src/lib/browser/reading-activity-client";
import { loginAsAdmin, loginAsMember, settleClient, choosePdfOnline, openReaderTools, TEST_MEMBER_ID } from "./runtime-helpers";

const READER_BOOKMARK_KEY = "tutam_bookmarks_v1";
const PDF_BOOKMARK_KEY = "tutam_pdf_bookmarks_v1";
const memberStorageKey = (key: string) => principalStorageKey(TEST_MEMBER_ID, key);

async function resetBookProgress(page: import('@playwright/test').Page): Promise<void> {
  const response = await page.request.get('/api/reading/progress/book/e2e-ebook');
  const {progress} = await response.json();
  if (!progress) return;
  const session = await (await page.request.get('/api/session')).json();
  const removed = await page.request.delete('/api/reading/progress', {
    headers: { 'x-csrf-token':session.csrfToken, origin:process.env.SVELTEKIT_BASE_URL || 'http://localhost:8787' },
    data:{contentKind:'book',contentId:'e2e-ebook',baseRevision:progress.revision,epoch:progress.epoch,deviceId:'reader-fixture:'+Date.now(),deviceSequence:1},
  });
  expect(removed.ok()).toBe(true);
}

test.describe("reader and books admin", () => {
  test("member reads chapters, changes display settings and restores them without file export", async ({ page }) => {
    await loginAsMember(page);
    await page.goto('/kinh-sach');
    await settleClient(page);
    const initialUrl = page.url();
    await resetBookProgress(page);
    let viewRequests = 0;
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/articles/e2e-ebook/views' && request.method() === 'POST') viewRequests++;
    });
    const viewed = page.waitForResponse(response => response.url().includes('/api/articles/e2e-ebook/views'));
    await page.getByRole('button', { name: 'Đọc ngay Sách nhiều tập E2E', exact: true }).click();
    const reader = page.locator('.reader-modal');
    await expect(reader).toHaveAccessibleName('Sách nhiều tập E2E');
    expect((await viewed).status()).toBe(200);
    await expect(reader.locator('.toc-number')).toHaveText(['1', '2']);
    await expect(page).toHaveURL(/[?&]article=e2e-ebook/);
    await expect(reader.getByRole('button', { name: /EPUB/ })).toHaveCount(0);
    await openReaderTools(page);
    await reader.locator('.reader-toolbar').getByRole('button', { name: 'Chữ lớn hơn' }).click();
    await expect(reader.locator('.font-size')).toHaveText('16px');
    await reader.locator('.square-button').click();
    await expect(reader.locator('.square-button')).toHaveAttribute('aria-pressed', 'true');
    await reader.getByRole('button', { name: 'Nền giấy Be nhạt' }).click();
    await expect(reader.locator('.reader-scroll')).toHaveClass(/bg-cream/);
    if (await reader.getByRole('button', { name: 'Đóng công cụ' }).isVisible()) await reader.getByRole('button', { name: 'Đóng công cụ' }).click();
    await reader.getByRole('button', { name: /Phẩm Một/ }).click();
    await expect(reader).toHaveAccessibleName('Phẩm Một');
    await expect(reader.locator('.reader-content')).toContainText('Nội dung phẩm một.');
    await expect(reader.locator('.reader-content')).toHaveCSS('font-family', /Bookerly/);
    await reader.locator('.reader-back').click();
    await reader.getByRole('button', { name: /Phẩm Hai/ }).click();
    await expect(reader.locator('.reader-content')).toContainText('Nội dung phẩm hai.');
    await reader.locator('.reader-back').click();
    await reader.locator('.reader-back').click();
    await expect(reader).toHaveCount(0);
    await expect(page).toHaveURL(initialUrl);
    await page.getByRole('button', { name: 'Đọc ngay Sách nhiều tập E2E', exact: true }).click();
    await openReaderTools(page);
    await expect(reader.locator('.font-size')).toHaveText('16px');
    await expect(reader.locator('.square-button')).toHaveAttribute('aria-pressed', 'true');
    await expect(reader.locator('.reader-scroll')).toHaveClass(/bg-cream/);
    expect(viewRequests).toBe(1);
  });

  test("late chapter responses keep a closed reader closed and cannot overwrite its next opening", async ({
    page,
  }) => {
    await loginAsMember(page);
    await resetBookProgress(page);
    let requestCount = 0;
    let firstChapterRequest!: () => void;
    const chapterPending = new Promise<void>(resolve => firstChapterRequest = resolve);
    await page.route("**/api/articles/e2e-ebook/chapters?**", async (route) => {
      requestCount += 1;
      if (requestCount === 1) {
        firstChapterRequest();
        await new Promise((resolve) => setTimeout(resolve, 650));
        await route.fulfill({
          json: [
            {
              id: "stale",
              so_thu_tu: 0,
              tieu_de: "Phẩm cũ",
              tom_tat: "",
              noi_dung: "<p>Cũ</p>",
            },
          ],
        });
        return;
      }
      await route.fulfill({
        json: [
          {
            id: "fresh",
            so_thu_tu: 0,
            tieu_de: "Phẩm mới",
            tom_tat: "",
            noi_dung: "<p>Mới</p>",
          },
        ],
      });
    });
    await page.goto('/kinh-sach');
    await settleClient(page);

    await page.getByRole("button", { name: "Đọc ngay Sách nhiều tập E2E" }).click();
    const reader = page.getByRole("dialog", { name: /Sách nhiều tập E2E/ });
    await chapterPending;
    const lateResponse = page.waitForResponse(response => response.url().includes('/api/articles/e2e-ebook/chapters?'));
    await reader.locator(".reader-back").click();
    await (await lateResponse).finished();
    await settleClient(page);
    await expect(reader).toHaveCount(0);
    await page.getByRole("button", { name: "Đọc ngay Sách nhiều tập E2E" }).click();
    await expect(
      reader.getByRole("button", { name: /Phẩm mới/ }),
    ).toBeVisible();
    await page.waitForTimeout(750);
    await expect(
      reader.getByRole("button", { name: /Phẩm mới/ }),
    ).toBeVisible();
    await expect(reader.getByText("Phẩm cũ")).toHaveCount(0);
    expect(requestCount).toBe(2);
  });

  test("reader bookmark reopens the saved chapter and scroll offset without affecting PDF state", async ({
    page,
  }) => {
    await loginAsMember(page);
    await page.goto('/kinh-sach');
    await settleClient(page);
    await page.getByRole("button", { name: "Đọc ngay Bài PDF kiểm thử E2E" }).click();
    await choosePdfOnline(page);
    // This journey owns its bookmark fixture; prior tests may have left cloud progress.
    const currentProgress = await (await page.request.get('/api/reading/progress/book/e2e-ebook')).json();
    if (currentProgress.progress) {
      const session = await (await page.request.get('/api/session')).json();
      const reset = await page.request.delete('/api/reading/progress', {
        headers: { 'x-csrf-token': session.csrfToken, origin: new URL(page.url()).origin },
        data: { contentKind: 'book', contentId: 'e2e-ebook', baseRevision: currentProgress.progress.revision,
          epoch: currentProgress.progress.epoch, deviceId: 'bookmark-fixture:' + Date.now(), deviceSequence: 1 },
      });
      expect(reset.ok()).toBe(true);
    }
    const initialPdf = page.getByRole("dialog", { name: "Bài PDF kiểm thử E2E" });
    const initialPage = initialPdf.getByRole("spinbutton", { name: "Số trang PDF" });
    await expect(initialPage).toBeEnabled();
    await initialPage.fill("1");
    await initialPage.press("Enter");
    await expect(initialPdf.locator(".pdf-controls")).toContainText("Trang 1 / 3");
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      localStorage.removeItem("tutam_bookmarks_v1");
      localStorage.removeItem("tutam_pdf_bookmarks_v1");
    });
    await page.evaluate(
      ([readerKey, pdfKey]) => {
        localStorage.removeItem(readerKey);
        localStorage.removeItem(pdfKey);
      },
      [
        memberStorageKey(READER_BOOKMARK_KEY),
        memberStorageKey(PDF_BOOKMARK_KEY),
      ],
    );
    await page.addStyleTag({ content: ".reader-content{min-height:2000px}" });

    await page.getByRole("button", { name: "Đọc ngay Sách nhiều tập E2E" }).click();
    const reader = page.getByRole("dialog", { name: /Sách nhiều tập E2E/ });
    await reader.getByRole("button", { name: /Phẩm Hai/ }).click();
    const chapter = page.getByRole("dialog", { name: "Phẩm Hai" });
    await expect(chapter.getByText("Nội dung phẩm hai.")).toBeVisible();
    await chapter.locator(".reader-scroll").evaluate((element) => {
      element.scrollTop = 420;
    });
    await chapter.getByRole("button", { name: "Đánh dấu" }).click();

    await expect
      .poll(() =>
        page.evaluate((key) => {
          const bookmark = JSON.parse(
            localStorage.getItem(key) || "[]",
          )[0];
          return {
            id: bookmark?.id,
            chapIdx: bookmark?.chapIdx,
            chapTitle: bookmark?.chapTitle,
            scrollTop: bookmark?.scrollTop,
          };
        }, memberStorageKey(READER_BOOKMARK_KEY)),
      )
      .toEqual({
        id: "e2e-ebook",
        chapIdx: 1,
        chapTitle: "Phẩm Hai",
        scrollTop: 420,
      });
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("tutam_bookmarks_v1")),
      )
      .toBeNull();

    await page.keyboard.press('Escape');
    await resetBookProgress(page);
    await page.reload();
    await settleClient(page);
    await page.addStyleTag({ content: ".reader-content{min-height:2000px}" });
    await page.getByRole("button", { name: "Đọc ngay Sách nhiều tập E2E" }).click();

    const reopenedReader = page.getByRole("dialog", {
      name: /Sách nhiều tập E2E/,
    });
    await expect(reopenedReader.locator(".toc-count")).toBeVisible();
    await reopenedReader
      .getByRole("button", { name: "Đi tới vị trí đã đánh dấu" })
      .click();
    const resumedChapter = page.getByRole("dialog", { name: "Phẩm Hai" });
    await expect(resumedChapter.getByText("Nội dung phẩm hai.")).toBeVisible();
    await expect
      .poll(() =>
        resumedChapter
          .locator(".reader-scroll")
          .evaluate((element) => element.scrollTop),
      )
      .toBe(420);

    const switchReaderPrincipal = (principalId: string | null) =>
      page.evaluate((id) => {
        window.dispatchEvent(
          new CustomEvent("quangtu:session-changed", {
            detail: id
              ? { authenticated: true, csrfToken: `csrf-${id}`, user: { id } }
              : { authenticated: false, csrfToken: null, user: null },
          }),
        );
      }, principalId);
    await switchReaderPrincipal("reader-account-a");
    await expect(page.locator(".reader-modal")).toBeHidden();
    await switchReaderPrincipal("reader-account-b");
    for (const principalId of ["reader-account-a", "reader-account-b"]) {
      expect(
        await page.evaluate(
          (key) => localStorage.getItem(key),
          principalStorageKey(principalId, READER_BOOKMARK_KEY),
        ),
      ).toBeNull();
    }
    await switchReaderPrincipal(null);
    await expect(page.locator(".reader-modal")).toBeHidden();
    await page.context().clearCookies();
    await page.reload();
    await settleClient(page);
    await page.getByRole("button", { name: "Đọc ngay Sách nhiều tập E2E" }).click();
    await expect(page.locator('.reader-modal')).toBeVisible();
    await expect(page.locator('.bookmark-ribbon')).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Đăng nhập', exact: true })).toHaveCount(0);
    await loginAsMember(page);
    await page.goto('/kinh-sach');
    await settleClient(page);
    await page
      .getByRole("button", { name: "Đọc ngay Sách nhiều tập E2E" })
      .click();
    await page
      .getByRole("dialog", { name: /Sách nhiều tập E2E/ })
      .getByRole("button", { name: "Đi tới vị trí đã đánh dấu" })
      .click();
    await expect(
      page.getByRole("button", { name: "Đã đánh dấu", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.locator('.reader-modal .reader-back').click();
    await page.locator('.reader-modal .reader-back').click();
    await expect(page.locator(".reader-modal")).toBeHidden();
    await page.evaluate((key) => {
      const bookmarks = JSON.parse(
        localStorage.getItem(key) || "[]",
      );
      bookmarks.unshift({
        id: "e2e-pdf",
        chapIdx: 1,
        chapTitle: "Không áp dụng",
        scrollTop: 999,
        date: new Date().toISOString(),
      });
      localStorage.setItem(key, JSON.stringify(bookmarks));
    }, memberStorageKey(READER_BOOKMARK_KEY));
    await page
      .getByRole("button", { name: "Đọc ngay Bài PDF kiểm thử E2E" })
      .click();
    await choosePdfOnline(page);
    await expect(
      page
        .getByRole("dialog", { name: "Bài PDF kiểm thử E2E" })
        .locator(".pdf-controls"),
    ).toContainText("Trang 1 / 3");
  });

  for (const closeWhilePreparing of [false, true]) {
  test(`reader TTS, share fallback and reduced-motion feedback work at runtime${closeWhilePreparing ? ' after closing pending speech' : ''}`, async ({
    page,
  }) => {
    await loginAsMember(page);
    await page.addInitScript(() => {
      class FakeUtterance {
        text: string;
        lang = "";
        voice: unknown = null;
        onstart: null | (() => void) = null;
        onend: null | (() => void) = null;
        onerror: null | ((event: { error: string }) => void) = null;
        constructor(text: string) {
          this.text = text;
        }
      }
      const synthesis = {
        getVoices: () => [{ lang: "vi-VN" }],
        speak: (utterance: FakeUtterance) => setTimeout(() => {
          if (utterance.text) {
            const target = window as unknown as { readerSpeechStarts: number };
            target.readerSpeechStarts += 1;
          }
          utterance.onstart?.();
        }, 0),
        cancel: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      };
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        value: FakeUtterance,
      });
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: synthesis,
      });
      (window as unknown as { readerSpeechStarts: number }).readerSpeechStarts = 0;
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value: () => true,
      });
    });
    let releaseChapters!: () => void;
    const chaptersGate = new Promise<void>(resolve => { releaseChapters = resolve; });
    let chapterRequested!: () => void;
    const chapterPending = new Promise<void>(resolve => { chapterRequested = resolve; });
    await page.route('**/api/articles/e2e-public/chapters?**', async route => {
      chapterRequested();
      await chaptersGate;
      await route.fulfill({ json: [] });
    });
    const progressLoaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/reading/progress/article/e2e-public');
    await page.route('**/api/reading/progress/article/e2e-public', route => route.fulfill({ json: {
      progress: { contentKind: 'article', contentId: 'e2e-public', position: { scrollTop: 0 },
        percent: 0, epoch: 1, revision: 1, deviceId: 'reader-speech-fixture', deviceSequence: 1,
        total: null, contentVersion: null, clientUpdatedAt: '2026-11-04T00:00:00Z', serverUpdatedAt: '2026-11-04T00:00:00Z' },
    } }));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto('/kinh-sach');
    await settleClient(page);
    await page
      .getByRole("button", { name: "Đọc ngay Bài viết kiểm thử E2E" })
      .click();
    const reader = page.getByRole("dialog", { name: "Bài viết kiểm thử E2E" });
    // Cookie seeding does not hydrate the root session; await its authenticated branch before TTS.
    await expect(reader.locator(".cf-user-badge")).toBeAttached();
    await expect(reader).toHaveCSS("animation-name", "none");
    const mostViewed = reader.locator(".most-viewed");
    await expect(
      mostViewed.getByRole("heading", {
        name: "Bài viết xem nhiều — CHUYỆN NHÂN QUẢ",
      }),
    ).toBeVisible();
    await expect(
      mostViewed.getByRole("button", { name: /Bài PDF kiểm thử E2E/i }),
    ).toBeVisible();
    await expect(mostViewed).toContainText(/👁\s+\d+/);
    await chapterPending;
    await progressLoaded;

    await reader.getByRole("button", { name: "Chia sẻ" }).click();
    await expect(page.locator(".reader-toast")).toHaveText(
      "Đã copy link bài viết!",
    );
    await expect
      .poll(() =>
        page
          .locator(".reader-toast")
          .evaluate((toast) =>
            parseFloat(getComputedStyle(toast).transitionDuration),
          ),
      )
      .toBeLessThan(0.001);
    await reader.getByRole("button", { name: "Nghe" }).click();
    await expect(reader.getByRole('button', { name: 'Đang tải...' })).toHaveAttribute('aria-busy', 'true');
    if (closeWhilePreparing) {
      await reader.locator('.reader-back').click();
      await expect(reader).toHaveCount(0);
    }
    releaseChapters();
    if (closeWhilePreparing) {
      await page.getByRole('button', { name: 'Đọc ngay Bài viết kiểm thử E2E' }).click();
      await expect(reader.locator('.cf-user-badge')).toBeAttached();
      await reader.getByRole('button', { name: 'Nghe' }).click();
    }
    await expect(reader.getByRole("button", { name: "Dừng" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as { readerSpeechStarts: number }).readerSpeechStarts)).toBe(1);
    await expect(reader.locator(".tts-word.active")).not.toHaveCount(0);
    await reader.getByRole("button", { name: "Dừng" }).click();
    await expect(reader.getByRole("button", { name: "Nghe" })).toBeVisible();
    await expect(reader.locator(".tts-word.active")).toHaveCount(0);
  });
  }

  test("normal reader restores tags, image lightbox and modal focus containment", async ({
    page,
  }) => {
    await loginAsMember(page);
    await page.setExtraHTTPHeaders({ "cache-control": "no-cache" });
    await page.goto('/kinh-sach');
    await settleClient(page);
    await page
      .getByRole("button", { name: "Đọc ngay Bài viết kiểm thử E2E" })
      .click();

    const reader = page.getByRole("dialog", { name: "Bài viết kiểm thử E2E" });
    await expect(reader.locator(".reader-tag")).toHaveText(["e2e", "nhân quả"]);
    await reader.locator(".reader-content").evaluate((content) => {
      content.insertAdjacentHTML(
        "beforeend",
        '<img src="/assets/branding/tu-tap-logo.png" alt="Logo Quang Từ">',
      );
    });

    const inlineImage = reader.getByRole("button", {
      name: "Mở ảnh: Logo Quang Từ",
    });
    await inlineImage.focus();
    await page.keyboard.press("Enter");
    const lightbox = page.getByRole("dialog", {
      name: "Xem ảnh: Logo Quang Từ",
    });
    await expect(lightbox).toBeVisible();
    await expect(page.locator(".reader-modal")).toHaveAttribute("inert", "");
    await expect(page.locator(".reader-modal")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    const closeImage = lightbox.getByRole("button", { name: "Đóng ảnh" });
    await expect(closeImage).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(closeImage).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(lightbox).toBeHidden();
    await expect(inlineImage).toBeFocused();

    await reader.locator(".reader-back").focus();
    await page.keyboard.press("Shift+Tab");
    await expect
      .poll(() =>
        reader.evaluate((modal) => modal.contains(document.activeElement)),
      )
      .toBe(true);
  });

  test("PDF reader toolbar matches the production desktop geometry", async ({
    page,
  }) => {
    await loginAsMember(page);
    await page.goto('/kinh-sach');
    await settleClient(page);
    await page.evaluate(() =>
      localStorage.removeItem("tutam_pdf_bookmarks_v1"),
    );
    await page
      .getByRole("button", { name: "Đọc ngay Bài PDF kiểm thử E2E" })
      .click();
    await choosePdfOnline(page);

    const reader = page.getByRole("dialog", { name: "Bài PDF kiểm thử E2E" });
    const toolbar = reader.locator(".pdf-controls");
    await expect(reader).toBeVisible();
    const firstPage = reader.getByRole("spinbutton", { name: "Số trang PDF" });
    await expect(firstPage).toBeEnabled();
    await firstPage.fill("1");
    await firstPage.press("Enter");
    await expect(toolbar).toContainText("Trang 1 / 3");
    await expect(toolbar.getByRole("button", { name: "Phóng to", exact: true })).toHaveText(
      "+",
    );
    await expect(reader.locator(".pdf-document-header h1")).toHaveCSS(
      "font-weight",
      "700",
    );
    const appFont = await page.evaluate(() => getComputedStyle(document.documentElement)
      .getPropertyValue('--font-app').replace(/['"]/g, '').replace(/\s+/g, ' ').trim());
    expect(appFont).toContain('San Francisco Web');
    await expect.poll(() => reader.locator('.pdf-document-header h1')
      .evaluate(element => getComputedStyle(element).fontFamily
        .replace(/['"]/g, '').replace(/\s+/g, ' ').trim())).toBe(appFont);
    const pdfViewer = reader.locator(".pdf-viewer");
    await pdfViewer.evaluate((element) => {
      element.scrollTop = 420;
      element.dispatchEvent(new Event("scroll"));
    });
    await toolbar.getByRole("button", { name: "Phóng to", exact: true }).click();
    await expect(toolbar.locator("output")).toHaveText("105%");
    const pdfPages = reader.locator(".pdf-pages");
    await expect(pdfPages).toHaveClass(/spread/);
    await expect(pdfPages.locator(":scope > .pdf-spread")).toHaveCount(2);
    await expect(
      pdfPages.locator(":scope > .pdf-spread").first().locator(".pdf-page"),
    ).toHaveCount(1);
    const pairedSpread = pdfPages.locator(":scope > .pdf-spread").nth(1);
    await expect(pairedSpread.locator(".pdf-page")).toHaveCount(2);
    await expect(pairedSpread.locator(".pdf-page").nth(0)).toHaveAttribute(
      "aria-label",
      "Trang 2",
    );
    await expect(pairedSpread.locator(".pdf-page").nth(1)).toHaveAttribute(
      "aria-label",
      "Trang 3",
    );
    await expect(pairedSpread.locator('canvas[data-rendered]')).toHaveCount(2);
    await expect
      .poll(() =>
        pairedSpread.evaluate((spread) => {
          const pages = Array.from(
            spread.querySelectorAll<HTMLElement>(":scope > .pdf-page"),
          );
          const spreadBox = spread.getBoundingClientRect();
          const left = pages[0]?.getBoundingClientRect();
          const right = pages[1]?.getBoundingClientRect();
          if (!left || !right) return null;
          const gap = right.left - left.right;
          return {
            fillsSpread: Math.abs(
              spreadBox.width - left.width - gap - right.width,
            ),
            gap: Math.round(gap),
            pageWidthDelta: Math.abs(left.width - right.width),
          };
        }),
      )
      .toEqual({ fillsSpread: 0, gap: 8, pageWidthDelta: 0 });
    await expect
      .poll(() => pdfViewer.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(10);
    await toolbar.getByRole("button", { name: "Đánh dấu trang", exact:true }).click();
    await expect(page.locator(".reader-toast")).toHaveText(
      "✓ Đã đánh dấu trang 1",
    );
    await toolbar.getByRole("button", { name: "Đánh dấu trang", exact:true }).click();
    await expect(page.locator(".reader-toast")).toHaveText(
      "Đã bỏ đánh dấu trang 1",
    );
    await expect(reader.locator('.download-gate')).toHaveCount(0);
    const commentButton = reader.getByRole("button", {
      name: "Viết bình luận",
    });
    await expect(commentButton).toBeVisible();
    await expect
      .poll(async () => {
        const box = await commentButton.boundingBox();
        const viewport = page.viewportSize();
        return {
          width: Math.round(box?.width ?? 0),
          height: Math.round(box?.height ?? 0),
          right: Math.round(
            (viewport?.width ?? 0) - (box?.x ?? 0) - (box?.width ?? 0),
          ),
          bottom: Math.round(
            (viewport?.height ?? 0) - (box?.y ?? 0) - (box?.height ?? 0),
          ),
        };
      })
      .toEqual({ width: 50, height: 50, right: 16, bottom: 80 });
    await commentButton.click();
    await expect(
      reader.getByRole("form", { name: "Gửi bình luận" }),
    ).toBeVisible();
    await reader
      .getByRole("button", { name: "Đóng biểu mẫu bình luận" })
      .click();

    const viewport = page.viewportSize();
    if (viewport && viewport.width > 768) {
      await expect
        .poll(async () =>
          Math.round(
            (await reader.locator(".reader-back").boundingBox())?.height || 0,
          ),
        )
        .toBe(36);
      await expect
        .poll(async () =>
          Math.round((await toolbar.boundingBox())?.height || 0),
        )
        .toBe(49);
      await expect
        .poll(async () => Math.round((await toolbar.boundingBox())?.width || 0))
        .toBe(viewport.width);
      await expect
        .poll(async () =>
          Math.round(
            (await toolbar.locator(".pdf-zoom").boundingBox())?.width || 0,
          ),
        )
        .toBe(164);
    }

    const mostViewed = reader.locator(".most-viewed");
    await expect(
      mostViewed.getByRole("heading", {
        name: "Bài viết xem nhiều — CHUYỆN NHÂN QUẢ",
      }),
    ).toBeVisible();
    expect(await mostViewed.locator(".most-viewed__item").count()).toBeGreaterThan(0);
    expect(await mostViewed.locator(".most-viewed__item").count()).toBeLessThanOrEqual(5);
    await expect(mostViewed.getByRole('button',{name:/Bài PDF kiểm thử E2E/i})).toHaveCount(0);
    await expect(mostViewed).toContainText(/Bài viết kiểm thử E2E/i);
    await expect
      .poll(async () => {
        const text = await mostViewed
          .getByRole("button", { name: /Bài viết kiểm thử E2E/i })
          .textContent();
        return Number(text?.match(/👁\s*(\d+)/u)?.[1] || 0);
      })
      .toBeGreaterThanOrEqual(38);
    await mostViewed
      .getByRole("button", { name: /Bài viết kiểm thử E2E/i })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Bài viết kiểm thử E2E" }),
    ).toBeVisible();
  });

  test("authenticated reading offers in-app PDF offline storage without EPUB or PDF export", async ({ page }) => {
    await loginAsMember(page);
    await page.goto('/kinh-sach');
    await settleClient(page);
    await page.getByRole('button', { name: 'Đọc ngay Sách nhiều tập E2E', exact: true }).click();
    await expect(page.locator('.reader-modal .download-gate')).toHaveCount(0);
    await page.locator('.reader-back').click();
    await page.getByRole('button', { name: 'Đọc ngay Bài PDF kiểm thử E2E', exact: true }).click();
    await choosePdfOnline(page);
    await openReaderTools(page);
    await expect(page.locator('.pdf-offline-main-btn')).toBeVisible();
    await expect(page.locator('.reader-modal .download-gate')).toHaveCount(0);
    await page.locator('.pdf-offline-main-btn').click();
    await expect(page.getByRole('button', { name: 'Tải về máy', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Đọc online', exact: true }).click();
    await expect(page.locator('.pdf-page canvas[data-rendered]').first()).toBeVisible();
  });

  test("closing a PDF fully releases the reader before another book opens", async ({
    page,
  }) => {
    await loginAsMember(page);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto('/kinh-sach');
    await settleClient(page);
    await page.evaluate(
      ([bookmarkKey, progressKey]) => {
        localStorage.removeItem("tutam_pdf_bookmarks_v1");
        localStorage.removeItem(bookmarkKey);
        localStorage.removeItem(progressKey);
      },
      [
        memberStorageKey(PDF_BOOKMARK_KEY),
        memberStorageKey(READING_PROGRESS_CACHE_KEY),
      ],
    );

    await page
      .getByRole("button", { name: "Đọc ngay Bài PDF kiểm thử E2E" })
      .click();
    await choosePdfOnline(page);
    const pdfReader = page.getByRole("dialog", {
      name: "Bài PDF kiểm thử E2E",
    });
    const firstPage = pdfReader.getByRole("spinbutton", { name: "Số trang PDF" });
    await expect(firstPage).toBeEnabled();
    await firstPage.fill("1");
    await firstPage.press("Enter");
    await expect(pdfReader.locator(".pdf-controls")).toContainText(
      "Trang 1 / 3",
    );
    const pdfViewer = pdfReader.locator(".pdf-viewer");
    await expect
      .poll(() =>
        pdfViewer.evaluate(
          (element) => element.scrollHeight - element.clientHeight,
        ),
      )
      .toBeGreaterThan(100);
    await pdfViewer.evaluate((element) => {
      element.scrollTop = Math.min(
        420,
        element.scrollHeight - element.clientHeight,
      );
      element.dispatchEvent(new Event("scroll"));
    });
    await expect
      .poll(() => pdfViewer.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(10);
    await page.keyboard.press("Escape");
    await expect(pdfReader).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate((key) => {
          const progress = JSON.parse(localStorage.getItem(key) || "[]");
          const pdf = progress.find(
            (row: { contentId?: string; contentKind?: string }) =>
              row.contentKind === "pdf" && row.contentId === "e2e-pdf",
          );
          return Number(pdf?.position?.scrollTop || 0);
        }, memberStorageKey(READING_PROGRESS_CACHE_KEY)),
      )
      .toBeGreaterThan(10);
    expect(
      await page.evaluate(() => localStorage.getItem("tutam_pdf_bookmarks_v1")),
    ).toBeNull();

    await page
      .getByRole("button", { name: "Đọc ngay Bài PDF kiểm thử E2E" })
      .click();
    await choosePdfOnline(page);
    await expect(pdfReader.locator(".pdf-controls")).toContainText(
      "Trang 1 / 3",
    );
    await expect(page.locator(".reader-toast")).toHaveText(
      "📖 Tiếp tục từ vị trí đã đọc",
    );
    await expect
      .poll(() => pdfViewer.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(10);
    await page.keyboard.press("Escape");
    await expect(pdfReader).toBeHidden();
    await expect(page.locator(".pdf-shell")).toHaveCount(0);

    await page.getByRole("button", { name: "Đọc ngay Sách nhiều tập E2E" }).click();
    const ebookReader = page.getByRole("dialog", {
      name: /Sách nhiều tập E2E/,
    });
    await expect(ebookReader).toBeVisible();
    await expect(ebookReader.locator(".toc-count")).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.locator(".pdf-shell")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("closing a PDF while its first page is loading leaves no late reader work", async ({
    page,
  }) => {
    await loginAsMember(page);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route(
      "**/assets/pdfs/bai-viet-mau-gieo-nhan-lanh.pdf",
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.continue();
      },
    );

    await page.goto('/kinh-sach');
    await settleClient(page);
    await page
      .getByRole("button", { name: "Đọc ngay Bài PDF kiểm thử E2E" })
      .click();
    await choosePdfOnline(page);
    const pdfReader = page.getByRole("dialog", {
      name: "Bài PDF kiểm thử E2E",
    });
    await expect(pdfReader).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Đọc ngay Sách nhiều tập E2E" }).click();
    const ebookReader = page.getByRole("dialog", {
      name: /Sách nhiều tập E2E/,
    });
    await expect(ebookReader.locator(".toc-count")).toBeVisible();
    await page.waitForTimeout(700);
    expect(pageErrors).toEqual([]);
  });

  test("guest admin route blocks the inventory and provides a way home", async ({ page }) => {
    await page.goto("/admin/books");
    await expect(page.getByRole('heading', { name: 'Yêu cầu quyền Quản trị' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Thêm bài viết', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Về Trang chủ', exact: true }).click();
    await expect(page).toHaveURL('/');
    await expect(
      page.locator(".daily-dhammapada-card"),
    ).toBeVisible();
  });

  test("seeded Google admin session authenticates the dedicated inventory", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/books');
    await settleClient(page);
    await expect(page.getByRole('button', { name: 'Thêm bài viết', exact: true })).toBeVisible();
    const row = page.getByRole('row', { name: /Bài PDF kiểm thử E2E/ });
    await expect(row.getByRole('button', { name: 'Chỉnh sửa', exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Xóa', exact: true })).toBeVisible();
    await page.goto('/ca-nhan?tab=account');
    await expect(page.locator('.cn-admin-hub__more')).toHaveAttribute('href', '/admin');
  });

  test("books inventory opens the article editor without leaving its route", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/kinh-sach");
    await settleClient(page);
    let savedBody: Record<string, unknown> | null = null;
    let savedCsrf = "";
    let releaseMediaUpload!: () => void;
    let mediaUploadStarted!: () => void;
    const mediaUploadGate = new Promise<void>((resolve) => {
      releaseMediaUpload = resolve;
    });
    const mediaUploadRequest = new Promise<void>((resolve) => {
      mediaUploadStarted = resolve;
    });
    await page.route("**/api/media", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      mediaUploadStarted();
      await mediaUploadGate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "/api/media/pdfs/replacement.pdf" }),
      });
    });
    await page.route("**/api/articles/e2e-pdf", async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      savedBody = route.request().postDataJSON();
      savedCsrf = route.request().headers()["x-csrf-token"] || "";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(savedBody),
      });
    });
    await page.goto('/admin/books');
    await page.getByRole('row', { name: /Bài PDF kiểm thử E2E/ }).getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/books$/u);
    const editor = page.getByRole("dialog", { name: /Sửa bài viết/i });
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel(/Tiêu đề bài viết/i)).toHaveValue(
      "Bài PDF kiểm thử E2E",
    );
    await expect(editor.locator(".article-current-file")).toBeVisible();
    await expect(
      editor.locator(".article-current-file > span"),
    ).toHaveText(/\.pdf$/u);
    await expect(editor.locator(".article-rte-toolbar")).toHaveCount(0);
    await expect(editor.locator(".article-rte")).toHaveCount(0);
    await expect(editor.locator(".article-admin-pdf-preview")).toBeVisible();
    await expect(editor.locator(".article-admin-divider")).toBeVisible();
    const titleInput = editor.getByLabel(/Tiêu đề bài viết/i);
    await expect(titleInput).toHaveCSS("font-size", "13px");
    await expect
      .poll(async () =>
        Math.abs(
          Math.round(await titleInput.evaluate((input) => input.getBoundingClientRect().height)) - 36,
        ),
      )
      .toBeLessThanOrEqual(1);
    const divider = editor.locator(".article-admin-divider");
    await divider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(divider).toHaveAttribute("data-value", "31");

    const pdfInput = editor.locator(".article-pdf-upload input[type=file]");
    const coverInput = editor.locator(".article-cover-upload input[type=file]");
    const upload = pdfInput.setInputFiles({
      name: "replacement.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("replacement-pdf"),
    });
    await mediaUploadRequest;
    await expect(pdfInput).toBeDisabled();
    await expect(coverInput).toBeDisabled();
    await expect(
      editor.getByRole("button", { name: /Đang tải tệp/i }),
    ).toBeDisabled();
    releaseMediaUpload();
    await upload;
    await expect(pdfInput).toBeEnabled();
    await expect(coverInput).toBeEnabled();
    await expect(
      editor.getByRole("button", { name: /Lưu bài viết/i }),
    ).toBeVisible();
    await editor.getByLabel("Tác giả").fill("Quang Từ E2E");
    await editor.getByRole("button", { name: /Lưu bài viết/i }).click();
    await expect(editor).toHaveCount(0);
    expect(savedBody).toMatchObject({ id: "e2e-pdf", tac_gia: "Quang Từ E2E" });
    expect(savedCsrf).not.toBe("");
    expect(savedCsrf).not.toBe("public");
  });

  test("article save stays locked until a chapter save has finished", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/kinh-sach");
    await settleClient(page);

    let savedChapters: Array<{ noi_dung?: string }> = [];
    let releaseChapterSave!: () => void;
    let chapterSaveStarted!: () => void;
    const chapterSaveGate = new Promise<void>((resolve) => {
      releaseChapterSave = resolve;
    });
    const chapterSaveRequest = new Promise<void>((resolve) => {
      chapterSaveStarted = resolve;
    });
    await page.route("**/api/admin/books/e2e-ebook/chapters", async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      savedChapters = JSON.parse(route.request().postData() || '{}').chapters || [];
      chapterSaveStarted();
      await chapterSaveGate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ chapters: 2 }),
      });
    });

    await page.goto('/admin/books');
    await page.getByRole('row', { name: /Sách nhiều tập E2E/ }).getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
    const editor = page.getByRole("dialog", { name: /Sửa bài viết/i });
    const tocEditor = editor.locator(".toc-editor");
    await expect(tocEditor).toBeVisible();
    await expect(
      editor.getByRole("heading", { name: "Mục lục & nội dung tập" }),
    ).toHaveCount(0);
    await expect(tocEditor.locator(".toc-item")).toHaveCount(2);
    await expect(tocEditor.getByLabel("Tên mục 1")).toHaveValue("Phẩm Một");
    await expect(tocEditor.getByRole("button", { name: "Soạn" }).first()).toBeVisible();
    await expect(tocEditor.getByRole("button", { name: "Thêm mục" })).toBeVisible();

    await tocEditor.getByRole("button", { name: "Soạn" }).first().click();
    let chapterComposer = page.getByRole("dialog", { name: /Phẩm Một/ });
    await expect(chapterComposer).toBeVisible();
    await expect(chapterComposer.getByRole("button", { name: "Lưu tập" })).toBeVisible();
    const chapterEditor = chapterComposer.locator('.native-editor');
    await expect(chapterEditor).toBeVisible();
    await expect(chapterComposer.locator('.editor-toolbar')).toBeVisible();
    await expect(chapterComposer.locator('.editor-input')).toBeVisible();
    await chapterComposer.getByRole('button', { name: 'Quay lại' }).click();

    await tocEditor.getByLabel("Tóm tắt mục 1").fill("Tóm tắt đã chỉnh");
    await editor.getByRole("button", { name: /Lưu bài viết/i }).click();
    await chapterSaveRequest;

    const mainSave = editor.getByRole("button", { name: "Đang lưu mục lục…" });
    await expect(mainSave).toBeDisabled();
    await expect(editor.getByRole("button", { name: "Hủy" })).toBeDisabled();

    releaseChapterSave();
    await expect(editor).toHaveCount(0);
  });

  test('opening and closing the chapter composer preserves untouched source bytes', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/books");
    await settleClient(page);

    const originalResponse = await page.request.get('/api/articles/e2e-ebook/chapters?order=so_thu_tu.asc&limit=5000');
    expect(originalResponse.ok()).toBe(true);
    const originalSource = (await originalResponse.json())[0].noi_dung;
    let savedChapters: Array<{ noi_dung?: string }> = [];
    await page.route('**/api/admin/books/e2e-ebook/chapters', async (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      savedChapters = JSON.parse(route.request().postData() || '{}').chapters || [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ chapters: savedChapters.length }),
      });
    });

    await page.getByRole('row', { name: /Sách nhiều tập E2E/ }).getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
    const editor = page.getByRole('dialog', { name: /Sửa bài viết/i });
    const tocEditor = editor.locator('.toc-editor');
    await tocEditor.getByRole('button', { name: 'Soạn' }).first().click();
    const chapterComposer = page.getByRole('dialog', { name: /Phẩm Một/ });
    await expect(chapterComposer.locator('.editor-input')).toBeVisible();
    await chapterComposer.getByRole('button', { name: 'Quay lại' }).click();

    await tocEditor.getByLabel('Tóm tắt mục 1').fill('Chỉ đổi tóm tắt');
    await editor.getByRole('button', { name: /Lưu bài viết/i }).click();
    await expect(editor).toHaveCount(0);
    expect(savedChapters[0]?.noi_dung).toBe(originalSource);
  });

  test("presence heartbeat uses public CSRF for guests", async ({ page }) => {
    let token = "";
    await page.route("**/api/presence", async (route) => {
      token = route.request().headers()["x-csrf-token"] || "";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"enabled":true,"activeCount":1,"heartbeatIntervalSeconds":60}',
      });
    });
    const heartbeat = page.waitForResponse((response) =>
      response.url().includes("/api/presence"),
    );
    await page.goto('/kinh-sach');
    expect((await heartbeat).status()).toBe(200);
    await expect.poll(() => token).toBe("public");
  });

  test("presence heartbeat uses the authenticated session CSRF token", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/kinh-sach");
    await settleClient(page);
    const expectedToken = await page.evaluate(async () => {
      const response = await fetch("/api/session", { cache: "no-store" });
      const payload = await response.json();
      return String(payload.csrfToken || "");
    });
    let sessionRequests = 0;
    await page.route("**/api/session", async (route) => {
      sessionRequests += 1;
      if (sessionRequests === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"error":"temporary"}',
        });
      } else {
        await route.continue();
      }
    });
    const tokens: string[] = [];
    await page.route("**/api/presence", async (route) => {
      const token = route.request().headers()["x-csrf-token"] || "";
      tokens.push(token);
      await route.fulfill({
        status: token === "public" ? 403 : 200,
        contentType: "application/json",
        body:
          token === "public"
            ? '{"error":"csrf_invalid"}'
            : '{"enabled":true,"activeCount":1,"heartbeatIntervalSeconds":60}',
      });
    });
    const heartbeat = page.waitForResponse(
      (response) =>
        response.url().includes("/api/presence") && response.status() === 200,
    );
    await page.reload();
    expect((await heartbeat).status()).toBe(200);
    await expect.poll(() => tokens).toEqual([expectedToken]);
    expect(sessionRequests).toBe(0);
  });

  test("real local admin session opens chapter editor, saves ordering and imports atomically", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/kinh-sach");
    await settleClient(page);
    await page.goto("/admin/books");
    await expect(
      page.getByRole("heading", { name: "Sách & bài viết", exact: true }),
    ).toBeVisible();
    const bookRow = page.getByRole("row", { name: /Sách nhiều tập E2E/u });
    await bookRow.getByRole("button", { name: "Chỉnh sửa" }).click();
    const editor = page.getByRole("dialog", { name: /Sửa bài viết/i });
    const tocEditor = editor.getByRole("region", { name: "Mục lục danh sách phẩm" });
    await expect(tocEditor.getByLabel("Tên mục 1")).toHaveValue("Phẩm Một");
    await tocEditor.getByRole("button", { name: "Đưa mục 1 xuống" }).click();
    await expect(tocEditor.getByLabel("Tên mục 1")).toHaveValue("Phẩm Hai");

    await editor
      .locator(
        'input[type=file][accept="image/jpeg,image/png,image/webp,image/gif"]:not([multiple])',
      )
      .setInputFiles({
        name: "ảnh bìa kiểm thử.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from("safe-image-bytes"),
      });
    await expect(
      editor.getByText("Tệp đã tải lên an toàn.", { exact: true }),
    ).toBeVisible();

    await editor.getByRole("button", { name: "Lưu bài viết" }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("Đã lưu “Sách nhiều tập E2E”.");
    await page.goto("/admin/books?mode=import");
    await settleClient(page);
    const importer = page.getByRole("dialog", { name: "Import sách từ file JSON" });
    await importer.locator('input[type=file][accept*="json"]').setInputFiles({
      name: "book-import.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          book: {
            id: "e2e-imported",
            tieu_de: "Sách import E2E",
            tac_gia: "Quang Từ",
          },
          chapters: [
            { tieu_de: "Tập import", noi_dung: "<p>Nội dung import.</p>" },
          ],
        }),
      ),
    });
    await importer.getByRole("button", { name: "Import vào D1" }).click();
    await expect(importer.getByRole("status")).toContainText("Đã import 1 sách vào D1.");
  });

  test("guests cannot trigger reader mutations and members use session CSRF for comments and views", async ({
    page,
  }) => {
    const assertCsrfFor = async (authenticated: boolean) => {
      let viewToken = "";
      let commentToken = "";

      await page.unrouteAll({ behavior: "ignoreErrors" });
      await page.route("**/api/articles/**/views", async (route) => {
        viewToken = route.request().headers()["x-csrf-token"] || "";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{"ok":true}',
        });
      });
      await page.route(/\/api\/articles\/[^/]+\/comments(?:\?.*)?$/, async (route) => {
        if (route.request().method() === "GET") {
          expect(new URL(route.request().url()).searchParams.get('includeOwn')).toBe('1');
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: "[]",
          });
          return;
        }
        commentToken = route.request().headers()["x-csrf-token"] || "";
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: authenticated ? 2 : 1,
            ten: authenticated ? "e2e-admin" : "Khách đọc",
            noi_dung: authenticated
              ? "Bình luận khi đã đăng nhập"
              : "Bình luận guest",
            tao_luc: "2026-07-31T00:00:00.000Z",
          }),
        });
      });

      if (!authenticated) {
        await page.goto('/kinh-sach');
        await settleClient(page);
        await page.getByRole('button', { name: 'Đọc ngay Sách nhiều tập E2E', exact: true }).click();
        const reader = page.getByRole('dialog', { name: /Sách nhiều tập E2E/ });
        await expect(reader).toBeVisible();
        await expect.poll(() => viewToken).toBe('public');
        expect(commentToken).toBe('');
      } else {
        await loginAsAdmin(page);
    await page.goto("/kinh-sach");
    await settleClient(page);
        // A new view attempt for this persona; the preceding guest visit is
        // intentionally deduplicated for the browser tab otherwise.
        await page.evaluate(() => sessionStorage.removeItem('quangtu_viewed_e2e-ebook'));
        const expectedToken = await page.evaluate(async () => {
          const response = await fetch("/api/session", { cache: "no-store" });
          const payload = await response.json();
          return String(payload.csrfToken || "");
        });

        await page
          .getByRole("button", { name: "Đọc ngay Sách nhiều tập E2E" })
          .click();
        const reader = page.getByRole("dialog", { name: /Sách nhiều tập E2E/ });
        await expect(reader).toBeVisible();
        await reader.getByRole("button", { name: /Phẩm Một/ }).click();
        await page.getByRole("dialog", { name: /Phẩm Một/ })
          .locator(".reader-back").click();
        await page.getByRole("button", { name: /Viết bình luận/ }).click();
        const commentForm = page.getByRole("form", { name: "Gửi bình luận" });
        await expect(commentForm).toBeVisible();
        const viewport = page.viewportSize();
        if (viewport && viewport.width > 768) {
          await expect
            .poll(async () => {
              const formBox = await commentForm.boundingBox();
              return {
                x: Math.round(formBox?.x ?? -1),
                width: Math.round(formBox?.width ?? 0),
                bottom: Math.round((formBox?.y ?? 0) + (formBox?.height ?? 0)),
              };
            })
            .toEqual({ x: 0, width: viewport.width, bottom: viewport.height });
        }
        await expect(commentForm.getByText("Bình luận dưới tên:")).toBeVisible();
        await page
          .getByLabel("Nội dung góp ý *")
          .fill("Bình luận khi đã đăng nhập");
        await page.getByRole("button", { name: "Gửi bình luận" }).click();

        await expect(
          page.getByText("Bình luận khi đã đăng nhập"),
        ).toBeVisible();
        expect(viewToken).toBe(expectedToken);
        expect(commentToken).toBe(expectedToken);
      }
    };

    await assertCsrfFor(false);
    await assertCsrfFor(true);
  });
});
