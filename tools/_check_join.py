# -*- coding: utf-8 -*-
"""Smoke-тест вступления в группы/каналы и заявок (Фаза 2b). Чистит за собой."""
import main
import database
from database import get_db, dict_cursor

app = main.app
app.config['TESTING'] = True
OWNER = 4
GUEST = 7
H = {'X-CSRF-Token': 't'}

ok = []


def wipe_leftovers():
    """Убирает то, что осталось от неудачных прогонов."""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute("SELECT id FROM groups WHERE name LIKE 'Тест-%'")
    for r in cur.fetchall():
        cur.execute('DELETE FROM groups WHERE id = %s', (r['id'],))
    cur.execute("SELECT id FROM channels WHERE name LIKE 'Тест-%'")
    for r in cur.fetchall():
        cur.execute('DELETE FROM channels WHERE id = %s', (r['id'],))
    cur.execute("DELETE FROM group_join_requests WHERE group_id NOT IN (SELECT id FROM groups)")
    conn.commit()
    conn.close()


wipe_leftovers()


def step(name, cond, extra=''):
    ok.append(bool(cond))
    print(('  OK  ' if cond else ' FAIL ') + name + (' ' + str(extra) if extra != '' else ''))


def client_for(uid):
    cl = app.test_client()
    with cl.session_transaction() as s:
        s['user_id'] = uid
        s['csrf_token'] = 't'
    return cl


owner = client_for(OWNER)
guest = client_for(GUEST)
anon = app.test_client()

pub_g = database.create_group('Тест-Публичная', OWNER, 'для теста', True, username='testpubg')
priv_g = database.create_group('Тест-Приватная', OWNER, 'для теста', False, username='testprvg')
pub_c = database.create_channel('Тест-Канал', OWNER, 'для теста', True, username='testpubc')
priv_c = database.create_channel('Тест-ПриватныйКанал', OWNER, 'для теста', False, username='testprvc')
print('groups:', pub_g, priv_g, 'channels:', pub_c, priv_c)

# --- витрина группы для не-участника
r = guest.get(f'/api/group/{pub_g}/public')
d = r.get_json()
step('публичная витрина 200', r.status_code == 200)
step('витрина: is_member=False', d.get('is_member') is False)
step('витрина: can_view=True', d.get('can_view') is True)
step('витрина: видно описание', bool((d.get('group') or {}).get('description')))
step('витрина: member_count есть', (d.get('member_count') or 0) >= 1)

r = guest.get(f'/api/group/{priv_g}/public')
d = r.get_json()
step('приватная: can_view=False', d.get('can_view') is False)
step('приватная: описание скрыто', (d.get('group') or {}).get('description') is None)

# --- вступление в публичную
r = guest.post(f'/api/group/{pub_g}/join', json={}, headers=H)
d = r.get_json()
step('вступление в публичную 200', r.status_code == 200, d)
step('status=joined', d.get('status') == 'joined')
step('стал участником', bool(database.is_group_member(pub_g, GUEST)))

# повторное вступление
r = guest.post(f'/api/group/{pub_g}/join', json={}, headers=H)
step('повторное вступление 400', r.status_code == 400, r.get_json())

# --- заявка в приватную
r = guest.post(f'/api/group/{priv_g}/join', json={'message': 'Хочу вступить'}, headers=H)
d = r.get_json()
step('заявка в приватную 200', r.status_code == 200, d)
step('status=pending', d.get('status') == 'pending')
step('в группу не попал', not database.is_group_member(priv_g, GUEST))
step('статус заявки pending', database.get_group_join_request_status(priv_g, GUEST) == 'pending')

# повторная заявка
r = guest.post(f'/api/group/{priv_g}/join', json={}, headers=H)
step('повторная заявка 409', r.status_code == 409, r.get_json())

# заявка видна админу
reqs = database.get_group_join_requests(priv_g)
step('заявка видна владельцу', any(x['user_id'] == GUEST for x in reqs), len(reqs))
req_id = next((x['id'] for x in reqs if x['user_id'] == GUEST), None)

# --- приватная группа: витрина показывает «заявка отправлена»
r = guest.get(f'/api/group/{priv_g}/public')
step('витрина: request_status=pending', (r.get_json() or {}).get('request_status') == 'pending')

# --- одобрение заявки
r = owner.post(f'/api/group/approve_join/{priv_g}', json={'request_id': req_id}, headers=H)
step('одобрение 200', r.status_code == 200, r.get_json())
step('после одобрения — участник', bool(database.is_group_member(priv_g, GUEST)))

