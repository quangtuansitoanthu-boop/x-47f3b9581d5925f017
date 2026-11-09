import json
import sys

src_path = r'D:\CA NHAN\A.WEB_HP\tutam-mobile\static\offline-data\chapters\tt_1781224598651_2_i3l0j.json'
dst_path = r'D:\CA NHAN\A.WEB_HP\tutam-mobile\scripts\i18n\work\source_chapters.json'

with open(src_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

with open(dst_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f'Extracted {len(data)} chapters to {dst_path}', file=sys.stderr)
for i, ch in enumerate(data):
    print(f'Ch {i}: id={ch["id"]}, title={ch["tieu_de"][:80]}', file=sys.stderr)