import json
import sys

src_path = r'D:\CA NHAN\A.WEB_HP\tutam-mobile\scripts\i18n\work\source_chapters.json'
dst_path = r'D:\CA NHAN\A.WEB_HP\tutam-mobile\static\offline-data\chapters-en\tt_1781224598651_2_i3l0j.json'

with open(src_path, 'r', encoding='utf-8') as f:
    src_chapters = json.load(f)

with open(dst_path, 'r', encoding='utf-8') as f:
    dst_chapters = json.load(f)

# Write verification to file
with open(r'D:\CA NHAN\A.WEB_HP\tutam-mobile\scripts\i18n\work\verify.txt', 'w', encoding='utf-8') as f:
    f.write(f"Source chapters: {len(src_chapters)}\n")
    f.write(f"Target chapters: {len(dst_chapters)}\n\n")
    for i, (src, dst) in enumerate(zip(src_chapters, dst_chapters)):
        f.write(f"Chapter {i} (id={src['id']}):\n")
        f.write(f"  VI Title: {src['tieu_de'][:80]}\n")
        f.write(f"  EN Title: {dst['tieu_de'][:80]}\n")
        f.write(f"  VI Summary: {src['tom_tat'][:100]}...\n")
        f.write(f"  EN Summary: {dst['tom_tat'][:100]}...\n")
        f.write(f"  VI Content len: {len(src['noi_dung'])}\n")
        f.write(f"  EN Content len: {len(dst['noi_dung'])}\n\n")

print("Verification written to file", file=sys.stderr)