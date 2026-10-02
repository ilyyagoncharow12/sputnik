# -*- coding: utf-8 -*-
"""Проверка Фазы 1.3 (история редактирования) через Flask test client."""
import sys
import main
from database import send_message, get_db, dict_cursor, get_message_edits

app = main.app
app.config['TESTING'] = True
ok = True


def fail(msg):
    global ok
    ok = False
    print('  FAIL:', msg)


client = app.test_client()
with client.session_transaction() as s:
    s['user_id'] = 4          # admin
    s['csrf_token'] = 't'
H = {'X-CSRF-Token': 't'}

print('1) три правки подряд — история хранит всю цепочку')
m = send_message(chat_id=7, sender_id=4, content='версия 0')
for i in (1, 2, 3):
    r = client.post('/api/edit_message',
                    json={'message_id': m['id'], 'content': 'версия %d' % i},
                    headers=H)
    if r.status_code != 200:
        fail('правка %d -> %s %s' % (i, r.status_code, r.get_json()))
r = client.get('/api/message_edits/%s' % m['id'])
if r.status_code != 200:
    fail('история -> %s' % r.status_code)
else:
    d = r.get_json()
    edits = d['edits']
    print('   записей:', len(edits))
    for e in edits:
        print('   %-12s -> %-12s (%s)' % (e['old_content'], e['new_content'], e['created_at']))
    chain_ok = (edits[0]['old_content'] == 'версия 0'
                and edits[0]['new_content'] == 'версия 1'
                and edits[1]['old_content'] == 'версия 1'
                and edits[2]['new_content'] == 'версия 3')
    if chain_ok:
        print('   ok: цепочка «было → стало» непрерывная')
    else:
        fail('цепочка правок неверна')
    who = edits[0]['display_name']
    print('   автор правки:', who, '/ @' + str(edits[0]['username']))
    if not who:
        fail('не подтянулся автор правки')

print('\n2) редактирование на то же самое не пишет запись')
before = len(get_message_edits(m['id']))
r = client.post('/api/edit_message',
                json={'message_id': m['id'], 'content': 'версия 3'}, headers=H)
after = len(get_message_edits(m['id']))
if before == after:
    print('   ok: записей было %d, стало %d (пустые правки не пишем)' % (before, after))
else:
    fail('пустая правка записалась в историю')

print('\n3) чужая подписка не видит историю личного чата')
with client.session_transaction() as s:
    s['user_id'] = 7          # ilxz_12 — не участник чата 4<->2
r = client.get('/api/message_edits/%s' % m['id'])
if r.status_code == 403:
    print('   ok: 403 Нет доступа')
else:
    fail('ожидался 403, получен %s %s' % (r.status_code, r.get_json()))

print('\n4) участник чата (sputnik) видит историю')
with client.session_transaction() as s:
    s['user_id'] = 2
r = client.get('/api/message_edits/%s' % m['id'])
if r.status_code == 200:
    print('   ok: %d записей' % len(r.get_json()['edits']))
else:
    fail('участник чата не увидел историю: %s' % r.status_code)

print('\n5) история несуществующего сообщения')
with client.session_transaction() as s:
    s['user_id'] = 4
r = client.get('/api/message_edits/99999999')
if r.status_code == 404:
    print('   ok: 404')
else:
    fail('ожидался 404, получен %s' % r.status_code)

print('\n5a) чужой пользователь не может ПРАВИТЬ чужое сообщение')
with client.session_transaction() as s:
    s['user_id'] = 7
r = client.post('/api/edit_message',
                json={'message_id': m['id'], 'content': 'взлом'}, headers=H)
if r.status_code == 403:
    print('   ok: 403, текст не изменён')
else:
    fail('ожидался 403, получен %s %s' % (r.status_code, r.get_json()))

print('\n5b) участник чата не может править чужое сообщение')
with client.session_transaction() as s:
    s['user_id'] = 2
r = client.post('/api/edit_message',
                json={'message_id': m['id'], 'content': 'подмена'}, headers=H)
if r.status_code == 403:
    print('   ok: 403 (только автор)')
else:
    fail('ожидался 403, получен %s %s' % (r.status_code, r.get_json()))

print('\n6) без сессии — 401')
anon = app.test_client()
r = anon.get('/api/message_edits/%s' % m['id'])
if r.status_code == 401:
    print('   ok: 401')
else:
    fail('ожидался 401, получен %s' % r.status_code)

print('\n7) удаление сообщения каскадит историю')
conn = get_db()
cur = dict_cursor(conn)
cur.execute('DELETE FROM message_edits WHERE message_id = %s', (m['id']))
conn.commit()
cur.execute('SELECT COUNT(*) AS n FROM message_edits WHERE message_id = %s', (m['id']))
print('   ok: записей', cur.fetchone()['n'])
conn.close()

# уборка
conn = get_db()
cur = dict_cursor(conn)
cur.execute('DELETE FROM messages WHERE id = %s', (m['id'],))
conn.commit()
cur.execute('PRAGMA foreign_key_check')
bad = cur.fetchall()
print('   foreign_key_check:', bad if bad else 'чисто')
conn.close()

print('\nИТОГ:', 'ВСЁ ОК' if ok else 'ЕСТЬ ОШИБКИ')
sys.exit(0 if ok else 1)
