import type { Page } from '@playwright/test';

/** Inspect layout and visible text, including overflow hidden by a containing card. */
export async function inspectHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const findings: Array<{ selector: string; text: string; kind: string; width: number; content: number }> = [];
    const dialogs = [...document.querySelectorAll<HTMLElement>('dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]')]
      .filter(node => node.getBoundingClientRect().width > 0);
    const root = dialogs.at(-1) ?? document.body;
    if (root !== document.body && root.scrollWidth > root.clientWidth + 2) findings.push({
      selector:root.tagName.toLowerCase()+'.'+[...root.classList].join('.'),text:'',kind:'dialog-scroll',
      width:root.clientWidth,content:root.scrollWidth,
    });
    for (const element of root.querySelectorAll<HTMLElement>('*')) {
      if (!(element instanceof HTMLElement) || element.closest('.pdf-text-layer')) continue;
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      if (rect.width < 8 || rect.height < 6 || rect.bottom <= 0 || rect.top >= innerHeight || style.visibility !== 'visible'
        || style.display === 'none' || style.opacity === '0' || style.clipPath !== 'none') continue;
      let intentional = false;
      for (let parent: HTMLElement | null = element; parent && parent !== document.body; parent = parent.parentElement) {
        const css = getComputedStyle(parent);
        if (css.visibility !== 'visible' || css.opacity === '0' || css.display === 'none') { intentional = true; break; }
        if(parent.matches('.admin-sidebar:not(.admin-sidebar--open)') && parent.getBoundingClientRect().right<=1) {intentional=true;break;}
        if (['auto', 'scroll'].includes(css.overflowX) && parent.scrollWidth > parent.clientWidth + 2
          && parent.matches('.section-nav,.pt-as-header-row2,.pdf-controls,.pdf-viewer,[class*="table-wrap"],.native-editor-toolbar,.admin-approval-nav')) { intentional = true; break; }
        if (css.textOverflow === 'ellipsis') { intentional = true; break; }
      }
      if (intentional || element.closest('[aria-hidden="true"], [inert]')) continue;
      const directText = [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
      const control = element.matches('button,input,select,textarea');
      if (!directText && !control) continue;
      const boundsOverflow = rect.left < -2 || rect.right > width + 2;
      const textOverflow = directText && !element.matches('input,textarea') && element.clientWidth > 0
        && element.scrollWidth > element.clientWidth + 2;
      if (boundsOverflow || textOverflow) findings.push({
        selector: element.tagName.toLowerCase() + (element.id ? '#' + element.id : '') + '.' + [...element.classList].join('.'),
        text: (element.textContent || '').trim().slice(0, 110), kind: boundsOverflow ? 'bounds' : 'text',
        width: Math.round(rect.width), content: element.scrollWidth,
      });
    }
    return { viewport: width, documentWidth: document.documentElement.scrollWidth, findings };
  });
}
