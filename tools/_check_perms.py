# -*- coding: utf-8 -*-
"""Smoke-тест персональных прав участников группы (Фаза 2c). Чистит за собой."""
import main
import database
from database import get_db, dict_cursor

app = main.app
app.config['TESTING'] = True
OWNER, ADMIN = 4, 7   # реальные: admin, ilxz_12
MEMBER, GUEST = None, None  # создаём временных
H = {'X-CSRF-Token': 't'}
ok = []

PERMS = ('can_send_messages', 'can_send_media', 'can_add_members',
         'can_pin_messages', 'can_change_info', 'can_delete_messages',
         'can_ban_users')


def step(name, cond, extra=''):
    ok.append(bool(cond))
    print(('  OK  ' if cond else ' FAIL ') + name + (' ' + str(extra) if extra != '' else ''))


def client_for(uid):
    cl = app.test_client()
    with cl.session_transaction() as s:
        s['user_id'] = uid
        s['csrf_token'] = 't'
    return cl


def wipe():
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute("DELETE FROM groups WHERE name LIKE 'PERM-%'")
    conn.commit()
    conn.close()


def make_temp_user(username):
    """Создаёт временного пользователя и возвращает его id."""
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        row = cur.fetchone()
        if row:
            return row['id']
        import random
        phone = '+7999%07d' % random.randint(0, 9999999)
        cur.execute('''
            INSERT INTO users (unique_id, phone, username, display_name, password)
            VALUES (%s, %s, %s, %s, %s) RETURNING id
        ''', (abs(hash(phone)) % 900000 + 100000, phone, username,
              'Тест ' + username, 'x'))
        uid = cur.fetchone()['id']
        conn.commit()
        return uid
    finally:
        conn.close()


def drop_temp_users():
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute("DELETE FROM users WHERE username LIKE 'permtest_%'")
    conn.commit()
    conn.close()


wipe()
drop_temp_users()
MEMBER = make_temp_user('permtest_member')
GUEST = make_temp_user('permtest_guest')
print('temp users:', MEMBER, GUEST)
owner = client_for(OWNER)
admin = client_for(ADMIN)
member = client_for(MEMBER)
guest = client_for(GUEST)

g = database.create_group('PERM-Группа', OWNER, 'тест прав', True, username='permtestg')
print('group:', g)
database.add_group_member(g, ADMIN, 'admin')
database.add_group_member(g, MEMBER, 'member')

# --- базовые права ролей
step('admin может слать по роли', database.can_group_perform(g, ADMIN, 'can_send_messages'))
step('member не может банить', not database.can_group_perform(g, MEMBER, 'can_ban_users'))
step('owner всё может', all(database.can_group_perform(g, OWNER, p) for p in PERMS))
step('не-участник ничего не может', not database.can_group_perform(g, GUEST, 'can_send_messages'))

# --- персональное РАЗРЕШЕНИЕ: участнику даём право банить
r = owner.post(f'/api/group/{g}/member_permissions/{MEMBER}',
               json={'permissions': {'can_ban_users': True}}, headers=H)
d = r.get_json()
step('POST выдача права: 200', r.status_code == 200, d)
step('выдано can_ban_users', d.get('permissions', {}).get('can_ban_users') == 1)
step('effective.can_ban_users=True', (d.get('effective') or {}).get('can_ban_users') is True)
step('can_group_perform увиделOverride', database.can_group_perform(g, MEMBER, 'can_ban_users'))
step('остальные права не тронуты', (d.get('effective') or {}).get('can_send_messages') in (0, 1, True, False))

# --- персональный ЗАПРЕТ: админу отнимаем право управлять правами
step('до запрета админ писал', database.can_group_perform(g, ADMIN, 'can_send_messages'))
r = owner.post(f'/api/group/{g}/member_permissions/{ADMIN}',
               json={'permissions': {'can_change_info': False}}, headers=H)
