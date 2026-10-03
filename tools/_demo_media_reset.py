# -*- coding: utf-8 -*-
"""Убирает демо-данные и файлы проверки медиа-галереи (v0.62.4)."""
import glob
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database as db

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHONE = '+70000000999'
ADMIN_PHONE = '+79999999999'

conn = db.get_db()
cur = db.dict_cursor(conn)
cur.execute('SELECT id, phone FROM users WHERE phone IN (%s, %s)', (PHONE, ADMIN_PHONE))
rows = cur.fetchall()
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
    cur.execute('DELETE FROM messages WHERE sender_id IN (%s)' % ph)
    cur.execute('DELETE FROM users WHERE id IN (%s)' % ph)
if admin:
    cur.execute('DELETE FROM messages WHERE sender_id IN (%s) AND file_path LIKE %s',
                (','.join(str(i) for i in admin), '%demo%'))
cur.execute('''DELETE FROM messages WHERE file_path LIKE %s''', ('%demo%',))
conn.commit()

cur.execute('SELECT COUNT(*) c FROM users WHERE phone = %s', (PHONE,))
left_users = cur.fetchone()['c']
cur.execute('''SELECT COUNT(*) c FROM messages WHERE file_path LIKE %s''', ('%demo%',))
left_msgs = cur.fetchone()['c']
cur.execute('PRAGMA integrity_check')
integrity = cur.fetchone()['integrity_check']
cur.execute('PRAGMA foreign_key_check')
fk = cur.fetchall()
cur.execute('SELECT id, username, phone FROM users ORDER BY id')
users = [(r['id'], r['username'], r['phone']) for r in cur.fetchall()]
cur.execute('SELECT COUNT(*) c FROM chats')
chats = cur.fetchone()['c']
cur.execute('SELECT COUNT(*) c FROM messages')
msgs = cur.fetchone()['c']
conn.close()

removed = []
for pattern in ('static/uploads/photos/demo_*', 'static/uploads/audio/demo_*',
                'static/uploads/files/demo.*', 'static/uploads/videos/demo_*'):
    for f in glob.glob(os.path.join(ROOT, pattern)):
        os.remove(f)
        removed.append(os.path.relpath(f, ROOT))

print('удалено файлов: %d %s' % (len(removed), removed))
print('осталось демо-пользователей: %d, демо-сообщений: %d' % (left_users, left_msgs))
print('users: %s' % users)
print('chats: %d, messages: %d, integrity=%s, fk=%d' % (chats, msgs, integrity, len(fk)))
