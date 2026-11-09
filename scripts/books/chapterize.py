"""Split a document's paragraph stream into chapters.

Three detectors are tried and the best-scoring result wins:
  separator  -- "---o0o---" dividers used by the quangduc.com ebook family
  heading    -- short bold/oversized lines standing above the body text
  pattern    -- explicit "Chương/Phần/Câu chuyện N" markers

Front matter and the source table of contents are dropped first: the TOC would
otherwise register as dozens of spurious one-line chapters.
"""
import re
import statistics

SEPARATOR = re.compile(r'^[\s\-\u2013\u2014•*=_]*[o0](?:\s*[o0]){2}[\s\-\u2013\u2014•*=_]*$', re.I)
TOC_HEADING = re.compile(r'^\s*(mục\s*lục|muc\s*luc|nội\s*dung|table\s+of\s+contents)\s*$', re.I)
CHAPTER_PATTERN = re.compile(
    r'^\s*(chương|chưong|phần|phẩm|thiên|quyển|tập|câu\s*chuyện|truyện|bài|mục|tiết|đoạn)'
    r'\s+(thứ\s+)?([0-9]+|[ivxlcdm]+|một|hai|ba|bốn|tư|năm|sáu|bảy|tám|chín|mười'
    r'|nhất|nhị|tam|tứ|ngũ|lục|thất|bát|cửu|thập)\b',
    re.I)
NUMBERED = re.compile(r'^\s*(\d{1,3})\s*[.)\-–]\s*\S')
# Word field codes survive textutil conversion of legacy .doc files.
FIELD_CODE = re.compile(r'\b(HYPERLINK|PAGEREF|TOC|SEQ|REF|EMBED|INCLUDEPICTURE)\b[^\n]*?(?=\s|$)')
SENTENCE_END = re.compile(r'[.;:,]\s*$')


def clean_text(text):
    """Strip Word field-code noise and collapse whitespace."""
    text = re.sub(r'HYPERLINK\s+(\\l\s+)?"[^"]*"', ' ', text)
    text = re.sub(r'TOC\s+\\[^\n]*', ' ', text)
    text = re.sub(r'PAGEREF\s+\S+(\s+\\\S+)*', ' ', text)
    text = re.sub(r'\\[a-z]\b', ' ', text)
    text = re.sub(r'\s{2,}', ' ', text)
    return text.strip()


def body_font_size(paras):
    """The dominant size of running text, used as the heading baseline."""
    sizes = [p['sz'] for p in paras if p['sz'] and len(p['text']) > 200]
    if not sizes:
        sizes = [p['sz'] for p in paras if p['sz'] and len(p['text']) > 80]
    return statistics.median(sizes) if sizes else None


def find_body_start(paras):
    """Skip front matter and the source TOC block."""
    # A heading near the end is back matter; skipping to it would drop the book.
    limit = len(paras) * 0.8
    toc_index = next((i for i, p in enumerate(paras)
                      if TOC_HEADING.match(p['text']) and i < limit), None)
    if toc_index is None:
        return 0
    # The TOC runs until a long running-text paragraph or a separator appears.
    for i in range(toc_index + 1, min(len(paras), toc_index + 400)):
        text = paras[i]['text']
        if SEPARATOR.match(text):
            return i + 1
        if len(text) > 300:
            return i
    return toc_index + 1


def is_heading(para, base_size, index, paras):
    """A heading is short, visually promoted, and followed by running text."""
    text = para['text']
    if not (2 < len(text) <= 130) or para['images']:
        return False
    if SENTENCE_END.search(text) or DATE_LINE.match(text):
        return False
    # Continuation fragments and closing quotes are not chapter openings.
    if text[:1].islower() or text[-1:] in '”"\u2019!?':
        return False
    bigger = base_size and para['sz'] and para['sz'] > base_size + 0.4
    bold = para['bold_ratio'] > 0.85
    centered = para['align'] == 'center'
    if not (bigger or (bold and (centered or len(text) < 90))):
        return False
    # Require running text nearby so captions and verse lines are not promoted.
    return any(len(paras[j]['text']) > 160 for j in range(index + 1, min(len(paras), index + 8)))


PAGE_NUMBER = re.compile(r'^\d{1,4}$')
SECTION_NUMBER = re.compile(r'^(\d{1,3})[.)]$')


def strip_page_numbers(paras):
    """Drop the running page numbers Word leaves as standalone paragraphs.

    Only a paragraph that is nothing but bare digits qualifies, so years such
    as "(1953)" or "- 2012 -" and list markers like "1." are left alone.
    """
    return [p for p in paras
            if not (PAGE_NUMBER.match(p['text'].strip()) and not p['images'])]


