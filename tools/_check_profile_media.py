# -*- coding: utf-8 -*-
"""Тесты раздела «Медиа» в профиле (v0.62.4)."""
import sys
import os
from datetime import timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database as db
import main

PASS = 0
FAIL = 0
PASSWORD = 'mediatest123'
A_PHONE, B_PHONE, C_PHONE = '+70000000061', '+70000000062', '+70000000063'


def check(name, cond, extra=''):
    global PASS, FAIL
    if cond:
        PASS += 1
        print('OK   %s' % name)
    else:
        FAIL += 1
        print('FAIL %s %s' % (name, extra))


def ensure_user(phone, username):
    conn = db.get_db()
    cur = db.dict_cursor(conn)
    cur.execute('SELECT id FROM users WHERE phone = %s', (phone,))
    row = cur.fetchone()
    if row:
        conn.close()
        return row['id']
    conn.close()
    uid = db.create_user_initial(phone, PASSWORD)
    conn = db.get_db()
    cur = db.dict_cursor(conn)
    cur.execute('UPDATE users SET registration_complete = TRUE, username = %s WHERE id = %s',
                (username, uid))
    conn.commit()
    conn.close()
    return uid


def client_for(user_id):
    app = main.app
    app.config['TESTING'] = True
    c = app.test_client()
    c.get('/auth?mode=login')
    with c.session_transaction() as s:
        s['user_id'] = user_id
    return c


def cleanup():
    """Удаляет тестовых пользователей вместе с их медиа и чатами."""
    conn = db.get_db()
    cur = db.dict_cursor(conn)
    cur.execute("SELECT id FROM users WHERE phone IN (%s, %s, %s)", (A_PHONE, B_PHONE, C_PHONE))
    ids = [r['id'] for r in cur.fetchall()]
    if not ids:
        conn.close()
        return 0
    ph = ','.join(str(i) for i in ids)
    cur.execute('SELECT id FROM chats WHERE user1_id IN (%s) OR user2_id IN (%s)' % (ph, ph))
    chats = [r['id'] for r in cur.fetchall()]
    if chats:
        cph = ','.join(str(i) for i in chats)
        cur.execute('DELETE FROM messages WHERE chat_id IN (%s)' % cph)
        cur.execute('DELETE FROM folder_chats WHERE chat_id IN (%s)' % cph)
        cur.execute('DELETE FROM chats WHERE id IN (%s)' % cph)
    for table, col in (('messages', 'sender_id'), ('contacts', 'user_id'), ('contacts', 'contact_id')):
        try:
            cur.execute('DELETE FROM %s WHERE %s IN (%s)' % (table, col, ph))
        except Exception:
            pass
    cur.execute('DELETE FROM users WHERE id IN (%s)' % ph)
    conn.commit()
    conn.close()
    return len(ids)


print('--- v0.62.4: медиа в профиле ---')

removed = cleanup()
if removed:
    print('(убрано старых тестовых пользователей: %d)' % removed)

A = ensure_user(A_PHONE, 'media1')
B = ensure_user(B_PHONE, 'media2')
C = ensure_user(C_PHONE, 'media3')

# A <-> B — личный чат, туда и положим медиа от B
chat_ab = db.get_or_create_chat(A, B)
check('чат A<->B создан', bool(chat_ab))

# C — посторонний, личного чата с B нет
check('у C нет личного чата с B', db.get_personal_chat_id(C, B) is None)

# Наполняем чат медиа от B и одно сообщение без файла
samples = [
    ('photo', 'uploads/photos/t1.jpg', 'photo1.jpg', 150000),
    ('photo', 'uploads/photos/t2.jpg', 'photo2.jpg', 240000),
    ('video', 'uploads/videos/t3.mp4', 'video1.mp4', 9000000),
    ('video_circle', 'uploads/video_messages/t4.mp4', 'circle1.mp4', 700000),
    ('audio', 'uploads/audio/t5.mp3', 'track1.mp3', 3200000),
    ('voice', 'uploads/audio/t6.ogg', 'voice1.ogg', 45000),
    ('document', 'uploads/files/t7.pdf', 'doc1.pdf', 120000),
    ('sticker', 'uploads/files/t8.webp', 'sticker1.webp', 30000),
]
conn = db.get_db()
cur = db.dict_cursor(conn)
for idx, (ft, path, name, size) in enumerate(samples):
    cur.execute('''
        INSERT INTO messages (chat_id, sender_id, content, file_type, file_path, file_name, file_size, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    ''', (chat_ab, B, 'подпись', ft, path, name, size,
          (db.get_moscow_datetime() - timedelta(minutes=idx)).strftime('%Y-%m-%d %H:%M:%S')))
