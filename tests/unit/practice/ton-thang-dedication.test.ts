import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { renderReaderContent } from '../../../src/lib/components/reader/content-renderer';

it('ships and renders the complete Ton Thang dedication before closing homage', () => {
  const id = 'tt_nghi_thuc_tri_chu_phat_danh_ton_thang';
  const chapters = JSON.parse(readFileSync(`static/offline-data/chapters/${id}.json`, 'utf8'));
  const content = chapters[0].noi_dung;
  for (const file of ['src/lib/data/offline-bundled-articles.json', 'static/offline-bundled-articles.json']) {
    const article = JSON.parse(readFileSync(file, 'utf8')).find((row: any) => row.id === id);
    expect(article.noi_dung).toBe(content);
  }
  const rendered = renderReaderContent(content);
  for (const text of ['9. Niệm Phật và hồi hướng', 'Hồi hướng công đức', 'Xin đem công đức thù thắng nầy', 'Hồi hướng bốn ân và ba cõi', 'Đều sanh Cực Lạc thành Phật đạo.', '10. Lễ vãn', 'Thức ba tiếng chuông']) {
    expect(rendered).toContain(text);
  }
  expect(content.indexOf('Hồi hướng công đức')).toBeLessThan(content.indexOf('10. Lễ vãn'));
});
