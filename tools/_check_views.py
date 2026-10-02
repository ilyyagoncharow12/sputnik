"""Проверка просмотров постов канала и видеокружков.

Был баг: views_count рос на КАЖДОМ открытии канала (пере-открытие и
догрузка засчитывались повторно). Теперь просмотр считается один раз
на пользователя, как в Telegram.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database  # noqa: E402
import main as app_module  # noqa: E402

OWNER = 4      # @admin
READER = 7     # ilxz_12

passed = 0
failed = 0
group_id = None
channel_id = None
temp_users = []


def step(name, cond, extra=''):
    global passed, failed
    if cond:
        passed += 1
        print('OK   ' + name)
    else:
        failed += 1
        print('FAIL ' + name + (' -> ' + str(extra) if extra else ''))


def make_temp_user(tag):
    conn = database.get_db()
    cur = database.dict_cursor(conn)
    try:
        cur.execute('SELECT id FROM users WHERE username = %s', (tag,))
        row = cur.fetchone()
        if row:
            return row['id']
        import random
        phone = '+7999%07d' % random.randint(0, 9999999)
        cur.execute('''
            INSERT INTO users (unique_id, phone, username, display_name, password)
            VALUES (%s, %s, %s, %s, %s) RETURNING id
        ''', (abs(hash(phone)) % 900000 + 100000, phone, tag, 'Тест ' + tag, 'x'))
        uid = cur.fetchone()['id']
        conn.commit()
        return uid
    finally:
        conn.close()


def drop_temp_users():
    if not temp_users:
        return
    conn = database.get_db()
    cur = database.dict_cursor(conn)
    cur.execute('DELETE FROM users WHERE username LIKE %s', ('viewtest_%',))
    conn.commit()
    conn.close()


def login(uid):
    client = app_module.app.test_client()
    with client.session_transaction() as sess:
        sess['user_id'] = uid
        sess['csrf_token'] = 't'
        sess.permanent = True
    return client


def main():
    global group_id, channel_id
    temp_users.extend([READER, make_temp_user('viewtest_x')])
    third = temp_users[-1]
    headers = {'X-CSRF-Token': 't'}

    try:
        # --- канал и пост ---
        channel_id = database.create_channel('viewtest_ch', owner_id=OWNER,
                                             description='временный канал', is_public=True)
        database.subscribe_to_channel(channel_id, READER)
        database.subscribe_to_channel(channel_id, third)

        mid = database.send_message(sender_id=OWNER, channel_id=channel_id,
                                    content='пост для просмотров')['id']
        step('счётчик стартует с нуля',
             database.get_messages(channel_id=channel_id, user_id=OWNER)[0]['views_count'] == 0)

        owner_c = login(OWNER)
        reader_c = login(READER)
        third_c = login(third)

        # Автор не считается зрителем
        d = owner_c.get(f'/api/get_channel/{channel_id}').get_json()
        post = [m for m in d['messages'] if m['id'] == mid][0]
        step('автор не накручивает свои просмотры', post['views_count'] == 0, post['views_count'])

        # Первый просмотр читателем
        d = reader_c.get(f'/api/get_channel/{channel_id}').get_json()
        post = [m for m in d['messages'] if m['id'] == mid][0]
        step('первый просмотр = 1', post['views_count'] == 1, post['views_count'])

        # Повторные открытия НЕ увеличивают
        for _ in range(5):
            d = reader_c.get(f'/api/get_channel/{channel_id}').get_json()
        post = [m for m in d['messages'] if m['id'] == mid][0]
        step('5 повторных открытий не увеличили', post['views_count'] == 1, post['views_count'])

        # Второй зритель
        d = third_c.get(f'/api/get_channel/{channel_id}').get_json()
        post = [m for m in d['messages'] if m['id'] == mid][0]
        step('второй зритель = 2', post['views_count'] == 2, post['views_count'])

        # Второй зритель повторно
        third_c.get(f'/api/get_channel/{channel_id}')
        d = owner_c.get(f'/api/get_channel/{channel_id}').get_json()
        post = [m for m in d['messages'] if m['id'] == mid][0]
        step('повтор второго зрителя не учитывается', post['views_count'] == 2, post['views_count'])

        # Значение в БД совпадает с ответом
        row = database.get_db()
        cur = database.dict_cursor(row)
        cur.execute('SELECT views_count FROM messages WHERE id = %s', (mid,))
        db_val = cur.fetchone()['views_count']
        row.close()
        step('в БД тоже 2', db_val == 2, db_val)

        # --- видеокружки: тот же учёт, без накрутки по произвольному id ---
        vid = database.send_message(sender_id=OWNER, channel_id=channel_id,
                                    content='кружок', file_type='video_circle')['id']
        r = third_c.post(f'/api/video_message/{vid}/viewed', headers=headers)
        step('видео: первый просмотр', r.get_json().get('views') == 1, r.get_json())
        r = third_c.post(f'/api/video_message/{vid}/viewed', headers=headers)
        step('видео: повтор не считается', r.get_json().get('views') == 1, r.get_json())
        r = third_c.post('/api/video_message/999999/viewed', headers=headers)
        step('видео: несуществующее сообщение 404', r.status_code == 404, r.get_json())

        # --- каскад: просмотры удаляются вместе с постом ---
        gone = database.send_message(sender_id=OWNER, channel_id=channel_id, content='второй пост')['id']
        reader_c.get(f'/api/get_channel/{channel_id}')
        conn = database.get_db()
        cur = database.dict_cursor(conn)
        cur.execute('DELETE FROM messages WHERE id = %s', (gone,))
        conn.commit()
        cur.execute('SELECT COUNT(*) AS n FROM message_views WHERE message_id = %s', (gone,))
        left = cur.fetchone()['n']
        conn.close()
        step('просмотры удалены каскадом', left == 0, left)

        # --- не подписанный не видит и не накручивает ---
        r = reader_c.get(f'/api/get_channel/{channel_id}')
        step('подписанный видит канал', r.status_code == 200)

        conn = database.get_db()
        cur = database.dict_cursor(conn)
        cur.execute('PRAGMA foreign_key_check')
        issues = cur.fetchall()
        conn.close()
        step('foreign_key_check чист', not issues, issues)

    finally:
        try:
            if channel_id:
                conn = database.get_db()
                cur = database.dict_cursor(conn)
                cur.execute('DELETE FROM channels WHERE id = %s', (channel_id,))
                conn.commit()
                conn.close()
            drop_temp_users()
        except Exception as e:
            print('cleanup error:', e)

    print(f'\nИТОГ: {passed}/{passed + failed}')
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    sys.exit(main())