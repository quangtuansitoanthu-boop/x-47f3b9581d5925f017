import json
import sys

with open(r'D:/CA NHAN/A.WEB_HP/tutam-mobile/static/offline-data/chapters/tt_1781224598651_2_i3l0j.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"Total chapters: {len(data)}")
for i, ch in enumerate(data):
    print(f'{i}: id={ch["id"]}, so_thu_tu={ch["so_thu_tu"]}, title={ch["tieu_de"][:80]}')