"""Decode legacy Vietnamese text encodings (VNI-Windows, TCVN3) to Unicode.

Some of the source books were produced from VNI- or TCVN3-encoded originals,
so their text arrives as sequences like "Hoøa Thöôïng" instead of
"Hòa Thượng". Decoding is applied per paragraph and only when the paragraph
actually looks encoded, so already-correct Unicode text is left untouched.
"""
import re
import unicodedata

# --- VNI-Windows -------------------------------------------------------------
# A base vowel is followed by a modifier character carrying the diacritics.
_TONES = ['acute', 'grave', 'hook', 'tilde', 'dot']

# Tone rows are ordered a, e, i, o, u, y / plain, circumflex, breve, horn.
_PLAIN = {
    'a': 'áàảãạ', 'e': 'éèẻẽẹ', 'i': 'íìỉĩị', 'o': 'óòỏõọ',
    'u': 'úùủũụ', 'y': 'ýỳỷỹỵ', 'ơ': 'ớờởỡợ', 'ư': 'ứừửữự',
}
_CIRCUMFLEX = {'a': 'ấầẩẫậ', 'e': 'ếềểễệ', 'o': 'ốồổỗộ'}
_BREVE = {'a': 'ắằẳẵặ'}

_MOD_PLAIN = dict(zip('ùøûõï', _TONES))
_MOD_CIRC = dict(zip('áàåãä', _TONES))
_MOD_BREVE = dict(zip('éèúüë', _TONES))

_BASE_MARK = {'â': ('circumflex', {'a': 'â', 'e': 'ê', 'o': 'ô'}), 'ê': ('breve', {'a': 'ă'})}

_SINGLE = {'ñ': 'đ', 'Ñ': 'Đ', 'ö': 'ư', 'Ö': 'Ư', 'ô': 'ơ', 'Ô': 'Ơ',
           'ó': 'ĩ', 'æ': 'ỉ', 'ò': 'ị', 'î': 'ỵ', 'ì': 'ì', 'í': 'í'}


def _build_vni():
    """Build the (base, modifier) -> composed character table, both cases."""
    table = {}
    for base, forms in _PLAIN.items():
        for mod, tone in _MOD_PLAIN.items():
            table[(base, mod)] = forms[_TONES.index(tone)]
    for base, forms in _CIRCUMFLEX.items():
        for mod, tone in _MOD_CIRC.items():
            table[(base, mod)] = forms[_TONES.index(tone)]
    for base, forms in _BREVE.items():
        for mod, tone in _MOD_BREVE.items():
            table[(base, mod)] = forms[_TONES.index(tone)]
    for mod, (_kind, mapping) in _BASE_MARK.items():
        for base, composed in mapping.items():
            table[(base, mod)] = composed
    # Uppercase base + uppercase modifier, and uppercase base + lowercase modifier.
    upper = {}
    for (base, mod), composed in table.items():
        upper[(base.upper(), mod.upper())] = composed.upper()
        upper[(base.upper(), mod)] = composed.upper()
    table.update(upper)
    return table


_VNI = _build_vni()
# ơ/ư are written as ô/ö before the tone modifier is applied.
_VNI_BASE_ALIAS = {'ô': 'ơ', 'Ô': 'Ơ', 'ö': 'ư', 'Ö': 'Ư'}
_VNI_MODS = set('ùøûõïáàåãäéèúüëâê') | set('ÙØÛÕÏÁÀÅÃÄÉÈÚÜËÂÊ')


def decode_vni(text):
    out = []
    i = 0
    while i < len(text):
        ch = text[i]
        base = _VNI_BASE_ALIAS.get(ch, ch)
        if i + 1 < len(text) and text[i + 1] in _VNI_MODS:
            composed = _VNI.get((base, text[i + 1]))
            if composed:
                out.append(composed)
                i += 2
                continue
        out.append(_SINGLE.get(ch, base if ch in _VNI_BASE_ALIAS else ch))
        i += 1
    return ''.join(out)


