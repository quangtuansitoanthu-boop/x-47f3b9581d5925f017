import json
import sys

with open(r'D:/CA NHAN/A.WEB_HP/tutam-mobile/static/offline-data/chapters/tt_1781224598651_2_i3l0j.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for i, ch in enumerate(data):
    fn = f'D:/CA NHAN/A.WEB_HP/tutam-mobile/scripts/i18n/work/ch{i}_proper.json'
    with open(fn, 'w', encoding='utf-8') as out:
        json.dump(ch, out, ensure_ascii=False, indent=2)
    print(f'Saved chapter {i}')

print(f'Total chapters: {len(data)}')