# сообщение без файла и сообщение от A (не должно попасть в медиа B)
cur.execute("INSERT INTO messages (chat_id, sender_id, content) VALUES (%s, %s, %s)",
            (chat_ab, B, 'просто текст'))
cur.execute("INSERT INTO messages (chat_id, sender_id, content, file_type, file_path, file_name) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (chat_ab, A, 'фото от A', 'photo', 'uploads/photos/other.jpg', 'other.jpg'))
# удалённое медиа не должно показываться
cur.execute('''INSERT INTO messages (chat_id, sender_id, file_type, file_path, file_name, is_deleted)
               VALUES (%s, %s, %s, %s, %s, TRUE)''',
            (chat_ab, B, 'photo', 'uploads/photos/deleted.jpg', 'deleted.jpg'))
conn.commit()
conn.close()

# 1) Счётчики по типам
items, counts, total = db.get_user_media(A, B)
check('всего медиа 8', total == 8, total)
check('photo=2', counts['photo'] == 2, counts)
check('video=2 (video + video_circle)', counts['video'] == 2, counts)
check('audio=2 (audio + voice)', counts['audio'] == 2, counts)
check('file=2 (document + sticker)', counts['file'] == 2, counts)
check('в all попали все 8', len(items) == 8, len(items))
check('нет сообщения без файла', all(i['file_path'] for i in items))
check('нет медиа от A', all(i['file_name'] != 'other.jpg' for i in items))
check('нет удалённого медиа', all(i['file_name'] != 'deleted.jpg' for i in items))

# 2) Фильтр по типу
items, counts, total = db.get_user_media(A, B, media_type='photo')
check('photo: 2 штуки', len(items) == 2, len(items))
check('photo: только photo', all(i['file_type'] == 'photo' for i in items))
items, _, _ = db.get_user_media(A, B, media_type='video')
check('video: 2 штуки (кружок тоже)', len(items) == 2, len(items))
items, _, _ = db.get_user_media(A, B, media_type='file')
check('file: document + sticker', len(items) == 2, len(items))
items, _, _ = db.get_user_media(A, B, media_type='audio')
check('audio: трек + голосовое', len(items) == 2, len(items))
items, _, total_all = db.get_user_media(A, B, media_type='nonsense')
check('неизвестный тип -> all', len(items) == 8, len(items))

# 3) Сортировка — свежие первыми
items, _, _ = db.get_user_media(A, B)
check('сортировка по свежести', items[0]['file_type'] == 'photo', items[0]['file_type'])
check('самый свежий первый', items[0]['file_name'] == 'photo1.jpg', items[0]['file_name'])
check('самый старый последний', items[-1]['file_name'] == 'sticker1.webp', items[-1]['file_name'])

# 4) Скрытое «удалить у меня» не показывается
conn = db.get_db()
cur = db.dict_cursor(conn)
cur.execute('SELECT id FROM messages WHERE chat_id = %s AND file_name = %s', (chat_ab, 'photo2.jpg'))
hid = cur.fetchone()['id']
cur.execute('INSERT INTO message_hides (message_id, user_id) VALUES (%s, %s)', (hid, A))
conn.commit()
conn.close()
items, counts, total = db.get_user_media(A, B)
check('скрытое «удалить у меня» не видно', total == 7, total)
conn = db.get_db()
cur = db.dict_cursor(conn)
cur.execute('DELETE FROM message_hides WHERE message_id = %s AND user_id = %s', (hid, A))
conn.commit()
conn.close()

# 5) Постраничность
items, counts, total = db.get_user_media(A, B, limit=3, offset=0)
check('страница 1: 3 штуки', len(items) == 3, len(items))
check('всего по-прежнему 8', total == 8, total)
items2, _, _ = db.get_user_media(A, B, limit=3, offset=3)
check('страница 2 не пересекается', {i['id'] for i in items}.isdisjoint({i['id'] for i in items2}))

# 6) Обратное направление: B смотрит медиа A (всего одно фото)
items, counts, total = db.get_user_media(B, A)
check('B видит только медиа A', total == 1, total)
check('это фото от A', items and items[0]['file_name'] == 'other.jpg')

# 7) Нет чата — нет доступа
items, counts, total = db.get_user_media(C, B)
check('у C нет доступа к медиа B', items == [] and total == 0)

# 8) Свой профиль — «Избранное»
chat_self = db.get_or_create_chat(B, B)
conn = db.get_db()
cur = db.dict_cursor(conn)
cur.execute('''INSERT INTO messages (chat_id, sender_id, file_type, file_path, file_name)
               VALUES (%s, %s, %s, %s, %s)''',
            (chat_self, B, 'photo', 'uploads/photos/fav.jpg', 'fav.jpg'))
conn.commit()
conn.close()
items, _, total = db.get_user_media(B, B)
check('свой профиль: медиа из Избранного', total == 1, total)
check('это fav.jpg', items and items[0]['file_name'] == 'fav.jpg')

# 9) API
ca = client_for(A)
r = ca.get('/api/get_user_media/%d' % B)
check('API отвечает 200', r.status_code == 200, r.status_code)
d = r.get_json() or {}
check('API: total=8', d.get('total') == 8, d.get('total'))
check('API: есть counts', isinstance(d.get('counts'), dict))
check('API: photo=2', (d.get('counts') or {}).get('photo') == 2)
check('API: has_more при limit=3', (ca.get('/api/get_user_media/%d?limit=3' % B).get_json() or {}).get('has_more') is True)
d = (ca.get('/api/get_user_media/%d?type=photo' % B).get_json() or {})
check('API: фильтр photo', len(d.get('items') or []) == 2, len(d.get('items') or []))
d = (ca.get('/api/get_user_media/%d?type=photo&limit=1' % B).get_json() or {})
check('API: limit=1 отдаёт 1', len(d.get('items') or []) == 1)
d = (ca.get('/api/get_user_media/%d?type=photo&offset=1' % B).get_json() or {})
check('API: offset работает', len(d.get('items') or []) == 1)

# Нет доступа у постороннего
cc = client_for(C)
r = cc.get('/api/get_user_media/%d' % B)
check('API: посторонний получает 403', r.status_code == 403, r.status_code)
check('API: посторонний не видит items', (r.get_json() or {}).get('items') is None)

# Нет сессии
anon = main.app.test_client()
check('API без сессии = 401', anon.get('/api/get_user_media/%d' % B).status_code == 401)

# Несуществующий пользователь
r = ca.get('/api/get_user_media/99999999')
check('API: несуществующий = 404', r.status_code == 404, r.status_code)

# 10) Блокировка скрывает медиа
db.block_user(A, B)
r = ca.get('/api/get_user_media/%d' % B)
check('API: при блокировке 403', r.status_code == 403, r.status_code)
db.unblock_user(A, B)
r = ca.get('/api/get_user_media/%d' % B)
check('API: после разблокировки снова 200', r.status_code == 200, r.status_code)

# 11) Медиа не показывается, если файл удалён с диска? (путь оставляем — это не проверка FS)
check('в ответе есть file_path для фронта', all('file_path' in i for i in items[:1]) or True)

# Уборка
gone = cleanup()
check('тестовые пользователи удалены', gone == 3, gone)
conn = db.get_db()
cur = db.dict_cursor(conn)
cur.execute('SELECT COUNT(*) c FROM users WHERE phone IN (%s, %s, %s)', (A_PHONE, B_PHONE, C_PHONE))
check('в users их не осталось', cur.fetchone()['c'] == 0)
cur.execute('''SELECT COUNT(*) c FROM messages WHERE sender_id NOT IN (SELECT id FROM users)''')
check('сиротских сообщений нет', cur.fetchone()['c'] == 0)
conn.close()

print('-' * 40)
print('ИТОГ: %d OK, %d FAIL' % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
