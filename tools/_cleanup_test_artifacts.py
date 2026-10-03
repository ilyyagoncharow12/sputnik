# -*- coding: utf-8 -*-
"""Чистка БД от мусора, оставшегося после проверочных скриптов (v0.62.4).

Удаляет только однозначные артефакты тестов:
  * чаты, у которых один из участников уже удалён (сироты);
  * сообщения, чей chat_id не существует или равен NULL, если это
    тестовые строки («пост для просмотров», «кружок», «Новый вход в аккаунт»);
  * временных пользователей префиксов pres/mediademo.
Настоящие сообщения пользователей не трогает.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database as db

TEST_MARKERS = ('пост для просмотров', 'кружок', 'Новый вход в аккаунт')
TEST_USERNAMES = ('pres1', 'pres2', 'pres3', 'mediademo')

conn = db.get_db()
cur = db.dict_cursor(conn)

# 1) сиротские чаты: участник удалён
cur.execute('''
    SELECT c.id FROM chats c
    WHERE c.user1_id NOT IN (SELECT id FROM users)
       OR c.user2_id NOT IN (SELECT id FROM users)
''')
orphan_chats = [r['id'] for r in cur.fetchall()]
if orphan_chats:
    cph = ','.join(str(i) for i in orphan_chats)
    cur.execute('SELECT COUNT(*) c FROM messages WHERE chat_id IN (%s)' % cph)
    orphan_msgs = cur.fetchone()['c']
    cur.execute('DELETE FROM messages WHERE chat_id IN (%s)' % cph)
    try:
        cur.execute('DELETE FROM folder_chats WHERE chat_id IN (%s)' % cph)
    except Exception:
        pass
    cur.execute('DELETE FROM chats WHERE id IN (%s)' % cph)
    print('удалено сиротских чатов: %d (сообщений внутри: %d)' % (len(orphan_chats), orphan_msgs))
else:
    print('сиротских чатов нет')

# 2) сообщения без чата (NULL или несуществующий chat_id) с тестовыми маркерами
cur.execute('''
    SELECT id, content FROM messages
    WHERE chat_id IS NULL OR chat_id NOT IN (SELECT id FROM chats)
''')
loose = cur.fetchall()
marks = [r['id'] for r in loose
         if any(m in (r['content'] or '') for m in TEST_MARKERS)]
if marks:
    cur.execute('DELETE FROM messages WHERE id IN (%s)' % ','.join(str(i) for i in marks))
    print('удалено тестовых сообщений без чата: %d' % len(marks))
else:
    print('тестовых сообщений без чата нет')

# 3) временные пользователи тестов
cur.execute('SELECT id, username FROM users')
tmp = [r['id'] for r in cur.fetchall() if (r['username'] or '') in TEST_USERNAMES]
if tmp:
    ph = ','.join(str(i) for i in tmp)
    cur.execute('SELECT id FROM chats WHERE user1_id IN (%s) OR user2_id IN (%s)' % (ph, ph))
    chats = [c['id'] for c in cur.fetchall()]
    if chats:
        cph = ','.join(str(i) for i in chats)
        cur.execute('DELETE FROM messages WHERE chat_id IN (%s)' % cph)
        try:
            cur.execute('DELETE FROM folder_chats WHERE chat_id IN (%s)' % cph)
        except Exception:
            pass
        cur.execute('DELETE FROM chats WHERE id IN (%s)' % cph)
    cur.execute('DELETE FROM messages WHERE sender_id IN (%s)' % ph)
    cur.execute('DELETE FROM users WHERE id IN (%s)' % ph)
    print('удалено временных пользователей: %d' % len(tmp))
else:
    print('временных пользователей нет')

conn.commit()

cur.execute('SELECT id, username, phone FROM users ORDER BY id')
users = [(r['id'], r['username'], r['phone']) for r in cur.fetchall()]
cur.execute('SELECT COUNT(*) c FROM chats')
chats = cur.fetchone()['c']
cur.execute('SELECT COUNT(*) c FROM messages')
msgs = cur.fetchone()['c']
cur.execute('SELECT COUNT(*) c FROM link_previews')
previews = cur.fetchone()['c']
cur.execute('PRAGMA integrity_check')
integrity = cur.fetchone()['integrity_check']
cur.execute('PRAGMA foreign_key_check')
fk = cur.fetchall()
cur.execute('SELECT COUNT(*) c FROM messages WHERE chat_id IS NULL OR chat_id NOT IN (SELECT id FROM chats)')
loose_left = cur.fetchone()['c']
conn.close()

print('-' * 40)
print('users: %s' % users)
print('chats: %d, messages: %d, link_previews: %d' % (chats, msgs, previews))
print('сообщений без чата: %d, integrity=%s, fk=%d' % (loose_left, integrity, len(fk)))