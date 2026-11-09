import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('reader comments parity', () => {
  const source = readFileSync('src/lib/components/comments/CommentsPanel.svelte', 'utf8');

  it('renders legacy initials and relative timestamps', () => {
    expect(source).toContain('function initials');
    expect(source).toContain('function relativeTime');
    expect(source).toContain('comment-avatar');
    expect(source).toContain('relativeTime(comment.tao_luc)');
  });

  it('clears the complete form and reports successful submission', () => {
    expect(source).toContain("name = ''; phone = ''; email = ''; content = ''");
    expect(source).toContain('showNotice(t.sent)');
    expect(source).toContain('role="status"');
  });

  it('keeps the floating comment affordance draggable without treating a drag as activation', () => {
    expect(source).toContain('setPointerCapture');
    expect(source).toContain('Math.hypot(deltaX, deltaY) < 5');
    expect(source).toContain('if (fabDragged)');
    expect(source).toContain('touch-action:none');
  });

  it('clears comments on article changes and rejects stale network responses', () => {
    expect(source).toContain('commentsRequest?.abort()');
    expect(source).toContain('const generation = ++commentsGeneration');
    expect(source).toContain('comments = []');
    expect(source).toContain('generation === commentsGeneration && requestedArticleId === articleId');
    expect(source).toContain('submittedArticleId !== articleId');
    expect(source).toContain('signal: controller.signal');
  });
});
