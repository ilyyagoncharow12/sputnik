# -*- coding: utf-8 -*-
"""Проверка безопасности (v0.63.0):

  1. Секреты 2FA/паскода хешируются bcrypt (с солью), а не несолёным SHA-256,
     со старой миграцией на лету.
  2. Перебор пароля/кода/облачного пароля блокируется ПО АККАУНТУ, а не по IP.
  3. Открытая вкладка удалённого аккаунта больше не работает.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database as db
import main

PASS = 0
FAIL = 0

PHONE = '+70000000991'
USERNAME = 'sectest1'
PASSWORD = 'sectestpass1'


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
        # Приводим пароль к известному, чтобы тест был воспроизводим.
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
    """Полностью убирает тестового пользователя со следами."""
    conn = db.get_db()
    cur = db.dict_cursor(conn)
    cur.execute('SELECT id FROM chats WHERE user1_id = %s OR user2_id = %s', (uid, uid))
    chats = [r['id'] for r in cur.fetchall()]
    if chats:
        cph = ','.join(str(i) for i in chats)
        for sql in ('DELETE FROM messages WHERE chat_id IN (%s)' % cph,
                    'DELETE FROM folder_chats WHERE chat_id IN (%s)' % cph,
                    'DELETE FROM chats WHERE id IN (%s)' % cph):
            try:
                cur.execute(sql)
            except Exception:
                pass
    for sql in ('DELETE FROM messages WHERE sender_id = %s' % uid,
                'DELETE FROM user_sessions WHERE user_id = %s' % uid,
                'DELETE FROM contacts WHERE user_id = %s OR contact_id = %s' % (uid, uid),
                'DELETE FROM blocked_users WHERE user_id = %s OR blocked_user_id = %s' % (uid, uid),
                'DELETE FROM chat_folders WHERE user_id = %s' % uid,
                'DELETE FROM login_codes WHERE user_id = %s' % uid):
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


def csrf_client(user_id=None):
    app = main.app
    app.config['TESTING'] = True
    # Сбрасываем IP-лимит, чтобы тест проверял именно анти-перебор по аккаунту.
    main.RATE_LIMIT_REQUESTS.clear()
    c = app.test_client()
    c.get('/auth?mode=login')
    with c.session_transaction() as s:
        tok = s.get('csrf_token')
        if user_id is not None:
            s['user_id'] = user_id
    return c, tok


def db_hash(uid, column):
    conn = db.get_db()
    cur = db.dict_cursor(conn)
    cur.execute('SELECT %s AS h FROM users WHERE id = %%s' % column, (uid,))
    h = cur.fetchone()['h']
    conn.close()
    return h


print('--- v0.63.0: безопасность (хеши секретов, анти-перебор, удалённые сессии) ---')

uid = ensure_user(PHONE, USERNAME, PASSWORD)
if not uid:
    print('SKIP: не удалось создать тестового пользователя')
    sys.exit(0)


# ============ 1. СЕКРЕТЫ: bcrypt вместо несолёного SHA-256 ============
print('\n[1] Хеширование секретов')
h1 = db._hash_secret('1234')
h2 = db._hash_secret('1234')
check('_hash_secret даёт bcrypt ($2...)', h1.startswith('$2'), h1[:8])
check('соль: одинаковый ввод даёт разные хэши', h1 != h2)
check('_verify_secret распознаёт правильный секрет', db._verify_secret(h1, '1234') is True)
check('_verify_secret отклоняет неверный', db._verify_secret(h1, '12345') is False)

legacy = db._legacy_secret_hash('1234')
check('legacy-хэш — 64 hex-символа (старый sha256)', len(legacy) == 64 and not legacy.startswith('$2'))
check('_verify_secret ещё принимает legacy-хэш', db._verify_secret(legacy, '1234') is True)

db.set_cloud_password(uid, 'cloud1234', hint='тест')
check('облачный пароль хранится как bcrypt', db_hash(uid, 'cloud_password_hash').startswith('$2'))
check('check_cloud_password: верный пароль', db.check_cloud_password(uid, 'cloud1234') is True)
check('check_cloud_password: неверный пароль', db.check_cloud_password(uid, 'nope') is False)

# миграция старого облачного пароля
conn = db.get_db()
cur = db.dict_cursor(conn)
cur.execute('UPDATE users SET cloud_password_hash = %s WHERE id = %s',
            (db._legacy_secret_hash('cloud1234'), uid))
conn.commit()
conn.close()
check('старый sha256 облачного пароля принимается', db.check_cloud_password(uid, 'cloud1234') is True)
check('после входа sha256 МИГРИРОВАН в bcrypt', db_hash(uid, 'cloud_password_hash').startswith('$2'))

db.set_app_passcode(uid, '4321', hint='код')
check('паскод хранится как bcrypt', db_hash(uid, 'app_passcode_hash').startswith('$2'))
check('check_app_passcode: верный', db.check_app_passcode(uid, '4321') is True)
check('check_app_passcode: неверный', db.check_app_passcode(uid, '0000') is False)

conn = db.get_db()
cur = db.dict_cursor(conn)
cur.execute('UPDATE users SET app_passcode_hash = %s WHERE id = %s',
            (db._legacy_secret_hash('4321'), uid))
conn.commit()
conn.close()
check('старый sha256 паскода принимается', db.check_app_passcode(uid, '4321') is True)
check('паскод после входа МИГРИРОВАН в bcrypt', db_hash(uid, 'app_passcode_hash').startswith('$2'))


# ============ 2. АНТИ-ПЕРЕБОР ПО АККАУНТУ ============
print('\n[2] Перебор по аккаунту (не по IP)')
login_key = main.auth_failure_key('login', PHONE)
main.clear_auth_failures(login_key)

last = None
for i in range(5):
    c, tok = csrf_client()
    r = c.post('/auth', data={'action': 'login', 'phone': PHONE, 'password': 'wrong%d' % i},
               headers={'X-CSRF-Token': tok})
    last = r.status_code
check('5 неверных паролей → 401', last == 401, last)
check('счётчик неудач набрался', main.auth_lock_remaining(login_key) > 0)

# 6-я попытка с ДРУГОГО IP — всё равно 429
c, tok = csrf_client()
r = c.post('/auth', data={'action': 'login', 'phone': PHONE, 'password': 'wrong-again'},
           headers={'X-CSRF-Token': tok}, environ_base={'REMOTE_ADDR': '10.9.9.9'})
check('6-я неудача (другой IP) → 429', r.status_code == 429, r.status_code)

# ДАЖЕ ВЕРНЫЙ пароль с другого IP заперт — значит лимит по аккаунту
c, tok = csrf_client()
r = c.post('/auth', data={'action': 'login', 'phone': PHONE, 'password': PASSWORD},
           headers={'X-CSRF-Token': tok}, environ_base={'REMOTE_ADDR': '10.9.9.10'})
check('верный пароль, но аккаунт заперт → 429', r.status_code == 429, r.status_code)
check('в ответе 429 есть Retry-After', bool(r.headers.get('Retry-After')))

main.clear_auth_failures(login_key)
check('после сброса счётчик обнулён', main.auth_lock_remaining(login_key) == 0)
c, tok = csrf_client()
r = c.post('/auth', data={'action': 'login', 'phone': PHONE, 'password': PASSWORD, 'remember': 'on'},
           headers={'X-CSRF-Token': tok})
check('после сброса верный пароль входит (302)', r.status_code == 302, r.status_code)

# успех очищает счётчик: 2 неудачи + верный вход
main.clear_auth_failures(login_key)
for i in range(2):
    c, tok = csrf_client()
    c.post('/auth', data={'action': 'login', 'phone': PHONE, 'password': 'bad%d' % i},
           headers={'X-CSRF-Token': tok})
c, tok = csrf_client()
r = c.post('/auth', data={'action': 'login', 'phone': PHONE, 'password': PASSWORD},
           headers={'X-CSRF-Token': tok})
check('верный пароль после 2 неудач входит (302)', r.status_code == 302, r.status_code)
check('успешный вход очистил счётчик неудач', main.auth_lock_remaining(login_key) == 0)


# ============ 3. АНТИ-ПЕРЕБОР ОБЛАЧНОГО ПАРОЛЯ (2FA) ============
print('\n[3] Перебор облачного пароля')
db.set_cloud_password(uid, 'cloud1234')
twofa_key = main.auth_failure_key('2fa', PHONE)
main.clear_auth_failures(twofa_key)
last = None
for i in range(5):
    c, tok = csrf_client()
    r = c.post('/api/2fa/verify', json={'phone': PHONE, 'password': 'bad%d' % i},
               headers={'X-CSRF-Token': tok})
    last = r.status_code
check('5 неверных облачных паролей → 401', last == 401, last)
c, tok = csrf_client()
r = c.post('/api/2fa/verify', json={'phone': PHONE, 'password': 'cloud1234'},
           headers={'X-CSRF-Token': tok}, environ_base={'REMOTE_ADDR': '10.9.9.11'})
check('верный облачный пароль при блокировке → 429', r.status_code == 429, r.status_code)
main.clear_auth_failures(twofa_key)
c, tok = csrf_client()
r = c.post('/api/2fa/verify', json={'phone': PHONE, 'password': 'cloud1234'},
           headers={'X-CSRF-Token': tok})
check('после сброса облачный пароль принят', r.get_json().get('success') is True)


# ============ 4. АНТИ-ПЕРЕБОР ПАСКОДА БЛОКИРОВКИ ============
print('\n[4] Перебор кода блокировки приложения')
db.set_app_passcode(uid, '4321')
lock_key = main.auth_failure_key('lock', uid)
main.clear_auth_failures(lock_key)
last = None
for i in range(5):
    c, tok = csrf_client(uid)
    r = c.post('/api/app_lock/verify', json={'passcode': '000%d' % i},
               headers={'X-CSRF-Token': tok})
    last = r.status_code
check('5 неверных паскодов → 200 с success=false', last == 200, last)
c, tok = csrf_client(uid)
r = c.post('/api/app_lock/verify', json={'passcode': '4321'},
           headers={'X-CSRF-Token': tok})
check('верный паскод при блокировке → 429', r.status_code == 429, r.status_code)
main.clear_auth_failures(lock_key)
c, tok = csrf_client(uid)
r = c.post('/api/app_lock/verify', json={'passcode': '4321'},
           headers={'X-CSRF-Token': tok})
check('после сброса паскод принят', r.get_json().get('success') is True)


# ============ 5. СЕССИЯ УДАЛЁННОГО АККАУНТА ============
print('\n[5] Живая сессия удалённого аккаунта')
c, tok = csrf_client(uid)
r = c.get('/api/get_my_user')
check('активный аккаунт: /api/get_my_user = 200', r.status_code == 200, r.status_code)

conn = db.get_db()
cur = db.dict_cursor(conn)
cur.execute('UPDATE users SET is_deleted = TRUE WHERE id = %s', (uid,))
conn.commit()
conn.close()

r = c.get('/api/get_my_user')
check('удалённый: API отвечает 403', r.status_code == 403, r.status_code)
check('в ответе помечено deleted', (r.get_json() or {}).get('deleted') is True)
r2 = c.get('/api/get_my_user')
check('сессия сброшена (повторный запрос уже без входа)', r2.status_code == 401, r2.status_code)
r3 = c.get('/chat')
check('страница /chat уводит удалённого на вход', r3.status_code == 302, r3.status_code)

# сбросим флаг для последующей уборки
conn = db.get_db()
cur = db.dict_cursor(conn)
cur.execute('UPDATE users SET is_deleted = FALSE WHERE id = %s', (uid,))
conn.commit()
conn.close()


# ============ 6. УБОРКА ============
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
