"""Разовая чистка БД: удалить всех пользователей, кроме системных.

Запуск:  python tools/wipe_users.py [--dry-run]

Защищённые (их не трогаем НИКОГДА):
  - все аккаунты с is_system = 1 (системный чат @sputnik);
  - аккаунты из PROTECTED_USERS в .env (по id или @username);
  - если не задано — @sputnik и @admin.
"""
import os
import re
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import env  # noqa: E402

DB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'sputnik.db')

# Таблица -> колонки со ссылкой на users.id
USER_COLUMNS = (
    'user_id', 'user1_id', 'user2_id', 'sender_id', 'author_id', 'contact_id',
    'blocked_user_id', 'blocked_by', 'subscriber_id', 'member_id', 'admin_id',
    'owner_id', 'from_user_id', 'to_user_id', 'inviter_id', 'created_by',
    'master_user_id', 'target_id', 'performer_id', 'actor_id', 'moderator_id',
    'follower_id', 'following_id', 'owner_user_id', 'creator_id', 'linked_user_id',
    'pinned_by', 'muted_by', 'banned_by', 'other_user_id',
)

# Таблицы, где колонка — просто текст (логин/имя), а не id
TEXT_COLUMNS = {'messages': ('forwarded_from_username',)}


def protected_spec():
    raw = env('PROTECTED_USERS', '@sputnik,@admin')
    out = set()
    for part in re.split(r'[,\s;]+', raw or ''):
        part = part.strip().lstrip('@').lower()
        if part:
            out.add(part)
    return out or {'sputnik'}


def protected_ids(conn):
    """id пользователей, которых нельзя удалять."""
    spec = protected_spec()
    ids = set()
    for row in conn.execute('SELECT id, username, is_system FROM users'):
        uid, uname, is_sys = row[0], (row[1] or '').lower(), row[2]
        if is_sys or uname in spec or str(uid) in spec:
            ids.add(uid)
    return ids


def main(dry=False):
    conn = sqlite3.connect(DB)
    conn.execute('PRAGMA foreign_keys = OFF')
    cur = conn.cursor()
    keep = protected_ids(conn)
    print('Защищённые (остаются):', sorted(keep) or '—')

    doomed = [r[0] for r in cur.execute(
        'SELECT id FROM users WHERE is_system = 0 AND id NOT IN (%s) ORDER BY id'
        % ','.join('?' * len(keep)), tuple(sorted(keep)))]
    if not doomed:
        print('Удалять нечего: кроме защищённых аккаунтов никого нет.')
        conn.close()
        return
    print('Удаляем:', ', '.join(
        '%s(id=%s)' % (u, i) for i, u in cur.execute(
            'SELECT id, username FROM users WHERE is_system = 0 '
            'AND id NOT IN (%s) ORDER BY id' % ','.join('?' * len(keep)),
            tuple(sorted(keep)))))

    marks = ','.join('?' * len(doomed))
    tables = [r[0] for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    plan = []
    for t in sorted(tables):
        if t == 'users':
            continue
        cols = [r[1] for r in cur.execute('PRAGMA table_info(%s)' % t)]
        targets = [c for c in cols if c in USER_COLUMNS]
        if not targets:
            continue
        for col in targets:
            n = cur.execute('SELECT COUNT(*) FROM %s WHERE %s IN (%s)'
                            % (t, col, marks), doomed).fetchone()[0]
            if n:
                plan.append((t, col, n))
    for t, col, n in plan:
        print('  %-24s %-22s %d' % (t, col, n))

    if dry:
        print('\nЭто был --dry-run, ничего не удалено.')
        conn.close()
        return

    for t, col, _ in plan:
        cur.execute('DELETE FROM %s WHERE %s IN (%s)' % (t, col, marks), doomed)
    cur.execute('DELETE FROM users WHERE id IN (%s)' % marks, doomed)
    # Имя/логин в текстовых полях тоже подчищаем
    cur.execute("UPDATE messages SET forwarded_from_username = 'Удалённый аккаунт' "
                "WHERE sender_id IN (%s)" % marks, doomed)
    # Новые пользователи не должны ловить id системного аккаунта
    cur.execute("UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM users) "
                "WHERE name = 'users'")

    conn.commit()
    left = list(cur.execute('SELECT id, username, is_system FROM users ORDER BY id'))
    print('\nОсталось в users:', left)
    for t in sorted(tables):
        try:
            n = cur.execute('SELECT COUNT(*) FROM %s' % t).fetchone()[0]
        except sqlite3.Error:
            continue
        if n and t in {p[0] for p in plan}:
            print('  %-24s осталось строк: %d' % (t, n))
    conn.close()
    print('\nГотово. Бэкап: backup_sputnik_20260928_before_wipe.db')


if __name__ == '__main__':
    main(dry='--dry-run' in sys.argv)
