"""Extract structured paragraphs from a legacy .doc into the same JSON shape
as docx-extract.py, by way of `textutil -convert html`.

textutil emits per-paragraph CSS classes (font size, alignment, colour), so the
class table is parsed first and then applied to each <p>.
"""
import json
import re
import subprocess
import sys
from html.parser import HTMLParser
from html import unescape

INLINE_BOLD = {'b', 'strong'}
INLINE_ITALIC = {'i', 'em'}


def class_table(css):
    """Map textutil's generated p.pN / span.sN classes to formatting props."""
    table = {}
    for name, body in re.findall(r'(?:p|span|li)\.(\w+)\s*\{([^}]*)\}', css):
        props = {'sz': None, 'align': None, 'color': None, 'b': False, 'i': False}
        font = re.search(r'font:\s*([^;]*)', body)
        if font:
            spec = font.group(1)
            size = re.search(r'(\d+(?:\.\d+)?)px', spec)
            if size:
                props['sz'] = float(size.group(1))
            if re.search(r'\bbold\b', spec):
                props['b'] = True
            if re.search(r'\bitalic\b', spec):
                props['i'] = True
        size = re.search(r'font-size:\s*(\d+(?:\.\d+)?)px', body)
        if size:
            props['sz'] = float(size.group(1))
        if re.search(r'font-weight:\s*(bold|[6-9]00)', body):
            props['b'] = True
        align = re.search(r'text-align:\s*(\w+)', body)
        if align:
            props['align'] = align.group(1)
        color = re.search(r'(?<!background-)color:\s*#([0-9a-fA-F]{6})', body)
        if color and color.group(1).lower() != '000000':
            props['color'] = color.group(1)
        table[name] = props
    return table


class DocParser(HTMLParser):
    def __init__(self, table):
        super().__init__(convert_charrefs=True)
        self.table = table
        self.paras = []
        self.para = None
        self.bold = 0
        self.italic = 0
        self.underline = 0
        self.span = []

    def _props(self, attrs):
        cls = dict(attrs).get('class', '')
        for name in cls.split():
            if name in self.table:
                return self.table[name]
        return {'sz': None, 'align': None, 'color': None, 'b': False, 'i': False}

    def handle_starttag(self, tag, attrs):
        if tag in ('p', 'li', 'h1', 'h2', 'h3'):
            self.para = {'props': self._props(attrs), 'runs': [], 'images': []}
        elif tag == 'span' and self.para is not None:
            self.span.append(self._props(attrs))
        elif tag in INLINE_BOLD:
            self.bold += 1
        elif tag in INLINE_ITALIC:
            self.italic += 1
        elif tag == 'u':
            self.underline += 1
        elif tag == 'br' and self.para is not None:
            self.para['runs'].append({'t': '\n', 'b': False, 'i': False, 'u': False, 'sz': None, 'color': None})
        elif tag == 'img' and self.para is not None:
            src = dict(attrs).get('src')
            if src:
                self.para['images'].append(src)

    def handle_endtag(self, tag):
        if tag in ('p', 'li', 'h1', 'h2', 'h3'):
            self._flush()
        elif tag == 'span' and self.span:
            self.span.pop()
        elif tag in INLINE_BOLD:
            self.bold = max(0, self.bold - 1)
        elif tag in INLINE_ITALIC:
            self.italic = max(0, self.italic - 1)
        elif tag == 'u':
            self.underline = max(0, self.underline - 1)

    def handle_data(self, data):
        if self.para is None or not data:
            return
        span = self.span[-1] if self.span else {}
        base = self.para['props']
        self.para['runs'].append({
            't': data,
            'b': bool(self.bold) or span.get('b', base.get('b')),
            'i': bool(self.italic) or span.get('i', base.get('i')),
            'u': bool(self.underline),
            'sz': span.get('sz') or base.get('sz'),
            'color': span.get('color') or base.get('color'),
        })

    def _flush(self):
        if self.para is None:
            return
        para, self.para = self.para, None
        text = ''.join(run['t'] for run in para['runs'])
        if not text.strip() and not para['images']:
            return
        sized = [run for run in para['runs'] if run['sz'] and run['t'].strip()]
        chars = sum(len(run['t']) for run in para['runs'] if run['t'].strip()) or 1
        bold_chars = sum(len(run['t']) for run in para['runs'] if run['b'] and run['t'].strip())
        self.paras.append({
            'text': re.sub(r'[ \t ]+', ' ', text).strip(),
            'align': para['props'].get('align'),
            'style': None,
            'sz': max((run['sz'] for run in sized), default=None),
            'bold_ratio': round(bold_chars / chars, 3),
            'images': para['images'],
            'runs': para['runs'],
        })


def extract(path):
    html = subprocess.run(
        ['textutil', '-convert', 'html', '-stdout', path],
        capture_output=True, check=True,
    ).stdout.decode('utf8', 'replace')
    css = re.search(r'<style[^>]*>(.*?)</style>', html, re.S)
    parser = DocParser(class_table(css.group(1) if css else ''))
    parser.feed(html)
    parser._flush()
    return parser.paras


if __name__ == '__main__':
    json.dump(extract(sys.argv[1]), open(sys.argv[2], 'w'), ensure_ascii=False)
    print(f'{sys.argv[1]}: paragraphs extracted', file=sys.stderr)