def merge_section_numbers(paras):
    """Rejoin a lone "1." with the heading that follows it."""
    out = []
    index = 0
    while index < len(paras):
        para = paras[index]
        match = SECTION_NUMBER.match(para['text'].strip())
        follows = paras[index + 1] if index + 1 < len(paras) else None
        if match and follows and 2 < len(follows['text']) <= 130 and not para['images']:
            joined = dict(follows)
            joined['text'] = f"{match.group(1)}. {follows['text']}"
            joined['runs'] = [{'t': f"{match.group(1)}. ", 'b': True, 'i': False,
                               'u': False, 'sz': None, 'color': None}] + list(follows.get('runs', []))
            out.append(joined)
            index += 2
            continue
        out.append(para)
        index += 1
    return out


TOC_LINE = re.compile(r'/\\s*\\d{1,4}\\s*$')
SENTENCE_CLOSE = re.compile(r'[.!?:;\u2026\u00bb"\u201d\'\)\]]\s*$')


def join_wrapped_paragraphs(paras):
    """Rejoin a sentence that the source split across two paragraphs.

    Documents converted from scans or PDFs often end a paragraph at the page
    edge, so a sentence continues in the next one. Only long, body-aligned
    paragraphs that do not close a sentence are joined, and only to a
    continuation that starts lower-case, so verse lines and headings are left
    intact.
    """
    out = []
    for para in paras:
        previous = out[-1] if out else None
        text = para['text']
        if (previous
                and not previous['images'] and not para['images']
                and len(previous['text']) > 60
                and len(text) > 40
                and not TOC_LINE.search(previous['text'])
                and not TOC_LINE.search(text)
                and not SENTENCE_CLOSE.search(previous['text'])
                and previous.get('align') not in ('center', 'right')
                and para.get('align') not in ('center', 'right')
                and text[:1].islower()):
            joined = dict(previous)
            joined['text'] = f"{previous['text']} {text}"
            joined['runs'] = list(previous.get('runs', [])) + \
                [{'t': ' ', 'b': False, 'i': False, 'u': False, 'sz': None, 'color': None}] + \
                list(para.get('runs', []))
            out[-1] = joined
            continue
        out.append(para)
    return out


DROP_CAP = re.compile(r'^[A-ZĐÀÁẢÃẠÂẤẦẨẪẬĂẮẰẲẴẶÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴ]$')
DATE_LINE = re.compile(r'^\s*(giảng|thuyết|khai thị|ghi|dịch)\b.{0,40}\b(ngày|năm|tháng)\b', re.I)


def merge_drop_caps(paras):
    """Word drop caps sit in their own paragraph; rejoin them with their text."""
    out = []
    index = 0
    while index < len(paras):
        para = paras[index]
        follows = paras[index + 1] if index + 1 < len(paras) else None
        if (DROP_CAP.match(para['text'].strip()) and follows
                and follows['text'][:1].islower()):
            joined = dict(follows)
            joined['text'] = para['text'].strip() + follows['text']
            out.append(joined)
            index += 2
            continue
        out.append(para)
        index += 1
    return out


def merge_small_chapters(chapters, minimum=900):
    """Fold stub sections into the previous chapter to undo over-splitting."""
    merged = []
    for chapter in chapters:
        size = sum(len(p['text']) for p in chapter['paras'])
        if merged and size < minimum:
            merged[-1]['paras'].extend(chapter['paras'])
            continue
        merged.append({'title': chapter['title'], 'paras': list(chapter['paras'])})
    return merged


def _slice(paras, starts, titles):
    chapters = []
    for n, start in enumerate(starts):
        end = starts[n + 1] if n + 1 < len(starts) else len(paras)
        body = paras[start:end]
        if not body:
            continue
        chapters.append({'title': titles[n], 'paras': body})
    return chapters


def by_separator(paras, base_size):
    marks = [i for i, p in enumerate(paras) if SEPARATOR.match(p['text'])]
    if len(marks) < 3:
        return None
    starts, titles = [], []
    for mark in marks:
        head = mark + 1
        while head < len(paras) and not paras[head]['text']:
            head += 1
        if head >= len(paras):
            continue
        starts.append(head)
        titles.append(paras[head]['text'][:130])
    return _slice(paras, starts, titles) if len(starts) >= 3 else None


def by_heading(paras, base_size):
    starts = [i for i, p in enumerate(paras) if is_heading(p, base_size, i, paras)]
    if len(starts) < 3:
        return None
    return _slice(paras, starts, [paras[i]['text'][:130] for i in starts])


def by_pattern(paras, base_size):
    starts = [i for i, p in enumerate(paras)
              if CHAPTER_PATTERN.match(p['text']) and len(p['text']) <= 130]
    if len(starts) < 3:
        return None
    return _slice(paras, starts, [paras[i]['text'][:130] for i in starts])


