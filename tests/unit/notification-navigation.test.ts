import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const component = readFileSync('src/lib/components/notifications/NotificationBell.svelte', 'utf8');
const script = component.slice(component.indexOf('>') + 1, component.indexOf('</script>'));
const ast = ts.createSourceFile('notification.ts', script, ts.ScriptTarget.Latest, true);
const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === 'handleItemClick');
const source = ts.transpileModule(node!.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function harness(href = 'https://app.test/phap-thoai', principal: string | null = 'a') {
  const goto = vi.fn(async () => {});
  const assign = vi.fn();
  const save = vi.fn();
  const sync = vi.fn(async () => {});
  const state = runInNewContext(`let readIds=new Set(); let pendingReadIds=new Set(); let isOpen=true;
    ${source}
    ({click:handleItemClick, read:()=>Array.from(readIds), open:()=>isOpen});`, {
    goto, saveReadState: save, savePendingReadState: vi.fn(), syncReadState: sync, URL, accountPrincipal: principal,
    window: { location: { origin: 'https://app.test', href, assign } },
  }) as { click: (item: { id: string; link: string; type?: string; principalId?: string }) => void | Promise<void>; read: () => string[]; open: () => boolean };
  return { ...state, goto, assign, save, sync };
}

describe('notification navigation', () => {
  it('does not mark or navigate a late notification belonging to a previous account', async () => {
    const h = harness('https://app.test/tu-tap', 'b');
    await h.click({ id: 'old-a', principalId: 'a', type: 'mindful_prayer', link: '/tu-tap?communityPost=private-a' });
    expect(h.goto).not.toHaveBeenCalled(); expect(h.assign).not.toHaveBeenCalled();
    expect(h.read()).toEqual([]); expect(h.save).not.toHaveBeenCalled();
  });
  it('keeps an active practice URL while opening an exact community reaction', async () => {
    const h = harness('https://app.test/tu-tap?action=rosary&article=old&chap=2#reading');
    await h.click({ id: 'mindful-reaction:r1', type: 'mindful_prayer', link: '/tu-tap?communityPost=p1&communityReaction=r1' });
    expect(h.goto).toHaveBeenCalledWith('https://app.test/tu-tap?action=rosary&article=old&chap=2&communityPost=p1&communityReaction=r1#reading');
    expect(h.assign).not.toHaveBeenCalled();
    expect(h.read()).toEqual(['mindful-reaction:r1']);
    expect(h.sync).toHaveBeenCalledWith(false, true);
  });
  it('links all lunar reminders to practice', () => {
    const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === 'loadUserNotifications');
    const lunar = node!.getText(ast).split('const hour = now.getHours();')[0];
    expect([...lunar.matchAll(/link: '([^']+)'/g)].map(match => match[1])).toEqual(Array(6).fill('/tu-tap'));
  });
  it.each(['/tu-tap?muc=kinh#reading', 'https://app.test/tu-tap?muc=kinh#reading'])('navigates internal %s without document replacement', async link => {
    const h = harness();
    await h.click({ id: 'practice', link });
    expect(h.goto).toHaveBeenCalledWith('https://app.test/tu-tap?muc=kinh#reading');
    expect(h.assign).not.toHaveBeenCalled();
    expect(h.read()).toEqual(['practice']);
    expect(h.save).toHaveBeenCalledOnce();
    expect(h.open()).toBe(false);
  });

  it('keeps a same-origin double-slash path attached to its original origin', async () => {
    const h = harness();
    await h.click({ id: 'path', link: 'https://app.test//other.test/path' });
    expect(h.goto).toHaveBeenCalledWith('https://app.test//other.test/path');
    expect(h.assign).not.toHaveBeenCalled();
  });

  it('preserves external HTTP(S) navigation and the read receipt', async () => {
    const h = harness();
    await h.click({ id: 'external', link: 'https://example.test/help?q=1#topic' });
    expect(h.assign).toHaveBeenCalledWith('https://example.test/help?q=1#topic');
    expect(h.goto).not.toHaveBeenCalled();
    expect(h.read()).toEqual(['external']);
    expect(h.open()).toBe(false);
  });

  it.each(['javascript:alert(1)', 'data:text/html,unsafe', 'https://[', ''])('does not navigate an unsafe, invalid or empty link %s', async link => {
    const h = harness();
    await h.click({ id: 'invalid', link });
    expect(h.assign).not.toHaveBeenCalled();
    expect(h.goto).not.toHaveBeenCalled();
    expect(h.read()).toEqual(['invalid']);
    expect(h.open()).toBe(false);
  });
});
