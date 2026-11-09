import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('admin books legacy authoring parity', () => {
  const manager = readFileSync('src/lib/components/admin/books/BookManager.svelte', 'utf8');
  const chapters = readFileSync('src/lib/components/admin/books/ChapterEditor.svelte', 'utf8');
  const composer = readFileSync('src/lib/components/admin/books/ChapterComposer.svelte', 'utf8');
  const imageDialog = readFileSync('src/lib/components/admin/books/ChapterImageInsertDialog.svelte', 'utf8');
  const articleModal = readFileSync('src/lib/components/admin/articles/ArticleAdminModal.svelte', 'utf8');
  const articleEditor = readFileSync('src/lib/components/admin/articles/ArticleContentEditor.svelte', 'utf8');
  const professionalEditor = readFileSync('src/lib/components/admin/editor/ProfessionalRichTextEditor.svelte', 'utf8');
  const articlePdfPreview = readFileSync('src/lib/components/admin/articles/ArticlePdfPreview.svelte', 'utf8');
  const articleModalCss = readFileSync('src/lib/components/admin/articles/article-admin-modal.css', 'utf8');
  const adminLayoutCss = readFileSync('src/lib/styles/admin-layout.css', 'utf8');
  const importJsonModal = readFileSync('src/lib/components/admin/books/ImportJsonModal.svelte', 'utf8');
  const importJsonModalCss = readFileSync('src/lib/components/admin/books/import-json-modal.css', 'utf8');
  const siteHeader = readFileSync('src/lib/components/layout/SiteHeader.svelte', 'utf8');
  const homePage = readFileSync('src/routes/+page.svelte', 'utf8');

  it('persists legacy publication, external-link and cover-position fields', () => {
    expect(manager).toContain('<ArticleAdminModal');
    expect(articleModal).toContain('beforeNavigate((navigation) =>');
    expect(articleModal).toContain("window.addEventListener('beforeunload', beforeUnload)");
    expect(articleModal).toContain('if (workActive)');
    expect(articleModal).toContain('if (navigation.willUnload)');
    expect(articleModal).not.toContain('if (navigationApproved) return');
    expect(articleModal).toContain('link_ngoai: externalUrl');
    expect(articleModal).toContain('noi_bat: featured');
    expect(articleModal).toContain('trang_thai: status');
    expect(articleModal).toContain('encodeBookCoverAsset(coverUrl, coverPosition)');
    expect(articleModal).toContain('style:object-position={coverPosition}');
  });

  it('supports JSON file, paste, sample and drop import workflows', () => {
    expect(manager).toContain('<ImportJsonModal');
    expect(importJsonModal).toContain('multiple onchange={selectFiles}');
    expect(importJsonModal).toContain('Xem mẫu JSON');
    expect(importJsonModal).toContain('ondragover={(event) =>');
    expect(importJsonModal).toContain('ondrop={dropFiles}');
    expect(importJsonModal).toContain('normalizeBookImportPayload');
  });

  it('warns about unsaved changes and provides content preview', () => {
    expect(articleModal).toContain('Bạn có thay đổi chưa lưu');
    expect(articleModal).toContain('onclick={safeClose}');
    expect(articleModal).toContain('<ArticleContentEditor');
    expect(articleEditor).toContain('<ProfessionalRichTextEditor');
    expect(articleEditor).toContain('showSplit');
    expect(professionalEditor).toContain('class="preview-panel"');
  });

  it('supports rich chapter formatting, preview and secure bulk image insertion', () => {
    expect(chapters).toMatch(/format\('formatBlock',\s*'h2'\)/u);
    expect(chapters).toContain("format('insertUnorderedList')");
    expect(chapters).toContain('insertLink');
    expect(chapters).toContain('multiple accept="image/jpeg,image/png,image/webp,image/gif"');
    expect(chapters).toMatch(/'x-content-sha256':\s*encoded/u);
    expect(chapters).toContain('class="rte-preview"');
    expect(chapters).toContain('<ChapterComposer');
    expect(composer).toContain('<ProfessionalRichTextEditor');
    expect(professionalEditor).toContain('contenteditable={!busy}');
    expect(professionalEditor).toContain('sanitizeStoredHtml');
    expect(imageDialog).toContain('multiple accept="image/*"');
    expect(imageDialog).toContain('Dán URL');
    expect(imageDialog).toContain('Chèn ảnh');
    expect(composer).toContain('createChapterEditorHtml(content)');
    expect(composer).toContain('serialize={serializeChapterEditorHtml}');
    expect(professionalEditor).not.toContain('@ckeditor/');
  });

  it('keeps native formatting controls and scrollable content', () => {
    expect(professionalEditor).toContain('class="editor-toolbar"');
    expect(professionalEditor).toContain('overflow:auto');
    expect(professionalEditor).toContain('onImageBusy(true)');
  });



  it('matches the legacy chapter image modal layout and controls', () => {
    expect(imageDialog).toContain('max-width: 520px');
    expect(imageDialog).toContain('gap: 4px; margin-bottom: 14px; padding: 10px 18px 0');
    expect(imageDialog).toContain('flex: 1; align-items: center; justify-content: center');
    expect(imageDialog).toContain('height: 143px');
    expect(imageDialog).toContain('margin-bottom: 10px; padding: 28px 16px');
    expect(imageDialog).toContain('padding: 28px 16px');
    expect(imageDialog).toContain('border: 2px dashed var(--border2)');
    expect(imageDialog).toContain('font: 18px var(--font-app); line-height: normal');
    expect(imageDialog).toContain('box-shadow: 0 2px 8px rgba(200,150,62,.3)');
  });

  it('locks navigation and chapter switching while inline images are uploading', () => {
    expect(articleModal).toContain('onUploadBusy={(value) => chapterUploadBusy = value}');
    expect(articleModal).toContain('const workActive = $derived(Boolean(busy || chapterUploadBusy || chapterSaveBusy || uploadKind))');
    expect(articleModal).toContain('disabled={busy || chapterUploadBusy || chapterSaveBusy || Boolean(uploadKind)}');
    expect(chapters).toContain('createChapterImageUploadCoordinator');
    expect(chapters).toContain('imageUploadCoordinator.isCurrent');
  });

  it('matches the production add-article modal and full authoring toolbar', () => {
    expect(articleModal).toContain('ArticleContentEditor');
    expect(articleModal).toContain("uploadImage={(file) => upload(file, 'content')}");
    expect(articleEditor).toContain('<ProfessionalRichTextEditor');
    expect(professionalEditor).toContain('contenteditable={!busy}');
    expect(professionalEditor).toContain('sanitizeStoredHtml');
    expect(professionalEditor).not.toContain('@ckeditor/');
    expect(articleModalCss).toContain('.article-admin-body');
    expect(articleModalCss).toContain('justify-content: space-between');
    expect(articleModalCss).toContain('line-height: normal');
    expect(articleModalCss).toContain('.article-admin-editor-field');
  });

  it('keeps the mobile article body scroll region separate from its action footer', () => {
    expect(articleModal).toMatch(/<form[\s\S]*?<div class="article-admin-body">[\s\S]*?<div class="article-admin-left">/u);
    expect(articleModal).toMatch(/<\/div>\s*<footer class="article-admin-footer">/u);
    expect(articleModalCss).toMatch(/\.article-admin-form\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/iu);
    expect(articleModalCss).toMatch(/\.article-admin-body\s*\{[^}]*display:\s*grid[^}]*min-height:\s*0[^}]*flex:\s*1/iu);
    expect(articleModalCss).toMatch(/@media \(max-width: 1023px\)[\s\S]*?\.article-admin-body\s*\{[^}]*overflow-y:\s*auto/iu);
    expect(articleModalCss).toMatch(/\.article-admin-footer\s*\{[^}]*flex:\s*none/iu);
    expect(articleModalCss).toMatch(/\.article-admin-footer button\s*\{[^}]*min-height:\s*44px/iu);
  });

  it('keeps the full-screen article editor above the admin sidebar', () => {
    const overlayZ = Number(articleModalCss.match(/\.article-admin-overlay\s*\{[\s\S]*?z-index:\s*(\d+)/u)?.[1]);
    const sidebarZ = Number(adminLayoutCss.match(/\.admin-sidebar\s*\{[\s\S]*?z-index:\s*(\d+)/u)?.[1]);

    expect(overlayZ).toBeGreaterThan(sidebarZ);
  });

  it('keeps plain category labels aligned with their persisted values', () => {
    for (const category of ['CHUYỆN NHÂN QUẢ','SÁCH KHUYẾN THIỆN','KINH PHẬT','TRÌ CHÚ','NGHI THỨC KHÁC','KHÁC']) expect(articleModal).toContain("value: '"+category+"'");
    expect(articleModal).toContain('<option value={option.value}>{option.label}</option>');
  });

  it('renders a paginated PDF preview when editing a PDF article', () => {
    expect(articleModal).toContain("import ArticlePdfPreview from './ArticlePdfPreview.svelte'");
    expect(articleModal).toContain('<ArticlePdfPreview url={pdfUrl} {title} />');
    // pdfjs is reached through the shared loader, which installs the platform
    // APIs older Safari lacks and keeps the library itself lazily imported.
    expect(articlePdfPreview).toContain('await loadPdfjs()');
    expect(readFileSync('src/lib/browser/pdfjs-loader.ts', 'utf8')).toContain("import('pdfjs-dist/legacy/build/pdf.mjs')");
    expect(articlePdfPreview).toContain('showPage');
    expect(articlePdfPreview).toContain('Trang trước');
    expect(articlePdfPreview).toContain('Trang sau');
    expect(articlePdfPreview).toContain('aria-label="Đi tới trang PDF"');
    expect(articlePdfPreview).toContain('Bản xem trước PDF');
    expect(articlePdfPreview).toContain('Mở PDF trong tab mới');
  });

  it('opens the legacy JSON importer as a home-page modal without navigation', () => {
    expect(siteHeader).not.toContain("new CustomEvent('quangtu:import-json')");
    expect(homePage).toContain("window.addEventListener('quangtu:import-json'");
    expect(homePage).toContain('<ImportJsonModal');
    expect(importJsonModal).toContain('role="dialog"');
    expect(importJsonModal).toContain('Import sách từ file JSON');
    expect(importJsonModal).toContain('<DatabaseZap aria-hidden="true"');
    expect(importJsonModal).toContain('Dành cho CTV và Admin · Dữ liệu sẽ được lưu vào hệ thống');
    expect(importJsonModalCss).toContain('max-width:680px');
  });

  it('preserves upload, paste and sample JSON workflows in the modal', () => {
    expect(importJsonModal).toContain('Tải file lên');
    expect(importJsonModal).toContain('Dán JSON');
    expect(importJsonModal).toContain('Xem mẫu JSON');
    expect(importJsonModal).toContain('multiple onchange={selectFiles}');
    expect(importJsonModal).toContain('ondrop={dropFiles}');
    expect(importJsonModal).toContain("'/api/admin/books/import'");
    expect(importJsonModal).toContain("'x-csrf-token': csrf");
    expect(importJsonModal).toContain('Import vào D1');
  });
});
