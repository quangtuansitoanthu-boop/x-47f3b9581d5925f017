"""Extract structured paragraphs from a .docx into JSON.

Emits one record per paragraph with the formatting signals needed to rebuild
clean HTML and to detect chapter boundaries: alignment, dominant font size,
bold/italic ratio and inline runs. Word fonts are intentionally dropped -- the
reader applies the site typography instead.
"""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'


def rel_map(z):
    """Map relationship id -> media target for image resolution."""
    try:
        root = ET.fromstring(z.read('word/_rels/document.xml.rels'))
    except KeyError:
        return {}
    ns = '{http://schemas.openxmlformats.org/package/2006/relationships}'
    return {r.get('Id'): r.get('Target') for r in root.findall(f'{ns}Relationship')}


def run_props(rpr):
    """Read the formatting flags of a single run."""
    if rpr is None:
        return {'b': False, 'i': False, 'u': False, 'sz': None, 'color': None}
    def on(tag):
        el = rpr.find(f'{W}{tag}')
        return el is not None and el.get(f'{W}val') not in ('0', 'false', 'none')
    sz = rpr.find(f'{W}sz')
    color = rpr.find(f'{W}color')
    cval = color.get(f'{W}val') if color is not None else None
    return {
        'b': on('b'),
        'i': on('i'),
        'u': on('u'),
        # Word stores half-points; convert to pt.
        'sz': int(sz.get(f'{W}val')) / 2 if sz is not None and sz.get(f'{W}val', '').isdigit() else None,
        'color': cval if cval and cval.lower() not in ('auto', '000000') else None,
    }


def para_images(p, rels):
    """Collect image relationship targets referenced by a paragraph."""
    out = []
    for blip in p.iter(f'{A}blip'):
        rid = blip.get(f'{R}embed')
        if rid and rid in rels:
            out.append(rels[rid])
    for imagedata in p.iter('{urn:schemas-microsoft-com:vml}imagedata'):
        rid = imagedata.get(f'{R}id')
        if rid and rid in rels:
            out.append(rels[rid])
    return out


def extract(path):
    z = zipfile.ZipFile(path)
    rels = rel_map(z)
    root = ET.fromstring(z.read('word/document.xml'))
    body = root.find(f'{W}body')
    paras = []

    for p in body.iter(f'{W}p'):
        ppr = p.find(f'{W}pPr')
        align = None
        style = None
        if ppr is not None:
            jc = ppr.find(f'{W}jc')
            if jc is not None:
                align = jc.get(f'{W}val')
            ps = ppr.find(f'{W}pStyle')
            if ps is not None:
                style = ps.get(f'{W}val')

        runs = []
        for r in p.findall(f'{W}r'):
            props = run_props(r.find(f'{W}rPr'))
            text = ''
            for node in r:
                if node.tag == f'{W}t':
                    text += node.text or ''
                elif node.tag == f'{W}tab':
                    text += '\t'
                elif node.tag in (f'{W}br', f'{W}cr'):
                    text += '\n'
            if text:
                runs.append({**props, 't': text})

        text = ''.join(run['t'] for run in runs)
        images = para_images(p, rels)
        if not text.strip() and not images:
            continue

        sized = [run for run in runs if run['sz'] and run['t'].strip()]
        max_sz = max((run['sz'] for run in sized), default=None)
        chars = sum(len(run['t']) for run in runs if run['t'].strip()) or 1
        bold_chars = sum(len(run['t']) for run in runs if run['b'] and run['t'].strip())

        paras.append({
            'text': re.sub(r'[ \t ]+', ' ', text).strip(),
            'align': align,
            'style': style,
            'sz': max_sz,
            'bold_ratio': round(bold_chars / chars, 3),
            'images': images,
            'runs': runs,
        })
    return paras


if __name__ == '__main__':
    with open(sys.argv[2], 'w', encoding='utf-8') as f:
        json.dump(extract(sys.argv[1]), f, ensure_ascii=False)
    print(f'{sys.argv[1]}: paragraphs extracted', file=sys.stderr)
