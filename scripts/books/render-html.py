"""Render extracted paragraphs into the clean HTML stored in tap_noi_dung.

The output deliberately drops the source Word typography (point sizes, page
widths, Times New Roman, colour runs). sanitizeStoredHtml strips those anyway,
and the reader supplies the site's own font. Only meaning-bearing formatting
survives: emphasis, alignment, headings and images.
"""
import re
import unicodedata
from html import escape

# Ebook-conversion boilerplate that adds nothing to the reading text.
NOISE = re.compile(
    r'^(nguồn|nguồn|chuyển sang ebook|người thực hiện|link audio|'
    r'đánh máy|trình bày|nhà xuất bản điện tử|thực hiện ebook|'
    r'http[s]?://|www\.|[\w.+-]+@[\w-]+\.[\w.]+)',
    re.I)
BULLET = re.compile(r'^\s*[•▪◦*·]\s+')


def repair_horn(text):
    """Restore the horn lost from "ươ" in sources that degraded it to "ưo"."""
    return text.replace('ưo', 'ươ').replace('Ưo', 'Ươ').replace('ƯO', 'ƯƠ')


def is_noise(text):
    return bool(NOISE.match(text.strip())) or text.strip() in {'---', '***'}


DECORATIVE_EMPHASIS = re.compile(r'<(em|u|strong)>([^<]{1,2})</\1>(?=\w)')


def inline_html(runs):
    """Rebuild a paragraph's inline markup from its runs."""
    parts = []
    for run in runs:
        text = run.get('t', '')
        if not text:
            continue
        chunk = escape(text).replace('\n', '<br>')
        # Emphasis on whitespace alone is a Word run-split artefact, not intent.
        if text.strip():
            if run.get('b'):
                chunk = f'<strong>{chunk}</strong>'
            if run.get('i'):
                chunk = f'<em>{chunk}</em>'
            if run.get('u'):
                chunk = f'<u>{chunk}</u>'
        parts.append(chunk)
    html = ''.join(parts)
    # Collapse adjacent identical tags left by Word's run splitting.
    for tag in ('strong', 'em', 'u'):
        html = html.replace(f'</{tag}><{tag}>', '')
    # A drop cap arrives as its own styled run; it should not italicise the word.
    previous = None
    while previous != html:
        previous = html
        html = DECORATIVE_EMPHASIS.sub(r'\2', html)
    for tag in ('strong', 'em', 'u'):
        html = html.replace(f'</{tag}><{tag}>', '')
        html = re.sub(rf'<{tag}>\s*</{tag}>', ' ', html)
    return re.sub(r'\s{2,}', ' ', html).strip()


def align_style(align):
    if align in ('center', 'right'):
        return f' style="text-align:{align}"'
    if align in ('both', 'justify'):
        return ' style="text-align:justify"'
    return ''


def render_paragraph(para, image_urls):
    if para.get('images'):
        figures = []
        for source in para['images']:
            url = image_urls.get(source)
            if url:
                figures.append(f'<figure><img src="{escape(url)}" alt="" loading="lazy"></figure>')
        if figures and not para['text'].strip():
            return ''.join(figures)
        if figures:
            return ''.join(figures) + f'<p{align_style(para.get("align"))}>{inline_html(para["runs"])}</p>'

    text = para['text']
    if not text.strip() or is_noise(text):
        return ''
    body = inline_html(para['runs']) if para.get('runs') else escape(text)
    if not body:
        return ''
    if BULLET.match(text):
        body = BULLET.sub('', body)
        return f'<p{align_style(para.get("align"))}>• {body}</p>'
    return f'<p{align_style(para.get("align"))}>{body}</p>'


def _fold_title(text):
    """Case- and diacritic-insensitive key for matching a heading to a title."""
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    for source in ('\u0111', '\u0110', '\u00f0', '\u00d0'):
        text = text.replace(source, 'd')
    return re.sub(r'[^a-z0-9]+', '', text.lower())


def _is_same_heading(text, title):
    """True when a paragraph repeats the chapter title in any casing.

    Also covers the case where the body prints a shortened heading of its own
    contents entry ("Kệ và giảng giải" under "Chú Lăng Nghiêm kệ và giảng
    giải"). Only a short line qualifies, so a biography whose first sentence
    opens with the subject's name is never mistaken for a repeated heading.
    """
    a, b = _fold_title(text), _fold_title(title)
    if not a or not b:
        return False
    if a == b:
        return True
    if len(text.strip()) > 130:
        return False
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    return len(shorter) >= 10 and shorter in longer


def render_chapter(title, paras, image_urls):
    """Chapter HTML: centred bold title, then the body paragraphs."""
    blocks = []
    if title:
        blocks.append(f'<p style="text-align:center"><strong>{escape(title)}</strong></p>')
    first = True
    for para in paras:
        # The heading line is already rendered as the title above. The body may
        # print it in a different case ("6. KẾT LÔ CỘNG TU" for "6. Kết lô cộng
        # tu"), so compare without case or diacritics.
        if first and title and not para.get('images') and _is_same_heading(para['text'], title):
            first = False
            continue
        if para['text'].strip():
            first = False
        html = render_paragraph(para, image_urls)
        if html:
            blocks.append(html)
    return '\n'.join(blocks)


def summarize(paras, limit=220):
    """First real sentence(s) of the chapter, used as tom_tat."""
    for para in paras:
        text = para['text'].strip()
        if len(text) > 80 and not is_noise(text):
            summary = re.sub(r'\s+', ' ', text)
            return summary[:limit].rsplit(' ', 1)[0] + ('…' if len(summary) > limit else '')
    return ''
