"""Проверка обслуживания БД (раздел 4A CHANGELOG).

Чистить ничего нельзя без явного подтверждения, доступ — только
системный аккаунт или MAINTENANCE_USERS.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database  # noqa: E402
import main as app_module  # noqa: E402
from database import get_db, dict_cursor  # noqa: E402

ADMIN = 4        # @admin — есть в MAINTENANCE_USERS по умолчанию
STRANGER = 7     # ilxz_12 — обычный пользователь
HEADERS = {'X-CSRF-Token': 't'}

passed = failed = 0


def step(name, cond, extra=''):
    global passed, failed
    if cond:
        passed += 1
        print('OK   ' + name)
    else:
        failed += 1
        print('FAIL ' + name + (' -> ' + str(extra) if extra != '' else ''))


def client_for(uid):
    cl = app_module.app.test_client()
    with cl.session_transaction() as s:
        s['user_id'] = uid
        s['csrf_token'] = 't'
    return cl


def make_temp_user(tag):
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('SELECT id FROM users WHERE username = %s', (tag,))
        row = cur.fetchone()
        if row:
            return row['id']
        import random
        phone = '+7998%07d' % random.randint(0, 9999999)
        cur.execute('''
            INSERT INTO users (unique_id, phone, username, display_name, password)
            VALUES (%s, %s, %s, %s, %s) RETURNING id
        ''', (abs(hash(phone)) % 900000 + 100000, phone, tag, 'Тест ' + tag, 'x'))
        uid = cur.fetchone()['id']
        conn.commit()
        return uid
    finally:
        conn.close()


def count(table, where, args):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute(f'SELECT COUNT(*) AS n FROM {table} WHERE {where}', args)
    n = cur.fetchone()['n']
    conn.close()
    return n


def main():
    temp = make_temp_user('maintest_u')
    admin = client_for(ADMIN)
    stranger = client_for(STRANGER)

    try:
        # --- доступ ---
        r = stranger.get('/api/db/health')
        step('чужому health закрыт (403)', r.status_code == 403, r.get_json())
        r = stranger.post('/api/db/backup', json={}, headers=HEADERS)
        step('чужому backup закрыт (403)', r.status_code == 403, r.get_json())
        r = stranger.post('/api/db/cleanup_orphans', json={}, headers=HEADERS)
        step('чужому cleanup закрыт (403)', r.status_code == 403, r.get_json())
        anon = app_module.app.test_client()
        step('без сессии 401', anon.get('/api/db/health').status_code == 401)

        # --- health ---
        r = admin.get('/api/db/health')
        d = r.get_json()
        step('health 200', r.status_code == 200, d)
        h = (d or {}).get('health') or {}
        step('целостность в порядке', h.get('integrity') == 'ok', h.get('integrity'))
        step('битых ссылок нет', h.get('foreign_keys_total') == 0, h.get('foreign_keys_total'))
        step('размер БД известен', (h.get('db_size') or 0) > 0, h.get('db_size'))
        step('число таблиц известно', (h.get('tables') or 0) > 10, h.get('tables'))

        # --- backup ---
        r = admin.post('/api/db/backup', json={}, headers=HEADERS)
        d = r.get_json()
        step('backup 200', r.status_code == 200, d)
        name = (d or {}).get('backup') or ''
        step('имя файла возвращено', name.endswith('.db'), name)
        folder = os.path.join(os.path.dirname(os.path.abspath(database.DB_PATH)), 'backups')
        step('файл бэкапа на диске', os.path.exists(os.path.join(folder, name)))
        step('бэкап не пустой', os.path.getsize(os.path.join(folder, name)) > 1000)

        # --- осиротевшие записи ---
        gid = database.create_group('maintest-group', ADMIN, 'для проверки чистки', False)
        mid = database.send_message(sender_id=ADMIN, group_id=gid, content='сообщение группы')['id']
        step('сообщение создано', count('messages', 'id = %s', (mid,)) == 1)

        # Удаляем группу «в обход» delete_group, чтобы получить сироту
        conn = get_db()
        cur = dict_cursor(conn)
        cur.execute('DELETE FROM groups WHERE id = %s', (gid,))
        conn.commit()
        conn.close()
        step('сирота появилась', count('messages', 'id = %s', (mid,)) == 1)

        r = admin.post('/api/db/cleanup_orphans', json={}, headers=HEADERS)
        rep = (r.get_json() or {}).get('report') or {}
        step('dry-run 200', r.status_code == 200, r.get_json())
        step('dry-run ничего не удалил', count('messages', 'id = %s', (mid,)) == 1)
        step('dry-run нашёл сироту', rep.get('total', 0) >= 1, rep.get('total'))
        step('dry-run помечен', rep.get('dry_run') is True)

        # apply без confirm — отказ, ничего не чистим
        r = admin.post('/api/db/cleanup_orphans',
                       json={'apply': True}, headers=HEADERS)
        d = r.get_json() or {}
        step('apply без confirm не чистит', count('messages', 'id = %s', (mid,)) == 1)
        step('apply без confirm — 400 с ошибкой',
             r.status_code == 400 and not d.get('success'), d)

        # настоящая чистка
        r = admin.post('/api/db/cleanup_orphans',
                       json={'apply': True, 'confirm': 'DELETE'}, headers=HEADERS)
        d = r.get_json()
        rep = (d or {}).get('report') or {}
        step('чистка 200', r.status_code == 200, d)
        step('сирота удалена', count('messages', 'id = %s', (mid,)) == 0)
        step('бэкап сделан автоматически', bool(rep.get('backup')), rep.get('backup'))

        h = admin.get('/api/db/health').get_json()['health']
        step('после чистки ссылок целы', h.get('foreign_keys_total') == 0, h)

        # --- важные данные не трогаются ---
        step('пользователи на месте', count('users', 'id = %s', (ADMIN,)) == 1)

    finally:
        conn = get_db()
        cur = dict_cursor(conn)
        cur.execute("DELETE FROM users WHERE username LIKE 'maintest_%'")
        cur.execute("DELETE FROM groups WHERE name LIKE 'maintest-%'")
        cur.execute("DELETE FROM messages WHERE content = 'сообщение группы'")
        conn.commit()
        conn.close()

    print(f'\nИТОГ: {passed}/{passed + failed}')
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    sys.exit(main())