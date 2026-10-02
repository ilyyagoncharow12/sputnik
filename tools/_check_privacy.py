# -*- coding: utf-8 -*-
"""Проверка, что содержимое приватных групп/каналов не утекает посторонним."""
import main
import database

app = main.app
app.config['TESTING'] = True
OWNER, GUEST = 4, 7
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


conn = database.get_db()
cur = database.dict_cursor(conn)
cur.execute("DELETE FROM groups WHERE name LIKE 'LEAK-%'")
cur.execute("DELETE FROM channels WHERE name LIKE 'LEAK-%'")
conn.commit()
conn.close()

own = client_for(OWNER)
guest = client_for(GUEST)

pg = database.create_group('LEAK-Приватная', OWNER, 'СЕКРЕТ ГРУППЫ', False, username='leakpg')
pubg = database.create_group('LEAK-Публичная', OWNER, 'открытый текст', True, username='leakpubg')
pc = database.create_channel('LEAK-Приватный', OWNER, 'СЕКРЕТ КАНАЛА', False, username='leakpc')
pubc = database.create_channel('LEAK-Публичный', OWNER, 'открытый канал', True, username='leakpubc')

# --- поиск по имени: приватные не светятся
d = guest.get('/api/search_all?q=LEAK').get_json()
step('поиск по имени не выдаёт приватные',
     len(d['groups']) == 1 and d['groups'][0]['id'] == pubg,
     f"группы={[g['name'] for g in d['groups']]} каналы={[c['name'] for c in d['channels']]}")
step('поиск по имени: публичная группа видна с описанием',
     d['groups'] and d['groups'][0]['description'] == 'открытый текст')

# --- поиск по username: приватная находится, но内容 закрыто
d = guest.get('/api/search_all?q=leakpg').get_json()
step('приватная группа находится по @username', len(d['groups']) == 1, d['groups'])
step('приватная группа: описание скрыто', d['groups'] and d['groups'][0]['description'] is None)
step('приватная группа: аватар скрыт', d['groups'] and d['groups'][0]['avatar'] is None)
step('приватная группа: имя и username видны', d['groups'] and d['groups'][0]['name'] == 'LEAK-Приватная')

d = guest.get('/api/search_all?q=leakpc').get_json()
step('приватный канал находится по @username', len(d['channels']) == 1)
step('приватный канал: описание скрыто', d['channels'] and d['channels'][0]['description'] is None)
step('приватный канал: аватар скрыт', d['channels'] and d['channels'][0]['avatar'] is None)
step('приватная группа: invite_link не утёк', d and all('invite_link' not in x for x in d['groups']))
step('приватный канал: invite_link не утёк', d and all('invite_link' not in x for x in d['channels']))

# --- публичные не пострадали
d = guest.get('/api/search_all?q=leakpubg').get_json()
step('публичная группа: описание видно', d['groups'] and d['groups'][0]['description'] == 'открытый текст')
d = guest.get('/api/search_all?q=leakpubc').get_json()
step('публичный канал: описание видно', d['channels'] and d['channels'][0]['description'] == 'открытый канал')

# --- витрина
d = guest.get(f'/api/group/{pg}/public').get_json()
step('витрина приватной группы: описание скрыто', d['group']['description'] is None)
step('витрина приватной группы: участников не отдаёт', not d.get('members'))
step('витрина приватной группы: can_view False', d['can_view'] is False)

d = guest.get(f'/api/channel/{pc}/public').get_json()
step('витрина приватного канала: описание скрыто', d['channel']['description'] is None)
step('витрина приватного канала: аватар скрыт', d['channel']['avatar'] is None)

# --- владелец видит своё
d = own.get(f'/api/group/{pg}/public').get_json()
step('владелец видит описание группы', d['group']['description'] == 'СЕКРЕТ ГРУППЫ')
step('владелец видит участников', len(d.get('members') or []) == 1)
d = own.get(f'/api/channel/{pc}/public').get_json()
step('владелец-подписчик видит описание канала', d['channel']['description'] == 'СЕКРЕТ КАНАЛА')

# --- чистим за собой
for c in (pubc, pc):
    database.delete_channel(c, OWNER)
for g in (pg, pubg):
    database.delete_group(g, OWNER)
conn = database.get_db()
cur = database.dict_cursor(conn)
cur.execute("SELECT COUNT(*) as n FROM groups WHERE name LIKE 'LEAK-%'")
a = cur.fetchone()['n']
cur.execute("SELECT COUNT(*) as n FROM channels WHERE name LIKE 'LEAK-%'")
b = cur.fetchone()['n']
conn.close()
step('группы удалены', a == 0, a)
step('каналы удалены', b == 0, b)

print('\nИТОГ: %d/%d' % (sum(ok), len(ok)))