def score(chapters):
    """Prefer a moderate number of chapters with evenly distributed, real text."""
    if not chapters:
        return -1
    lengths = [sum(len(p['text']) for p in c['paras']) for c in chapters]
    total = sum(lengths)
    if total == 0:
        return -1
    count = len(chapters)
    tiny = sum(1 for length in lengths if length < 400)
    huge = max(lengths) / total
    penalty = (tiny / count) * 1.4 + max(0.0, huge - 0.45) * 2.0
    ideal = 1.0 - abs(min(count, 80) - 30) / 90
    return ideal - penalty


# --- Table-of-contents driven detection --------------------------------------
import unicodedata

PAGE_TAIL = re.compile(r'\s*[.\u2026\-\s]*\s*\d{1,4}\s*$')


def _fold(text):
    """Normalise for matching: drop diacritics, punctuation and case.

    Old Vietnamese fonts write Đ as Eth (Ð/ð), so those fold to "d" as well;
    otherwise a table-of-contents entry never matches its own heading.
    """
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    for source in ('\u0111', '\u0110', '\u00f0', '\u00d0'):
        text = text.replace(source, 'd')
    return re.sub(r'[^a-z0-9]+', '', text.lower())


def _toc_entries(paras):
    """Read the source table of contents into a list of chapter titles."""
    start = next((i for i, p in enumerate(paras) if TOC_HEADING.match(p['text'])), None)
    if start is None:
        return None, None
    rows, index = [], start + 1
    gap = 0
    while index < len(paras) and gap < 25:
        text = paras[index]['text']
        # Running text means the TOC block has ended.
        if len(text) > 300 or (len(text) > 160 and SENTENCE_END.search(text)):
            break
        candidate = PAGE_TAIL.sub('', text).strip(' .\u2026-\u2013\u2014')
        if len(candidate) >= 3 and not SEPARATOR.match(text):
            # An entry ending in a page number is complete; one without it is a
            # long title that wrapped onto the next line.
            rows.append((index, candidate, bool(PAGE_TAIL.search(text))))
            gap = 0
        else:
            gap += 1
        index += 1

    # Wrap-joining only makes sense when this TOC actually prints page numbers;
    # in a TOC without them every entry would otherwise be joined into one.
    numbered = sum(1 for _, _, complete in rows if complete)
    if numbered < len(rows) * 0.6:
        rows = [(position, title, True) for position, title, _ in rows]

    entries, pending = [], None
    for position, title, complete in rows:
        if pending:
            position, title = pending[0], f'{pending[1]} {title}'
            pending = None
        if complete:
            entries.append((position, title))
        else:
            pending = (position, title)
    if pending:
        entries.append(pending)

    seen, unique = set(), []
    for position, title in entries:
        key = _fold(title)
        if key and key not in seen:
            seen.add(key)
            unique.append((position, title))
    return unique, start


def by_toc(paras, base_size):
    entries, toc_start = _toc_entries(paras)
    if not entries or len(entries) < 3:
        return None
    last = entries[-1][0]
    # A TOC at the very end of the file describes the text that precedes it.
    trailing = last > len(paras) * 0.8
    search_from, search_to = (0, entries[0][0]) if trailing else (last + 1, len(paras))

    folded = [(i, _fold(p['text'])) for i, p in enumerate(paras[search_from:search_to], search_from)]
    starts, titles, cursor, truncated = [], [], 0, 0
    for _, title in entries:
        key = _fold(title)
        if len(key) < 4:
            continue
        for position in range(cursor, len(folded)):
            index, text = folded[position]
            # A heading is often a shortened form of its own TOC entry
            # ("Kệ và giảng giải" for "Chú Lăng Nghiêm kệ và giảng giải").
            if (text.startswith(key[:60])
                    or (len(key) > 12 and key[:40] in text)
                    or (len(text) >= 8 and key.endswith(text))):
                heading = paras[index]['text'][:130]
                # Multi-column contents pages extract as cut-off entries. The
                # heading in the body carries the full title, so prefer it, and
                # count how often the entry was the shorter of the two.
                if text.startswith(key) and len(text) > len(key) + 4:
                    truncated += 1
                    title = heading
                starts.append(index)
                titles.append(title)
                cursor = position + 1
                break

    # A contents page that is mostly cut-off entries is not usable evidence;
    # the body's own headings describe the book better.
    if starts and truncated > len(starts) * 0.3:
        return None
    # Require most of the TOC to be found, otherwise the TOC is unusable
    # (multi-column merges produce entries that exist nowhere in the body).
    if len(starts) < 3 or len(starts) < len(entries) * 0.55:
        return None
    ordered = sorted(range(len(starts)), key=lambda n: starts[n])
    starts = [starts[n] for n in ordered]
    titles = [titles[n] for n in ordered]
    if trailing:
        return _slice(paras[:entries[0][0]], starts, titles)
    return _slice(paras, starts, titles)


