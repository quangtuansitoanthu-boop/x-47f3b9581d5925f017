import sys

src_path = r'D:\CA NHAN\A.WEB_HP\tutam-mobile\static\offline-data\chapters\tt_1781224598651_2_i3l0j.json'

# Try reading in binary first
with open(src_path, 'rb') as f:
    content = f.read()

print(f'Bytes: {len(content)}', file=sys.stderr)
print(f'First 200 bytes: {content[:200]}', file=sys.stderr)

# Try decoding
try:
    text = content.decode('utf-8')
    print(f'Decoded OK, chars: {len(text)}', file=sys.stderr)
except Exception as e:
    print(f'Decode error: {e}', file=sys.stderr)
    # Try other encodings
    for enc in ['utf-8-sig', 'cp1258', 'latin-1']:
        try:
            text = content.decode(enc)
            print(f'Decoded with {enc}, chars: {len(text)}', file=sys.stderr)
            break
        except Exception as e2:
            print(f'  {enc} failed: {e2}', file=sys.stderr)

# Write first 10000 chars to a file
with open(r'D:\CA NHAN\A.WEB_HP\tutam-mobile\scripts\i18n\work\source_text.txt', 'w', encoding='utf-8') as f:
    f.write(text[:10000])

print('Wrote preview', file=sys.stderr)