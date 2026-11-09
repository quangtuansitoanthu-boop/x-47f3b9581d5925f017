import json

with open('D:/CA NHAN/A.WEB_HP/tutam-mobile/static/offline-data/chapters/tt_klngl_q06.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"Total chapters: {len(data)}")
for i, d in enumerate(data):
    print(f"Chapter {i}: id={d['id']}, so_thu_tu={d['so_thu_tu']}")
    print(f"  Title: {d['tieu_de']}")
    print(f"  Tom_tat length: {len(d['tom_tat'])}")
    print(f"  Content length: {len(d['noi_dung'])}")
    print()