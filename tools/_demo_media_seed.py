# -*- coding: utf-8 -*-
"""Временные данные для проверки медиа-галереи в браузере (v0.62.4).

Создаёт тестового пользователя, пишет от admin в личный чат с ним фото,
видео, аудио и документ, а также кладёт фото в «Избранное» тестового
пользователя (для проверки своего профиля). Скрипт можно запускать
несколько раз — данные пересоздаются. Удаление — tools/_demo_media_reset.py.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database as db

PHONE = '+70000000999'
USERNAME = 'mediademo'
PASSWORD = 'mediademo123'
ADMIN_PHONE = '+79999999999'


def reset():
    conn = db.get_db()
    cur = db.dict_cursor(conn)
    cur.execute('SELECT id, phone FROM users WHERE phone = %s OR phone = %s', (PHONE, ADMIN_PHONE))
    rows = cur.fetchall()
    ids = [r['id'] for r in rows]
    demo = [r['id'] for r in rows if r['phone'] == PHONE]
    admin = [r['id'] for r in rows if r['phone'] == ADMIN_PHONE]
    if demo:
        ph = ','.join(str(i) for i in demo)
        cur.execute('SELECT id FROM chats WHERE user1_id IN (%s) OR user2_id IN (%s)' % (ph, ph))
        chats = [c['id'] for c in cur.fetchall()]
        if chats:
            cph = ','.join(str(i) for i in chats)
            cur.execute('DELETE FROM messages WHERE chat_id IN (%s)' % cph)
            cur.execute('DELETE FROM folder_chats WHERE chat_id IN (%s)' % cph)
            cur.execute('DELETE FROM chats WHERE id IN (%s)' % cph)
        cur.execute('DELETE FROM messages WHERE file_path LIKE %s', ('%demo%',))
        cur.execute('DELETE FROM messages WHERE sender_id IN (%s)' % ph)
        cur.execute('DELETE FROM users WHERE id IN (%s)' % ph)
    if admin:
        cur.execute('DELETE FROM messages WHERE sender_id IN (%s) AND file_path LIKE %s',
                    (','.join(str(i) for i in admin), '%demo%'))
    conn.commit()
    conn.close()
    return demo[0] if demo else None


old = reset()
print('старый демо-пользователь: %s' % old)

demo_id = db.create_user_initial(PHONE, PASSWORD)
conn = db.get_db()
cur = db.dict_cursor(conn)
cur.execute('''UPDATE users SET registration_complete = TRUE, username = %s,
               display_name = 'МедиаТест' WHERE id = %s''', (USERNAME, demo_id))
cur.execute('SELECT id FROM users WHERE phone = %s', (ADMIN_PHONE,))
admin_id = cur.fetchone()['id']
conn.commit()
conn.close()

chat = db.get_or_create_chat(admin_id, demo_id)
fav = db.get_or_create_chat(demo_id, demo_id)
print('демо user_id=%s, admin=%s, чат=%s, избранное=%s' % (demo_id, admin_id, chat, fav))

rows = [
    (chat, 'photo', 'uploads/photos/demo_1.png', 'demo_1.png', 3146),
    (chat, 'photo', 'uploads/photos/demo_2.png', 'demo_2.png', 3245),
    (chat, 'photo', 'uploads/photos/demo_3.png', 'demo_3.png', 3233),
    (chat, 'photo', 'uploads/photos/demo_4.png', 'demo_4.png', 3157),
    (chat, 'video', 'uploads/videos/demo_clip.mp4', 'demo_clip.mp4', 32),
    (chat, 'video_circle', 'uploads/videos/demo_clip.mp4', 'demo_circle.mp4', 32),
    (chat, 'audio', 'uploads/audio/demo_tone.wav', 'demo_tone.wav', 132344),
    (chat, 'voice', 'uploads/audio/demo_tone.wav', 'demo_voice.ogg', 45000),
    (chat, 'document', 'uploads/files/demo.pdf', 'demo.pdf', 616),
    (chat, 'sticker', 'uploads/photos/demo_1.png', 'demo_sticker.png', 3146),
    (fav, 'photo', 'uploads/photos/demo_2.png', 'fav_1.png', 3245),
    (fav, 'photo', 'uploads/photos/demo_3.png', 'fav_2.png', 3233),
]

conn = db.get_db()
cur = db.dict_cursor(conn)
for chat_id, ft, path, name, size in rows:
    cur.execute('''INSERT INTO messages (chat_id, sender_id, content, file_type, file_path,
                                          file_name, file_size, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)''',
                (chat_id, admin_id if chat_id == chat else demo_id, 'демо', ft, path,
                 name, size, db.get_moscow_time()))
conn.commit()

cur.execute('''SELECT COUNT(*) c FROM messages WHERE chat_id = %s AND file_path IS NOT NULL''',
            (chat,))
print('медиа в чате с admin: %d' % cur.fetchone()['c'])
cur.execute('''SELECT COUNT(*) c FROM messages WHERE chat_id = %s AND file_path IS NOT NULL''',
            (fav,))
print('медиа в избранном: %d' % cur.fetchone()['c'])
conn.close()
print('готово: логин +%s, пароль %s' % (PHONE, PASSWORD))
