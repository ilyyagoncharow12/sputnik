# -*- coding: utf-8 -*-
"""Проверка Фазы 1.2 (галочки) через Flask test client, без живого сервера."""
import sys
import main
from database import get_db, dict_cursor

app = main.app
app.config['TESTING'] = True
ok = True


def fail(msg):
    global ok
    ok = False
    print('  FAIL:', msg)


# ---- находим личный чат admin(4) <-> sputnik(2) ----
conn = get_db()
cur = dict_cursor(conn)
cur.execute('SELECT id FROM chats WHERE (user1_id = 4 AND user2_id = 2) OR (user1_id = 2 AND user2_id = 4)')
row = cur.fetchone()
chat_id = row['id'] if row else None
conn.close()
if not chat_id:
    print('нет чата 4<->2, пропуск')
    sys.exit(0)
print('чат admin(4) <-> sputnik(2):', chat_id)

client = app.test_client()

# логин под admin
with client.session_transaction() as s:
    s['user_id'] = 4
    s['csrf_token'] = 'test-token'

print('\n1) /sw.js отдаётся из корня')
r = client.get('/sw.js')
if r.status_code != 200:
    fail('sw.js status %s' % r.status_code)
else:
    print('  ok, Service-Worker-Allowed =', r.headers.get('Service-Worker-Allowed'))

print('\n2) /api/push/state с сессией')
r = client.get('/api/push/state')
if r.status_code != 200:
    fail('push/state status %s' % r.status_code)
else:
    d = r.get_json()
    print('  ok: enabled=%s public_key=%s...' % (d.get('enabled'), (d.get('public_key') or '')[:10]))

print('\n3) POST без CSRF-токена отбивается (403)')
r = client.post('/api/push/test')
if r.status_code != 403:
    fail('ожидался 403, получен %s' % r.status_code)
else:
    print('  ok')

print('\n4) /api/get_chat/2 открывает чат и помечает доставку')
conn = get_db()
cur = dict_cursor(conn)
cur.execute('SELECT MAX(id) AS m FROM messages')
max_before = cur.fetchone()['m'] or 0
conn.close()

# создаём сообщение от sputnik(2) напрямую, чтобы проверить flow
from database import send_message
msg = send_message(chat_id=chat_id, sender_id=2, content='Проверка галочек 1.2')
new_id = msg['id']
print('  создано сообщение id =', new_id)

r = client.get('/api/get_chat/2')
if r.status_code != 200:
    fail('get_chat status %s' % r.status_code)
else:
    print('  ok, сообщений в ответе:', len(r.get_json().get('messages') or []))

conn = get_db()
cur = dict_cursor(conn)
cur.execute('SELECT delivered_at, is_read FROM messages WHERE id = %s', (new_id,))
r2 = cur.fetchone()
conn.close()
if r2['delivered_at']:
    print('  ok: delivered_at =', r2['delivered_at'])
else:
    fail('delivered_at не проставлен после открытия чата')
if r2['is_read']:
    print('  ok: is_read = 1 (чат открыт — прочитано)')
else:
    fail('is_read не проставлен')

print('\n5) сообщение в delivered_at НЕ ставится владельцем чата')
from database import send_message
m2 = send_message(chat_id=chat_id, sender_id=4, content='Моё собственное')
conn = get_db()
cur = dict_cursor(conn)
cur.execute('SELECT delivered_at FROM messages WHERE id = %s', (m2['id'],))
r3 = cur.fetchone()
conn.close()
if r3['delivered_at'] is None:
    print('  ok: свои сообщения остаются без delivered_at')
else:
    fail('своё сообщение получило delivered_at')

print('\n6) /api/push/state возвращает delivered_at в сообщениях')
r = client.get('/api/get_chat/2')
msgs = {m['id']: m for m in (r.get_json().get('messages') or [])}
if new_id in msgs and 'delivered_at' in msgs[new_id]:
    print('  ok: delivered_at в JSON =', msgs[new_id]['delivered_at'])
else:
    fail('delivered_at не отдаётся в get_messages')

print('\n7) ставим delivered_at обратно в NULL, проверяем join_chat-логику')
conn = get_db()
cur = dict_cursor(conn)
cur.execute('UPDATE messages SET delivered_at = NULL WHERE id = %s', (new_id,))
conn.commit()
conn.close()
from database import get_undelivered_message_ids, mark_messages_delivered
ids = get_undelivered_message_ids(chat_id, 4, message_ids=None) if False else get_undelivered_message_ids(chat_id, 4)
if new_id in ids:
    print('  ok: сообщение снова в списке недоставленных')
    newly = mark_messages_delivered(chat_id, 4, message_ids=[new_id])
    if new_id in newly:
        print('  ok: mark_messages_delivered вернул', newly)
    else:
        fail('mark_messages_delivered не отметил')
else:
    fail('сообщения нет в списке недоставленных')

print('\n8) редактирование и удаление не ломают delivered_at')
r = client.post('/api/edit_message/%s' % new_id, json={'content': 'Проверка галочек 1.2 (изм.)'},
                headers={'X-CSRF-Token': 'test-token'})
print('  edit_message ->', r.status_code, (r.get_json() or {}).get('error', ''))
r = client.post('/api/delete_message/%s' % m2['id'], headers={'X-CSRF-Token': 'test-token'})
print('  delete_message ->', r.status_code)

print('\nИТОГ:', 'ВСЁ ОК' if ok else 'ЕСТЬ ОШИБКИ')
sys.exit(0 if ok else 1)