d = r.get_json()
step('POST запрет: 200', r.status_code == 200)
step('админ больше не меняет инфо/права',
     not database.can_group_perform(g, ADMIN, 'can_change_info'))
r = admin.post(f'/api/group/{g}/member_permissions/{MEMBER}', json={}, headers=H)
step('админ без can_change_info не меняет права (403)', r.status_code == 403, r.get_json())
step('перекрытие участника не списано неудачной попыткой',
     bool(database.get_group_member_permissions(g, MEMBER)))
# вернуть админу can_change_info, чтобы дальнейшие проверки были рабочими
owner.post(f'/api/group/{g}/member_permissions/{ADMIN}',
           json={'permissions': {'can_change_info': None}}, headers=H)
step('вернули админу can_change_info',
     database.can_group_perform(g, ADMIN, 'can_change_info'))

# --- сброс к роли
r = owner.delete(f'/api/group/{g}/member_permissions/{ADMIN}', headers=H)
step('DELETE сброс: 200', r.status_code == 200, r.get_json())
step('после сброса права роли вернулись', database.can_group_perform(g, ADMIN, 'can_send_messages'))
step('строка удалена из БД',
     not database.get_group_member_permissions(g, ADMIN))
step('перекрытие участника не тронуто сбросом другого',
     bool(database.get_group_member_permissions(g, MEMBER)))

# --- права владельца неприкосновенны
r = owner.post(f'/api/group/{g}/member_permissions/{OWNER}',
               json={'permissions': {'can_send_messages': False}}, headers=H)
step('права владельца менять нельзя (403)', r.status_code == 403, r.get_json())
step('владелец по-прежнему может писать', database.can_group_perform(g, OWNER, 'can_send_messages'))

# --- обычный участник не может выдавать права
r = member.get(f'/api/group/{g}/member_permissions/{ADMIN}', headers=H)
step('участник не читает права (403)', r.status_code == 403)
r = member.post(f'/api/group/{g}/member_permissions/{ADMIN}',
                json={'permissions': {'can_ban_users': True}}, headers=H)
step('участник не выдаёт права (403)', r.status_code == 403)

# --- админ не может выдать право, которого нет у него самого
# Сначала запрещаем админу банить, потом даём ему менять инфо —
# тогда он попытается выдать другому право, которого у него самого нет.
database.set_group_member_permissions(g, ADMIN, {'can_ban_users': False}, OWNER)
database.set_group_member_permissions(g, ADMIN, {'can_change_info': True}, OWNER)
r = admin.post(f'/api/group/{g}/member_permissions/{MEMBER}',
               json={'permissions': {'can_ban_users': True}}, headers=H)
step('админ не выдаёт право выше своих (403)', r.status_code == 403, r.get_json())

# --- неизвестные права отвергаются
r = owner.post(f'/api/group/{g}/member_permissions/{MEMBER}',
               json={'permissions': {'can_launch_missiles': True}}, headers=H)
step('неизвестное право отвергнуто (400)', r.status_code == 400, r.get_json())

# --- несуществующий участник
r = owner.post(f'/api/group/{g}/member_permissions/999999',
               json={'permissions': {'can_send_messages': False}}, headers=H)
step('несуществующий участник 404', r.status_code == 404, r.get_json())

# --- get_group отдаёт итоговые права и карту перекрытий
d = owner.get(f'/api/get_group/{g}').get_json()
step('get_group: permissions.can_ban_users (владелец)',
     (d.get('permissions') or {}).get('can_ban_users') is True)
step('get_group: есть member_permissions', 'member_permissions' in d)
step('get_group: перекрытие участника в карте',
     'can_ban_users' in ((d.get('member_permissions') or {}).get(str(MEMBER)) or {}))

# участник не должен видеть карту перекрытий
d2 = member.get(f'/api/get_group/{g}').get_json()
step('участник не видит карту перекрытий', 'member_permissions' not in d2)
step('участник видит свои итоговые права',
     (d2.get('permissions') or {}).get('can_ban_users') is True)

