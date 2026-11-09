import json

with open(r'D:\CA NHAN\A.WEB_HP\tutam-mobile\static\offline-data\chapters\tt_1781224598651_2_i3l0j.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f'Total chapters: {len(data)}')
for i, ch in enumerate(data):
    print(f'Ch {i}: id={ch["id"]}, title={ch["tieu_de"][:80]}... content_len={len(ch["noi_dung"])}')
    if i < 3:
        print(f'  Summary: {ch["tom_tat"][:100]}...')
        print(f'  Content preview: {ch["noi_dung"][:200]}...')
        print()