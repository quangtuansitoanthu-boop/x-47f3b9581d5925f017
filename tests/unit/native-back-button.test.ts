import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
const { navigateHome } = vi.hoisted(() => ({ navigateHome: vi.fn(async () => {}) }));
vi.mock('$app/navigation', () => ({ goto: navigateHome }));
vi.mock('$app/environment', () => ({ browser:true }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp:() => true }));
vi.mock('$lib/browser/modal-dialog', () => ({ dismissTopModal:() => false }));
vi.mock('@capacitor/app', () => ({
  get App() {
    // Fixture của từng ca vẫn kiểm tra đúng thứ tự đóng UI, qua API import thật của owner.
    return (window as unknown as { Capacitor: { Plugins: { App: object } } }).Capacitor.Plugins.App;
  },
}));
beforeEach(() => { vi.resetModules(); navigateHome.mockClear(); });
afterEach(() => vi.unstubAllGlobals());

it.each([false, true])('hardware Back closes only the visible notification popover before the practice underneath (hidden: %s)', async hidden => {
  const dom = new JSDOM('<header class="tt-topbar"><button class="tt-back-btn">Practice back</button></header><main data-practice-route-back></main><div class="notification-popover"><button class="close-popover-btn">Close notifications</button></div>');
  const close = dom.window.document.querySelector<HTMLButtonElement>('.close-popover-btn')!;
  const route = dom.window.document.querySelector<HTMLButtonElement>('.tt-back-btn')!;
  Object.defineProperty(close, 'offsetParent', { value: hidden ? null : {} });
  Object.defineProperty(route, 'offsetParent', { value: {} });
  const dismissed = vi.fn(), routeBack = vi.fn(), historyBack = vi.fn();
  close.addEventListener('click', dismissed); route.addEventListener('click', routeBack);
  let handler: (value: { canGoBack: boolean }) => void = () => {};
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('window', {
    Capacitor: { Plugins: { App: { addListener: async (_name: string, callback: typeof handler) => { handler = callback; } } } },
    location: { pathname: '/tu-tap', search: '' }, history: { back: historyBack }, dispatchEvent: () => true,
  });
  const { initializeNativeBackButton } = await import('$lib/browser/native-back-button');
  try {
    await initializeNativeBackButton(); handler({ canGoBack: true });
    expect(dismissed).toHaveBeenCalledTimes(hidden ? 0 : 1);
    expect(routeBack).toHaveBeenCalledTimes(hidden ? 1 : 0);
    expect(historyBack).not.toHaveBeenCalled();
  } finally { dom.window.close(); }
});

it.each(['/ca-nhan', '/privacy-policy'])('cold native Back returns from %s to home instead of exiting', async pathname => {
  const dom = new JSDOM('<main>Cold subroute</main>');
  let handler: (value: { canGoBack: boolean }) => void = () => {};
  const exitApp = vi.fn(), historyBack = vi.fn();
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('window', {
    Capacitor: { Plugins: { App: { addListener: async (_name: string, callback: typeof handler) => { handler = callback; }, exitApp } } },
    location: { pathname, search: '' }, history: { back: historyBack }, dispatchEvent: () => true,
  });
  const { initializeNativeBackButton } = await import('$lib/browser/native-back-button');
  try {
    await initializeNativeBackButton();
    handler({ canGoBack: false });
    expect(navigateHome).toHaveBeenCalledExactlyOnceWith('/');
    expect(historyBack).not.toHaveBeenCalled();
    expect(exitApp).not.toHaveBeenCalled();
    expect(dom.window.document.querySelector('#native-back-toast')).toBeNull();
  } finally { dom.window.close(); }
});

