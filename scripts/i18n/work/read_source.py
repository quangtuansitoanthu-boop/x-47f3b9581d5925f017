import json

path = r'D:\CA NHAN\A.WEB_HP\tutam-mobile\static\offline-data\chapters\tt_1781224598651_2_i3l0j.json'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

print('File length:', len(content))
data = json.loads(content)
print('Total chapters:', len(data))
for i, ch in enumerate(data):
    print(f'Ch {i}: id={ch["id"]}, title={ch["tieu_de"][:80]}')
    if i < 2:
        print(f'  Summary: {ch["tom_tat"][:200]}')
        print(f'  Content preview: {ch["noi_dung"][:300]}')
        print()

# Save to a temp file for easier reading
with open(r'D:\CA NHAN\A.WEB_HP\tutam-mobile\scripts\i18n\work\source_chapters.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print('Saved to source_chapters.json')