# -*- coding: utf-8 -*-
"""Smoke-тест живого PostgreSQL (прод): DB_BACKEND=postgres, DATABASE_URL из env.

Проверяет: коннект, init_db, гарды, регистрацию/вход, сообщения, опросы,
сессии/отзыв, облачный пароль, db_health. Всё через database.py —
main.py не импортируется. Тестовые строки чистятся в конце.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database as db

PASS = 0
FAIL = 0
PHONE = '+70000000993'
USERNAME = 'pgtest1'
PASSWORD = 'pgtestpass1'


def check(name, cond, extra=''):
    global PASS, FAIL
    if cond:
        PASS += 1
        print('OK   %s' % name)
    else:
        FAIL += 1
        print('FAIL %s %s' % (name, extra))


print('--- postgres smoke ---')
check('бэкенд postgres', db.is_postgres() is True, db.DB_BACKEND)

conn = db.get_db()
cur = db.dict_cursor(conn)
cur.execute('SELECT version() AS v')
check('коннект к PG', bool((cur.fetchone() or {}).get('v')))
conn.close()

db.init_db()
conn = db.get_db()
cur = db.dict_cursor(conn)
cur.execute("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = 'public'")
ntables = (cur.fetchone() or {}).get('n', 0)
conn.close()
check('init_db создал таблицы', ntables > 30, ntables)

conn = db.get_db()
cur = db.dict_cursor(conn)
cur.execute("SELECT COUNT(*) AS n FROM pg_trigger WHERE tgname LIKE 'trg_users_protected%' AND NOT tgisinternal")
ntrg = (cur.fetchone() or {}).get('n', 0)
conn.close()
check('plpgsql-гарды стоят', ntrg >= 2, ntrg)

# чистка остатков прошлого прогона (если был)
conn = db.get_db()
cur = db.dict_cursor(conn)
cur.execute('SELECT id FROM users WHERE phone = %s', (PHONE,))
old = cur.fetchone()
conn.close()
if old:
    _c = db.get_db()
    _cc = db.dict_cursor(_c)
    for sql, p in (('DELETE FROM messages WHERE sender_id = %s', (old['id'],)),
                   ('DELETE FROM user_sessions WHERE user_id = %s', (old['id'],)),
                   ('DELETE FROM users WHERE id = %s', (old['id'],))):
        try:
            _cc.execute(sql, p)
        except Exception:
            pass
    try:
        _c.commit()
    except Exception:
        pass
    _c.close()

uid = db.create_user_initial(PHONE, PASSWORD)
check('create_user_initial', bool(uid), uid)
db.complete_registration(uid, USERNAME, 'PG Test')
u = db.verify_user(PHONE, PASSWORD)
check('регистрация + вход', bool(u) and u['id'] == uid)

cid = db.get_or_create_chat(uid, uid)
check('self-чат', bool(cid), cid)
m = db.send_message(chat_id=cid, sender_id=uid, content='pg smoke')
check('send_message', bool(m and m.get('id')), m)
msgs = db.get_messages(chat_id=cid, user_id=uid)
check('get_messages видит', any(x['id'] == m['id'] for x in msgs), len(msgs))

pid = db.create_poll(cid, None, None, 'pg?', ['да', 'нет'], True, uid)
check('create_poll', bool(pid), pid)
check('vote_poll', db.vote_poll(pid, uid, 0) is True)

db.add_session(uid, 'tok-pg-1', 'smoke', '127.0.0.1', '')
check('add_session + active', db.session_token_active('tok-pg-1') is True)
db.delete_session('tok-pg-1')
check('delete_session отзывает', db.session_token_active('tok-pg-1') is False)

db.set_cloud_password(uid, 'cloudpg', hint='t')
check('облачный пароль bcrypt+verify', db.check_cloud_password(uid, 'cloudpg') is True)

h = db.db_health()
check('db_health ok', h.get('ok') is True and h.get('tables', 0) > 30, h)

# гарды: защищённого удалить/пометить нельзя (sputnik защищён по умолчанию)
sys_user = db.get_system_user()
check('системный sputnik создан', bool(sys_user and sys_user.get('username') == 'sputnik'))
conn = db.get_db()
cur = db.dict_cursor(conn)
cur.execute("SELECT id FROM users WHERE lower(username) = 'sputnik'")
prot = cur.fetchone()
conn.close()
if prot:
    conn = db.get_db()
    cur = db.dict_cursor(conn)
    try:
        cur.execute('DELETE FROM users WHERE id = %s', (prot['id'],))
        conn.commit()
        check('гард DELETE защищённого', False, 'удалилось!')
    except Exception:
        check('гард DELETE защищённого', True)
        try:
            conn.rollback()
        except Exception:
            pass
    conn.close()
    conn = db.get_db()
    cur = db.dict_cursor(conn)
    try:
        cur.execute('UPDATE users SET is_deleted = TRUE WHERE id = %s', (prot['id'],))
        conn.commit()
        check('гард UPDATE защищённого', False, 'обновилось!')
    except Exception:
        check('гард UPDATE защищённого', True)
        try:
            conn.rollback()
        except Exception:
            pass
    conn.close()
else:
    check('есть защищённый sputnik', False, 'нет строки')

# уборка
conn = db.get_db()
cur = db.dict_cursor(conn)
for sql, p in (('DELETE FROM poll_votes WHERE user_id = %s', (uid,)),
               ('DELETE FROM polls WHERE created_by = %s', (uid,)),
               ('DELETE FROM messages WHERE sender_id = %s', (uid,)),
               ('DELETE FROM user_sessions WHERE user_id = %s', (uid,)),
               ('DELETE FROM users WHERE id = %s', (uid,))):
    try:
        cur.execute(sql, p)
    except Exception as e:
        print('cleanup warn: %s' % e)
try:
    conn.commit()
except Exception:
    pass
conn.close()
conn = db.get_db()
cur = db.dict_cursor(conn)
cur.execute('SELECT COUNT(*) AS n FROM users WHERE phone = %s', (PHONE,))
left = (cur.fetchone() or {}).get('n', 1)
conn.close()
check('тестовый пользователь убран', left == 0, left)

print('-' * 40)
print('ИТОГ: %d OK, %d FAIL' % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