it.each([
  '.pdf-bookmark-panel [aria-label="Đóng danh sách đánh dấu"], .reader-tools-panel.open .sheet-close-btn',
  '.practice-confirm .practice-confirm__actions button:first-child',
  '.tt-rosary .tt-rosary__back-btn',
  '.lp .lp__header-left .lp__hbtn',
  '.tt-practice .ttp-back',
  '.tt-section-view .tt-back-btn',
  '#copy-options .panel-heading button',
  '.copy-writing .issues-heading button',
  '.tt-topbar .tt-back-btn',
])('hardware Back activates the visible practice control %s before history', async (selector) => {
  let handler: (value: {canGoBack:boolean}) => void = () => {};
  const click = vi.fn(); const historyBack = vi.fn();
  vi.stubGlobal('document', { querySelector:(query:string) => query === selector ? { offsetParent:{}, click } : query === '[data-practice-route-back]' && selector === '.tt-topbar .tt-back-btn' ? {} : null, querySelectorAll:() => [] });
  vi.stubGlobal('window', {
    Capacitor:{ Plugins:{ App:{ addListener:async (_name:string, callback:typeof handler) => { handler = callback; } } } },
    location:{ pathname:'/tu-tap' }, history:{ back:historyBack }, dispatchEvent:() => true,
  });
  const { initializeNativeBackButton } = await import('$lib/browser/native-back-button');
  await initializeNativeBackButton();
  handler({ canGoBack:true });
  expect(click).toHaveBeenCalledOnce();
  expect(historyBack).not.toHaveBeenCalled();
});

it.each([false, true])('hardware Back uses the category shell control for direct links (history: %s)', async (canGoBack) => {
  const dom = new JSDOM('<header class="tt-topbar"><button class="tt-back-btn">Back</button></header><div class="tt-section-view" data-practice-route-back></div>');
  const back = dom.window.document.querySelector<HTMLButtonElement>('button')!;
  Object.defineProperty(back, 'offsetParent', { value:{} });
  const click = vi.fn(), historyBack = vi.fn();
  back.addEventListener('click', click);
  let handler: (value: {canGoBack:boolean}) => void = () => {};
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('window', {
    Capacitor:{ Plugins:{ App:{ addListener:async (_name:string, callback:typeof handler) => { handler = callback; } } } },
    location:{ pathname:'/tu-tap', search:'?muc=tri-chu' }, history:{ back:historyBack }, dispatchEvent:() => true,
  });
  const { initializeNativeBackButton } = await import('$lib/browser/native-back-button');
  try {
    await initializeNativeBackButton();
    handler({ canGoBack });
    expect(click).toHaveBeenCalledOnce();
    expect(historyBack).not.toHaveBeenCalled();
  } finally { dom.window.close(); }
});

it.each([
  ['continue practice', '<button data-parent>Background</button><div class="tt-modal-overlay"><button class="tt-modal-close" data-dismiss>Close</button><button type="submit" data-save>Save</button></div>'],
  ['Thanh Tịnh confirmation', '<div class="thanh-tinh-overlay"><button class="btn-back" data-parent>Back</button><div class="modal-backdrop"><button class="btn-cancel" data-dismiss>Hủy</button><button type="submit" data-save>Lưu</button></div></div>'],
  ['practice history', '<div class="tt-modal-overlay"><button class="tt-tracker__close" data-parent>Close tracker</button></div><div class="tt-overlay open"><button class="tt-dialog-ok" type="button" aria-label="Đóng" data-dismiss>Đóng</button></div>'],
  ['manual practice form', '<div class="tt-modal-overlay"><button class="tt-tracker__close" data-parent>Close tracker</button></div><div class="tt-overlay open"><form><button class="tt-dialog-ok" type="submit" data-save>Lưu</button><button class="tt-dialog-cancel" type="button" data-dismiss>Hủy</button></form></div>'],
])('hardware Back dismisses only the top %s without submitting it', async (_name, html) => {
  const dom = new JSDOM(html);
  const parentClose = vi.fn(), dismiss = vi.fn(), save = vi.fn(), historyBack = vi.fn();
  dom.window.document.querySelector('[data-parent]')!.addEventListener('click', parentClose);
  dom.window.document.querySelector('[data-dismiss]')!.addEventListener('click', dismiss);
  dom.window.document.querySelector('[data-save]')?.addEventListener('click', save);
  dom.window.document.querySelectorAll('button').forEach(button => Object.defineProperty(button, 'offsetParent', { value:{} }));
  let handler: (value: {canGoBack:boolean}) => void = () => {};
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('window', {
    Capacitor:{ Plugins:{ App:{ addListener:async (_name:string, callback:typeof handler) => { handler = callback; } } } },
    location:{ pathname:'/tu-tap' }, history:{ back:historyBack }, dispatchEvent:() => true,
  });
  const { initializeNativeBackButton } = await import('$lib/browser/native-back-button');
  try {
    await initializeNativeBackButton();
    handler({ canGoBack:true });
    expect(dismiss).toHaveBeenCalledOnce();
    expect(parentClose).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(historyBack).not.toHaveBeenCalled();
  } finally { dom.window.close(); }
});