# --- отказ по заявке (v0.61.0: раньше заявитель об отказе не узнавал)
r = guest.post(f'/api/chat/leave/{priv_g}', json={}, headers=H)
database.remove_group_member(priv_g, GUEST)   # выйти из группы, чтобы подать заявку снова
step('после выхода не участник', not database.is_group_member(priv_g, GUEST))
r = guest.post(f'/api/group/{priv_g}/join', json={}, headers=H)
step('повторная заявка после выхода', r.status_code == 200, r.get_json())
reqs2 = database.get_group_join_requests(priv_g)
req_id2 = next((x['id'] for x in reqs2 if x['user_id'] == GUEST), None)
r = owner.post(f'/api/group/reject_join/{priv_g}', json={'request_id': req_id2}, headers=H)
step('отказ 200', r.status_code == 200, r.get_json())
step('после отказа не участник', not database.is_group_member(priv_g, GUEST))
step('статус заявки rejected',
     database.get_group_join_request_status(priv_g, GUEST) == 'rejected',
     database.get_group_join_request_status(priv_g, GUEST))
r = owner.post(f'/api/group/reject_join/{priv_g}', json={'request_id': req_id2}, headers=H)
step('повторный отказ по той же заявке 400', r.status_code == 400, r.get_json())

# --- чужим нельзя смотреть/модерировать заявки
r = guest.get(f'/api/group/join_requests/{priv_g}')
step('чужой не видит заявки (403)', r.status_code == 403)
other_g = database.create_group('Тест-Чужая', OWNER, 'для теста', True, username='testothg')
step('не-участник не видит сам чат (403)', guest.get(f'/api/get_group/{other_g}').status_code == 403)

# --- подписка на каналы
r = guest.post(f'/api/subscribe/channel/id/{pub_c}', json={}, headers=H)
step('подписка на публичный канал', r.status_code == 200 and (r.get_json() or {}).get('success'), r.get_json())
step('стал подписчиком', bool(database.is_channel_subscriber(pub_c, GUEST)))

r = guest.post(f'/api/subscribe/channel/id/{priv_c}', json={}, headers=H)
step('приватный канал по id — 403', r.status_code == 403, r.get_json())
step('в приватный канал не попал', not database.is_channel_subscriber(priv_c, GUEST))

# по инвайт-ссылке приватного — можно
invite = database.get_channel_by_id(priv_c)['invite_link']
r = guest.get(f'/api/subscribe/channel/{invite}')
step('приватный канал по инвайту — ок', r.status_code == 200 and (r.get_json() or {}).get('success'))

# --- витрина канала
r = guest.get(f'/api/channel/{pub_c}/public')
d = r.get_json()
step('витрина канала 200', r.status_code == 200)
step('is_subscribed=True', d.get('is_subscribed') is True)
step('subscriber_count есть', (d.get('subscriber_count') or 0) >= 1)

# --- заблокированному нельзя
database.ban_group_member(priv_g, GUEST, OWNER, 'тест')  # (group_id, user_id, banned_by, reason)
step('guest реально в бане', database.is_group_banned(priv_g, GUEST))
r = guest.post(f'/api/group/{priv_g}/join', json={}, headers=H)
step('заблокированный: join 403', r.status_code == 403, r.get_json())
step('заблокированный: витрина показывает бан',
     (guest.get(f'/api/group/{priv_g}/public').get_json() or {}).get('banned') is True)
database.unban_group_member(priv_g, GUEST)

# --- поиск находит публичную группу
r = guest.get('/api/search_all?q=testpubg')
d = r.get_json()
step('поиск находит публичную группу', any(g['id'] == pub_g for g in (d.get('groups') or [])), len(d.get('groups') or []))
step('в поиске есть is_member', any(g.get('is_member') for g in (d.get('groups') or []) if g['id'] == pub_g))

# --- авторизация
step('витрина без сессии 401', anon.get(f'/api/group/{pub_g}/public').status_code == 401)
step('витрина несуществующей группы 404', guest.get('/api/group/999999/public').status_code == 404)

# --- чистим за собой
for g in (pub_g, priv_g, other_g):
    database.delete_group(g, OWNER)
for c in (pub_c, priv_c):
    database.delete_channel(c, OWNER)
conn = get_db()
cur = dict_cursor(conn)
cur.execute("SELECT COUNT(*) as n FROM groups WHERE name LIKE 'Тест-%'")
a = cur.fetchone()['n']
cur.execute("SELECT COUNT(*) as n FROM channels WHERE name LIKE 'Тест-%'")
b = cur.fetchone()['n']
cur.execute("SELECT COUNT(*) as n FROM group_join_requests WHERE user_id = %s", (GUEST,))
rq = cur.fetchone()['n']
cur.execute('PRAGMA foreign_key_check')
fk = cur.fetchall()
conn.close()
step('группы удалены', a == 0, a)
step('каналы удалены', b == 0, b)
step('заявки удалены', rq == 0, rq)
step('foreign_key_check чист', not fk, fk)

print('\nИТОГ: %d/%d' % (sum(ok), len(ok)))