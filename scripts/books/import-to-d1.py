"""Generate the D1 statements that replace each book's chapters.

For every payload: refresh the baiviet row's table-of-contents fields, drop the
existing tap_noi_dung rows and insert the freshly converted chapters. Book ids,
view counts and comments are preserved, so existing links keep working.
"""
import glob
import json
import os
import sys
from datetime import datetime, timezone


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


# D1 rejects an oversized statement (SQLITE_TOOBIG), so a long chapter is
# inserted as a first slice and then appended to in further statements.
CHUNK = 60_000


def statements(payload, book_id, now):
    book = payload['book']
    yield (f"UPDATE baiviet SET has_muc_luc = 1, so_tap = {book['so_tap']}, "
           f"tap_tieu_de = {quote(json.dumps(book['tap_tieu_de'], ensure_ascii=False))}, "
           f"updated_at = {quote(now)} WHERE id = {quote(book_id)};")
    yield f"DELETE FROM tap_noi_dung WHERE bai_viet_id = {quote(book_id)};"
    for chapter in payload['chapters']:
        content = chapter['noi_dung']
        head, rest = content[:CHUNK], content[CHUNK:]
        yield ("INSERT INTO tap_noi_dung "
               "(bai_viet_id, so_thu_tu, tieu_de, tom_tat, noi_dung, updated_at) VALUES ("
               f"{quote(book_id)}, {chapter['so_thu_tu']}, {quote(chapter['tieu_de'])}, "
               f"{quote(chapter['tom_tat'])}, {quote(head)}, {quote(now)});")
        for start in range(0, len(rest), CHUNK):
            piece = rest[start:start + CHUNK]
            yield ("UPDATE tap_noi_dung SET noi_dung = noi_dung || "
                   f"{quote(piece)} WHERE bai_viet_id = {quote(book_id)} "
                   f"AND so_thu_tu = {chapter['so_thu_tu']};")


def main():
    payload_dir, sql_dir, id_map_path = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(sql_dir, exist_ok=True)
    id_map = json.load(open(id_map_path))
    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')

    missing = []
    claimed = {}
    for path in sorted(glob.glob(os.path.join(payload_dir, '*.json'))):
        if path.endswith('_report.json'):
            continue
        payload = json.load(open(path))
        title = payload['book']['tieu_de']
        book_id = payload['book'].get('id') or id_map.get(title)
        if not book_id:
            missing.append(title)
            continue
        # Two books resolving to one id would overwrite a book with another's text.
        if book_id in claimed:
            print(f'ABORT: {title} and {claimed[book_id]} both resolve to {book_id}', file=sys.stderr)
            sys.exit(1)
        claimed[book_id] = title
        sql_path = os.path.join(sql_dir, f"{payload['book_key']}.sql")
        with open(sql_path, 'w') as handle:
            handle.write('\n'.join(statements(payload, book_id, now)) + '\n')
        print(f"{title[:46]:<48}{book_id:<40}{payload['book']['so_tap']:>4} chapters")

    if missing:
        print('\nNo D1 id resolved for:', missing, file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
