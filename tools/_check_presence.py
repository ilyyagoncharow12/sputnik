# -*- coding: utf-8 -*-
"""Тесты онлайн-статуса и приватности времени захода (v0.62.2)."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database as db
import main

PASS = 0
FAIL = 0


def check(name, cond, extra=''):
    global PASS, FAIL
    if cond:
        PASS += 1
        print('OK   %s' % name)
    else:
        FAIL += 1
        print('FAIL %s %s' % (name, extra))


def set_privacy(user_id, value):
    conn = db.get_db()
    cur = db.dict_cursor(conn)
    cur.execute('UPDATE users SET privacy_last_seen = %s WHERE id = %s', (value, user_id))
    conn.commit()
    conn.close()


def add_contact(a, b):
    conn = db.get_db()
    cur = db.dict_cursor(conn)
    cur.execute('DELETE FROM contacts WHERE (user_id = %s AND contact_id = %s)', (a, b))
    cur.execute('INSERT INTO contacts (user_id, contact_id) VALUES (%s, %s)', (a, b))
    conn.commit()
    conn.close()


def del_contact(a, b):
    conn = db.get_db()
    cur = db.dict_cursor(conn)
    cur.execute('DELETE FROM contacts WHERE (user_id = %s AND contact_id = %s)', (a, b))
    conn.commit()
    conn.close()


PASSWORD = 'presencetest123'


def ensure_user(phone, username):
    """Тестовый пользователь создаётся при первом запуске и удаляется вручную."""
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


def login(phone, password):
    app = main.app
    app.config['TESTING'] = True
    c = app.test_client()
    c.get('/auth?mode=login')
    with c.session_transaction() as s:
        tok = s.get('csrf_token')
    r = c.post('/auth', data={'action': 'login', 'phone': phone, 'password': password,
                               'remember': 'on'},
               headers={'X-CSRF-Token': tok})
    return c, (r.status_code == 302)


def users_by_phone(*phones):
    conn = db.get_db()
    cur = db.dict_cursor(conn)
    out = {}
    for p in phones:
        cur.execute('SELECT id FROM users WHERE phone = %s', (p,))
        row = cur.fetchone()
        out[p] = row['id'] if row else None
    conn.close()
    return out


print('--- v0.62.2: онлайн-статус и приватность ---')
A = ensure_user('+70000000001', 'pres1')
B = ensure_user('+70000000002', 'pres2')
C = ensure_user('+70000000003', 'pres3')

if not all([A, B, C]):
    print('SKIP: тестовых пользователей нет')
    sys.exit(0)

# Нужны личные чаты A<->B и A<->C, иначе в списке чатов их не будет
db.get_or_create_chat(A, B)
db.get_or_create_chat(A, C)

# 1) everyone — видно
set_privacy(B, 'everyone')
check('everyone: can_see_last_seen(A,B)', db.can_see_last_seen(A, B) is True)
check('everyone: себя видно всегда', db.can_see_last_seen(A, A) is True)

# 2) nobody — не видно
set_privacy(B, 'nobody')
check('nobody: не видно', db.can_see_last_seen(A, B) is False)
check('nobody: себе видно', db.can_see_last_seen(B, B) is True)

# 3) contacts — только контакт
set_privacy(B, 'contacts')
add_contact(A, B)
check('contacts: контакт видит', db.can_see_last_seen(A, B) is True)
check('contacts: не-контакт не видит', db.can_see_last_seen(C, B) is False)
del_contact(A, B)
check('contacts: после удаления не видит', db.can_see_last_seen(A, B) is False)

# 4) can_see_last_seen_many совпадает с одиночной проверкой
set_privacy(B, 'everyone')
set_privacy(C, 'nobody')
many = db.can_see_last_seen_many(A, [B, C, A, None])
check('many: B виден (everyone)', B in many)
check('many: C скрыт (nobody)', C not in many)
check('many: себя не возвращает', A not in many)
check('many: пустой список', db.can_see_last_seen_many(A, []) == set())
check('many: все None', db.can_see_last_seen_many(A, [None]) == set())

# 5) API: is_online выставляется и скрывается по приватности
app = main.app
app.config['TESTING'] = True
with app.test_client() as ca:
    ca.get('/auth?mode=login')
    with ca.session_transaction() as s:
        s['user_id'] = A
    r = ca.get('/api/get_chats_list')
    check('API /api/get_chats_list отвечает 200', r.status_code == 200, r.status_code)
    chats = r.get_json() or []
    ch_b = next((c for c in chats if c.get('other_user_id') == B), None)
    ch_c = next((c for c in chats if c.get('other_user_id') == C), None)
    check('в списке чатов есть поле is_online', ch_b is not None and 'is_online' in ch_b)
    check('скрытый (nobody) last_seen обнулён', ch_c is not None and ch_c.get('last_seen') is None)
    check('у скрытого is_online=false', ch_c is not None and ch_c.get('is_online') is False)

    set_privacy(C, 'everyone')
    r = ca.get('/api/get_chats_list')
    chats = r.get_json() or []
    ch_c = next((c for c in chats if c.get('other_user_id') == C), None)
    check('посди privacy last_seen вернулся', ch_c is not None and ch_c.get('last_seen') is not None)
    set_privacy(C, 'nobody')

# 5a) last_seen не должен утекать через /api/get_user и /api/get_user_by_username
with app.test_client() as ca:
    ca.get('/auth?mode=login')
    with ca.session_transaction() as s:
        s['user_id'] = A
    d = (ca.get('/api/get_user/%d' % C).get_json() or {})
    check('/api/get_user: скрытый last_seen = None', d.get('last_seen') is None, d.get('last_seen'))
    check('/api/get_user: скрытому is_online=False', d.get('is_online') is False)
    d = (ca.get('/api/get_user_by_username?username=pres3').get_json() or {})
    check('/api/get_user_by_username: скрытый last_seen = None', d.get('last_seen') is None, d.get('last_seen'))

    set_privacy(C, 'everyone')
    d = (ca.get('/api/get_user/%d' % C).get_json() or {})
    check('/api/get_user: при everyone last_seen виден', d.get('last_seen') is not None)
    d = (ca.get('/api/get_user_by_username?username=pres3').get_json() or {})
    check('/api/get_user_by_username: при everyone last_seen виден', d.get('last_seen') is not None)

    set_privacy(C, 'nobody')
    d = (ca.get('/api/get_user/%d' % A).get_json() or {})
    check('/api/get_user: себе last_seen виден', d.get('last_seen') is not None)

# 6) Присутствие в памяти: онлайн-юзер помечается, офлайн — нет
main.online_user_sids[B] = {'fake-sid'}
check('is_user_online(B) истина', main.is_user_online(B) is True)
r = None
with app.test_client() as ca:
    ca.get('/auth?mode=login')
    with ca.session_transaction() as s:
        s['user_id'] = A
    r = ca.get('/api/get_chats_list')
    chats = r.get_json() or []
    ch_b = next((c for c in chats if c.get('other_user_id') == B), None)
    check('онлайн-собеседник помечен is_online', ch_b is not None and ch_b.get('is_online') is True)

    # но скрытому C статус не передаётся, даже если он «онлайн»
    main.online_user_sids[C] = {'fake-sid'}
    r = ca.get('/api/get_chats_list')
    chats = r.get_json() or []
    ch_c = next((c for c in chats if c.get('other_user_id') == C), None)
    check('скрытому не показываем онлайн', ch_c is not None and ch_c.get('is_online') is False)

main.online_user_sids.pop(B, None)
main.online_user_sids.pop(C, None)

# 7) Профиль
with app.test_client() as ca:
    ca.get('/auth?mode=login')
    with ca.session_transaction() as s:
        s['user_id'] = A
    main.online_user_sids[B] = {'fake-sid'}
    r = ca.get('/api/get_user_profile/%d' % B)
    data = r.get_json() or {}
    check('профиль: is_online=true у онлайн', data.get('is_online') is True, data.get('is_online'))
    r = ca.get('/api/get_chat/%d' % C)
    d2 = r.get_json() or {}
    check('профиль скрытого: last_seen пуст', (d2.get('other_user') or {}).get('last_seen') is None)
    check('профиль скрытого: is_online=false', (d2.get('other_user') or {}).get('is_online') is False)
    r = ca.get('/api/get_user/%d' % B)
    check('/api/get_user: есть is_online', (r.get_json() or {}).get('is_online') is True)
main.online_user_sids.pop(B, None)

# 8) Без авторизации — 401
with app.test_client() as cu:
    check('без сессии /api/get_chats_list = 401', cu.get('/api/get_chats_list').status_code == 401)

# 9) Уведомление о присутствии не падает и не шлёт «nobody»
main.online_user_sids[A] = {'sid-a'}
main.online_user_sids[B] = {'sid-b'}
set_privacy(B, 'nobody')
received = []
_orig_emit = main.socketio.emit


def spy_emit(event, *a, **kw):
    if event == 'presence_update':
        received.append((dict(a[0]) if a else {}, kw))
    return _orig_emit(event, *a, **kw)


main.socketio.emit = spy_emit
try:
    main.notify_presence(B, True)
    check('nobody: событие не отправлено', len(received) == 0, received)
    set_privacy(B, 'everyone')
    main.notify_presence(B, True)
    check('everyone: событие отправлено', len(received) == 1, received)
    check('событие содержит online=True', received and received[0][0].get('online') is True)
finally:
    main.socketio.emit = _orig_emit
    main.online_user_sids.pop(A, None)
    main.online_user_sids.pop(B, None)

set_privacy(B, 'everyone')
set_privacy(C, 'nobody')

print('-' * 40)
print('ИТОГ: %d OK, %d FAIL' % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
