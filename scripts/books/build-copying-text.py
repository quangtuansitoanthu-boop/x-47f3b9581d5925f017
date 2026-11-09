"""Build immutable copying text from the three checked-in Vietnamese editions.

Preserves all visible source content, including opening/closing rituals. Never
guesses which doctrinal text should be removed. Run with Python's standard library.
"""
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'src/lib/data/scripture-copying'
BOOKS = [
    ('dia-tang', 'Kinh Địa Tạng Bồ Tát Bổn Nguyện', 'tt_1780910773084'),
    ('phap-hoa', 'Kinh Diệu Pháp Liên Hoa', 'book_1787189827026_8b568f64'),
    ('lang-nghiem', 'Kinh Thủ Lăng Nghiêm', 'book_1788482371938_34f43522'),
]


class TextParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.hidden += 1
        if tag in ('p', 'div', 'br', 'hr', 'li', 'h1', 'h2', 'h3', 'h4', 'tr'):
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.hidden = max(0, self.hidden - 1)
        if tag in ('p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'tr'):
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


DEST.mkdir(parents=True, exist_ok=True)
for slug, title, article in BOOKS:
    source = json.loads((ROOT / f'static/offline-data/chapters/{article}.json').read_text(encoding='utf-8'))
    chapters = []
    for index, chapter in enumerate(sorted(source, key=lambda row: row['so_thu_tu'])):
        parser = TextParser()
        parser.feed(chapter['noi_dung'])
        # Paragraph-aware, bounded diff windows. Preserve every visible word.
        paragraphs = [re.sub(r'\s+', ' ', p).strip() for p in ''.join(parser.parts).splitlines()]
        blocks, pending = [], []
        for paragraph in filter(None, paragraphs):
            words = paragraph.split()
            if pending and len(pending) + len(words) > 160:
                blocks.append(' '.join(pending))
                pending = []
            while len(words) > 160:
                blocks.append(' '.join(words[:160]))
                words = words[160:]
            pending.extend(words)
        if pending:
            blocks.append(' '.join(pending))
        assert blocks
        assert ' '.join(blocks).split() == ' '.join(paragraphs).split()
        chapters.append({'number': index + 1, 'title': chapter['tieu_de'], 'blocks': blocks})
    canonical = json.dumps(chapters, ensure_ascii=False, separators=(',', ':'))
    version = 'nfc-v1-' + hashlib.sha256(canonical.encode()).hexdigest()[:20]
    payload = {'id': slug, 'title': title, 'articleId': article, 'version': version, 'chapters': chapters}
    (DEST / f'{slug}.json').write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(slug, len(chapters), 'chapters;', sum(len(c['blocks']) for c in chapters), 'blocks;', version)
