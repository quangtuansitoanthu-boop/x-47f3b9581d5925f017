"""Convert every source document in sach-nhan-qua into an import payload.

Pipeline: extract -> decode legacy encoding -> split into chapters ->
render clean HTML -> collect images. Writes one JSON payload per book plus a
summary report, ready for the D1 import step.
"""
import hashlib
import importlib.util
import json
import os
import re
import sys
import unicodedata
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SOURCE_DIR = os.path.join(ROOT, 'sach-nhan-qua')


def _load(name):
    path = os.path.join(HERE, f'{name}.py')
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


docx_extract = _load('docx-extract')
doc_extract = _load('doc-extract')
vn = _load('vn-encoding')
chapterize = _load('chapterize')
render = _load('render-html')

MEDIA_BASE = 'https://media.quangtu.vn'


def slugify(value):
    text = unicodedata.normalize('NFD', value)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    text = text.replace('đ', 'd').replace('Đ', 'D')
    return re.sub(r'-{2,}', '-', re.sub(r'[^a-z0-9]+', '-', text.lower())).strip('-')[:40]


def collect_images(source_path, book_key, out_dir):
    """Pull embedded images out of a .docx and give each a stable media URL."""
    if not source_path.lower().endswith('.docx'):
        return {}
    urls = {}
    os.makedirs(out_dir, exist_ok=True)
    with zipfile.ZipFile(source_path) as archive:
        # A zip may list "word/media/" itself; that entry is a directory, not an image.
        names = [n for n in archive.namelist()
                 if n.startswith('word/media/') and not n.endswith('/')]
        for index, name in enumerate(sorted(names), 1):
            data = archive.read(name)
            if not data:
                continue
            extension = os.path.splitext(name)[1].lower() or '.png'
            digest = hashlib.sha1(data).hexdigest()[:12]
            filename = f'image-{index:03d}-{digest}{extension}'
            with open(os.path.join(out_dir, filename), 'wb') as handle:
                handle.write(data)
            key = f'content/{book_key}/{filename}'
            # Relationship targets are recorded relative to word/.
            urls[name.replace('word/', '')] = f'{MEDIA_BASE}/{key}'
            urls[name] = f'{MEDIA_BASE}/{key}'
    return urls


def assemble(filename, meta, media_root):
    path = os.path.join(SOURCE_DIR, filename)
    extractor = docx_extract if filename.lower().endswith('.docx') else doc_extract
    paras = extractor.extract(path)

    encoding, texts, modes = vn.decode_document([p['text'] for p in paras])
    for para, text, mode in zip(paras, texts, modes):
        para['text'] = render.repair_horn(text)
        # The HTML is rendered from the runs, so they need the same decoding
        # decision that was made for the paragraph they belong to.
        for run in para.get('runs', []):
            run['t'] = render.repair_horn(vn.decode_text(run['t'], mode))

    book_key = f"{slugify(meta['tieu_de'])}-{hashlib.sha1(filename.encode()).hexdigest()[:8]}"
    image_urls = collect_images(path, book_key, os.path.join(media_root, book_key))

    result = chapterize.chapterize(paras)
    # sanitizeStoredHtml() truncates beyond 600_000 characters, so a section is
    # divided only when keeping it whole would actually lose text.
    sections = []
    for chapter in result['chapters']:
        html = render.render_chapter(chapter['title'], chapter['paras'], image_urls)
        if len(html) <= 599_000:
            sections.append((chapter, html))
            continue
        for part in chapterize.split_oversized([chapter], limit=45_000):
            sections.append((part, render.render_chapter(part['title'], part['paras'], image_urls)))

    chapters = []
    for index, (chapter, html) in enumerate(sections):
        if not html.strip():
            continue
        chapters.append({
            'so_thu_tu': len(chapters),
            'tieu_de': chapter['title'].strip() or f'Phần {index + 1}',
            'tom_tat': render.summarize(chapter['paras']),
            'noi_dung': html,
        })

    return {
        'source': filename,
        'encoding': encoding,
        'strategy': result['strategy'],
        'book_key': book_key,
        'book': {
            'id': meta.get('id'),
            'tieu_de': meta['tieu_de'],
            'has_muc_luc': 1,
            'so_tap': len(chapters),
            'tap_tieu_de': [c['tieu_de'] for c in chapters],
        },
        'chapters': chapters,
        'images': sorted(set(image_urls.values())),
    }


def main():
    out_dir = sys.argv[1]
    media_root = os.path.join(out_dir, 'media')
    os.makedirs(out_dir, exist_ok=True)
    config = json.load(open(os.path.join(HERE, 'books.config.json')))

    report = []
    for filename, meta in config.items():
        payload = assemble(filename, meta, media_root)
        out_path = os.path.join(out_dir, f"{payload['book_key']}.json")
        json.dump(payload, open(out_path, 'w'), ensure_ascii=False)
        sizes = [len(c['noi_dung']) for c in payload['chapters']]
        report.append({
            'title': meta['tieu_de'],
            'source': filename,
            'encoding': payload['encoding'],
            'strategy': payload['strategy'],
            'chapters': len(payload['chapters']),
            'max_html': max(sizes) if sizes else 0,
            'total_html': sum(sizes),
            'images': len(payload['images']),
        })
        print(f"{meta['tieu_de'][:44]:<46}{payload['strategy']:>10}{len(payload['chapters']):>5}"
              f"{(max(sizes) if sizes else 0) // 1024:>7}KB")
    json.dump(report, open(os.path.join(out_dir, '_report.json'), 'w'), ensure_ascii=False, indent=2)


if __name__ == '__main__':
    main()
