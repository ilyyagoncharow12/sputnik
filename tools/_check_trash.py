"""Smoke-тест корзины удалённых (Фаза 1.4). Удаляет за собой тестовые данные."""
import main
import database
from database import get_db, dict_cursor

app = main.app
app.config['TESTING'] = True
UID = 4          # admin
OTHER = 2        # sputnik
H = {'X-CSRF-Token': 't'}

ok = []


def step(name, cond, extra=''):
    ok.append(bool(cond))
    print(('  OK  ' if cond else ' FAIL ') + name + (' ' + str(extra) if extra != '' else ''))


def client_for(uid):
    cl = app.test_client()
    with cl.session_transaction() as s:
        s['user_id'] = uid
        s['csrf_token'] = 't'
    return cl


c = client_for(UID)
c2 = client_for(OTHER)
anon = app.test_client()

cid = database.get_or_create_chat(UID, OTHER)
print('chat_id =', cid)

conn = get_db()
cur = dict_cursor(conn)
cur.execute("INSERT INTO messages (chat_id, sender_id, content) VALUES (%s, %s, %s) RETURNING id",
            (cid, UID, 'корзина-моё-сообщение'))
m1 = cur.fetchone()['id']
cur.execute("INSERT INTO messages (chat_id, sender_id, content) VALUES (%s, %s, %s) RETURNING id",
            (cid, OTHER, 'корзина-чужое-сообщение'))
m2 = cur.fetchone()['id']
conn.commit()
conn.close()
print('test messages:', m1, m2)

# 1. «Удалить у меня» — скрывается только у меня, у собеседника остаётся
r = c.post('/api/delete_message', json={'message_id': m1, 'delete_for_all': False}, headers=H)
step('delete_for_me 200', r.status_code == 200, r.get_json())

msgs = database.get_messages(chat_id=cid, user_id=UID)
step('моё скрыто у меня', not any(m['id'] == m1 for m in msgs))
msgs = database.get_messages(chat_id=cid, user_id=OTHER)
step('чужой видит это сообщение', any(m['id'] == m1 for m in msgs))

# 2. Корзина показывает скрытое «у меня»
r = c.get(f'/api/trash?chat_id={cid}&chat_type=personal')
d = r.get_json() or {}
step('trash 200', r.status_code == 200)
step('trash содержит m1', any(i['id'] == m1 for i in d.get('items', [])), d.get('count'))

# 3. Восстановление «у себя»
r = c.post('/api/restore_message', json={'message_id': m1, 'delete_for_all': False}, headers=H)
step('restore_for_me 200', r.status_code == 200, r.get_json())
msgs = database.get_messages(chat_id=cid, user_id=UID)
step('сообщение снова видно', any(m['id'] == m1 for m in msgs))

# 4. Удаление у всех + корзина
r = c.post('/api/delete_message', json={'message_id': m1, 'delete_for_all': True}, headers=H)
step('delete_for_all 200', r.status_code == 200)
r = c.get(f'/api/trash?chat_id={cid}&chat_type=personal')
d = r.get_json() or {}
item = next((i for i in d.get('items', []) if i['id'] == m1), None)
step('m1 в корзине как deleted_for_all', bool(item) and item['deleted_for_all'] is True)
step('есть deleted_at и deleted_by', bool(item and item.get('deleted_at') and item.get('deleted_by') == UID))

# 5. Чужой не может восстановить чужое удаление «у всех»
r = c2.post('/api/restore_message', json={'message_id': m1, 'delete_for_all': True}, headers=H)
step('чужой НЕ восстановил (403)', r.status_code == 403, r.status_code)

# 6. Автор может восстановить
r = c.post('/api/restore_message', json={'message_id': m1, 'delete_for_all': True}, headers=H)
step('автор восстановил', r.status_code == 200, r.get_json())
msgs = database.get_messages(chat_id=cid, user_id=OTHER)
step('у собеседника вернулось', any(m['id'] == m1 for m in msgs))

# 7. Очистка корзины
c.post('/api/delete_message', json={'message_id': m1, 'delete_for_all': True}, headers=H)
c.post('/api/delete_message', json={'message_id': m2, 'delete_for_all': True}, headers=H)
r = c.post('/api/trash/clear', json={'chat_id': cid, 'chat_type': 'personal'}, headers=H)
step('trash/clear 200', r.status_code == 200, r.get_json())
conn = get_db()
cur = dict_cursor(conn)
cur.execute('SELECT COUNT(*) as n FROM messages WHERE id IN (%s, %s)', (m1, m2))
n = cur.fetchone()['n']
conn.close()
step('сообщения физически удалены', n == 0, n)

# 8. purge_old_trash не падает
step('purge_old_trash не падает', database.purge_old_trash(30) >= 0)

# 9. Авторизация
step('trash без сессии 401', anon.get('/api/trash?chat_id=1').status_code == 401)
# POST без сессии упирается в CSRF (403) — это тоже корректная защита.
# С валидным CSRF, но без user_id, роут обязан отдать 401.
noc = app.test_client()
with noc.session_transaction() as s:
    s['csrf_token'] = 't'
step('restore без user_id 401',
     noc.post('/api/restore_message', json={'message_id': 1}, headers=H).status_code == 401)
step('POST без сессии режется CSRF (403)',
     anon.post('/api/restore_message', json={'message_id': 1}, headers=H).status_code == 403)
step('trash без chat_id 400', c.get('/api/trash').status_code == 400)

# 10. Целостность БД
conn = get_db()
cur = dict_cursor(conn)
cur.execute('PRAGMA foreign_key_check')
fk = cur.fetchall()
conn.close()
step('foreign_key_check чист', not fk, fk)

print('\nИТОГ: %d/%d' % (sum(ok), len(ok)))