def split_oversized(chapters, limit=45_000):
    """Break a chapter that is too long to read comfortably into parts.

    Some sources (aphorism collections) carry no headings at all, so an
    otherwise correct pass can leave a single enormous chapter behind. The
    limit also keeps each row's INSERT under D1's per-statement size cap.
    """
    out = []
    for chapter in chapters:
        size = sum(len(p['text']) for p in chapter['paras'])
        if size <= limit:
            out.append(chapter)
            continue
        parts = max(2, -(-size // limit))
        target = size / parts
        bucket, running, index = [], 0, 1
        for para in chapter['paras']:
            bucket.append(para)
            running += len(para['text'])
            # Emit a part once it reaches its share, keeping the last for the tail.
            if running >= target and index < parts:
                title = chapter['title'] or 'Nội dung'
                out.append({'title': f'{title} — Phần {index}', 'paras': bucket})
                bucket, running, index = [], 0, index + 1
        if bucket:
            title = chapter['title'] or 'Nội dung'
            label = f'{title} — Phần {index}' if index > 1 else title
            out.append({'title': label, 'paras': bucket})
    return out


def _opening_chapter(dropped, minimum=1200):
    """Recover body text that sits before the first detected chapter.

    Starts at the last heading-like line that precedes the running text, so the
    recovered chapter gets a real title instead of the cover page.
    """
    prose = [i for i, p in enumerate(dropped) if len(p['text']) > 160]
    if not prose or sum(len(dropped[i]['text']) for i in prose) < minimum:
        return None
    first = prose[0]
    # Walk back to the nearest short line, which is the section's own heading.
    start = first
    for index in range(first - 1, max(-1, first - 4), -1):
        text = dropped[index]['text']
        if 2 < len(text) <= 130 and not SENTENCE_END.search(text):
            start = index
            break
    paras = dropped[start:]
    title = paras[0]['text'][:130] if len(paras[0]['text']) <= 130 else 'Mở đầu'
    return {'title': title, 'paras': paras}


def chapterize(paras):
    paras = [dict(p, text=clean_text(p['text'])) for p in paras]
    paras = [p for p in paras if p['text'] or p['images']]
    paras = strip_page_numbers(paras)
    paras = merge_drop_caps(paras)
    paras = merge_section_numbers(paras)
    start = find_body_start(paras)
    front, body = paras[:start], paras[start:]
    base_size = body_font_size(body)

    best, best_name, best_score = None, 'single', -1
    for name, detector in (('toc', by_toc), ('separator', by_separator),
                           ('heading', by_heading), ('pattern', by_pattern)):
        # by_toc needs the untrimmed stream: the TOC itself is its input.
        found = detector(paras if name == 'toc' else body, base_size)
        if not found:
            continue
        found = merge_small_chapters(found)
        # Every strategy is judged on an evenly divided shape, so that a
        # correct split containing one naturally huge section is not beaten
        # by a wrong but tidy-looking one.
        balanced = split_oversized(found)
        value = score(balanced)
        # TOC evidence comes from the author, so it outranks the heuristics.
        # Its sections are also kept whole: the book's own contents page
        # decides the chapter list, not our size heuristic.
        if name == 'toc':
            value += 0.5
        # The book's own structure decides the chapter list. Splitting by size
        # is only a fallback for a document with no headings at all, so a
        # detected chapter is kept whole here; the storage limit may divide it
        # later, and only if keeping it whole would actually lose text.
        candidate = found
        if value > best_score:
            best, best_name, best_score = candidate, name, value

    if not best:
        # Nothing structural was found, so size is the only available boundary.
        best, best_name = split_oversized([{'title': '', 'paras': body}]), 'single'

    # Whatever precedes the first detected chapter is normally a cover page and
    # the contents list, which are dropped on purpose. When it holds real
    # running text as well, that text is book content and is kept as an
    # opening chapter rather than silently discarded.
    for chapter in best:
        body_paras = chapter['paras']
        if len(body_paras) > 2:
            chapter['paras'] = body_paras[:1] + join_wrapped_paragraphs(body_paras[1:])

    dropped = paras[:paras.index(best[0]['paras'][0])] if best and best[0]['paras'] else []
    opening = _opening_chapter(dropped)
    if opening:
        best = [opening] + best
        front = dropped[:dropped.index(opening['paras'][0])]
    else:
        front = dropped
    return {'strategy': best_name, 'score': round(best_score, 3), 'front': front, 'chapters': best}
