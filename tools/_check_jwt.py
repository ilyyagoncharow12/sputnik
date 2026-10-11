# -*- coding: utf-8 -*-
"""Проверка JWT-сессий (v0.64.0):

  1. Сеанс хранится в подписанном JWT внутри cookie sputnik_session.
  2. Cookie HttpOnly, подделать/просрочить токен нельзя.
  3. Отзыв работает: logout и «завершить сессию» реально разлогинивают.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import jwt

import database as db
import main

PASS = 0
FAIL = 0

PHONE = '+70000000992'
USERNAME = 'jwttest1'
PASSWORD = 'jwttestpass1'
COOKIE = 'sputnik_session'


def check(name, cond, extra=''):
    global PASS, FAIL
    if cond:
        PASS += 1
        print('OK   %s' % name)
    else:
        FAIL += 1
        print('FAIL %s %s' % (name, extra))


def ensure_user(phone, username, password):
    conn = db.get_db()
    cur = db.dict_cursor(conn)
    cur.execute('SELECT id FROM users WHERE phone = %s', (phone,))
    row = cur.fetchone()
    if row:
        cur.execute('UPDATE users SET password = %s, registration_complete = TRUE WHERE id = %s',
                    (db.hash_password(password), row['id']))
        conn.commit()
        conn.close()
        return row['id']
    conn.close()
    uid = db.create_user_initial(phone, password)
    conn = db.get_db()
    cur = db.dict_cursor(conn)
    cur.execute('UPDATE users SET registration_complete = TRUE, username = %s WHERE id = %s',
                (username, uid))
    conn.commit()
    conn.close()
    return uid


def purge_user(uid):
    conn = db.get_db()
    cur = db.dict_cursor(conn)
    for sql in ('DELETE FROM user_sessions WHERE user_id = %d' % uid,
                'DELETE FROM login_codes WHERE user_id = %d' % uid,
                'DELETE FROM contacts WHERE user_id = %d OR contact_id = %d' % (uid, uid),
                'DELETE FROM chat_folders WHERE user_id = %d' % uid,
                'DELETE FROM messages WHERE sender_id = %d' % uid):
        try:
            cur.execute(sql)
        except Exception:
            pass
    try:
        cur.execute('DELETE FROM users WHERE id = %s', (uid,))
    except Exception:
        cur.execute('UPDATE users SET is_deleted = TRUE WHERE id = %s', (uid,))
    conn.commit()
    conn.close()


def cookie_val(client, key=COOKIE):
    c = client.get_cookie(key)
    return c.value if c is not None else None


def login_client(password=None):
    """Логинится и возвращает (client, raw_cookie)."""
    app = main.app
    app.config['TESTING'] = True
    main.RATE_LIMIT_REQUESTS.clear()
    main.AUTH_FAILURES.clear()
    c = app.test_client()
    c.get('/auth?mode=login')
    with c.session_transaction() as s:
        tok = s.get('csrf_token')
    r = c.post('/auth', data={'action': 'login', 'phone': PHONE,
                              'password': password or PASSWORD, 'remember': 'on'},
               headers={'X-CSRF-Token': tok})
    return c, r


print('--- v0.64.0: JWT-сессии ---')

uid = ensure_user(PHONE, USERNAME, PASSWORD)
if not uid:
    print('SKIP: не удалось создать тестового пользователя')
    sys.exit(0)

secret = main.app.config['SECRET_KEY']


# ============ 1. ВХОД: cookie = JWT ============
print('\n[1] Сеанс в cookie — JWT')
c, r = login_client()
check('вход выполнен (302)', r.status_code == 302, r.status_code)
raw = cookie_val(c)
check('cookie %s выставлена' % COOKIE, bool(raw))
setc = '; '.join(r.headers.get_all('Set-Cookie') or [])
check('в cookie есть HttpOnly', 'HttpOnly' in setc, setc[:80])
check('в cookie есть SameSite', 'SameSite=' in setc, setc[:80])

claims = None
try:
    claims = jwt.decode(raw, secret, algorithms=['HS256'])
except Exception as e:
    check('cookie — валидный JWT', False, repr(e))
if claims:
    check('cookie — валидный JWT', True)
    check('в JWT есть user_id', claims.get('user_id') == uid, claims.get('user_id'))
    check('в JWT есть exp (срок)', isinstance(claims.get('exp'), int))
    check('в JWT есть jti', bool(claims.get('jti')))
    check('в JWT есть sid (для отзыва)', bool(claims.get('sid')))

# аутентификация проходит
r = c.get('/api/get_my_user')
check('с JWT защищённый API отвечает 200', r.status_code == 200, r.status_code)


# ============ 2. ПОДДЕЛКА / ПРОСРОЧКА ============
print('\n[2] Подделка и просрочка токена')
forged = jwt.encode({'user_id': uid, 'exp': int(time.time()) + 3600},
                    'not-the-real-secret-000000000000000000', algorithm='HS256')
c2 = main.app.test_client()
c2.set_cookie(COOKIE, forged, domain='localhost')
check('токен с чужим ключом отклонён (401)', c2.get('/api/get_my_user').status_code == 401)

expired = jwt.encode({'user_id': uid, 'jti': 'x',
                      'exp': int(time.time()) - 10}, secret, algorithm='HS256')
c3 = main.app.test_client()
c3.set_cookie(COOKIE, expired, domain='localhost')
check('просроченный токен отклонён (401)', c3.get('/api/get_my_user').status_code == 401)

# валидная подпись, но sid (серверной сессии) нет — тоже отказ
ghost = jwt.encode({'user_id': uid, 'sid': 'no-such-token', 'jti': 'y',
                    'exp': int(time.time()) + 3600}, secret, algorithm='HS256')
c4 = main.app.test_client()
c4.set_cookie(COOKIE, ghost, domain='localhost')
check('токен с несуществующим sid отклонён (401)', c4.get('/api/get_my_user').status_code == 401)

# мусор вместо токена
c5 = main.app.test_client()
c5.set_cookie(COOKIE, 'garbage.not.jwt', domain='localhost')
check('мусорный токен отклонён (401)', c5.get('/api/get_my_user').status_code == 401)

# без cookie
check('без cookie защищённый API → 401', main.app.test_client().get('/api/get_my_user').status_code == 401)


# ============ 3. ОТЗЫВ: terminate_session ============
print('\n[3] Отзыв: завершение сессии с другого устройства')
cA, rA = login_client()
rawA = cookie_val(cA)
sidA = jwt.decode(rawA, secret, algorithms=['HS256'])['sid']
check('у устройства A своя серверная сессия', bool(sidA))

cB, rB = login_client()
# B видит сессии и убивает сессию A по её session_token
sess = cB.get('/api/get_sessions').get_json()
tokens = [s.get('session_token') for s in (sess or [])]
check('B видит сессию A в списке', sidA in tokens, tokens)

# Нужен CSRF-токен из сессии B
with cB.session_transaction() as s:
    tokB = s.get('csrf_token')
r = cB.post('/api/terminate_session', json={'session_token': sidA},
            headers={'X-CSRF-Token': tokB})
check('terminate_session вернул success', (r.get_json() or {}).get('success') is True)

cA2 = main.app.test_client()
cA2.set_cookie(COOKIE, rawA, domain='localhost')
check('устройство A разлогинено после отзыва (401)',
      cA2.get('/api/get_my_user').status_code == 401)

# B продолжает работать
check('устройство B не тронуто (200)', cB.get('/api/get_my_user').status_code == 200)


# ============ 4. ОТЗЫВ: logout ============
print('\n[4] Отзыв: выход')
cC, rC = login_client()
rawC = cookie_val(cC)
sidC = jwt.decode(rawC, secret, algorithms=['HS256'])['sid']
check('сессия C существует до выхода', db.session_token_active(sidC) is True)
cC.get('/logout')
check('после logout серверная сессия удалена', db.session_token_active(sidC) is False)
cC2 = main.app.test_client()
cC2.set_cookie(COOKIE, rawC, domain='localhost')
check('старый токен после logout отклонён (401)',
      cC2.get('/api/get_my_user').status_code == 401)


# ============ 5. CSRF всё ещё работает ============
print('\n[5] CSRF-защита сохраняется')
cD, rD = login_client()
r = cD.post('/api/terminate_all_sessions', json={})  # без X-CSRF-Token
check('POST без CSRF-токена → 403', r.status_code == 403, r.status_code)


# ============ 6. SOCKET.IO ВИДИТ JWT-СЕССИЮ ============
print('\n[6] Socket.IO с JWT-cookie')
cS, rS = login_client()
sio = main.socketio.test_client(main.app, flask_test_client=cS)
check('Socket.IO подключился (is_connected)', sio.is_connected() is True)
# connect-хендлер читает user_id из JWT и ставит пользователя в онлайн
check('connect-хендлер аутентифицировал JWT (онлайн)',
      uid in main.online_user_sids, list(main.online_user_sids.keys()))
sio.disconnect()
check('disconnect убрал из онлайна', uid not in main.online_user_sids)


# ============ 7. УБОРКА ============
purge_user(uid)
conn = db.get_db()
cur = db.dict_cursor(conn)
cur.execute('SELECT COUNT(*) AS n FROM users WHERE phone = %s', (PHONE,))
left = cur.fetchone()['n']
conn.close()
check('тестовый пользователь удалён', left == 0, left)

print('-' * 40)
print('ИТОГ: %d OK, %d FAIL' % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
