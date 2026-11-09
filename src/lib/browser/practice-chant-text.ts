/** Chỉ bỏ số thứ tự khỏi giọng tụng, không sửa nội dung hoặc cách đánh số hiển thị. */
export function practiceChantText(html: string): string {
  if (typeof document === 'undefined') return '';
  const container = document.createElement('div');
  container.innerHTML = html;
  container.querySelectorAll('script,style,button,[aria-hidden="true"]').forEach(node => node.remove());
  container.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
  container.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,tr').forEach(node => node.append('\n'));
  return (container.textContent ?? '').split(/\n/u)
    .map(line => line.trim().replace(/^(?:[\[(]\s*\d+\s*[\])]|(?:\d+|[IVXLCDM]+)\s*[.)、:：–—-](?=\s|\p{L}|$)|\d+(?=\s+\p{L})|\d+$)\s*/u, ''))
    .filter(Boolean).join(' ').replace(/\s+/gu, ' ').trim();
}
