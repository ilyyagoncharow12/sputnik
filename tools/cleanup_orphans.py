"""Удаление осиротевших записей после чистки пользователей.

Удаляет строки, которые ссылаются на несуществующих пользователей/чаты/
сообщения/папки (например, чаты, где один из участников уже удалён,
или сообщения из несуществующих чатов).

Запуск:
    python tools/cleanup_orphans.py --dry-run
    python tools/cleanup_orphans.py
"""
import argparse
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import DB_PATH  # noqa: E402


# (таблица, колонка-ссылка) -> что должна существовать
USER_REFS = [
    ('channel_admins', 'user_id'),
    ('channel_subscribers', 'user_id'),
    ('channels', 'owner_id'),
    ('chat_folders', 'user_id'),
    ('chats', 'user1_id'),
    ('chats', 'user2_id'),
    ('folder_chats', 'other_user_id'),
    ('group_join_requests', 'user_id'),
    ('group_members', 'user_id'),
    ('group_mutes', 'muted_by'),
    ('linked_accounts', 'master_user_id'),
    ('linked_accounts', 'linked_user_id'),
    ('login_codes', 'user_id'),
    ('message_reactions', 'user_id'),
    ('messages', 'sender_id'),
    ('messages', 'forwarded_from_user_id'),
    ('poll_votes', 'user_id'),
    ('polls', 'created_by'),
    ('recent_searches', 'user_id'),
    ('story_interactions', 'user_id'),
    ('story_reactions', 'user_id'),
    ('story_views', 'user_id'),
    ('user_sessions', 'user_id'),
    ('contacts', 'user_id'),
    ('contacts', 'contact_id'),
    ('blocked_users', 'user_id'),
    ('blocked_users', 'blocked_user_id'),
    ('stories', 'user_id'),
    ('stickers', 'user_id'),
    ('premium_activations', 'user_id'),
    ('calls', 'user_id'),
    ('call_participants', 'user_id'),
]

MESSAGE_REFS = [
    ('message_reactions', 'message_id'),
    ('message_views', 'message_id'),
    ('message_reads', 'message_id'),
    ('message_forwards', 'message_id'),
    ('polls', 'message_id'),
    ('poll_votes', 'poll_id'),
    ('stories', 'message_id'),
    ('messages', 'reply_to_id'),
]

FOLDER_REFS = [
    ('folder_chats', 'folder_id'),
]

CHAT_REFS = [
    ('messages', 'chat_id'),
    ('folder_chats', 'chat_id'),
    ('polls', 'chat_id'),
]

GROUP_REFS = [
    ('group_members', 'group_id'),
    ('group_permissions', 'group_id'),
    ('group_mutes', 'group_id'),
    ('group_join_requests', 'group_id'),
    ('messages', 'group_id'),
    ('polls', 'group_id'),
]

CHANNEL_REFS = [
    ('channel_admins', 'channel_id'),
    ('channel_subscribers', 'channel_id'),
    ('messages', 'channel_id'),
    ('polls', 'channel_id'),
]

STORY_REFS = [
    ('story_privacy', 'story_id'),
    ('story_reactions', 'story_id'),
    ('story_views', 'story_id'),
    ('story_interactions', 'story_id'),
]

ALL_REFS = (USER_REFS, MESSAGE_REFS, FOLDER_REFS, CHAT_REFS, GROUP_REFS,
            CHANNEL_REFS, STORY_REFS)
KIND_OF = {
    **{(t, c): 'users' for (t, c) in USER_REFS},
    **{(t, c): 'messages' for (t, c) in MESSAGE_REFS},
    **{(t, c): 'chat_folders' for (t, c) in FOLDER_REFS},
    **{(t, c): 'chats' for (t, c) in CHAT_REFS},
    **{(t, c): 'groups' for (t, c) in GROUP_REFS},
    **{(t, c): 'channels' for (t, c) in CHANNEL_REFS},
    **{(t, c): 'stories' for (t, c) in STORY_REFS},
}


def table_exists(conn, name):
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (name,)).fetchone() is not None


def ids_of(conn, table):
    if not table_exists(conn, table):
        return set()
    return {r[0] for r in conn.execute('SELECT id FROM %s' % table)}


def refs_of(table):
    return {(t, c) for lst in ALL_REFS for (t, c) in lst if t == table}


def plan(conn):
    live = {
        'users': ids_of(conn, 'users') | {0, -1},  # системные/технические
        'chats': ids_of(conn, 'chats'),
        'messages': ids_of(conn, 'messages'),
        'chat_folders': ids_of(conn, 'chat_folders'),
        'groups': ids_of(conn, 'groups'),
        'channels': ids_of(conn, 'channels'),
        'stories': ids_of(conn, 'stories'),
    }

    tables = [r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND name NOT LIKE 'sqlite_%' ORDER BY name")]

    steps = []
    for table in tables:
        cols = {r[1] for r in conn.execute('PRAGMA table_info(%s)' % table)}
        has_id = 'id' in cols
        for ref_table, col in sorted(refs_of(table)):
            kind = KIND_OF[(ref_table, col)]
            if col not in cols:
                continue
            where = '%s IS NOT NULL AND %s NOT IN (%s)' % (
                col, col, ','.join(str(v) for v in sorted(live[kind])))
            key = 'id' if has_id else col
            ids = [r[0] for r in conn.execute(
                'SELECT %s FROM %s WHERE %s' % (key, table, where))]
            if ids:
                steps.append((table, col, kind, sorted(live[kind]), ids))
    return steps


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--passes', type=int, default=6)
    args = ap.parse_args()

    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute('PRAGMA foreign_keys = OFF')
        total = 0
        for n in range(1, args.passes + 1):
            steps = plan(conn)
            if not steps:
                print('Проход %d: чисто.' % n)
                break
            print('Проход %d:' % n)
            for table, col, kind, live_ids, ids in steps:
                print('  %-22s %-22s -> %-12s %d шт: %s' % (
                    table, col, kind, len(ids), ids))
                total += len(ids)
            if args.dry_run:
                print('  (--dry-run: не удаляю, дальнейшие проходы пропущены)')
                break
            for table, col, kind, live_ids, ids in steps:
                cols = {r[1] for r in conn.execute('PRAGMA table_info(%s)' % table)}
                key = 'id' if 'id' in cols else col
                conn.execute(
                    'DELETE FROM %s WHERE %s IN (%s)'
                    % (table, key, ','.join('?' * len(ids))), ids)
            conn.commit()
        else:
            print('ВНИМАНИЕ: после %d проходов что-то осталось.' % args.passes)
        print('\nИтого удалено записей: %d' % total)
    finally:
        conn.close()


if __name__ == '__main__':
    main()
