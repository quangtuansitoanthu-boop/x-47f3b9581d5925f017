import sys
import json

path = r'D:\CA NHAN\A.WEB_HP\tutam-mobile\static\offline-data\chapters\tt_1781224598651_2_i3l0j.json'

# Read first 10000 chars
with open(path, 'r', encoding='utf-8') as f:
    content = f.read(10000)

with open(r'D:\CA NHAN\A.WEB_HP\tutam-mobile\scripts\i18n\work\preview.txt', 'w', encoding='utf-8') as f:
    f.write(content[:5000])

print("Done writing preview", file=sys.stderr)