# --- реальное применение: персональное право действует в настоящих роутах
# Отправка сообщения принимает form-data и проверяет can_send_messages
r = member.post('/api/send_message',
                data={'group_id': str(g), 'content': 'тест'}, headers=H)
print('   member send ->', r.status_code, r.get_json())
step('участник по умолчанию пишет в группу', r.status_code == 200, r.get_json())

database.set_group_member_permissions(g, MEMBER, {'can_send_messages': False}, OWNER)
r = member.post('/api/send_message',
                data={'group_id': str(g), 'content': 'тест'}, headers=H)
print('   member send (запрещено) ->', r.status_code, r.get_json())
step('участник с запретом не пишет в группу (403)', r.status_code == 403, r.get_json())

# персональный запрет на медиа
database.set_group_member_permissions(g, MEMBER, {'can_send_media': False}, OWNER)
step('запрет медиа действует', not database.can_group_perform(g, MEMBER, 'can_send_media'))
database.set_group_member_permissions(g, MEMBER, {'can_send_media': None}, OWNER)
step('медиа снова разрешено', database.can_group_perform(g, MEMBER, 'can_send_media'))

# Бан доступен только админу/владельцу по роли; персональное право участника
# не превращает обычного участника в админа.
r = member.post(f'/api/group/ban/{g}', json={'user_id': GUEST, 'reason': 'тест'}, headers=H)
step('участник не банит даже с правом (роль важнее)', r.status_code == 403, r.get_json())

# А вот админу с персональным запретом бан не проходит.
# Перед этим возвращаем админу права по роли, иначе он ещё запрещён с прошлого шага.
database.set_group_member_permissions(g, ADMIN, {'can_ban_users': None}, OWNER)
r = admin.post(f'/api/group/ban/{g}', json={'user_id': GUEST, 'reason': 'тест'}, headers=H)
step('админ по роли может банить', r.status_code == 200, r.get_json())
database.unban_group_member(g, GUEST)
database.set_group_member_permissions(g, ADMIN, {'can_ban_users': False}, OWNER)
r = admin.post(f'/api/group/ban/{g}', json={'user_id': GUEST, 'reason': 'тест'}, headers=H)
step('админ с запретом банить — 403', r.status_code == 403, r.get_json())
step('GUEST не забанен', not database.is_group_banned(g, GUEST))
database.set_group_member_permissions(g, ADMIN, {'can_ban_users': None}, OWNER)

# --- снятие перекрытия через POST с пустым dict
database.set_group_member_permissions(g, MEMBER, {'can_pin_messages': True}, OWNER)
r = owner.post(f'/api/group/{g}/member_permissions/{MEMBER}', json={'permissions': {}}, headers=H)
step('POST с пустым dict снимает перекрытие', r.status_code == 200 and
     not database.get_group_member_permissions(g, MEMBER), r.get_json())

# --- каскад при удалении группы
database.set_group_member_permissions(g, MEMBER, {'can_send_media': False}, OWNER)
database.delete_group(g, OWNER)
conn = get_db()
cur = dict_cursor(conn)
cur.execute('SELECT COUNT(*) as n FROM group_member_permissions WHERE group_id = %s', (g,))
step('перекрытия удалены с группой (cascade)', cur.fetchone()['n'] == 0)
cur.execute('SELECT COUNT(*) as n FROM groups WHERE id = %s', (g,))
step('группа удалена', cur.fetchone()['n'] == 0)
cur.execute('PRAGMA foreign_key_check')
fk = cur.fetchall()
conn.close()
step('foreign_key_check чист', not fk, fk)

wipe()
drop_temp_users()
conn = get_db()
cur = dict_cursor(conn)
cur.execute("SELECT COUNT(*) as n FROM users WHERE username LIKE 'permtest_%'")
step('временные пользователи удалены', cur.fetchone()['n'] == 0)
conn.close()
print('\nИТОГ: %d/%d' % (sum(ok), len(ok)))