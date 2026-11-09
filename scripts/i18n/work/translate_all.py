import json
import sys

# Source Vietnamese chapters (already extracted)
src_path = r'D:\CA NHAN\A.WEB_HP\tutam-mobile\scripts\i18n\work\source_chapters.json'
# Target English file to update
dst_path = r'D:\CA NHAN\A.WEB_HP\tutam-mobile\static\offline-data\chapters-en\tt_1781224598651_2_i3l0j.json'

with open(src_path, 'r', encoding='utf-8') as f:
    src_chapters = json.load(f)

with open(dst_path, 'r', encoding='utf-8') as f:
    dst_chapters = json.load(f)

# Verify chapter count matches
assert len(src_chapters) == len(dst_chapters) == 20, f"Chapter count mismatch: src={len(src_chapters)}, dst={len(dst_chapters)}"

# Verify IDs match
for i, (src, dst) in enumerate(zip(src_chapters, dst_chapters)):
    assert src['id'] == dst['id'], f"ID mismatch at index {i}: src={src['id']}, dst={dst['id']}"
    assert src['so_thu_tu'] == dst['so_thu_tu'], f"so_thu_tu mismatch at index {i}"

print("Chapter structure verified. Proceeding with translation...")

# Translation function for {align:justify|...} markup
def translate_content(vi_text):
    """Translate Vietnamese content to English, preserving {align:justify|...} markup."""
    # Split by the markup pattern
    import re
    pattern = r'(\{align:justify\|.*?\})(?=\{align:justify\||\Z)'
    parts = re.findall(pattern, vi_text, re.DOTALL)
    
    if not parts:
        return vi_text
    
    translated_parts = []
    for part in parts:
        # Extract the text inside the markup
        match = re.match(r'\{align:justify\|(.*)\}', part, re.DOTALL)
        if match:
            inner_text = match.group(1)
            # Translate the inner text (we'll do this manually per chapter)
            translated_inner = inner_text  # Placeholder - will be replaced per chapter
            translated_parts.append(f'{{align:justify|{translated_inner}}}')
        else:
            translated_parts.append(part)
    
    return ''.join(translated_parts)

# Since we need high-quality translation, we'll define translations per chapter
# This is a placeholder - actual translations will be applied per chapter below

# For now, let's just verify the structure and print what needs translation
for i, (src, dst) in enumerate(zip(src_chapters, dst_chapters)):
    print(f"\nChapter {i} (id={src['id']}):")
    print(f"  VI Title: {src['tieu_de'][:80]}")
    print(f"  EN Title: {dst['tieu_de'][:80]}")
    print(f"  VI Summary: {src['tom_tat'][:100]}...")
    print(f"  EN Summary: {dst['tom_tat'][:100]}...")
    print(f"  VI Content len: {len(src['noi_dung'])}")
    print(f"  EN Content len: {len(dst['noi_dung'])}")

print("\n\nReady to apply translations. Will write updated target file.")