# --- .VnTime / ABC family ----------------------------------------------------
# A handful of mantra blocks were typed in a legacy Vietnamese display font and
# stored as its raw glyph codes. The mapping below is derived from those blocks.
_LEGACY_GLYPHS = {
    'Ç': 'đ', 'ñ': 'đ', 'Œ': 'ệ', 'Ù': 'ứ', 'Æ': 'ậ', 'Î': 'ị',
    '¶': 'ộ', 'å': 'ạ', 'æ': 'ă', '¢': 'ằ', '»': 'ữ', 'Ã': 'ấ',
    'û': 'ủ', 'Ü': 'ư', 'ª': 'ở', '°': 'ổ', 'Š': 'ề', 'Ì': 'ả',
    'ä': 'á', 'Ï': 'ỉ', 'È': 'ẽ', 'Ø': 'ừ', 'Õ': 'ũ', 'Ê': 'ẻ',
    '†': 'ọ', '§': 'ớ', '©': 'ờ', '‰': 'ế', 'Ò': 'ồ', 'Ó': 'ố',
}


def decode_legacy_glyphs(text):
    return ''.join(_LEGACY_GLYPHS.get(ch, ch) for ch in text)


# --- Detection ---------------------------------------------------------------
# ô/ö stand for ơ/ư in VNI, so they count as bases that a modifier can follow.
_VNI_SIGNATURE = re.compile(r'[aeouyôöAEOUYÔÖ][ùøûõïáàåãäéèúüëâê]')
_TCVN3_SIGNATURE = re.compile(r'[\xa1-\xc3\xc8-\xef]')
_VIET_OK = re.compile(
    r'[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]', re.I)


def detect_encoding(text):
    """Classify a whole document; per-paragraph signal is too sparse to trust."""
    sample = text[:400_000]
    if not sample:
        return 'unicode'
    vni = len(_VNI_SIGNATURE.findall(sample))
    native = len(_VIET_OK.findall(sample))
    # Correct Unicode Vietnamese is dense in native characters; VNI has almost none.
    if vni > 200 and vni > native:
        return 'vni'
    return 'unicode'


# Characters that are neither valid Vietnamese nor VNI modifiers. Uppercase
# Vietnamese legitimately uses À Á Ã È Ì Ò Ó Õ Ù, so those can never be the
# evidence for this encoding -- "LÃO HÒA THƯỢNG" must stay untouched.
_LEGACY_MARKERS = set('¶»¢Šª†§©‰ŒÆÇÎØ°')


def looks_legacy_glyphs(text):
    """Detect a legacy-font block, which may sit inside a correct document.

    Requires at least one character that cannot occur in correct Vietnamese,
    so ordinary uppercase text is never mistaken for an encoded block.
    """
    if not any(ch in _LEGACY_MARKERS for ch in text):
        return False
    hits = sum(1 for ch in text if ch in _LEGACY_GLYPHS)
    if hits < 3:
        return False
    # In VNI the same characters act as modifiers directly after a base vowel.
    return hits > len(_VNI_SIGNATURE.findall(text))


def paragraph_mode(text, encoding):
    """Decide how one paragraph is encoded, given the document's verdict.

    Legacy-font blocks also occur inside VNI documents, so a paragraph is
    checked on its own before falling back to the document-wide verdict.
    """
    if looks_legacy_glyphs(text):
        return 'legacy'
    return 'vni' if encoding == 'vni' else 'plain'


def decode_text(text, mode):
    """Apply one paragraph's decoding; safe to reuse for each of its runs."""
    if mode == 'vni':
        text = decode_vni(text)
    elif mode == 'legacy':
        text = decode_legacy_glyphs(text)
    text = text.replace('\u01a3', 'ư').replace('\u01a2', 'Ư')
    return unicodedata.normalize('NFC', text)


def decode_document(paragraph_texts):
    """Decode a document's paragraphs, choosing the encoding once for all.

    Returns the per-paragraph modes as well, so a caller can decode the runs
    that make up each paragraph exactly the same way.
    """
    encoding = detect_encoding(' '.join(paragraph_texts))
    modes = [paragraph_mode(text, encoding) for text in paragraph_texts]
    out = [decode_text(text, mode) for text, mode in zip(paragraph_texts, modes)]
    return encoding, out, modes
