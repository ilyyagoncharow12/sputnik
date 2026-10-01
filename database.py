import sqlite3
import re
import hashlib
import json
import os
import sys
import random
import re
import urllib.request
from html.parser import HTMLParser
from urllib.parse import urljoin
from datetime import datetime, timedelta
from PIL import Image

from config import env

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

DB_PATH = env('SQLITE_PATH', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sputnik.db'))


# =============================================================================
#  СОВМЕСТИМЫЙ СЛОЙ БД: PostgreSQL-синтаксис -> SQLite
#  Позволяет основному коду (масса запросов с %s, SERIAL, TIMESTAMPTZ,
#  NOW() AT TIME ZONE, RETURNING, ON CONFLICT) работать как есть.
# =============================================================================

def _dict_factory(cursor, row):
    cols = [d[0] for d in cursor.description] if cursor.description else []
    return {cols[i]: row[i] for i in range(len(row))}


def _translate_sql(sql, params=None):
    """Превращает запрос из PG-диалекта в SQLite."""
    tparams = params

    # 1) Знакоместа: %s -> ? ; (name)s -> ? (для dict-параметров)
    if isinstance(params, dict):
        names = re.findall(r'%\((\w+)\)s', sql)
        if names:
            tparams = tuple(params[n] for n in names)
            sql = re.sub(r'%\(\w+\)s', '?', sql)
    elif sql.count('%s') > 0:
        sql = sql.replace('%s', '?')
        if tparams is None:
            tparams = ()
    else:
        tparams = params if tparams is None else tuple(tparams) if isinstance(tparams, (list, tuple)) else tparams

    # 2) DDL
    sql = re.sub(r'\bSERIAL\s+PRIMARY\s+KEY', 'INTEGER PRIMARY KEY AUTOINCREMENT', sql, flags=re.I)
    sql = re.sub(r'\bTIMESTAMPTZ\b', 'DATETIME', sql, flags=re.I)
    sql = re.sub(r'\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b', 'ADD COLUMN', sql, flags=re.I)

    # 3) data-выражения
    #     (NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours' [+ INTERVAL '...'])
    def _now_atz(m):
        intervals = [x.strip() for x in re.findall(r"INTERVAL\s*'([^']*)'", m.group(0)) if x.strip()]
        args = ', '.join("'%s'" % x for x in intervals)
        return "datetime('now'" + (', ' + args if args else '') + ')'

    sql = re.sub(
        r"NOW\(\)\s*AT\s*TIME\s*ZONE\s*'UTC'(\s*\+\s*INTERVAL\s*'[^']*')*",
        _now_atz, sql, flags=re.I)

    #     NOW() - INTERVAL '14 days'
    sql = re.sub(r"NOW\(\)\s*-\s*INTERVAL\s*'([^']+)'",
                 lambda m: "datetime('now', '-%s')" % m.group(1), sql, flags=re.I)

    #     NOW()
    sql = re.sub(r'\bNOW\(\)', "datetime('now')", sql, flags=re.I)

    # 4) to_char(..., 'YYYY-MM-DD') -> strftime
    sql = re.sub(r"to_char\(\s*([^,]+?)\s*,\s*(?:'([^']+)'|[A-Za-z_]+)\s*\)", _to_char_repl, sql, flags=re.I)

    # 5) STRING_AGG(x::text, ',') -> GROUP_CONCAT(x, ',')
    sql = re.sub(r'\bSTRING_AGG\s*\(', 'GROUP_CONCAT(', sql, flags=re.I)
    sql = re.sub(r'::[A-Za-z_]+', '', sql)

    # 6) information_schema.columns -> pragma_table_info
    m = re.search(r"information_schema\.columns\s*WHERE\s*table_name\s*=\s*'([^']+)'.*?column_name\s*=\s*'([^']+)'", sql, re.S | re.I)
    if m:
        sql = "SELECT name FROM pragma_table_info('%s') WHERE name='%s'" % (m.group(1), m.group(2))

    return sql, tparams


def _to_char_repl(m):
    col = m.group(1).strip()
    f = m.group(2) or 'YYYY-MM-DD'
    fmt = f
    for pg, sq in (('YYYY', '%Y'), ('MM', '%m'), ('DD', '%d'),
                   ('HH24', '%H'), ('HH', '%H'), ('MI', '%M'), ('SS', '%S'),
                   ('Month', '%B'), ('YYYY-MM-DD', '%Y-%m-%d')):
        fmt = fmt.replace(pg, sq)
    return "strftime('%s', %s)" % (fmt, col)


class _CompatCursor:
    """Микросовместимость с psycopg2 RealDictCursor."""

    def __init__(self, sqlite_conn):
        self._conn = sqlite_conn
        self._cur = self._conn.cursor()
        self._buffer = []
        self.rowcount = -1
        self.lastrowid = None

    def execute(self, sql, params=None):
        self._buffer = []
        tsql, tparams = _translate_sql(sql, params)
        try:
            if tparams is None:
                self._cur.execute(tsql)
            elif isinstance(tparams, (tuple, list)):
                self._cur.execute(tsql, tparams)
            else:
                self._cur.execute(tsql, (tparams,))
        except sqlite3.OperationalError as e:
            # ADD COLUMN без IF NOT EXISTS на повторном старте -> игнорируем
            if 'duplicate column name' in str(e).lower():
                self.rowcount = 0
                return self
            raise
        self.rowcount = self._cur.rowcount if self._cur.rowcount is not None else -1
        self.lastrowid = self._cur.lastrowid
        if self._cur.description is not None:
            # RETURGING/SELECT: сразу вычитываем строки, иначе commit() на
            # соединении упадёт с "SQL statements in progress"
            self._buffer = [dict(r) for r in self._cur.fetchall()]
        return self

    def executemany(self, sql, seq):
        for item in seq:
            self.execute(sql, item)
        return self

    def fetchone(self):
        if not self._buffer:
            self._buffer = [dict(r) for r in self._cur.fetchall()]
        if not self._buffer:
            return None
        return self._buffer.pop(0)

    def fetchall(self):
        if not self._buffer:
            self._buffer = [dict(r) for r in self._cur.fetchall()]
        rows, self._buffer = self._buffer, []
        return rows

    def fetchmany(self, size=None):
        if not self._buffer:
            self._buffer = [dict(r) for r in self._cur.fetchall()]
        if size is None:
            size = len(self._buffer)
        rows = self._buffer[:size]
        self._buffer = self._buffer[size:]
        return rows

    def close(self):
        try:
            self._cur.close()
        except Exception:
            pass

    def __iter__(self):
        return iter(self.fetchall())


class _CompatConnection:
    """Обёртка над sqlite3.Connection с псевдо-RealDictCursor."""

    def __init__(self, path):
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = _dict_factory
        self._conn.execute('PRAGMA foreign_keys = ON')

    def cursor(self, cursor_factory=None):
        return _CompatCursor(self._conn)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

    def execute(self, sql, params=None):
        cur = self.cursor()
        cur.execute(sql, params)
        self._conn.commit()
        return cur


def get_moscow_time():
    """Возвращает текущее московское время (UTC+3)"""
    return (datetime.utcnow() + timedelta(hours=3)).strftime('%Y-%m-%d %H:%M:%S')

def get_moscow_datetime():
    """Возвращает объект datetime с московским временем"""
    return datetime.utcnow() + timedelta(hours=3)


def get_db():
    conn = _CompatConnection(DB_PATH)
    return conn


def dict_cursor(conn):
    return conn.cursor()


def init_db():
    """Инициализация базы данных: создание всех таблиц"""
    conn = get_db()
    cur = dict_cursor(conn)

    # Таблица users
    cur.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                unique_id INTEGER UNIQUE NOT NULL,
                phone TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE,
                display_name TEXT,
                password TEXT NOT NULL,
                avatar TEXT,
                bio TEXT,
                birthday TEXT,
                last_seen TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
                privacy_last_seen TEXT DEFAULT 'everyone',
                privacy_photo TEXT DEFAULT 'everyone',
                privacy_forward TEXT DEFAULT 'everyone',
                privacy_calls TEXT DEFAULT 'everyone',
                privacy_messages TEXT DEFAULT 'everyone',
                theme TEXT DEFAULT 'light',
                font_size INTEGER DEFAULT 14,
                bubble_radius INTEGER DEFAULT 18,
                font_family TEXT DEFAULT 'Unbounded, cursive',
                my_message_color TEXT DEFAULT '#667eea',
                their_message_color TEXT DEFAULT '#f3f4f6',
                wallpaper TEXT DEFAULT '',
                wallpaper_image TEXT,
                email TEXT,
                is_deleted BOOLEAN DEFAULT FALSE,
                deleted_at TIMESTAMPTZ,
                registration_complete BOOLEAN DEFAULT FALSE
            )
        ''')

    # Миграция: колонка пермамент-бана аккаунта
    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_banned'"
    )
    if not cur.fetchone():
        cur.execute('ALTER TABLE users ADD COLUMN is_banned BOOLEAN DEFAULT FALSE')
        conn.commit()

    # Миграция: причина бана аккаунта
    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'ban_reason'"
    )
    if not cur.fetchone():
        cur.execute('ALTER TABLE users ADD COLUMN ban_reason TEXT DEFAULT NULL')
        conn.commit()

    # Служебные журналы (переименованы, данные сохраняются)
    for _o, _n, _cm in (
        ('admin_audit_log', 'svc_traces', (('admin_phone', 'actor'),)),
        ('admin_login_log', 'svc_access_log', (('entered_code', 'probe'),)),
    ):
        try:
            cur.execute('SELECT id FROM %s LIMIT 1' % _n)
        except Exception:
            conn.rollback()
            try:
                cur.execute('ALTER TABLE %s RENAME TO %s' % (_o, _n))
                conn.commit()
            except Exception:
                conn.rollback()
        for _co, _cn in _cm:
            try:
                cur.execute('ALTER TABLE %s RENAME COLUMN %s TO %s' % (_n, _co, _cn))
                conn.commit()
            except Exception:
                conn.rollback()

    cur.execute('''
        CREATE TABLE IF NOT EXISTS svc_traces (
            id SERIAL PRIMARY KEY,
            actor TEXT NOT NULL,
            action TEXT NOT NULL,
            details TEXT,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours'))
        )
    ''')

    cur.execute('''
        CREATE TABLE IF NOT EXISTS svc_access_log (
            id SERIAL PRIMARY KEY,
            ip TEXT,
            user_agent TEXT,
            device TEXT,
            phone TEXT,
            probe TEXT,
            success INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours'))
        )
    ''')

    # Таблица chats
    cur.execute('''
        CREATE TABLE IF NOT EXISTS chats (
            id SERIAL PRIMARY KEY,
            user1_id INTEGER NOT NULL,
            user2_id INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            UNIQUE(user1_id, user2_id)
        )
    ''')

    # В init_db() добавьте эту таблицу:
    cur.execute('''
        CREATE TABLE IF NOT EXISTS linked_accounts (
            id SERIAL PRIMARY KEY,
            master_user_id INTEGER NOT NULL,
            linked_user_id INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            UNIQUE(master_user_id, linked_user_id),
            FOREIGN KEY (master_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (linked_user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')


    # Таблица messages
    cur.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            chat_id INTEGER,
            group_id INTEGER,
            channel_id INTEGER,
            sender_id INTEGER NOT NULL,
            content TEXT,
            file_type TEXT,
            file_path TEXT,
            file_name TEXT,
            file_size INTEGER,
            is_read BOOLEAN DEFAULT FALSE,
            is_deleted BOOLEAN DEFAULT FALSE,
            deleted_for_all BOOLEAN DEFAULT FALSE,
            edited_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            reply_to_id INTEGER,
            forwarded_from_id INTEGER,
            forwarded_from_user_id INTEGER,
            forwarded_from_username TEXT,
            forwarded_from_display_name TEXT
        )
    ''')
    # Самоуничтожающиеся сообщения (для уже существующих БД)
    cur.execute('ALTER TABLE messages ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ')
    # Корзина: когда и кем удалено (v0.60.3)
    cur.execute('ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ')
    cur.execute('ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_by INTEGER')
    # «Удалить у меня» — скрытие сообщения только у одного пользователя
    cur.execute('''
        CREATE TABLE IF NOT EXISTS message_hides (
            message_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            PRIMARY KEY (message_id, user_id)
        )
    ''')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_message_hides_user ON message_hides(user_id)')

    # Таблица contacts
    cur.execute('''
        CREATE TABLE IF NOT EXISTS contacts (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            contact_id INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            UNIQUE(user_id, contact_id)
        )
    ''')

    # Таблица contact_names
    cur.execute('''
        CREATE TABLE IF NOT EXISTS contact_names (
            user_id INTEGER NOT NULL,
            contact_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            PRIMARY KEY (user_id, contact_id)
        )
    ''')

    # Таблица favorites
    cur.execute('''
        CREATE TABLE IF NOT EXISTS favorites (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            file_type TEXT,
            file_path TEXT,
            file_name TEXT,
            note TEXT,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours'))
        )
    ''')




    # Таблица calls
    cur.execute('''
        CREATE TABLE IF NOT EXISTS calls (
            id SERIAL PRIMARY KEY,
            caller_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            call_type TEXT,
            status TEXT,
            duration INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours'))
        )
    ''')

    # Таблица папок чатов - ДОБАВИТЬ
    cur.execute('''
            CREATE TABLE IF NOT EXISTS chat_folders (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ''')

    # Таблица чатов в папках - ДОБАВИТЬ
    # В init_db() замените создание таблицы folder_chats на:
    cur.execute('''
        CREATE TABLE IF NOT EXISTS folder_chats (
            id SERIAL PRIMARY KEY,
            folder_id INTEGER NOT NULL,
            chat_id INTEGER NOT NULL,
            chat_type TEXT NOT NULL,
            chat_name TEXT,
            chat_avatar TEXT,
            other_user_id INTEGER,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            FOREIGN KEY (folder_id) REFERENCES chat_folders(id) ON DELETE CASCADE
        )
    ''')

    # Таблица video_calls
    cur.execute('''
        CREATE TABLE IF NOT EXISTS video_calls (
            id SERIAL PRIMARY KEY,
            room_id TEXT UNIQUE NOT NULL,
            creator_id INTEGER NOT NULL,
            call_type TEXT DEFAULT 'video',
            status TEXT DEFAULT 'active',
            started_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            ended_at TIMESTAMPTZ,
            duration INTEGER DEFAULT 0,
            participant_count INTEGER DEFAULT 1
        )
    ''')

    # Таблица video_call_participants
    cur.execute('''
        CREATE TABLE IF NOT EXISTS video_call_participants (
            id SERIAL PRIMARY KEY,
            call_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            joined_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            left_at TIMESTAMPTZ,
            audio_only BOOLEAN DEFAULT FALSE,
            screensharing BOOLEAN DEFAULT FALSE
        )
    ''')

    # Таблица user_sessions
    cur.execute('''
        CREATE TABLE IF NOT EXISTS user_sessions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            session_token TEXT UNIQUE NOT NULL,
            device TEXT,
            ip TEXT,
            location TEXT,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            last_active TIMESTAMPTZ
        )
    ''')

    # Таблица stories
    cur.execute('''
        CREATE TABLE IF NOT EXISTS stories (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            file_type TEXT,
            file_path TEXT,
            caption TEXT,
            music TEXT,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            expires_at TIMESTAMPTZ
        )
    ''')

    # Таблица story_interactions
    cur.execute('''
        CREATE TABLE IF NOT EXISTS story_interactions (
            id SERIAL PRIMARY KEY,
            story_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            type TEXT,
            reply_text TEXT,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            UNIQUE(story_id, user_id, type)
        )
    ''')

    # Таблица story_privacy
    cur.execute('''
        CREATE TABLE IF NOT EXISTS story_privacy (
            story_id INTEGER PRIMARY KEY,
            privacy_type TEXT,
            FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
        )
    ''')

    # Таблица story_allowed_users
    cur.execute('''
        CREATE TABLE IF NOT EXISTS story_allowed_users (
            story_id INTEGER,
            user_id INTEGER,
            PRIMARY KEY (story_id, user_id)
        )
    ''')

    # Таблица pinned_chats
    cur.execute('''
        CREATE TABLE IF NOT EXISTS pinned_chats (
            user_id INTEGER NOT NULL,
            chat_id INTEGER NOT NULL,
            pinned_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            PRIMARY KEY (user_id, chat_id)
        )
    ''')

    # Таблица groups
    cur.execute('''
        CREATE TABLE IF NOT EXISTS groups (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            owner_id INTEGER NOT NULL,
            is_public BOOLEAN DEFAULT TRUE,
            invite_link TEXT UNIQUE,
            avatar TEXT,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            FOREIGN KEY (owner_id) REFERENCES users(id)
        )
    ''')

    # Таблица group_members
    cur.execute('''
        CREATE TABLE IF NOT EXISTS group_members (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT DEFAULT 'member',
            joined_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            UNIQUE(group_id, user_id),
            FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')

    # Таблица group_permissions
    cur.execute('''
        CREATE TABLE IF NOT EXISTS group_permissions (
            group_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            can_send_messages BOOLEAN DEFAULT TRUE,
            can_send_media BOOLEAN DEFAULT TRUE,
            can_add_members BOOLEAN DEFAULT FALSE,
            can_pin_messages BOOLEAN DEFAULT FALSE,
            can_change_info BOOLEAN DEFAULT FALSE,
            can_delete_messages BOOLEAN DEFAULT FALSE,
            can_ban_users BOOLEAN DEFAULT FALSE,
            PRIMARY KEY (group_id, role),
            FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
        )
    ''')

    # Таблица channels
    cur.execute('''
        CREATE TABLE IF NOT EXISTS channels (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            owner_id INTEGER NOT NULL,
            is_public BOOLEAN DEFAULT TRUE,
            invite_link TEXT UNIQUE,
            avatar TEXT,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            FOREIGN KEY (owner_id) REFERENCES users(id)
        )
    ''')

    # Таблица channel_subscribers
    cur.execute('''
        CREATE TABLE IF NOT EXISTS channel_subscribers (
            id SERIAL PRIMARY KEY,
            channel_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            subscribed_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            UNIQUE(channel_id, user_id),
            FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')

    # Таблица channel_admins
    cur.execute('''
        CREATE TABLE IF NOT EXISTS channel_admins (
            channel_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            can_post BOOLEAN DEFAULT TRUE,
            can_edit BOOLEAN DEFAULT FALSE,
            can_delete BOOLEAN DEFAULT FALSE,
            can_add_admins BOOLEAN DEFAULT FALSE,
            added_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            PRIMARY KEY (channel_id, user_id),
            FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')

    # Таблица message_reactions
    cur.execute('''
        CREATE TABLE IF NOT EXISTS message_reactions (
            id SERIAL PRIMARY KEY,
            message_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            reaction TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            UNIQUE(message_id, user_id, reaction)
        )
    ''')

    # Таблица recent_searches
    cur.execute('''
        CREATE TABLE IF NOT EXISTS recent_searches (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            search_query TEXT NOT NULL,
            search_type TEXT,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours'))
        )
    ''')

    # Таблица preloaded_avatars
    cur.execute('''
        CREATE TABLE IF NOT EXISTS preloaded_avatars (
            id SERIAL PRIMARY KEY,
            filename TEXT UNIQUE NOT NULL,
            display_name TEXT,
            category TEXT DEFAULT 'default'
        )
    ''')

    # Таблица blocked_users
    cur.execute('''
        CREATE TABLE IF NOT EXISTS blocked_users (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            blocked_user_id INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            UNIQUE(user_id, blocked_user_id)
        )
    ''')


    # Таблица story_reactions
    cur.execute('''
        CREATE TABLE IF NOT EXISTS story_reactions (
            id SERIAL PRIMARY KEY,
            story_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            reaction TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            UNIQUE(story_id, user_id, reaction)
        )
    ''')

    # Таблица story_views
    cur.execute('''
        CREATE TABLE IF NOT EXISTS story_views (
            id SERIAL PRIMARY KEY,
            story_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            viewed_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            UNIQUE(story_id, user_id)
        )
    ''')

    # В функции init_db() добавьте:
    cur.execute('''
        CREATE TABLE IF NOT EXISTS chat_folders (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')

    cur.execute('''
        CREATE TABLE IF NOT EXISTS folder_chats (
            id SERIAL PRIMARY KEY,
            folder_id INTEGER NOT NULL,
            chat_id INTEGER NOT NULL,
            chat_type TEXT NOT NULL,
            chat_name TEXT,
            chat_avatar TEXT,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            FOREIGN KEY (folder_id) REFERENCES chat_folders(id) ON DELETE CASCADE
        )
    ''')




    # Индексы
    cur.execute('CREATE INDEX IF NOT EXISTS idx_blocked_users_user_id ON blocked_users(user_id)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_messages_group_id ON messages(group_id)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_users_unique_id ON users(unique_id)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_channel_subscribers_user_id ON channel_subscribers(user_id)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_stories_user_id ON stories(user_id)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON stories(expires_at)')

    # Заполняем предзагрузочные аватарки
    default_avatars = [
        ('avatar1.jpg', 'Аватар 1', 'default'),
        ('avatar2.jpg', 'Аватар 2', 'default'),
        ('avatar3.jpg', 'Аватар 3', 'default'),
        ('avatar4.jpg', 'Аватар 4', 'default'),
        ('avatar5.png', 'Аватар 5', 'default'),
        ('avatar6.png', 'Аватар 6', 'default'),
        ('avatar7.png', 'Аватар 7', 'default'),
        ('avatar8.png', 'Аватар 8', 'default'),
        ('deleted.png', 'Удалённый аккаунт', 'system')
    ]

    # Таблица для плейлиста
    cur.execute('''
        CREATE TABLE IF NOT EXISTS user_playlist (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            artist TEXT,
            file_path TEXT NOT NULL,
            duration INTEGER,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')

    # Таблица для прикрепленного канала
    cur.execute('''
            CREATE TABLE IF NOT EXISTS user_attached_channel (
                user_id INTEGER PRIMARY KEY,
                channel_id INTEGER NOT NULL,
                attached_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (channel_id) REFERENCES channels(id)
            )
        ''')

    for ava in default_avatars:
        cur.execute('''
            INSERT INTO preloaded_avatars (filename, display_name, category)
            VALUES (%s, %s, %s) ON CONFLICT DO NOTHING
        ''', ava)

    # Начальные права для групп
    cur.execute('''
        INSERT INTO group_permissions (group_id, role, can_send_messages, can_send_media, 
            can_add_members, can_pin_messages, can_change_info, can_delete_messages, can_ban_users)
        SELECT id, 'owner', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE FROM groups g
        WHERE NOT EXISTS (SELECT 1 FROM group_permissions gp WHERE gp.group_id = g.id AND gp.role = 'owner')
    ''')

    cur.execute('''
        INSERT INTO group_permissions (group_id, role, can_send_messages, can_send_media, 
            can_add_members, can_pin_messages, can_change_info, can_delete_messages, can_ban_users)
        SELECT id, 'admin', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE FROM groups g
        WHERE NOT EXISTS (SELECT 1 FROM group_permissions gp WHERE gp.group_id = g.id AND gp.role = 'admin')
    ''')

    cur.execute('''
        INSERT INTO group_permissions (group_id, role, can_send_messages, can_send_media, 
            can_add_members, can_pin_messages, can_change_info, can_delete_messages, can_ban_users)
        SELECT id, 'member', TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE FROM groups g
        WHERE NOT EXISTS (SELECT 1 FROM group_permissions gp WHERE gp.group_id = g.id AND gp.role = 'member')
    ''')

    conn.commit()
    conn.close()

    # Добавляем новые колонки, если их нет (после коммита основного транзакции)
    conn2 = get_db()
    cur2 = dict_cursor(conn2)
    try:
        cur2.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_color TEXT DEFAULT '#2b8d8d'")
        conn2.commit()
    except Exception:
        conn2.rollback()
    try:
        cur2.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_image TEXT")
        conn2.commit()
    except Exception:
        conn2.rollback()
    try:
        cur2.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE")
        conn2.commit()
    except Exception:
        conn2.rollback()
    conn2.close()

    # Таблица одноразовых кодов входа (5-значные коды)
    conn3 = get_db()
    cur3 = dict_cursor(conn3)
    cur3.execute('''
        CREATE TABLE IF NOT EXISTS login_codes (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            code TEXT NOT NULL,
            used BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            expires_at TIMESTAMPTZ
        )
    ''')
    cur3.execute('''
        CREATE TABLE IF NOT EXISTS pinned_messages (
            id SERIAL PRIMARY KEY,
            scope TEXT NOT NULL,
            scope_id INTEGER NOT NULL,
            message_id INTEGER NOT NULL,
            pinned_by INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            UNIQUE (scope, scope_id)
        )
    ''')
    cur3.execute('''
        CREATE TABLE IF NOT EXISTS link_previews (
            url TEXT PRIMARY KEY,
            title TEXT,
            description TEXT,
            image_url TEXT,
            site_name TEXT DEFAULT '',
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours'))
        )
    ''')
    cur3.execute('''
        CREATE TABLE IF NOT EXISTS polls (
            id SERIAL PRIMARY KEY,
            chat_id INTEGER,
            group_id INTEGER,
            channel_id INTEGER,
            question TEXT NOT NULL,
            options TEXT NOT NULL,
            is_anonymous BOOLEAN DEFAULT FALSE,
            is_closed BOOLEAN DEFAULT FALSE,
            created_by INTEGER,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours'))
        )
    ''')
    cur3.execute('''
        CREATE TABLE IF NOT EXISTS poll_votes (
            id SERIAL PRIMARY KEY,
            poll_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            option_index INTEGER NOT NULL,
            UNIQUE (poll_id, user_id)
        )
    ''')
    cur3.execute('ALTER TABLE messages ADD COLUMN IF NOT EXISTS poll_id INTEGER')

    # ===== Telegram-механики групп и каналов (v0.56.1) =====

    # Забаненные в группе (бан = удаление из участников + запись сюда)
    cur3.execute('''
        CREATE TABLE IF NOT EXISTS group_bans (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            banned_by INTEGER,
            reason TEXT,
            banned_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            UNIQUE(group_id, user_id),
            FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')

    # Мьют участников группы (нельзя писать; участник остаётся)
    cur3.execute('''
        CREATE TABLE IF NOT EXISTS group_mutes (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            muted_by INTEGER,
            until TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            UNIQUE(group_id, user_id),
            FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')

    # Заявки на вступление в приватные группы
    cur3.execute('''
        CREATE TABLE IF NOT EXISTS group_join_requests (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            message TEXT,
            status TEXT DEFAULT 'pending',
            requested_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            UNIQUE(group_id, user_id),
            FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')

    # Мьют уведомлений на чат (группа/канал) — как в Telegram
    cur3.execute('''
        CREATE TABLE IF NOT EXISTS chat_mutes (
            user_id INTEGER NOT NULL,
            chat_type TEXT NOT NULL,
            chat_id INTEGER NOT NULL,
            mute_until TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            PRIMARY KEY (user_id, chat_type, chat_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')

    cur3.execute('ALTER TABLE groups ADD COLUMN IF NOT EXISTS slow_mode_seconds INTEGER DEFAULT 0')
    cur3.execute('ALTER TABLE channels ADD COLUMN IF NOT EXISTS show_sender BOOLEAN DEFAULT FALSE')
    cur3.execute('ALTER TABLE messages ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0')
    cur3.execute('ALTER TABLE groups ADD COLUMN IF NOT EXISTS username TEXT')
    cur3.execute('ALTER TABLE channels ADD COLUMN IF NOT EXISTS username TEXT')
    cur3.execute('CREATE UNIQUE INDEX IF NOT EXISTS uq_groups_username ON groups(username) WHERE username IS NOT NULL AND username != \'\'')
    cur3.execute('CREATE UNIQUE INDEX IF NOT EXISTS uq_channels_username ON channels(username) WHERE username IS NOT NULL AND username != \'\'')

    # ===== v0.58.0: кружки, альбомы, форматирование, стикеры, премиум, 2FA =====

    # Кружки: длительность видеосообщения
    cur3.execute('ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_duration REAL')
    # Альбомы медиа: сообщения одного альбома делят album_id
    cur3.execute('ALTER TABLE messages ADD COLUMN IF NOT EXISTS album_id INTEGER')
    cur3.execute('ALTER TABLE messages ADD COLUMN IF NOT EXISTS album_order INTEGER DEFAULT 0')

    # ===== v0.60.0: Web Push + галочки доставки (✓ отправлено, ✓✓ доставлено/прочитано) =====
    # delivered_at — когда сообщение реально дошло до устройства получателя
    # (у него открыт чат). Пока NULL — вторая галочка не горит.
    cur3.execute('ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ')

    # История редактирования: каждая правка сохраняется, чтобы можно было
    # посмотреть «было → стало». Первая запись = текст ДО первой правки.
    cur3.execute('''
        CREATE TABLE IF NOT EXISTS message_edits (
            id SERIAL PRIMARY KEY,
            message_id INTEGER NOT NULL,
            editor_id INTEGER NOT NULL,
            old_content TEXT,
            new_content TEXT,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
        )''')
    cur3.execute('CREATE INDEX IF NOT EXISTS ix_message_edits_msg '
                 'ON message_edits(message_id, id)')

    # Премиум (Sputnik Premium)
    cur3.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ')
    cur3.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_emoji TEXT')
    cur3.execute('''
        CREATE TABLE IF NOT EXISTS premium_promos (
            id SERIAL PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            days INTEGER NOT NULL DEFAULT 30,
            max_activations INTEGER NOT NULL DEFAULT 1,
            activations INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT TRUE,
            note TEXT,
            created_by TEXT,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            expires_at TIMESTAMPTZ
        )
    ''')
    cur3.execute('''
        CREATE TABLE IF NOT EXISTS premium_activations (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            promo_id INTEGER,
            promo_code TEXT,
            days INTEGER NOT NULL DEFAULT 30,
            started_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            UNIQUE(promo_id, user_id)
        )
    ''')

    # 2FA: облачный пароль поверх кода входа + подсказка + восстановление по email
    cur3.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS cloud_password_hash TEXT')
    cur3.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS cloud_password_hint TEXT')
    cur3.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_email TEXT')

    # Блокировка приложения passcode (как в Telegram)
    cur3.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS app_passcode_hash TEXT')
    cur3.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS app_passcode_hint TEXT')
    cur3.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS app_lock_enabled BOOLEAN DEFAULT FALSE')
    cur3.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS app_lock_autolock INTEGER DEFAULT 0')
    cur3.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS app_passcode_len INTEGER DEFAULT 4')

    # Отложенные сообщения
    cur3.execute('''
        CREATE TABLE IF NOT EXISTS scheduled_messages (
            id SERIAL PRIMARY KEY,
            sender_id INTEGER NOT NULL,
            chat_id INTEGER,
            group_id INTEGER,
            channel_id INTEGER,
            content TEXT,
            file_type TEXT,
            file_path TEXT,
            file_name TEXT,
            file_size INTEGER,
            media_duration REAL,
            reply_to_id INTEGER,
            scheduled_for TIMESTAMPTZ NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours'))
        )
    ''')

    # Стикеры пользователя (в т.ч. избранные)
    cur3.execute('''
        CREATE TABLE IF NOT EXISTS stickers (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            emoji TEXT,
            caption TEXT,
            set_name TEXT DEFAULT 'Мои стикеры',
            is_favorite BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours'))
        )
    ''')
    cur3.execute('CREATE UNIQUE INDEX IF NOT EXISTS uq_stickers_user_path ON stickers(user_id, file_path)')

    # Подписки Web Push (Service Worker). Несколько устройств на юзера —
    # поэтому уникальность по endpoint, а не по user_id.
    cur3.execute('''
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            endpoint TEXT UNIQUE NOT NULL,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            user_agent TEXT,
            is_enabled BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT ((NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')),
            last_used_at TIMESTAMPTZ
        )
    ''')
    cur3.execute('CREATE INDEX IF NOT EXISTS ix_push_sub_user ON push_subscriptions(user_id)')

    conn3.commit()
    conn3.close()

    # Папки «Все чаты» для пользователей, зарегистрированных до появления папок
    migrate_existing_users_with_folders()

    # Железобетонная защита системных аккаунтов (см. PROTECTED_USERS)
    install_protected_users_guard()


# ===== ЗАЩИТА СИСТЕМНЫХ / АДМИНСКИХ АККАУНТОВ =====
# Их нельзя удалить, забанить, переименовать и нельзя снять флаг
# is_system — даже прямым SQL (sqlite3 в терминале, DB Browser, python).
# Защита двойная: триггеры SQLite (последний рубеж) + проверки в
# Python-функциях (чтобы пользователь получал внятную ошибку, а не
# SQLITE_CONSTRAINT).
PROTECTED_USERS_DEFAULT = '@sputnik,@admin'


def protected_usernames():
    """Логины, которые нельзя удалять/переименовать/банить."""
    import re as _re
    try:
        from config import env as _env
        raw = _env('PROTECTED_USERS', PROTECTED_USERS_DEFAULT)
    except Exception:
        raw = PROTECTED_USERS_DEFAULT
    out = set()
    for part in _re.split(r'[,\s;]+', raw or ''):
        part = part.strip().lstrip('@').lower()
        if part:
            out.add(part)
    return out or {'sputnik'}


def is_protected_user(user_id=None, username=None):
    """True, если аккаунт защищён от удаления."""
    conn = get_db()
    try:
        cur = dict_cursor(conn)
        if user_id:
            cur.execute('SELECT username, is_system FROM users WHERE id = %s', (user_id,))
            row = cur.fetchone()
            if not row:
                return False
            return bool(row.get('is_system')) or (row.get('username') or '').lower() in protected_usernames()
        if username:
            return str(username).lstrip('@').lower() in protected_usernames()
        return False
    finally:
        conn.close()


def _protected_sql_condition(alias=''):
    """SQL-условие «это защищённый аккаунт» (для триггеров)."""
    names = sorted(protected_usernames())
    marks = ','.join("'%s'" % n.replace("'", "''") for n in names)
    a = (alias + '.') if alias else ''
    return "({a}is_system = 1 OR lower({a}username) IN ({m}))".format(a=a, m=marks)


def install_protected_users_guard():
    """Создаёт/обновляет триггеры, запрещающие трогать защищённых."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute('DROP TRIGGER IF EXISTS trg_users_protected_no_delete')
        cur.execute('DROP TRIGGER IF EXISTS trg_users_protected_flags')
        cur.execute('''
            CREATE TRIGGER trg_users_protected_no_delete
            BEFORE DELETE ON users
            FOR EACH ROW WHEN {cond}
            BEGIN
                SELECT RAISE(ABORT, 'Защищённый аккаунт удалить нельзя');
            END
        '''.format(cond=_protected_sql_condition('OLD')))
        cur.execute('''
            CREATE TRIGGER trg_users_protected_flags
            BEFORE UPDATE OF is_deleted, deleted_at, is_banned, ban_reason,
                              is_system, username, phone, password
            ON users
            FOR EACH ROW WHEN {cond}
            BEGIN
                SELECT RAISE(ABORT, 'Защищённый аккаунт изменять нельзя');
            END
        '''.format(cond=_protected_sql_condition('OLD')))
        conn.commit()
    finally:
        conn.close()


# ----- ФУНКЦИИ БЛОКИРОВКИ -----
def block_user(user_id, blocked_user_id):
    """Блокирует пользователя"""
    if user_id == blocked_user_id:
        return False
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('''
            INSERT INTO blocked_users (user_id, blocked_user_id)
            VALUES (%s, %s)
        ''', (user_id, blocked_user_id))
        conn.commit()
        return True
    except:
        return False
    finally:
        conn.close()


def unblock_user(user_id, blocked_user_id):
    """Разблокирует пользователя"""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        DELETE FROM blocked_users 
        WHERE user_id = %s AND blocked_user_id = %s
    ''', (user_id, blocked_user_id))
    conn.commit()
    conn.close()
    return True


def is_user_blocked(user_id, blocked_user_id):
    """Проверяет, заблокирован ли пользователь"""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT id FROM blocked_users 
        WHERE user_id = %s AND blocked_user_id = %s
    ''', (user_id, blocked_user_id))
    result = cur.fetchone()
    conn.close()
    return result is not None


def get_blocked_users(user_id):
    """Получает список заблокированных пользователей"""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT u.id, u.unique_id, u.username, u.display_name, u.avatar
        FROM blocked_users bu
        JOIN users u ON bu.blocked_user_id = u.id
        WHERE bu.user_id = %s
    ''', (user_id,))
    blocked = cur.fetchall()
    conn.close()
    return blocked


def get_user_profile(user_id, current_user_id):
    conn = get_db()
    cur = dict_cursor(conn)

    cur.execute('''
        SELECT id, unique_id, username, display_name, phone, avatar, bio, birthday, 
               last_seen, is_deleted, is_banned, ban_reason, banner_color, banner_image
        FROM users 
        WHERE id = %s AND is_deleted = FALSE
    ''', (user_id,))
    user = cur.fetchone()
    conn.close()

    if not user:
        return None

    user_dict = dict(user)
    user_dict['is_blocked_by_me'] = is_user_blocked(current_user_id, user_id)
    user_dict['has_blocked_me'] = is_user_blocked(user_id, current_user_id)

    return user_dict


def clear_chat(chat_id=None, group_id=None, channel_id=None):
    """Очищает историю сообщений в чате (мягко — сообщения уходят в корзину)"""
    conn = get_db()
    cur = dict_cursor(conn)
    now = get_moscow_time()
    if chat_id:
        cur.execute('''UPDATE messages SET is_deleted = TRUE, deleted_for_all = TRUE,
                       deleted_at = %s WHERE chat_id = %s AND is_deleted = FALSE''', (now, chat_id))
        cur.execute('''DELETE FROM message_hides WHERE message_id IN
                       (SELECT id FROM messages WHERE chat_id = %s)''', (chat_id,))
    elif group_id:
        cur.execute('''UPDATE messages SET is_deleted = TRUE, deleted_for_all = TRUE,
                       deleted_at = %s WHERE group_id = %s AND is_deleted = FALSE''', (now, group_id))
        cur.execute('''DELETE FROM message_hides WHERE message_id IN
                       (SELECT id FROM messages WHERE group_id = %s)''', (group_id,))
    elif channel_id:
        cur.execute('''UPDATE messages SET is_deleted = TRUE, deleted_for_all = TRUE,
                       deleted_at = %s WHERE channel_id = %s AND is_deleted = FALSE''', (now, channel_id))
        cur.execute('''DELETE FROM message_hides WHERE message_id IN
                       (SELECT id FROM messages WHERE channel_id = %s)''', (channel_id,))

    conn.commit()
    conn.close()
    return True


def reply_to_story(story_id, user_id, reply_text):
    """Отправляет ответ на историю"""
    conn = get_db()
    cur = dict_cursor(conn)

    cur.execute('SELECT user_id FROM stories WHERE id = %s', (story_id,))
    story = cur.fetchone()

    if story:
        chat_id = get_or_create_chat(user_id, story['user_id'])
        message_content = f"📱 Ответ на историю: {reply_text}"
        send_message(chat_id=chat_id, sender_id=user_id, content=message_content)
        return chat_id

    conn.close()
    return None


# ----- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ -----
import bcrypt


def hash_password(password):
    """Создаёт bcrypt-хэш пароля (с солью)."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def is_bcrypt_hash(stored):
    return isinstance(stored, str) and stored.startswith('$2')


def is_legacy_sha256(stored):
    return isinstance(stored, str) and not stored.startswith('$') and len(stored) == 64


def verify_password(stored, password):
    """Проверяет пароль: bcrypt или старый sha256 (без миграции здесь)."""
    if is_bcrypt_hash(stored):
        try:
            return bcrypt.checkpw(password.encode('utf-8'), stored.encode('utf-8'))
        except Exception:
            return False
    if is_legacy_sha256(stored):
        return stored == hashlib.sha256(password.encode()).hexdigest()
    return False


def resize_and_crop_image(image_path, size=(500, 500)):
    try:
        img = Image.open(image_path)
        min_size = min(img.size)
        left = (img.size[0] - min_size) / 2
        top = (img.size[1] - min_size) / 2
        right = (img.size[0] + min_size) / 2
        bottom = (img.size[1] + min_size) / 2
        img = img.crop((left, top, right, bottom))
        img = img.resize(size, Image.Resampling.LANCZOS)
        img.save(image_path)
        return True
    except:
        return False


def generate_unique_id():
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT MAX(unique_id) as max_id FROM users')
    result = cur.fetchone()
    conn.close()

    if result and result['max_id'] and result['max_id'] >= 1000000:
        return result['max_id'] + 1
    else:
        return 1000000


# ----- ПОЛЬЗОВАТЕЛИ -----
def create_user_initial(phone, password, email=None):
    """Первый этап регистрации"""
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        unique_id = generate_unique_id()
        temp_username = f"user_{phone.replace('+', '').replace(' ', '')[:8]}"
        cur.execute('''
            INSERT INTO users (unique_id, phone, username, display_name, password, last_seen, email, registration_complete)
            VALUES (%s, %s, %s, %s, %s, %s, %s, FALSE)
            RETURNING id
        ''', (unique_id, phone, temp_username, temp_username, hash_password(password), get_moscow_time(), email))
        user_id = cur.fetchone()['id']
        conn.commit()

        cur.execute('INSERT INTO chats (user1_id, user2_id) VALUES (%s, %s) ON CONFLICT DO NOTHING', (user_id, user_id))
        conn.commit()
        return user_id
    except Exception as e:
        print(f"Error creating user: {e}")
        return None
    finally:
        conn.close()


def complete_registration(user_id, username, display_name, avatar=None):
    """Второй этап регистрации"""
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        if avatar:
            avatar = avatar.lstrip('/')
        cur.execute('''
            UPDATE users 
            SET username = %s, display_name = %s, avatar = %s, registration_complete = TRUE
            WHERE id = %s
        ''', (username, display_name or username, avatar, user_id))

        # ===== ВАЖНО: Создаем папку "Все чаты" для нового пользователя =====
        cur.execute('''
            INSERT INTO chat_folders (user_id, name, sort_order)
            VALUES (%s, 'Все чаты', 0) ON CONFLICT DO NOTHING
        ''', (user_id,))

        conn.commit()
        return True
    except Exception as e:
        print(f"Error completing registration: {e}")
        return False
    finally:
        conn.close()


def check_phone_exists(phone):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT id, registration_complete FROM users WHERE phone = %s AND is_deleted = FALSE', (phone,))
    user = cur.fetchone()
    conn.close()
    return user


def get_user_by_id(user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT * FROM users WHERE id = %s AND is_deleted = FALSE', (user_id,))
    user = cur.fetchone()
    conn.close()
    return user


def get_user_by_unique_id(unique_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT * FROM users WHERE unique_id = %s AND is_deleted = FALSE', (unique_id,))
    user = cur.fetchone()
    conn.close()
    return user


def get_user_by_username(username):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT * FROM users WHERE username = %s AND is_deleted = FALSE', (username,))
    user = cur.fetchone()
    conn.close()
    return user


def is_user_banned(user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT is_banned FROM users WHERE id = %s', (user_id,))
    row = cur.fetchone()
    conn.close()
    return bool(row and row['is_banned'])


def get_ban_info(user_id):
    """Возвращает статус бана и причину (для экрана 'Аккаунт заблокирован')."""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT is_banned, ban_reason FROM users WHERE id = %s', (user_id,))
    row = cur.fetchone()
    conn.close()
    return {
        'is_banned': bool(row and row['is_banned']),
        'ban_reason': (row or {}).get('ban_reason') if row else None,
    }


def svc_list_users():
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT u.id, u.unique_id, u.phone, u.username, u.display_name, u.avatar,
               u.email, u.bio, u.birthday, u.created_at, u.last_seen,
               u.is_banned, u.ban_reason, u.is_deleted, u.registration_complete,
               (SELECT COUNT(*) FROM messages m WHERE m.sender_id = u.id AND m.is_deleted = FALSE) as messages_count,
               (SELECT COUNT(*) FROM chats c WHERE c.user1_id = u.id OR c.user2_id = u.id) as chats_count,
               (SELECT COUNT(*) FROM stories s WHERE s.user_id = u.id) as stories_count
        FROM users u
        ORDER BY u.id
    ''')
    users = cur.fetchall()
    conn.close()
    return users


def svc_user_card(user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT * FROM users WHERE id = %s', (user_id,))
    user = cur.fetchone()
    if not user:
        conn.close()
        return None
    cur.execute('SELECT COUNT(*) as total FROM messages WHERE sender_id = %s AND is_deleted = FALSE', (user_id,))
    user['messages_count'] = cur.fetchone()['total']
    cur.execute('SELECT COUNT(*) as total FROM stories WHERE user_id = %s', (user_id,))
    user['stories_count'] = cur.fetchone()['total']
    cur.execute('SELECT COUNT(*) as total FROM chats WHERE user1_id = %s OR user2_id = %s', (user_id, user_id))
    user['chats_count'] = cur.fetchone()['total']
    cur.execute('SELECT COUNT(*) as total FROM contacts WHERE user_id = %s', (user_id,))
    user['contacts_count'] = cur.fetchone()['total']
    conn.close()
    return user


def svc_toggle(user_id, banned, reason=None):
    if is_protected_user(user_id):
        return False, 'Защищённый аккаунт заблокировать нельзя'
    conn = get_db()
    cur = dict_cursor(conn)
    if reason:
        cur.execute('UPDATE users SET is_banned = %s, ban_reason = %s WHERE id = %s',
                    (bool(banned), str(reason)[:300], user_id))
    else:
        cur.execute('UPDATE users SET is_banned = %s, ban_reason = %s WHERE id = %s',
                    (bool(banned), reason, user_id))
    conn.commit()
    conn.close()


def svc_wipe(user_id):
    if is_protected_user(user_id):
        return 0, 0
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('UPDATE messages SET is_deleted = TRUE WHERE sender_id = %s', (user_id,))
    deleted_messages = cur.rowcount
    cur.execute('DELETE FROM stories WHERE user_id = %s', (user_id,))
    deleted_stories = cur.rowcount
    conn.commit()
    conn.close()
    return deleted_messages, deleted_stories


def svc_trace(actor, action, details=None):
    """Записывает действие администратора в журнал (аудит-лог)."""
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('INSERT INTO svc_traces (actor, action, details) VALUES (%s, %s, %s)',
                    (actor, action, (details or '')[:500]))
        conn.commit()
    finally:
        conn.close()


def svc_trace_list(limit=200):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT * FROM svc_traces ORDER BY id DESC LIMIT %s', (limit,))
    rows = cur.fetchall()
    conn.close()
    return rows


def parse_user_agent(ua=''):
    """Возвращает читаемое описание устройства и браузера из User-Agent."""
    ua = ua or ''
    if 'iPhone' in ua:
        dev = 'iPhone'
    elif 'iPad' in ua:
        dev = 'iPad'
    elif 'Android' in ua:
        dev = 'Android'
    elif 'Windows' in ua:
        dev = 'Windows'
    elif 'Macintosh' in ua or 'Mac OS X' in ua:
        dev = 'macOS'
    elif 'Linux' in ua:
        dev = 'Linux'
    else:
        dev = 'Неизвестно'
    is_mobile = ('Mobile' in ua) or 'iPhone' in ua or 'Android' in ua
    dev += ' · ' + ('моб.' if is_mobile else 'ПК')
    browser = 'Браузер'
    for name, key in (('Яндекс', 'YaBrowser'), ('Edge', 'Edg/'), ('Opera', 'OPR/'),
                      ('Chrome', 'Chrome'), ('Firefox', 'Firefox'), ('Safari', 'Safari')):
        if key in ua:
            browser = name
            break
    return '%s · %s' % (dev, browser)


def svc_note_access(ip, user_agent, phone, probe, success):
    """Записывает попытку входа в админ-панель: IP, устройство, код, результат."""
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        device = parse_user_agent(user_agent)
        cur.execute('''
            INSERT INTO svc_access_log (ip, user_agent, device, phone, probe, success)
            VALUES (%s, %s, %s, %s, %s, %s)
        ''', ((ip or '')[:64], (user_agent or '')[:300], device,
              (phone or '')[:40], (probe or '')[:20], 1 if success else 0))
        conn.commit()
    finally:
        conn.close()


def svc_access_list(limit=100):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT * FROM svc_access_log ORDER BY id DESC LIMIT %s', (limit,))
    rows = cur.fetchall()
    conn.close()
    return rows


def svc_patch_user(user_id, username=None, display_name=None, bio=None, reset_avatar=False):
    """Модерация профиля пользователя (без пароля и без контента)."""
    if is_protected_user(user_id):
        return False
    conn = get_db()
    cur = dict_cursor(conn)
    updates = []
    params = []
    if username is not None:
        updates.append('username = %s')
        params.append(username)
    if display_name is not None:
        updates.append('display_name = %s')
        params.append(display_name)
    if bio is not None:
        updates.append('bio = %s')
        params.append(bio)
    if reset_avatar:
        updates.append('avatar = NULL')
    if not updates:
        conn.close()
        return False
    params.append(user_id)
    cur.execute(f'UPDATE users SET {", ".join(updates)} WHERE id = %s', params)
    conn.commit()
    conn.close()
    return True


def svc_list_groups():
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT g.id, g.name, g.description, g.avatar, g.is_public, g.created_at,
               g.owner_id, u.username as owner_username, u.display_name as owner_display_name,
               (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as member_count,
               (SELECT COUNT(*) FROM messages m WHERE m.group_id = g.id AND m.is_deleted = FALSE) as message_count
        FROM groups g
        JOIN users u ON g.owner_id = u.id
        ORDER BY g.id
    ''')
    rows = cur.fetchall()
    conn.close()
    return rows


def svc_group_roster(group_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT gm.user_id, gm.role, u.display_name, u.username, u.phone, u.is_banned, u.avatar
        FROM group_members gm
        JOIN users u ON gm.user_id = u.id
        WHERE gm.group_id = %s
        ORDER BY gm.role, u.display_name
    ''', (group_id,))
    rows = cur.fetchall()
    conn.close()
    return rows


def svc_remove_node(group_id):
    """Принудительное удаление группы (модерация) — любой причине."""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('DELETE FROM groups WHERE id = %s', (group_id,))
    ok = cur.rowcount > 0
    conn.commit()
    conn.close()
    return ok


def svc_detach(group_id, user_id):
    """Исключение участника из группы (владельца не трогаем)."""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute("DELETE FROM group_members WHERE group_id = %s AND user_id = %s AND role != 'owner'",
                (group_id, user_id))
    ok = cur.rowcount > 0
    conn.commit()
    conn.close()
    return ok


def svc_list_channels():
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT c.id, c.name, c.description, c.avatar, c.is_public, c.created_at,
               u.username as owner_username, u.display_name as owner_display_name, c.owner_id,
               (SELECT COUNT(*) FROM channel_subscribers cs WHERE cs.channel_id = c.id) as subscriber_count,
               (SELECT COUNT(*) FROM messages m WHERE m.channel_id = c.id AND m.is_deleted = FALSE) as message_count
        FROM channels c
        JOIN users u ON c.owner_id = u.id
        ORDER BY c.id
    ''')
    rows = cur.fetchall()
    conn.close()
    return rows


def svc_channel_roster(channel_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT cs.user_id, u.display_name, u.username, u.phone, u.is_banned, u.avatar
        FROM channel_subscribers cs
        JOIN users u ON cs.user_id = u.id
        WHERE cs.channel_id = %s
        ORDER BY u.display_name
    ''', (channel_id,))
    rows = cur.fetchall()
    conn.close()
    return rows


def svc_purge_node(channel_id):
    """Принудительное удаление канала (модерация)."""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('DELETE FROM channels WHERE id = %s', (channel_id,))
    ok = cur.rowcount > 0
    conn.commit()
    conn.close()
    return ok


def svc_find_user(phone=None, username=None, unique_id=None):
    """Поиск пользователя по телефону, username и/или уникальному ID (любое сочетание).

    Все указанные поля применяются как условия (И). Из результата исключается
    системный пользователь (id = -1). Используется для read-only просмотра аккаунтов.
    """
    import re
    conn = get_db()
    cur = dict_cursor(conn)
    conditions = ['is_deleted = FALSE', 'id != %s']
    params = [-1]
    if phone:
        norm = re.sub(r'\s+', '', phone.strip())
        conditions.append("(phone = %s OR phone = %s)")
        params += [norm, phone.strip()]
    if username:
        uname = username.strip().lstrip('@')
        conditions.append("LOWER(username) LIKE LOWER(%s)")
        params.append(f'%{uname}%')
    if unique_id:
        conditions.append("unique_id = %s")
        params.append(str(unique_id).strip())
    query = f'''
        SELECT id, unique_id, phone, username, display_name, avatar, is_banned,
               is_deleted, registration_complete, last_seen
        FROM users WHERE {' AND '.join(conditions)}
        ORDER BY id
    '''
    cur.execute(query, params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def svc_dump(user_id):
    """Полный read-only «зеркальный» профиль пользователя: анкета + список
    всех его чатов (личные, группы, каналы) с числом сообщений и последним текстом."""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT * FROM users WHERE id = %s', (user_id,))
    user = cur.fetchone()
    if not user:
        conn.close()
        return None
    user.pop('password', None)
    cur.execute('SELECT COUNT(*) as total FROM messages WHERE sender_id = %s AND is_deleted = FALSE',
                (user_id,))
    user['messages_count'] = cur.fetchone()['total']
    cur.execute('SELECT COUNT(*) as total FROM stories WHERE user_id = %s', (user_id,))
    user['stories_count'] = cur.fetchone()['total']

    cur.execute('''
        SELECT
            'personal' as chat_type,
            c.id as chat_id,
            CASE WHEN c.user1_id = %s THEN c.user2_id ELSE c.user1_id END as other_user_id,
            CASE WHEN c.user1_id = c.user2_id THEN 'Избранное'
                 ELSE COALESCE(cn.name, u.display_name, u.username) END as name,
            CASE WHEN c.user1_id = c.user2_id THEN 'static/icons/favorites.webp'
                 ELSE u.avatar END as avatar,
            u.username as other_username,
            u.display_name as other_display_name,
            u.is_banned as other_banned,
            (SELECT COUNT(*) FROM messages m
              WHERE m.chat_id = c.id AND m.is_deleted = FALSE AND (m.expires_at IS NULL OR m.expires_at > (NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours'))) as message_count,
            (SELECT m.content FROM messages m
              WHERE m.chat_id = c.id AND m.is_deleted = FALSE ORDER BY m.created_at DESC LIMIT 1) as last_message
        FROM chats c
        LEFT JOIN users u ON (CASE WHEN c.user1_id = %s THEN c.user2_id ELSE c.user1_id END) = u.id
        LEFT JOIN contact_names cn ON cn.user_id = %s AND cn.contact_id = u.id
        WHERE (c.user1_id = %s OR c.user2_id = %s) AND u.is_deleted = FALSE
        ORDER BY c.id
    ''', (user_id, user_id, user_id, user_id, user_id))
    personal = [dict(r) for r in cur.fetchall()]

    cur.execute('''
        SELECT
            'group' as chat_type,
            g.id as chat_id,
            g.name,
            g.avatar,
            (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as member_count,
            (SELECT COUNT(*) FROM messages m
              WHERE m.group_id = g.id AND m.is_deleted = FALSE AND (m.expires_at IS NULL OR m.expires_at > (NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours'))) as message_count,
            (SELECT m.content FROM messages m
              WHERE m.group_id = g.id AND m.is_deleted = FALSE ORDER BY m.created_at DESC LIMIT 1) as last_message
        FROM groups g
        JOIN group_members gm ON g.id = gm.group_id
        WHERE gm.user_id = %s
        ORDER BY g.id
    ''', (user_id,))
    groups = [dict(r) for r in cur.fetchall()]

    cur.execute('''
        SELECT
            'channel' as chat_type,
            c.id as chat_id,
            c.name,
            c.avatar,
            (SELECT COUNT(*) FROM channel_subscribers cs WHERE cs.channel_id = c.id) as subscriber_count,
            (SELECT COUNT(*) FROM messages m
              WHERE m.channel_id = c.id AND m.is_deleted = FALSE AND (m.expires_at IS NULL OR m.expires_at > (NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours'))) as message_count,
            (SELECT m.content FROM messages m
              WHERE m.channel_id = c.id AND m.is_deleted = FALSE ORDER BY m.created_at DESC LIMIT 1) as last_message
        FROM channels c
        JOIN channel_subscribers cs ON c.id = cs.channel_id
        WHERE cs.user_id = %s
        ORDER BY c.id
    ''', (user_id,))
    channels = [dict(r) for r in cur.fetchall()]

    conn.close()
    return {'profile': user, 'chats': personal + groups + channels}


def svc_page(chat_type, chat_id, limit=200, offset=0):
    """Read-only выборка сообщений чата (без пометок прочтения и без удаления
    истёкших). Администратор видит всё, включая скрытые блокировками диалоги."""
    conn = get_db()
    cur = dict_cursor(conn)
    params_base = (chat_id,)
    if chat_type == 'group':
        cond = 'm.group_id = %s'
        count_sql = '''SELECT COUNT(*) as total FROM messages
                       WHERE group_id = %s AND is_deleted = FALSE AND (expires_at IS NULL OR expires_at > (NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours'))'''
    elif chat_type == 'channel':
        cond = 'm.channel_id = %s'
        count_sql = '''SELECT COUNT(*) as total FROM messages
                       WHERE channel_id = %s AND is_deleted = FALSE AND (expires_at IS NULL OR expires_at > (NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours'))'''
    else:
        cond = 'm.chat_id = %s'
        count_sql = '''SELECT COUNT(*) as total FROM messages
                       WHERE chat_id = %s AND is_deleted = FALSE AND (expires_at IS NULL OR expires_at > (NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours'))'''

    cur.execute(count_sql, params_base)
    total = cur.fetchone()['total']

    cur.execute(f'''
        SELECT m.*, u.username, u.display_name, u.avatar, u.is_banned as sender_is_banned
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE m.is_deleted = FALSE AND (m.expires_at IS NULL OR m.expires_at > (NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')) AND {cond}
        ORDER BY m.created_at ASC
        LIMIT %s OFFSET %s
    ''', params_base + (limit, offset))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows, total


def svc_counters():
    conn = get_db()
    cur = dict_cursor(conn)
    def one(query, *params):
        cur.execute(query, params)
        row = cur.fetchone()
        return row['total'] if row else 0
    stats = {
        'users': one('SELECT COUNT(*) as total FROM users'),
        'deleted_users': one('SELECT COUNT(*) as total FROM users WHERE is_deleted = TRUE'),
        'banned_users': one('SELECT COUNT(*) as total FROM users WHERE is_banned = TRUE'),
        'messages': one('SELECT COUNT(*) as total FROM messages WHERE is_deleted = FALSE'),
        'groups': one('SELECT COUNT(*) as total FROM groups'),
        'channels': one('SELECT COUNT(*) as total FROM channels'),
        'stories': one('SELECT COUNT(*) as total FROM stories'),
        'chats': one('SELECT COUNT(*) as total FROM chats'),
        'contacts': one('SELECT COUNT(*) as total FROM contacts'),
    }
    cur.execute('''
        SELECT to_char(created_at, 'YYYY-MM-DD') as day, COUNT(*) as cnt
        FROM users
        WHERE created_at >= NOW() - INTERVAL '14 days'
        GROUP BY to_char(created_at, 'YYYY-MM-DD')
        ORDER BY day
    ''')
    stats['registrations'] = [dict(r) for r in cur.fetchall()]
    cur.execute('''
        SELECT u.id, u.display_name, u.username, u.is_banned, COUNT(m.id) as cnt
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.is_deleted = FALSE
        GROUP BY u.id, u.display_name, u.username, u.is_banned
        ORDER BY cnt DESC
        LIMIT 10
    ''')
    stats['top_users'] = [dict(r) for r in cur.fetchall()]
    conn.close()
    return stats


def get_user_by_phone(phone):
    import re
    conn = get_db()
    cur = dict_cursor(conn)
    normalized = re.sub(r'\s+', '', phone)
    cur.execute("SELECT * FROM users WHERE phone = %s AND is_deleted = FALSE", (normalized,))
    user = cur.fetchone()
    if not user:
        cur.execute("SELECT * FROM users WHERE phone = %s AND is_deleted = FALSE", (phone,))
        user = cur.fetchone()
    conn.close()
    return user


def verify_user(phone, password):
    user = get_user_by_phone(phone)
    if not user:
        return None
    stored = user['password']
    if verify_password(stored, password):
        # Авто-миграция со старого sha256 на bcrypt (соль + медленный хэш)
        if not is_bcrypt_hash(stored):
            new_hash = hash_password(password)
            conn = get_db()
            cur = conn.cursor()
            cur.execute('UPDATE users SET password = %s WHERE id = %s', (new_hash, user['id']))
            conn.commit()
            conn.close()
            user['password'] = new_hash
        return user
    return None


def update_last_seen(user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('UPDATE users SET last_seen = %s WHERE id = %s', (get_moscow_time(), user_id))
    conn.commit()
    conn.close()


# ----- ПОДПИСКИ WEB PUSH -----
def add_push_subscription(user_id, endpoint, p256dh, auth, user_agent=None):
    """Сохраняет/обновляет подписку Service Worker (один endpoint = одно устройство)."""
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('SELECT id FROM push_subscriptions WHERE endpoint = %s', (endpoint,))
        existing = cur.fetchone()
        if existing:
            cur.execute('''UPDATE push_subscriptions
                            SET user_id = %s, p256dh = %s, auth = %s,
                                user_agent = %s, is_enabled = TRUE, last_used_at = %s
                            WHERE id = %s''',
                         (user_id, p256dh, auth, user_agent, get_moscow_time(), existing['id']))
        else:
            cur.execute('''INSERT INTO push_subscriptions
                           (user_id, endpoint, p256dh, auth, user_agent)
                           VALUES (%s, %s, %s, %s, %s)''',
                        (user_id, endpoint, p256dh, auth, user_agent))
        conn.commit()
        return True
    finally:
        conn.close()


def get_push_subscriptions(user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''SELECT * FROM push_subscriptions
                   WHERE user_id = %s AND is_enabled = TRUE''', (user_id,))
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def count_push_subscriptions(user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = %s AND is_enabled = TRUE',
                (user_id,))
    row = cur.fetchone()
    conn.close()
    return int(row['n']) if row else 0


def delete_push_subscription(endpoint=None, user_id=None):
    """Убирает одну подписку (по endpoint) либо все подписки пользователя."""
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        if endpoint:
            cur.execute('DELETE FROM push_subscriptions WHERE endpoint = %s', (endpoint,))
        elif user_id:
            cur.execute('DELETE FROM push_subscriptions WHERE user_id = %s', (user_id,))
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


def prune_push_subscriptions(max_age_days=60):
    """Удаляет подписки, которыми не пользовались дольше max_age_days дней."""
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cutoff = (datetime.now() - timedelta(days=int(max_age_days))).strftime('%Y-%m-%d %H:%M:%S')
        cur.execute('''DELETE FROM push_subscriptions
                       WHERE last_used_at IS NOT NULL AND last_used_at < %s''', (cutoff,))
        conn.commit()
        return cur.rowcount
    except Exception as e:
        print('[db] prune_push_subscriptions: %s' % e)
        return 0
    finally:
        conn.close()


def touch_push_subscriptions(user_id):
    """Отмечает подписки пользователя как только что использованные."""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('UPDATE push_subscriptions SET last_used_at = %s WHERE user_id = %s',
                (get_moscow_time(), user_id))
    conn.commit()
    conn.close()


# ----- галочки доставки (v0.60.0) -----
def mark_messages_delivered(chat_id, reader_id, sender_id=None, message_ids=None):
    """Помечает сообщения доставленными и возвращает их id.

    Вызывается, когда получатель реально открыл чат (у него есть сокет).
    Отвечает только за те сообщения, где получатель — НЕ автор.
    """
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        sql = ('SELECT id FROM messages WHERE chat_id = %s AND sender_id != %s '
               'AND delivered_at IS NULL')
        params = [chat_id, reader_id]
        if sender_id:
            sql += ' AND sender_id = %s'
            params.append(sender_id)
        if message_ids:
            ids = [int(i) for i in message_ids if i]
            if not ids:
                conn.close()
                return []
            sql += ' AND id IN (' + ','.join(['%s'] * len(ids)) + ')'
            params.extend(ids)
        cur.execute(sql, params)
        newly = [r['id'] for r in cur.fetchall()]
        if newly:
            # Внимание: плейсхолдеры склеиваем вручную, иначе %s в шаблоне
            # отформатируется дважды и SQLite получит лишние знаки вопроса.
            upd = ('UPDATE messages SET delivered_at = %s WHERE id IN ('
                   + ','.join(['%s'] * len(newly)) + ')')
            cur.execute(upd, [get_moscow_time()] + newly)
            conn.commit()
        conn.close()
        return newly
    except Exception as e:
        print('[db] mark_messages_delivered: %s' % e)
        conn.close()
        return []


def get_undelivered_message_ids(chat_id, reader_id, limit=200):
    """id сообщений в чате, которые ещё не отмечены как доставленные."""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''SELECT id FROM messages WHERE chat_id = %s AND sender_id != %s
                   AND delivered_at IS NULL AND is_deleted = FALSE
                   ORDER BY id ASC LIMIT %s''', (chat_id, reader_id, int(limit)))
    rows = cur.fetchall()
    conn.close()
    return [r['id'] for r in rows]





# Колонки users, которые пользователь не может менять через
# update_user_settings: флаги аккаунта, логин, телефон, пароль.
USER_SETTINGS_FORBIDDEN = (
    'id', 'unique_id', 'is_system', 'is_deleted', 'deleted_at', 'is_banned',
    'ban_reason', 'phone', 'password', 'registration_complete',
    'premium_until', 'premium_emoji', 'cloud_password_hash',
    'app_passcode_hash', 'recovery_email',
)

# Дополнительно замораживаются у защищённых аккаунтов (иначе сработал бы
# триггер и запрос упал бы с 500 вместо тихой отмены).
USER_SETTINGS_FROZEN_PROTECTED = ('username',)

# Системный аккаунт (@sputnik) — витрина приложения: его имя, описание и
# аватар не должны переписываться обычной правкой профиля (иначе в чате
# появляется «Спутник» с чужим именем/аватаром).
USER_SETTINGS_FROZEN_SYSTEM = (
    'username', 'display_name', 'bio', 'avatar', 'banner_color',
    'banner_image', 'unique_id', 'phone',
)


def update_user_settings(user_id, **kwargs):
    conn = get_db()
    cur = dict_cursor(conn)
    protected = is_protected_user(user_id)
    is_system = False
    if protected:
        row = cur.execute(
            'SELECT is_system FROM users WHERE id = %s', (user_id,)).fetchone()
        is_system = bool(row and dict(row).get('is_system'))
    for key, value in kwargs.items():
        if value is None:
            continue
        if key in USER_SETTINGS_FORBIDDEN:
            continue
        if protected and key in USER_SETTINGS_FROZEN_PROTECTED:
            continue
        if is_system and key in USER_SETTINGS_FROZEN_SYSTEM:
            continue
        cur.execute(f'UPDATE users SET {key} = %s WHERE id = %s', (value, user_id))
    conn.commit()
    conn.close()


def delete_user_account(user_id):
    if is_protected_user(user_id):
        return False, 'Защищённый аккаунт удалить нельзя'
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT username FROM users WHERE id = %s', (user_id,))
    user = cur.fetchone()

    if user:
        new_username = f"deleted_{user['username']}_{get_moscow_datetime().strftime('%Y%m%d%H%M%S')}"
        cur.execute('''
            UPDATE users SET 
                is_deleted = TRUE,
                deleted_at = %s,
                username = %s,
                display_name = 'Удалённый аккаунт',
                avatar = 'static/avatar-swg/deleted.png',
                bio = NULL,
                phone = %s,
                password = %s
            WHERE id = %s
        ''', (get_moscow_time(), new_username, f"deleted_{user_id}", hash_password("deleted"), user_id))
        conn.commit()
    conn.close()
    return True


def check_username_available(username, current_user_id=None):
    conn = get_db()
    cur = dict_cursor(conn)

    if current_user_id:
        cur.execute('SELECT id FROM users WHERE username = %s AND id != %s AND is_deleted = FALSE',
                       (username, current_user_id))
    else:
        cur.execute('SELECT id FROM users WHERE username = %s AND is_deleted = FALSE', (username,))

    user = cur.fetchone()
    conn.close()
    return user is None


# ----- ПОИСК (ПРОСТОЙ) -----
def search_users(query, current_user_id):
    """Поиск людей: точный телефон или частичное совпадение по @username / имени.

    Раньше было только точное совпадение username/phone, поэтому «ilxz» не находил
    @ilxz_12 — в частности, это ломало выбор участников в мастере создания чата.
    """
    query = (query or '').strip()
    if not query:
        return []
    conn = get_db()
    cur = dict_cursor(conn)
    # экранируем спецсимволы LIKE, чтобы «%» и «_» не превращались в шаблон
    esc = query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
    like = f'%{esc.lstrip("@")}%'
    cur.execute('''
        SELECT id, unique_id, username, display_name, phone, avatar, bio, last_seen, is_banned
        FROM users
        WHERE (phone = %s
               OR username LIKE %s ESCAPE '\\'
               OR display_name LIKE %s ESCAPE '\\')
          AND id != %s
          AND is_deleted = FALSE
          AND registration_complete = TRUE
          AND COALESCE(is_system, FALSE) = FALSE
        ORDER BY
            CASE WHEN username = %s OR phone = %s THEN 0 ELSE 1 END,
            display_name
        LIMIT 20
    ''', (query, like, like, current_user_id, query.lstrip('@'), query))
    users = cur.fetchall()
    conn.close()
    return users


# ----- ГРУППЫ -----
def create_group(name, owner_id, description=None, is_public=True, avatar=None, username=None):
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        import secrets
        invite_link = secrets.token_urlsafe(16)

        cur.execute('''
            INSERT INTO groups (name, description, owner_id, is_public, invite_link, avatar, username)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        ''', (name, description, owner_id, is_public, invite_link, avatar, username))
        group_id = cur.fetchone()['id']

        cur.execute('''
            INSERT INTO group_members (group_id, user_id, role)
            VALUES (%s, %s, 'owner')
        ''', (group_id, owner_id))

        # Добавляем права для owner
        cur.execute('''
            INSERT INTO group_permissions (group_id, role, can_send_messages, can_send_media, 
                can_add_members, can_pin_messages, can_change_info, can_delete_messages, can_ban_users)
            VALUES (%s, 'owner', 1, 1, 1, 1, 1, 1, 1)
        ''', (group_id,))

        cur.execute('''
            INSERT INTO group_permissions (group_id, role, can_send_messages, can_send_media, 
                can_add_members, can_pin_messages, can_change_info, can_delete_messages, can_ban_users)
            VALUES (%s, 'admin', 1, 1, 1, 1, 1, 1, 1)
        ''', (group_id,))

        cur.execute('''
            INSERT INTO group_permissions (group_id, role, can_send_messages, can_send_media, 
                can_add_members, can_pin_messages, can_change_info, can_delete_messages, can_ban_users)
            VALUES (%s, 'member', 1, 1, 0, 0, 0, 0, 0)
        ''', (group_id,))

        conn.commit()
        return group_id
    except Exception as e:
        print(f"Error creating group: {e}")
        return None
    finally:
        conn.close()


def get_group_by_id(group_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT g.*, u.username as owner_username, u.display_name as owner_display_name,
               (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
        FROM groups g
        JOIN users u ON g.owner_id = u.id
        WHERE g.id = %s
    ''', (group_id,))
    group = cur.fetchone()
    conn.close()
    return group


def get_group_by_invite_link(invite_link):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT * FROM groups WHERE invite_link = %s', (invite_link,))
    group = cur.fetchone()
    conn.close()
    return group


def get_user_groups(user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT g.*, gm.role,
               (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count,
               (SELECT COUNT(*) FROM messages WHERE group_id = g.id AND sender_id != %s AND is_read = FALSE AND is_deleted = FALSE AND (expires_at IS NULL OR expires_at > (NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours'))) as unread_count
        FROM groups g
        JOIN group_members gm ON g.id = gm.group_id
        WHERE gm.user_id = %s
        ORDER BY g.created_at DESC
    ''', (user_id, user_id))
    groups = cur.fetchall()
    conn.close()
    return groups


def add_group_member(group_id, user_id, role='member'):
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('''
            INSERT INTO group_members (group_id, user_id, role)
            VALUES (%s, %s, %s) ON CONFLICT DO NOTHING
        ''', (group_id, user_id, role))
        conn.commit()
        return True
    except:
        return False
    finally:
        conn.close()


def remove_group_member(group_id, user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute("DELETE FROM group_members WHERE group_id = %s AND user_id = %s AND role != 'owner'",
                   (group_id, user_id))
    conn.commit()
    conn.close()
    return True


def get_group_members(group_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT u.id, u.username, u.display_name, u.avatar, u.last_seen, gm.role, gm.joined_at
        FROM group_members gm
        JOIN users u ON gm.user_id = u.id
        WHERE gm.group_id = %s AND u.is_deleted = FALSE
        ORDER BY 
            CASE gm.role 
                WHEN 'owner' THEN 1 
                WHEN 'admin' THEN 2 
                ELSE 3 
            END,
            gm.joined_at ASC
    ''', (group_id,))
    members = cur.fetchall()
    conn.close()
    return members


def is_group_member(group_id, user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT role FROM group_members WHERE group_id = %s AND user_id = %s', (group_id, user_id))
    member = cur.fetchone()
    conn.close()
    return member['role'] if member else None


def update_group_member_role(group_id, user_id, new_role):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute("UPDATE group_members SET role = %s WHERE group_id = %s AND user_id = %s AND role != 'owner'",
                   (new_role, group_id, user_id))
    conn.commit()
    conn.close()
    return True


def delete_group(group_id, user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT owner_id FROM groups WHERE id = %s', (group_id,))
    group = cur.fetchone()

    if group and group['owner_id'] == user_id:
        cur.execute('DELETE FROM groups WHERE id = %s', (group_id,))
        conn.commit()
        conn.close()
        return True

    conn.close()
    return False


def update_group_settings(group_id, **kwargs):
    conn = get_db()
    cur = dict_cursor(conn)
    for key, value in kwargs.items():
        if key == 'username':
            cur.execute('UPDATE groups SET username = %s WHERE id = %s', (value, group_id))
        elif value is not None:
            cur.execute(f'UPDATE groups SET {key} = %s WHERE id = %s', (value, group_id))
    conn.commit()
    conn.close()


def get_group_permissions(group_id, role):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT * FROM group_permissions WHERE group_id = %s AND role = %s', (group_id, role))
    perms = cur.fetchone()
    conn.close()
    return perms


def get_all_group_permissions(group_id):
    """Полная матрица прав группы по всем ролям."""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT * FROM group_permissions WHERE group_id = %s ORDER BY role', (group_id,))
    rows = cur.fetchall()
    conn.close()
    return rows


def update_group_permissions(group_id, role, **kwargs):
    conn = get_db()
    cur = dict_cursor(conn)
    for key, value in kwargs.items():
        if value is not None:
            cur.execute(f'UPDATE group_permissions SET {key} = %s WHERE group_id = %s AND role = %s',
                           (value, group_id, role))
    conn.commit()
    conn.close()


def can_group_perform(group_id, user_id, permission='can_send_messages'):
    """Проверяет право участника группы по его роли (владелец имеет все права)."""
    role = is_group_member(group_id, user_id)
    if not role:
        return False
    if role == 'owner':
        return True
    perms = get_group_permissions(group_id, role)
    if not perms:
        return False
    return bool(perms.get(permission, False))


# ----- Telegram-механики групп: бан, мьют, заявки -----

def ban_group_member(group_id, user_id, banned_by=None, reason=None):
    """Бан участника группы: удаляет из участников и записывает в group_bans."""
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('''
            INSERT INTO group_bans (group_id, user_id, banned_by, reason)
            VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING
        ''', (group_id, user_id, banned_by, reason))
        cur.execute("DELETE FROM group_members WHERE group_id = %s AND user_id = %s AND role != 'owner'",
                    (group_id, user_id))
        cur.execute('DELETE FROM group_mutes WHERE group_id = %s AND user_id = %s', (group_id, user_id))
        cur.execute('DELETE FROM group_join_requests WHERE group_id = %s AND user_id = %s AND status = %s',
                    (group_id, user_id, 'pending'))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error banning member: {e}")
        return False
    finally:
        conn.close()


def unban_group_member(group_id, user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('DELETE FROM group_bans WHERE group_id = %s AND user_id = %s', (group_id, user_id))
    conn.commit()
    conn.close()
    return True


def is_group_banned(group_id, user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT 1 FROM group_bans WHERE group_id = %s AND user_id = %s', (group_id, user_id))
    banned = cur.fetchone() is not None
    conn.close()
    return banned


def get_group_bans(group_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT gb.user_id, gb.reason, gb.banned_at, u.username, u.display_name, u.avatar
        FROM group_bans gb
        JOIN users u ON gb.user_id = u.id
        WHERE gb.group_id = %s AND u.is_deleted = FALSE
        ORDER BY gb.banned_at DESC
    ''', (group_id,))
    bans = cur.fetchall()
    conn.close()
    return bans


def mute_group_member(group_id, user_id, muted_by=None, seconds=None):
    """Мьют участника группы. seconds=None означает «до снятия»."""
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        until = None
        if seconds:
            until = get_moscow_datetime() + timedelta(seconds=int(seconds))
        cur.execute('''
            INSERT INTO group_mutes (group_id, user_id, muted_by, until)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (group_id, user_id) DO UPDATE SET until = EXCLUDED.until, muted_by = EXCLUDED.muted_by
        ''', (group_id, user_id, muted_by, until))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error muting member: {e}")
        return False
    finally:
        conn.close()


def unmute_group_member(group_id, user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('DELETE FROM group_mutes WHERE group_id = %s AND user_id = %s', (group_id, user_id))
    conn.commit()
    conn.close()
    return True


def is_group_muted(group_id, user_id):
    """True, если участник замьючен и мьют ещё активен (или бессрочный)."""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''SELECT until FROM group_mutes WHERE group_id = %s AND user_id = %s
                   AND (until IS NULL OR until > NOW())''', (group_id, user_id))
    row = cur.fetchone()
    conn.close()
    muted = row is not None
    if muted and row.get('until') is None:
        return True, None
    if muted:
        return True, row['until']
    return False, None


def get_group_mutes(group_id):
    cur = get_db()
    cursor = dict_cursor(cur)
    cursor.execute('''
        SELECT gm.user_id, gm.until, u.username, u.display_name, u.avatar
        FROM group_mutes gm
        JOIN users u ON gm.user_id = u.id
        WHERE gm.group_id = %s AND u.is_deleted = FALSE AND (gm.until IS NULL OR gm.until > NOW())
        ORDER BY gm.created_at DESC
    ''', (group_id,))
    mutes = cursor.fetchall()
    cur.close()
    return mutes


# ----- Заявки на вступление в группы -----

def add_group_join_request(group_id, user_id, message=None):
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('''
            INSERT INTO group_join_requests (group_id, user_id, message, status)
            VALUES (%s, %s, %s, 'pending') ON CONFLICT DO NOTHING
        ''', (group_id, user_id, message))
        conn.commit()
        return True
    except:
        return False
    finally:
        conn.close()


def get_group_join_request_status(group_id, user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute("SELECT status FROM group_join_requests WHERE group_id = %s AND user_id = %s",
                (group_id, user_id))
    row = cur.fetchone()
    conn.close()
    return row['status'] if row else None


def get_group_join_requests(group_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT gjr.id, gjr.user_id, gjr.message, gjr.requested_at, gjr.status,
               u.username, u.display_name, u.avatar
        FROM group_join_requests gjr
        JOIN users u ON gjr.user_id = u.id
        WHERE gjr.group_id = %s AND gjr.status = 'pending' AND u.is_deleted = FALSE
        ORDER BY gjr.requested_at ASC
    ''', (group_id,))
    reqs = cur.fetchall()
    conn.close()
    return reqs


def approve_group_join_request(request_id, group_id):
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute("SELECT user_id FROM group_join_requests WHERE id = %s AND status = 'pending'", (request_id,))
        row = cur.fetchone()
        if not row:
            conn.close()
            return None
        user_id = row['user_id']
        cur.execute("UPDATE group_join_requests SET status = 'accepted' WHERE id = %s", (request_id,))
        cur.execute('''
            INSERT INTO group_members (group_id, user_id, role)
            VALUES (%s, %s, 'member') ON CONFLICT DO NOTHING
        ''', (group_id, user_id))
        conn.commit()
        conn.close()
        return user_id
    except Exception as e:
        print(f"Error approving join request: {e}")
        conn.close()
        return None


def reject_group_join_request(request_id):
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute("UPDATE group_join_requests SET status = 'rejected' WHERE id = %s", (request_id,))
        conn.commit()
        return True
    except:
        return False
    finally:
        conn.close()


# ----- Телеграм: просмотры постов канала и мьют уведомлений -----

def add_channel_post_view(message_id):
    """Увеличивает счётчик просмотров поста канала."""
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('UPDATE messages SET views_count = views_count + 1 WHERE id = %s', (message_id,))
        conn.commit()
        return True
    except:
        return False
    finally:
        conn.close()


def is_chat_muted(user_id, chat_type, chat_id):
    """Мьют уведомлений на группу/канал (как в Telegram)."""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''SELECT mute_until FROM chat_mutes
                   WHERE user_id = %s AND chat_type = %s AND chat_id = %s
                   AND (mute_until IS NULL OR mute_until > NOW())''',
                (user_id, chat_type, chat_id))
    row = cur.fetchone()
    conn.close()
    return row is not None


def set_chat_mute(user_id, chat_type, chat_id, seconds=None):
    """seconds=None — бессрочный мьют уведомлений; seconds=0 — снять мьют."""
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        if seconds is not None and int(seconds) == 0:
            cur.execute('DELETE FROM chat_mutes WHERE user_id = %s AND chat_type = %s AND chat_id = %s',
                        (user_id, chat_type, chat_id))
            conn.commit()
            return True
        until = None
        if seconds:
            until = get_moscow_datetime() + timedelta(seconds=int(seconds))
        cur.execute('''
            INSERT INTO chat_mutes (user_id, chat_type, chat_id, mute_until)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (user_id, chat_type, chat_id) DO UPDATE SET mute_until = EXCLUDED.mute_until
        ''', (user_id, chat_type, chat_id, until))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error setting chat mute: {e}")
        return False
    finally:
        conn.close()


def get_channel_rights(channel_id, user_id):
    """Права пользователя в канале. Владелец имеет все права; не-админ — None."""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT owner_id FROM channels WHERE id = %s', (channel_id,))
    ch = cur.fetchone()
    if ch and ch['owner_id'] == user_id:
        conn.close()
        return {'is_owner': True, 'can_post': True, 'can_edit': True, 'can_delete': True, 'can_add_admins': True}
    cur.execute('''
        SELECT can_post, can_edit, can_delete, can_add_admins
        FROM channel_admins WHERE channel_id = %s AND user_id = %s
    ''', (channel_id, user_id))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return {
        'is_owner': False,
        'can_post': bool(row['can_post']),
        'can_edit': bool(row['can_edit']),
        'can_delete': bool(row['can_delete']),
        'can_add_admins': bool(row['can_add_admins']),
    }


# ----- КАНАЛЫ -----
def create_channel(name, owner_id, description=None, is_public=True, avatar=None, username=None):
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        import secrets
        invite_link = secrets.token_urlsafe(16)

        cur.execute('''
            INSERT INTO channels (name, description, owner_id, is_public, invite_link, avatar, username)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        ''', (name, description, owner_id, is_public, invite_link, avatar, username))
        channel_id = cur.fetchone()['id']

        cur.execute('''
            INSERT INTO channel_subscribers (channel_id, user_id)
            VALUES (%s, %s) ON CONFLICT DO NOTHING
        ''', (channel_id, owner_id))

        cur.execute('''
            INSERT INTO channel_admins (channel_id, user_id, can_post, can_edit, can_delete, can_add_admins)
            VALUES (%s, %s, 1, 1, 1, 1)
        ''', (channel_id, owner_id))

        conn.commit()
        return channel_id
    except Exception as e:
        print(f"Error creating channel: {e}")
        return None
    finally:
        conn.close()


def get_channel_by_id(channel_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT c.*, u.username as owner_username, u.display_name as owner_display_name,
               (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id = c.id) as subscriber_count
        FROM channels c
        JOIN users u ON c.owner_id = u.id
        WHERE c.id = %s
    ''', (channel_id,))
    channel = cur.fetchone()
    conn.close()
    return channel


def get_channel_by_invite_link(invite_link):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT * FROM channels WHERE invite_link = %s', (invite_link,))
    channel = cur.fetchone()
    conn.close()
    return channel


def get_user_channels(user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT c.*,
               (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id = c.id) as subscriber_count,
               (SELECT COUNT(*) FROM messages WHERE channel_id = c.id AND sender_id != %s AND is_read = FALSE AND is_deleted = FALSE AND (expires_at IS NULL OR expires_at > (NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours'))) as unread_count
        FROM channels c
        JOIN channel_subscribers cs ON c.id = cs.channel_id
        WHERE cs.user_id = %s
        ORDER BY c.created_at DESC
    ''', (user_id, user_id))
    channels = cur.fetchall()
    conn.close()
    return channels


def subscribe_to_channel(channel_id, user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('''
            INSERT INTO channel_subscribers (channel_id, user_id)
            VALUES (%s, %s) ON CONFLICT DO NOTHING
        ''', (channel_id, user_id))
        conn.commit()
        return True
    except:
        return False
    finally:
        conn.close()


def unsubscribe_from_channel(channel_id, user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('DELETE FROM channel_subscribers WHERE channel_id = %s AND user_id = %s', (channel_id, user_id))
    conn.commit()
    conn.close()
    return True


def get_channel_subscribers(channel_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT u.id, u.username, u.display_name, u.avatar, cs.subscribed_at
        FROM channel_subscribers cs
        JOIN users u ON cs.user_id = u.id
        WHERE cs.channel_id = %s AND u.is_deleted = FALSE
        ORDER BY cs.subscribed_at DESC
    ''', (channel_id,))
    subscribers = cur.fetchall()
    conn.close()
    return subscribers


def is_channel_subscriber(channel_id, user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT id FROM channel_subscribers WHERE channel_id = %s AND user_id = %s', (channel_id, user_id))
    subscriber = cur.fetchone()
    conn.close()
    return subscriber is not None


def can_post_in_channel(channel_id, user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT owner_id FROM channels WHERE id = %s', (channel_id,))
    channel = cur.fetchone()
    if channel and channel['owner_id'] == user_id:
        return True

    cur.execute('SELECT can_post FROM channel_admins WHERE channel_id = %s AND user_id = %s', (channel_id, user_id))
    admin = cur.fetchone()
    conn.close()
    return admin and admin['can_post']


def add_channel_admin(channel_id, user_id, **permissions):
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('''
            INSERT INTO channel_admins (channel_id, user_id, can_post, can_edit, can_delete, can_add_admins)
            VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (channel_id, user_id) DO UPDATE SET can_post = excluded.can_post, can_edit = excluded.can_edit, can_delete = excluded.can_delete, can_add_admins = excluded.can_add_admins
        ''', (channel_id, user_id,
              permissions.get('can_post', 1),
              permissions.get('can_edit', 0),
              permissions.get('can_delete', 0),
              permissions.get('can_add_admins', 0)))
        conn.commit()
        return True
    except:
        return False
    finally:
        conn.close()


def get_channel_admins_list(channel_id):
    """Возвращает список администраторов канала с их правами."""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT u.id as user_id, u.username, u.display_name, u.avatar,
               ca.can_post, ca.can_edit, ca.can_delete, ca.can_add_admins
        FROM channel_admins ca
        JOIN users u ON ca.user_id = u.id
        WHERE ca.channel_id = %s
    ''', (channel_id,))
    admins = cur.fetchall()
    conn.close()
    return admins


def remove_channel_admin(channel_id, user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('DELETE FROM channel_admins WHERE channel_id = %s AND user_id = %s', (channel_id, user_id))
    conn.commit()
    conn.close()
    return True


def delete_channel(channel_id, user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT owner_id FROM channels WHERE id = %s', (channel_id,))
    channel = cur.fetchone()

    if channel and channel['owner_id'] == user_id:
        cur.execute('DELETE FROM channels WHERE id = %s', (channel_id,))
        conn.commit()
        conn.close()
        return True

    conn.close()
    return False


def update_channel_settings(channel_id, **kwargs):
    conn = get_db()
    cur = dict_cursor(conn)
    for key, value in kwargs.items():
        if key == 'username':
            cur.execute('UPDATE channels SET username = %s WHERE id = %s', (value, channel_id))
        elif value is not None:
            cur.execute(f'UPDATE channels SET {key} = %s WHERE id = %s', (value, channel_id))
    conn.commit()
    conn.close()


# ----- СООБЩЕНИЯ -----
def get_or_create_chat(user1_id, user2_id):
    if user1_id == user2_id:
        conn = get_db()
        cur = dict_cursor(conn)
        cur.execute('SELECT id FROM chats WHERE user1_id = %s AND user2_id = %s', (user1_id, user1_id))
        chat = cur.fetchone()
        conn.close()
        return chat['id'] if chat else None

    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute(
        'SELECT id FROM chats WHERE (user1_id = %s AND user2_id = %s) OR (user1_id = %s AND user2_id = %s)',
        (user1_id, user2_id, user2_id, user1_id)
    )
    chat = cur.fetchone()
    if chat:
        conn.close()
        return chat['id']

    cur.execute('INSERT INTO chats (user1_id, user2_id) VALUES (%s, %s) RETURNING id', (user1_id, user2_id))
    conn.commit()
    chat_id = cur.fetchone()['id']
    conn.close()
    return chat_id


# ----- СИСТЕМНЫЙ ЧАТ @sputnik -----
def get_system_user():
    """Возвращает системного бота @sputnik (создаёт при необходимости)."""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT * FROM users WHERE username = %s AND is_system = TRUE', ('sputnik',))
    user = cur.fetchone()
    if not user:
        try:
            hashed = hash_password(secrets.token_urlsafe(32))
        except NameError:
            import secrets
            hashed = hash_password(secrets.token_urlsafe(32))
        try:
            cur.execute('''
                INSERT INTO users (unique_id, phone, username, display_name, password, avatar, bio,
                                   registration_complete, is_system)
                VALUES (%s, %s, %s, %s, %s, %s, %s, TRUE, TRUE)
                RETURNING id
            ''', (-1, '@sputnik_system', 'sputnik', 'Спутник', hashed,
                  'static/favicon/web-app-manifest-512x512.png', 'Системный чат. Сюда приходят уведомления о входе и коды подтверждения.'))
            conn.commit()
            user = cur.fetchone()
        except Exception:
            conn.rollback()
            cur.execute('SELECT * FROM users WHERE username = %s AND is_system = TRUE', ('sputnik',))
            user = cur.fetchone()
    conn.close()
    return user


def ensure_system_chat(user_id):
    """Гарантирует, что у пользователя есть диалог с @sputnik."""
    sys_user = get_system_user()
    if not sys_user:
        return None, None
    chat_id = get_or_create_chat(user_id, sys_user['id'])
    return chat_id, sys_user['id']


def send_system_message(user_id, text):
    """Отправляет сообщение от @sputnik в системный чат пользователя."""
    chat_id, sys_id = ensure_system_chat(user_id)
    if not chat_id:
        return None
    return send_message(chat_id=chat_id, sender_id=sys_id, content=text)


# ----- КОДЫ ВХОДА (5-значные) -----
def create_login_code(user_id):
    """Генерирует и сохраняет 5-значный код входа (действует 10 минут)."""
    code = str(random.randint(10000, 99999))
    conn = get_db()
    cur = dict_cursor(conn)
    # Инвалидируем старые неиспользованные коды пользователя
    cur.execute('UPDATE login_codes SET used = TRUE WHERE user_id = %s AND used = FALSE', (user_id,))
    cur.execute('''
        INSERT INTO login_codes (user_id, code, expires_at)
        VALUES (%s, %s, (NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours' + INTERVAL '10 minutes'))
        RETURNING id
    ''', (user_id, code))
    conn.commit()
    conn.close()
    return code


def verify_login_code(phone, code):
    """Проверяет 5-значный код входа. Возвращает user или None."""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT c.id as code_id, c.user_id
        FROM login_codes c
        JOIN users u ON u.id = c.user_id
        WHERE u.phone = %s AND c.code = %s AND c.used = FALSE
          AND c.expires_at > (NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')
        ORDER BY c.id DESC
        LIMIT 1
    ''', (phone, code))
    row = cur.fetchone()
    if not row:
        conn.close()
        return None
    cur.execute('UPDATE login_codes SET used = TRUE WHERE id = %s', (row['code_id'],))
    conn.commit()
    conn.close()
    return get_user_by_id(row['user_id'])


def get_user_chats(user_id):
    conn = get_db()
    cur = dict_cursor(conn)

    pinned_ids = get_pinned_chats(user_id)
    pinned_ids_str = ','.join(map(str, pinned_ids)) if pinned_ids else '0'

    cur.execute(f'''
        SELECT 
            'personal' as chat_type,
            c.id as chat_id, 
            CASE WHEN c.user1_id = %s THEN c.user2_id ELSE c.user1_id END as other_user_id,
            CASE WHEN c.user1_id = c.user2_id THEN 'Избранное'
                 ELSE COALESCE(cn.name, u.display_name, u.username) END as name,
            CASE WHEN c.user1_id = c.user2_id THEN 'static/icons/favorites.webp'
                 ELSE u.avatar END as avatar,
            u.last_seen,
            u.is_banned,
            m.content as last_message,
            m.file_type as last_file_type,
            m.created_at as last_message_time,
            (SELECT COUNT(*) FROM messages WHERE chat_id = c.id AND sender_id != %s AND is_read = FALSE AND is_deleted = FALSE AND NOT EXISTS (SELECT 1 FROM blocked_users bu WHERE bu.user_id = %s AND bu.blocked_user_id = messages.sender_id)) as unread_count,
            c.id IN ({pinned_ids_str}) as is_pinned
        FROM chats c
        LEFT JOIN users u ON (CASE WHEN c.user1_id = %s THEN c.user2_id ELSE c.user1_id END) = u.id
        LEFT JOIN contact_names cn ON cn.user_id = %s AND cn.contact_id = u.id
        LEFT JOIN messages m ON m.id = (SELECT id FROM messages WHERE chat_id = c.id AND is_deleted = FALSE AND NOT EXISTS (SELECT 1 FROM blocked_users bu WHERE bu.user_id = %s AND bu.blocked_user_id = messages.sender_id) ORDER BY created_at DESC LIMIT 1)
        WHERE (c.user1_id = %s OR c.user2_id = %s) AND u.is_deleted = FALSE
    ''', (user_id, user_id, user_id, user_id, user_id, user_id, user_id, user_id))

    personal_chats = cur.fetchall()

    # Скрываем аватарку и время захода у тех, кто заблокировал текущего пользователя
    for chat in personal_chats:
        chat['has_blocked_me'] = False
        other = chat.get('other_user_id')
        if other and other != user_id and is_user_blocked(other, user_id):
            chat['has_blocked_me'] = True
            chat['avatar'] = None
            chat['last_seen'] = None

    cur.execute('''
        SELECT 
            'group' as chat_type,
            g.id as chat_id,
            g.id as group_id,
            g.name,
            g.avatar,
            NULL as last_seen,
            m.content as last_message,
            m.file_type as last_file_type,
            m.created_at as last_message_time,
            (SELECT COUNT(*) FROM messages WHERE group_id = g.id AND sender_id != %s AND is_read = FALSE AND is_deleted = FALSE AND (expires_at IS NULL OR expires_at > (NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours'))) as unread_count,
            0 as is_pinned,
            (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
        FROM groups g
        JOIN group_members gm ON g.id = gm.group_id
        LEFT JOIN messages m ON m.id = (SELECT id FROM messages WHERE group_id = g.id AND is_deleted = FALSE AND NOT EXISTS (SELECT 1 FROM blocked_users bu WHERE bu.user_id = %s AND bu.blocked_user_id = messages.sender_id) ORDER BY created_at DESC LIMIT 1)
        WHERE gm.user_id = %s
        ORDER BY m.created_at DESC
    ''', (user_id, user_id, user_id))

    group_chats = cur.fetchall()

    cur.execute('''
        SELECT 
            'channel' as chat_type,
            c.id as chat_id,
            c.id as channel_id,
            c.name,
            c.avatar,
            NULL as last_seen,
            m.content as last_message,
            m.file_type as last_file_type,
            m.created_at as last_message_time,
            (SELECT COUNT(*) FROM messages WHERE channel_id = c.id AND sender_id != %s AND is_read = FALSE AND is_deleted = FALSE AND (expires_at IS NULL OR expires_at > (NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours'))) as unread_count,
            0 as is_pinned,
            (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id = c.id) as subscriber_count
        FROM channels c
        JOIN channel_subscribers cs ON c.id = cs.channel_id
        LEFT JOIN messages m ON m.id = (SELECT id FROM messages WHERE channel_id = c.id AND is_deleted = FALSE AND NOT EXISTS (SELECT 1 FROM blocked_users bu WHERE bu.user_id = %s AND bu.blocked_user_id = messages.sender_id) ORDER BY created_at DESC LIMIT 1)
        WHERE cs.user_id = %s
        ORDER BY m.created_at DESC
    ''', (user_id, user_id, user_id))

    channel_chats = cur.fetchall()

    conn.close()

    all_chats = []
    for chat in personal_chats:
        all_chats.append(dict(chat))
    for chat in group_chats:
        all_chats.append(dict(chat))
    for chat in channel_chats:
        all_chats.append(dict(chat))

    from datetime import timezone
    min_dt = datetime.min.replace(tzinfo=timezone.utc)

    def get_sort_key(chat):
        time_val = chat.get('last_message_time')
        if time_val is None or time_val == '':
            return min_dt
        if isinstance(time_val, str):
            try:
                t = datetime.fromisoformat(time_val.replace('Z', '+00:00'))
                if t.tzinfo is None:
                    t = t.replace(tzinfo=timezone.utc)
                return t
            except:
                return min_dt
        if isinstance(time_val, datetime) and time_val.tzinfo is None:
            return time_val.replace(tzinfo=timezone.utc)
        return time_val

    all_chats.sort(
        key=lambda chat: (bool(chat.get('is_pinned')), get_sort_key(chat)),
        reverse=True
    )
    return all_chats


def send_message(chat_id=None, group_id=None, channel_id=None, sender_id=None, content=None,
                 file_type=None, file_path=None, file_name=None, file_size=None,
                 reply_to_id=None, forwarded_from_id=None, forwarded_from_user_id=None,
                 forwarded_from_username=None, forwarded_from_display_name=None,
                 expire_after=None, poll_id=None, media_duration=None):
    conn = get_db()
    cur = dict_cursor(conn)

    # Самоуничтожение: считаем момент удаления
    expires_at = None
    if expire_after:
        try:
            expires_at = get_moscow_datetime() + timedelta(seconds=int(expire_after))
        except (TypeError, ValueError):
            expires_at = None

    # Если получатель заблокировал отправителя — сообщение сохраняется,
    # но помечается как недоставленное (получатель не увидит его)
    delivered = True
    if chat_id and sender_id:
        cur.execute('''SELECT CASE WHEN user1_id = %s THEN user2_id ELSE user1_id END as other_id
                        FROM chats WHERE id = %s''', (sender_id, chat_id))
        row = cur.fetchone()
        if row and row['other_id']:
            cur.execute('''SELECT id FROM blocked_users WHERE user_id = %s AND blocked_user_id = %s''',
                        (row['other_id'], sender_id))
            delivered = cur.fetchone() is None

    cur.execute('''
        INSERT INTO messages (chat_id, group_id, channel_id, sender_id, content, file_type, file_path, file_name, file_size,
                             reply_to_id, forwarded_from_id, forwarded_from_user_id, forwarded_from_username, forwarded_from_display_name,
                             expires_at, poll_id, media_duration)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    ''', (chat_id, group_id, channel_id, sender_id, content, file_type, file_path, file_name, file_size,
          reply_to_id, forwarded_from_id, forwarded_from_user_id, forwarded_from_username, forwarded_from_display_name,
          expires_at, poll_id, media_duration))
    message_id = cur.fetchone()['id']
    conn.commit()

    cur.execute('''
        SELECT m.*, u.username, u.display_name, u.avatar 
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE m.id = %s
    ''', (message_id,))
    message = dict(cur.fetchone())
    message['delivered'] = delivered
    conn.close()
    return message


def get_messages(chat_id=None, group_id=None, channel_id=None, user_id=None, limit=100, offset=0):
    conn = get_db()
    cur = dict_cursor(conn)

    # Удаляем истёкшие самоуничтожающиеся сообщения для этого диалога
    if chat_id:
        cur.execute("""DELETE FROM messages WHERE chat_id = %s AND expires_at IS NOT NULL
                       AND expires_at <= (NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')""", (chat_id,))
    elif group_id:
        cur.execute("""DELETE FROM messages WHERE group_id = %s AND expires_at IS NOT NULL
                       AND expires_at <= (NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')""", (group_id,))
    elif channel_id:
        cur.execute("""DELETE FROM messages WHERE channel_id = %s AND expires_at IS NOT NULL
                       AND expires_at <= (NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')""", (channel_id,))

    if chat_id:
        cur.execute('UPDATE messages SET is_read = TRUE WHERE chat_id = %s AND sender_id != %s', (chat_id, user_id))
    elif group_id:
        cur.execute('UPDATE messages SET is_read = TRUE WHERE group_id = %s AND sender_id != %s AND is_read = FALSE', (group_id, user_id))
    elif channel_id:
        cur.execute('UPDATE messages SET is_read = TRUE WHERE channel_id = %s AND sender_id != %s AND is_read = FALSE', (channel_id, user_id))

    query = '''
        SELECT m.*, u.username, u.display_name, u.avatar,
               u.is_banned as sender_is_banned,
               r.content as reply_content, r.sender_id as reply_sender_id,
               ru.username as reply_username, ru.display_name as reply_display_name,
               fu.avatar as forwarded_avatar,
               fu.is_banned as forwarded_is_banned
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        LEFT JOIN messages r ON m.reply_to_id = r.id
        LEFT JOIN users ru ON r.sender_id = ru.id
        LEFT JOIN users fu ON m.forwarded_from_user_id = fu.id
        WHERE m.is_deleted = FALSE AND (m.expires_at IS NULL OR m.expires_at > (NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours'))
          AND NOT EXISTS (SELECT 1 FROM message_hides h WHERE h.message_id = m.id AND h.user_id = %s)
    '''
    params = [user_id]

    if chat_id:
        query += ' AND m.chat_id = %s AND NOT EXISTS (SELECT 1 FROM blocked_users bu WHERE bu.user_id = %s AND bu.blocked_user_id = m.sender_id)'
        params.append(chat_id)
        params.append(user_id)
    elif group_id:
        query += ' AND m.group_id = %s'
        params.append(group_id)
    elif channel_id:
        query += ' AND m.channel_id = %s'
        params.append(channel_id)

    query += ' ORDER BY m.created_at ASC LIMIT %s OFFSET %s'
    params.extend([limit, offset])

    cur.execute(query, params)
    messages = cur.fetchall()
    conn.commit()
    conn.close()

    # Подмешиваем данные опросов к сообщениям-опросам
    if messages:
        messages = [dict(m) for m in messages]
        poll_ids = [m['poll_id'] for m in messages if m.get('poll_id')]
        if poll_ids:
            polls_map = get_polls_for_messages(poll_ids, user_id)
            for m in messages:
                if m.get('poll_id'):
                    m['poll'] = polls_map.get(m['poll_id'])

    return messages


def get_message_by_id(message_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT * FROM messages WHERE id = %s', (message_id,))
    msg = cur.fetchone()
    conn.close()
    return msg


def pin_message(scope, scope_id, message_id, user_id):
    """Закрепляет сообщение в чате (scope: personal/group/channel)."""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        INSERT INTO pinned_messages (scope, scope_id, message_id, pinned_by)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (scope, scope_id)
        DO UPDATE SET message_id = EXCLUDED.message_id,
                      pinned_by = EXCLUDED.pinned_by,
                      created_at = NOW()
    ''', (scope, scope_id, message_id, user_id))
    conn.commit()
    conn.close()
    return True


def unpin_message(scope, scope_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('DELETE FROM pinned_messages WHERE scope = %s AND scope_id = %s', (scope, scope_id))
    conn.commit()
    conn.close()
    return True


def unpin_message_by_message_id(message_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('DELETE FROM pinned_messages WHERE message_id = %s', (message_id,))
    conn.commit()
    conn.close()
    return True


def get_pinned_message(scope, scope_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT m.*, u.username, u.display_name, u.avatar,
               r.content as reply_content, r.sender_id as reply_sender_id,
               ru.username as reply_username, ru.display_name as reply_display_name,
               p.pinned_by, p.created_at as pinned_at
        FROM pinned_messages p
        JOIN messages m ON m.id = p.message_id AND m.is_deleted = FALSE
        LEFT JOIN users u ON m.sender_id = u.id
        LEFT JOIN messages r ON m.reply_to_id = r.id
        LEFT JOIN users ru ON r.sender_id = ru.id
        WHERE p.scope = %s AND p.scope_id = %s
    ''', (scope, scope_id))
    msg = cur.fetchone()
    conn.close()
    return msg


def get_chat_other_user(chat_id, user_id):
    """Возвращает id собеседника по личному чату.

    Если пользователь НЕ участник чата — возвращает None (иначе любой
    авторизованный пользователь проходил бы проверку доступа к чужому чату).
    """
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT CASE WHEN user1_id = %s THEN user2_id ELSE user1_id END AS other_id '
                'FROM chats WHERE id = %s AND (user1_id = %s OR user2_id = %s)',
                (user_id, chat_id, user_id, user_id))
    row = cur.fetchone()
    conn.close()
    return row['other_id'] if row else None


# ----- ПРЕВЬЮ ССЫЛОК -----
class _LinkPreviewParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.og = {}
        self.page_title = None
        self.meta_desc = None
        self._in_title = False
        self._title_parts = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'meta':
            prop = (a.get('property') or a.get('name') or a.get('itemprop') or '').strip().lower()
            content = (a.get('content') or '').strip()
            if prop == 'og:title' and 'title' not in self.og:
                self.og['title'] = content
            elif prop == 'og:description' and 'description' not in self.og:
                self.og['description'] = content
            elif prop == 'og:image' and 'image' not in self.og:
                self.og['image'] = content
            elif prop == 'og:site_name' and 'site_name' not in self.og:
                self.og['site_name'] = content
            elif prop == 'description' and self.meta_desc is None:
                self.meta_desc = content
        elif tag == 'title':
            self._in_title = True
            self._title_parts = []

    def handle_endtag(self, tag):
        if tag == 'title' and self._in_title:
            self._in_title = False
            self.page_title = ''.join(self._title_parts).strip()

    def handle_data(self, data):
        if self._in_title:
            self._title_parts.append(data)


def extract_link_preview(page_html, base_url):
    parser = _LinkPreviewParser()
    try:
        parser.feed(page_html[:500000])
    except Exception:
        pass
    og = parser.og
    title = og.get('title') or parser.page_title or ''
    if not title:
        m = re.match(r'^https?://([^/]+)', base_url)
        title = m.group(1) if m else base_url
    description = og.get('description') or parser.meta_desc or ''
    site_name = og.get('site_name') or ''
    image = og.get('image') or ''
    if image and not image.startswith(('http://', 'https://')):
        image = urljoin(base_url, image)
    return {
        'title': title[:300] or base_url[:300],
        'description': description[:500],
        'image_url': image[:500],
        'site_name': site_name[:100],
    }


def get_link_preview(url):
    """Возвращает превью по URL: из кэша или скачивая страницу."""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT title, description, image_url, site_name FROM link_previews WHERE url = %s', (url,))
    row = cur.fetchone()
    if row:
        conn.close()
        return dict(row)

    if not (url.startswith('http://') or url.startswith('https://')):
        conn.close()
        return None

    page_html = None
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Sputnik Messenger)'})
        with urllib.request.urlopen(req, timeout=8) as resp:
            raw = resp.read(500000)
            try:
                page_html = raw.decode(resp.headers.get_content_charset() or 'utf-8', errors='replace')
            except Exception:
                page_html = raw.decode('utf-8', errors='replace')
    except Exception:
        conn.close()
        return None

    info = extract_link_preview(page_html, url)
    try:
        cur.execute('''
            INSERT INTO link_previews (url, title, description, image_url, site_name)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (url) DO UPDATE SET title = EXCLUDED.title,
                                            description = EXCLUDED.description,
                                            image_url = EXCLUDED.image_url,
                                            site_name = EXCLUDED.site_name
        ''', (url, info['title'], info['description'], info['image_url'], info.get('site_name', '')))
        conn.commit()
    except Exception:
        pass
    finally:
        conn.close()
    return info


# ----- ОПРОСЫ -----
def create_poll(chat_id, group_id, channel_id, question, options, is_anonymous, created_by):
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        options_json = json.dumps(options, ensure_ascii=False)
    except Exception:
        options_json = json.dumps(['Вариант 1', 'Вариант 2'])
    cur.execute('''
        INSERT INTO polls (chat_id, group_id, channel_id, question, options, is_anonymous, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    ''', (chat_id, group_id, channel_id, question, options_json, bool(is_anonymous), created_by))
    poll_id = cur.fetchone()['id']
    conn.commit()
    conn.close()
    return poll_id


def get_polls_for_messages(poll_ids, user_id):
    """Возвращает {poll_id: {question, options, counts, total, my_vote, ...}}."""
    if not poll_ids:
        return {}
    conn = get_db()
    cur = dict_cursor(conn)
    ph = ','.join(['%s'] * len(poll_ids))
    cur.execute('SELECT * FROM polls WHERE id IN (%s)' % ph, tuple(poll_ids))
    polls = cur.fetchall()
    ph = ','.join(['%s'] * len(poll_ids))
    cur.execute('SELECT poll_id, user_id, option_index FROM poll_votes WHERE poll_id IN (%s)' % ph, tuple(poll_ids))
    votes = cur.fetchall()
    conn.close()

    result = {}
    for p in polls:
        try:
            options = json.loads(p['options'])
        except Exception:
            options = []
        counts = [0] * len(options)
        for v in votes:
            if v['poll_id'] == p['id'] and 0 <= v['option_index'] < len(options):
                counts[v['option_index']] += 1
        total = sum(counts)
        my_index = None
        if user_id:
            for v in votes:
                if v['poll_id'] == p['id'] and v['user_id'] == user_id:
                    my_index = v['option_index']
                    break
        result[p['id']] = {
            'id': p['id'],
            'question': p['question'],
            'options': options,
            'counts': counts,
            'total': total,
            'my_vote': my_index,
            'is_closed': bool(p['is_closed']),
            'is_anonymous': bool(p['is_anonymous']),
        }
    return result


def vote_poll(poll_id, user_id, option_index):
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('SELECT options FROM polls WHERE id = %s AND is_closed = FALSE', (poll_id,))
        row = cur.fetchone()
        if not row:
            return False
        try:
            options = json.loads(row['options'])
        except Exception:
            options = []
        if not (0 <= option_index < len(options)):
            return False
        cur.execute('''
            INSERT INTO poll_votes (poll_id, user_id, option_index)
            VALUES (%s, %s, %s)
            ON CONFLICT (poll_id, user_id)
            DO UPDATE SET option_index = EXCLUDED.option_index
        ''', (poll_id, user_id, option_index))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()


def close_poll(poll_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('UPDATE polls SET is_closed = TRUE WHERE id = %s', (poll_id,))
    conn.commit()
    conn.close()


def get_poll_by_id(poll_id, user_id):
    return get_polls_for_messages([poll_id], user_id).get(poll_id)


def forward_message(message_id, to_chat_id=None, to_group_id=None, to_channel_id=None, sender_id=None):
    conn = get_db()
    cur = dict_cursor(conn)

    cur.execute('SELECT * FROM messages WHERE id = %s', (message_id,))
    msg = cur.fetchone()

    if msg:
        forward_user = get_user_by_id(msg['sender_id'])
        cur.execute('''
            INSERT INTO messages (chat_id, group_id, channel_id, sender_id, content, file_type, file_path, file_name, file_size,
                                 forwarded_from_id, forwarded_from_user_id, forwarded_from_username, forwarded_from_display_name)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        ''', (to_chat_id, to_group_id, to_channel_id, sender_id, msg['content'], msg['file_type'],
              msg['file_path'], msg['file_name'], msg['file_size'], msg['id'], msg['sender_id'],
              forward_user['username'] if forward_user else None,
              forward_user['display_name'] if forward_user else None))
        new_id = cur.fetchone()['id']
        conn.commit()
        conn.close()
        return new_id
    conn.close()
    return None


def edit_message(message_id, new_content, editor_id=None):
    """Меняет текст сообщения и пишет правку в историю message_edits."""
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('SELECT content FROM messages WHERE id = %s', (message_id,))
        row = cur.fetchone()
        old_content = row['content'] if row else None
        cur.execute('UPDATE messages SET content = %s, edited_at = %s WHERE id = %s',
                    (new_content, get_moscow_time(), message_id))
        if row and (old_content or '') != (new_content or ''):
            # Каждая правка — отдельная запись. Первая запись хранит исходный
            # текст (old_content = то, что было до правки), дальше — цепочку
            # предыдущих состояний, поэтому историю можно показать целиком.
            cur.execute('''INSERT INTO message_edits
                           (message_id, editor_id, old_content, new_content, created_at)
                           VALUES (%s, %s, %s, %s, %s)''',
                        (message_id, editor_id or 0, old_content, new_content,
                         get_moscow_time()))
        conn.commit()
    finally:
        conn.close()


def get_message_edits(message_id):
    """История правок сообщения: от первой (исходный текст) к последней."""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT e.id, e.message_id, e.editor_id, e.old_content, e.new_content,
               e.created_at, u.username, u.display_name, u.avatar
        FROM message_edits e
        LEFT JOIN users u ON e.editor_id = u.id
        WHERE e.message_id = %s
        ORDER BY e.id ASC
    ''', (message_id,))
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_message_edits_count(message_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT COUNT(*) AS n FROM message_edits WHERE message_id = %s', (message_id,))
    row = cur.fetchone()
    conn.close()
    return int(row['n']) if row else 0


def delete_message(message_id, user_id, delete_for_all=False):
    """Удаление сообщения.

    delete_for_all=True  — удаляется у всех (мягко, сообщение уходит в корзину,
                           deleted_at/deleted_by заполняются → можно восстановить).
    delete_for_all=False — «удалить у меня»: строка остаётся у собеседника,
                           скрывается только у того, кто удалил (message_hides).
    """
    conn = get_db()
    cur = dict_cursor(conn)
    now = get_moscow_time()
    try:
        if delete_for_all:
            cur.execute('''
                UPDATE messages
                   SET is_deleted = TRUE, deleted_for_all = TRUE,
                       deleted_at = %s, deleted_by = %s
                 WHERE id = %s AND is_deleted = FALSE
            ''', (now, user_id, message_id))
        else:
            cur.execute('''
                INSERT INTO message_hides (message_id, user_id)
                VALUES (%s, %s)
                ON CONFLICT (message_id, user_id) DO NOTHING
            ''', (message_id, user_id))
        conn.commit()
        return True
    finally:
        conn.close()


def hide_message_for_user(message_id, user_id):
    """«Удалить у меня» — отдельная точка входа (используется и кнопкой в корзине)."""
    return delete_message(message_id, user_id, delete_for_all=False)


def get_deleted_messages(user_id, chat_id=None, group_id=None, channel_id=None, limit=50):
    """Корзина чата.

    Показывает два вида удалённых сообщений:
      • удалённые «у всех» (deleted_for_all) — их удалил любой участник,
        восстановить может автор сообщения или тот, кто удалил;
      • скрытые «у меня» (message_hides) — их удалил сам user_id,
        восстановление снимает только личное скрытие.
    """
    conn = get_db()
    cur = dict_cursor(conn)
    if chat_id:
        cond = 'm.chat_id = %s'
    elif group_id:
        cond = 'm.group_id = %s'
    else:
        cond = 'm.channel_id = %s'
    ref = chat_id if chat_id is not None else (group_id if group_id is not None else channel_id)
    cur.execute(f'''
        SELECT m.id, m.chat_id, m.group_id, m.channel_id, m.sender_id, m.content,
               m.file_type, m.file_name, m.file_size, m.deleted_at, m.deleted_by,
               m.deleted_for_all, m.created_at,
               u.username, u.display_name, u.avatar
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE {cond} AND (
            m.is_deleted = TRUE
            OR EXISTS (SELECT 1 FROM message_hides h
                        WHERE h.message_id = m.id AND h.user_id = %s)
        )
        ORDER BY COALESCE(m.deleted_at, m.created_at) DESC, m.id DESC
        LIMIT %s
    ''', (ref, user_id, limit))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def get_hidden_message_ids(user_id, chat_id=None, group_id=None, channel_id=None):
    """Список id сообщений, скрытых «у меня» — исключаются при выборке чата."""
    conn = get_db()
    cur = dict_cursor(conn)
    if chat_id:
        cond = 'm.chat_id = %s'
        args = (chat_id, user_id)
    elif group_id:
        cond = 'm.group_id = %s'
        args = (group_id, user_id)
    elif channel_id:
        cond = 'm.channel_id = %s'
        args = (channel_id, user_id)
    else:
        conn.close()
        return set()
    cur.execute(f'''
        SELECT h.message_id FROM message_hides h
        JOIN messages m ON m.id = h.message_id
        WHERE h.user_id = %s AND {cond}
    ''', args)
    ids = {row['message_id'] for row in cur.fetchall()}
    conn.close()
    return ids


def restore_message(message_id, user_id, delete_for_all=False):
    """Восстановление из корзины.

    Сообщение, удалённое «у всех» (is_deleted = TRUE), возвращается переписке
    целиком; вернуть такое удаление может только автор сообщения или тот,
    кто его удалил. Сообщение, скрытое «у меня», просто перестаёт быть скрытым.
    """
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('SELECT is_deleted, deleted_for_all, deleted_by, sender_id '
                    'FROM messages WHERE id = %s', (message_id,))
        row = cur.fetchone()
        if not row:
            return False

        if row['is_deleted']:
            is_author = (row['sender_id'] == user_id)
            is_deleter = (row['deleted_by'] == user_id)
            if not (is_author or is_deleter):
                return False
            cur.execute('''
                UPDATE messages
                   SET is_deleted = FALSE, deleted_for_all = FALSE,
                       deleted_at = NULL, deleted_by = NULL
                 WHERE id = %s
            ''', (message_id,))
            # убираем и личные скрытия — сообщение возвращено всем
            cur.execute('DELETE FROM message_hides WHERE message_id = %s', (message_id,))
        else:
            # скрыто «у меня» — снимаем только своё скрытие
            cur.execute('DELETE FROM message_hides WHERE message_id = %s AND user_id = %s',
                        (message_id, user_id))
        conn.commit()
        return True
    finally:
        conn.close()


def clear_chat_trash(chat_id=None, group_id=None, channel_id=None):
    """Очистить корзину: удалить из БД всё, что удалено «у всех» в этом чате."""
    conn = get_db()
    cur = dict_cursor(conn)
    if chat_id:
        cur.execute('DELETE FROM messages WHERE chat_id = %s AND deleted_for_all = TRUE', (chat_id,))
    elif group_id:
        cur.execute('DELETE FROM messages WHERE group_id = %s AND deleted_for_all = TRUE', (group_id,))
    else:
        cur.execute('DELETE FROM messages WHERE channel_id = %s AND deleted_for_all = TRUE', (channel_id,))
    conn.commit()
    conn.close()


def purge_old_trash(days=30):
    """Автоочистка корзины: окончательно удаляет старое (для фонового потока)."""
    cutoff = (datetime.utcnow() + timedelta(hours=3, days=-int(days))).strftime('%Y-%m-%d %H:%M:%S')
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        DELETE FROM messages
         WHERE deleted_for_all = TRUE
           AND deleted_at IS NOT NULL
           AND deleted_at <= %s
    ''', (cutoff,))
    n = cur.rowcount
    conn.commit()
    conn.close()
    return n


# ----- РЕАКЦИИ (максимум 3 на пользователя) -----
def add_reaction(message_id, user_id, reaction):
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('SELECT reaction FROM message_reactions WHERE message_id = %s AND user_id = %s',
                       (message_id, user_id))
        user_reactions = [row['reaction'] for row in cur.fetchall()]

        if reaction in user_reactions:
            cur.execute('DELETE FROM message_reactions WHERE message_id = %s AND user_id = %s AND reaction = %s',
                           (message_id, user_id, reaction))
        else:
            if len(user_reactions) >= 3:
                cur.execute('''
                    DELETE FROM message_reactions 
                    WHERE message_id = %s AND user_id = %s AND created_at = (
                        SELECT MIN(created_at) FROM message_reactions 
                        WHERE message_id = %s AND user_id = %s
                    )
                ''', (message_id, user_id, message_id, user_id))

            cur.execute('''
                INSERT INTO message_reactions (message_id, user_id, reaction)
                VALUES (%s, %s, %s)
            ''', (message_id, user_id, reaction))

        conn.commit()
        return True
    except Exception as e:
        print(f"Reaction error: {e}")
        return False
    finally:
        conn.close()


def get_message_reactions(message_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT reaction, COUNT(*) as count,
               STRING_AGG(user_id::text, ',') as user_ids
        FROM message_reactions
        WHERE message_id = %s
        GROUP BY reaction
    ''', (message_id,))
    reactions = cur.fetchall()
    conn.close()
    return reactions


def get_user_reactions(message_id, user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT reaction FROM message_reactions WHERE message_id = %s AND user_id = %s', (message_id, user_id))
    reactions = [row['reaction'] for row in cur.fetchall()]
    conn.close()
    return reactions


# ----- ИСТОРИИ -----
def create_story(user_id, file_type, file_path, caption, music_path, privacy, selected_users=None):
    expires_at = get_moscow_datetime() + timedelta(hours=24)
    expires_at_str = expires_at.strftime('%Y-%m-%d %H:%M:%S')
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        INSERT INTO stories (user_id, file_type, file_path, caption, music, expires_at)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id
    ''', (user_id, file_type, file_path, caption, music_path, expires_at_str))
    story_id = cur.fetchone()['id']
    cur.execute('INSERT INTO story_privacy (story_id, privacy_type) VALUES (%s, %s)', (story_id, privacy))
    if privacy == 'selected' and selected_users:
        for uid in selected_users:
            cur.execute('INSERT INTO story_allowed_users (story_id, user_id) VALUES (%s, %s)', (story_id, uid))
    conn.commit()
    conn.close()
    return story_id


def get_stories_for_user(viewer_id):
    conn = get_db()
    cur = dict_cursor(conn)

    cur.execute('''
        SELECT s.*, u.username, u.display_name, u.avatar,
               u.display_name as author_display_name,
               EXISTS(SELECT 1 FROM story_views WHERE story_id = s.id AND user_id = %(viewer)s) as viewed,
               (SELECT COUNT(*) FROM story_interactions WHERE story_id = s.id AND type='like') as likes_count,
               (SELECT COUNT(*) FROM story_interactions WHERE story_id = s.id AND type='view') as views_count,
               (SELECT COUNT(*) FROM story_reactions WHERE story_id = s.id) as reactions_count
        FROM stories s
        JOIN users u ON s.user_id = u.id
        WHERE s.expires_at > (NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')
          AND u.is_deleted = FALSE
          AND (
              s.user_id = %(viewer)s
              OR EXISTS (
                  SELECT 1 FROM story_privacy sp
                  WHERE sp.story_id = s.id AND sp.privacy_type = 'everyone'
              )
              OR EXISTS (
                  SELECT 1 FROM story_privacy sp
                  WHERE sp.story_id = s.id AND sp.privacy_type = 'contacts'
                  AND EXISTS (
                      SELECT 1 FROM contacts 
                      WHERE (user_id = %(viewer)s AND contact_id = s.user_id) 
                      OR (user_id = s.user_id AND contact_id = %(viewer)s)
                  )
              )
              OR EXISTS (
                  SELECT 1 FROM story_privacy sp
                  WHERE sp.story_id = s.id AND sp.privacy_type = 'selected'
                  AND EXISTS (
                      SELECT 1 FROM story_allowed_users 
                      WHERE story_id = s.id AND user_id = %(viewer)s
                  )
              )
          )
        ORDER BY 
            CASE WHEN s.user_id = %(viewer)s THEN 0 ELSE 1 END,
            s.created_at DESC
    ''', {'viewer': viewer_id})

    stories = cur.fetchall()
    conn.close()
    return stories


def add_story_interaction(story_id, user_id, interaction_type, reply_text=None):
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('''
            INSERT INTO story_interactions (story_id, user_id, type, reply_text)
            VALUES (%s, %s, %s, %s)
        ''', (story_id, user_id, interaction_type, reply_text))
        conn.commit()
    except sqlite3.IntegrityError:
        pass
    finally:
        conn.close()


def add_story_reaction(story_id, user_id, reaction):
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('''
            INSERT INTO story_reactions (story_id, user_id, reaction)
            VALUES (%s, %s, %s) ON CONFLICT DO NOTHING
        ''', (story_id, user_id, reaction))
        conn.commit()
        return True
    except:
        return False
    finally:
        conn.close()


def add_story_view(story_id, user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('''
            INSERT INTO story_views (story_id, user_id)
            VALUES (%s, %s) ON CONFLICT DO NOTHING
        ''', (story_id, user_id))
        conn.commit()
    except:
        pass
    finally:
        conn.close()


def get_story_reactions(story_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT reaction, COUNT(*) as count
        FROM story_reactions
        WHERE story_id = %s
        GROUP BY reaction
    ''', (story_id,))
    reactions = cur.fetchall()
    conn.close()
    return reactions


def delete_expired_stories():
    conn = get_db()
    cur = dict_cursor(conn)

    cur.execute("SELECT file_path, music FROM stories WHERE expires_at < (NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')")
    expired = cur.fetchall()

    for story in expired:
        for path in [story['file_path'], story['music']]:
            if path:
                try:
                    full_path = os.path.join('static', path)
                    if os.path.exists(full_path):
                        os.remove(full_path)
                except:
                    pass

    cur.execute("DELETE FROM stories WHERE expires_at < (NOW() AT TIME ZONE 'UTC' + INTERVAL '3 hours')")
    deleted = cur.rowcount
    conn.commit()
    conn.close()
    return deleted


def get_story_viewers(story_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT u.id, u.username, u.display_name, u.avatar, sv.viewed_at
        FROM story_views sv
        JOIN users u ON sv.user_id = u.id
        WHERE sv.story_id = %s
        ORDER BY sv.viewed_at DESC
    ''', (story_id,))
    viewers = cur.fetchall()
    conn.close()
    return viewers


def get_story_likes(story_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT u.id, u.username, u.display_name, u.avatar
        FROM story_interactions si
        JOIN users u ON si.user_id = u.id
        WHERE si.story_id = %s AND si.type = 'like'
    ''', (story_id,))
    likes = cur.fetchall()
    conn.close()
    return likes


# ----- ЗАКРЕПЛЕННЫЕ ЧАТЫ -----
def pin_chat(user_id, chat_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('INSERT INTO pinned_chats (user_id, chat_id, pinned_at) VALUES (%s, %s, %s) ON CONFLICT (user_id, chat_id) DO UPDATE SET pinned_at = excluded.pinned_at',
                   (user_id, chat_id, get_moscow_time()))
    conn.commit()
    conn.close()


def unpin_chat(user_id, chat_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('DELETE FROM pinned_chats WHERE user_id = %s AND chat_id = %s', (user_id, chat_id))
    conn.commit()
    conn.close()


def get_pinned_chats(user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT chat_id FROM pinned_chats WHERE user_id = %s ORDER BY pinned_at DESC', (user_id,))
    pinned = [row['chat_id'] for row in cur.fetchall()]
    conn.close()
    return pinned


# ----- ВИДЕОЗВОНКИ -----
def create_video_call(room_id, creator_id, call_type='video'):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        INSERT INTO video_calls (room_id, creator_id, call_type)
        VALUES (%s, %s, %s)
        RETURNING id
    ''', (room_id, creator_id, call_type))
    conn.commit()
    call_id = cur.fetchone()['id']

    cur.execute('''
        INSERT INTO video_call_participants (call_id, user_id)
        VALUES (%s, %s)
    ''', (call_id, creator_id))
    conn.commit()
    conn.close()
    return call_id


def add_video_call_participant(room_id, user_id, audio_only=False):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT id FROM video_calls WHERE room_id = %s AND status = "active"', (room_id,))
    call = cur.fetchone()

    if call:
        cur.execute('''
            INSERT INTO video_call_participants (call_id, user_id, audio_only)
            VALUES (%s, %s, %s) ON CONFLICT DO NOTHING
        ''', (call['id'], user_id, audio_only))
        cur.execute('''
            UPDATE video_calls 
            SET participant_count = (SELECT COUNT(*) FROM video_call_participants WHERE call_id = %s AND left_at IS NULL)
            WHERE id = %s
        ''', (call['id'], call['id']))
        conn.commit()

    conn.close()
    return call['id'] if call else None


def remove_video_call_participant(room_id, user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT id FROM video_calls WHERE room_id = %s AND status = "active"', (room_id,))
    call = cur.fetchone()

    if call:
        cur.execute('''
            UPDATE video_call_participants 
            SET left_at = %s
            WHERE call_id = %s AND user_id = %s
        ''', (get_moscow_time(), call['id'], user_id))
        conn.commit()
    conn.close()


def end_video_call(room_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT id, started_at FROM video_calls WHERE room_id = %s AND status = "active"', (room_id,))
    call = cur.fetchone()

    if call:
        duration = 0
        if call['started_at']:
            started = datetime.fromisoformat(call['started_at']) if isinstance(call['started_at'], str) else call[
                'started_at']
            duration = int((get_moscow_datetime() - started).total_seconds())

        cur.execute('''
            UPDATE video_calls 
            SET status = "ended", ended_at = %s, duration = %s
            WHERE id = %s
        ''', (get_moscow_time(), duration, call['id']))
        cur.execute('''
            UPDATE video_call_participants 
            SET left_at = %s
            WHERE call_id = %s AND left_at IS NULL
        ''', (get_moscow_time(), call['id']))
        conn.commit()
    conn.close()


def get_active_video_call(room_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT * FROM video_calls WHERE room_id = %s AND status = "active"', (room_id,))
    call = cur.fetchone()
    conn.close()
    return call


def get_video_call_participants(room_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT u.id, u.username, u.display_name, u.avatar, vcp.audio_only, vcp.screensharing, vcp.joined_at
        FROM video_calls vc
        JOIN video_call_participants vcp ON vc.id = vcp.call_id
        JOIN users u ON vcp.user_id = u.id
        WHERE vc.room_id = %s AND vcp.left_at IS NULL
    ''', (room_id,))
    participants = cur.fetchall()
    conn.close()
    return participants


# ----- ПОИСК -----
def search_groups(query, current_user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    q = (query or '').strip()
    exact = q.lower().lstrip('@') if q else ''
    cur.execute('''
        SELECT g.*,
               (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count,
               EXISTS(SELECT 1 FROM group_members WHERE group_id = g.id AND user_id = %s) as is_member
        FROM groups g
        WHERE (g.is_public = TRUE AND (g.name LIKE %s
                OR (g.username IS NOT NULL AND g.username != '' AND g.username LIKE %s)))
           OR (g.username = %s AND %s != '')
        LIMIT 20
    ''', (current_user_id, f'%{q}%', (exact + '%') if exact else '____', exact, exact))
    groups = cur.fetchall()
    # Приватная группа, найденная по @юзернейму, не раскрывает описание и аватар
    # постороннему — иначе содержимое утекает всем, кто знает username.
    # invite_link не отдаём никому: по нему входят без заявки.
    for g in groups:
        g.pop('invite_link', None)
        if not g.get('is_public') and not g.get('is_member'):
            g['description'] = None
            g['avatar'] = None
    conn.close()
    return groups


def search_channels(query, current_user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    q = (query or '').strip()
    exact = q.lower().lstrip('@') if q else ''
    cur.execute('''
        SELECT c.*,
               (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id = c.id) as subscriber_count,
               EXISTS(SELECT 1 FROM channel_subscribers WHERE channel_id = c.id AND user_id = %s) as is_subscribed
        FROM channels c
        WHERE (c.is_public = TRUE AND (c.name LIKE %s
                OR (c.username IS NOT NULL AND c.username != '' AND c.username LIKE %s)))
           OR (c.username = %s AND %s != '')
        LIMIT 20
    ''', (current_user_id, f'%{q}%', (exact + '%') if exact else '____', exact, exact))
    channels = cur.fetchall()
    # Приватный канал, найденный по @юзернейму, не должен раскрывать описание
    # и аватар постороннему — иначе содержимое утекает всем, кто знает username.
    # invite_link не отдаём: по нему подписываются без заявки.
    for ch in channels:
        ch.pop('invite_link', None)
        if not ch.get('is_public') and not ch.get('is_subscribed'):
            ch['description'] = None
            ch['avatar'] = None
    conn.close()
    return channels


def normalize_community_username(raw):
    """Превращает '@Name' / 'Name' в нижний регистр без @. Пусто -> None."""
    if not raw:
        return None
    u = str(raw).strip().lower().lstrip('@').strip()
    return u or None


def community_username_available(username, kind=None, chat_id=None):
    """Занят ли юзернейм группы/канала (глобально: пользователи + группы + каналы)."""
    if not username:
        return True
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('SELECT id FROM users WHERE username = %s', (username,))
        if cur.fetchone():
            return False
        if kind == 'channel' and chat_id is not None:
            cur.execute('SELECT id FROM channels WHERE username = %s AND id != %s', (username, chat_id))
        else:
            cur.execute('SELECT id FROM channels WHERE username = %s', (username,))
        if cur.fetchone():
            return False
        if kind == 'group' and chat_id is not None:
            cur.execute('SELECT id FROM groups WHERE username = %s AND id != %s', (username, chat_id))
        else:
            cur.execute('SELECT id FROM groups WHERE username = %s', (username,))
        if cur.fetchone():
            return False
        return True
    finally:
        conn.close()


def get_group_by_username(username):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT * FROM groups WHERE username = %s', (username,))
    group = cur.fetchone()
    conn.close()
    return group


def get_channel_by_username(username):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT * FROM channels WHERE username = %s', (username,))
    channel = cur.fetchone()
    conn.close()
    return channel


def add_recent_search(user_id, query, search_type='all'):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        INSERT INTO recent_searches (user_id, search_query, search_type)
        VALUES (%s, %s, %s)
    ''', (user_id, query, search_type))
    conn.commit()
    conn.close()


def get_recent_searches(user_id, limit=10):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT DISTINCT search_query, search_type, MAX(created_at) as last_searched
        FROM recent_searches
        WHERE user_id = %s
        GROUP BY search_query
        ORDER BY last_searched DESC
        LIMIT %s
    ''', (user_id, limit))
    searches = cur.fetchall()
    conn.close()
    return searches


# ----- ЗВОНКИ -----
def add_call(caller_id, receiver_id, call_type, status):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        INSERT INTO calls (caller_id, receiver_id, call_type, status)
        VALUES (%s, %s, %s, %s)
        RETURNING id
    ''', (caller_id, receiver_id, call_type, status))
    conn.commit()
    call_id = cur.fetchone()['id']
    conn.close()
    return call_id


def update_call_status(call_id, status, duration=0):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('UPDATE calls SET status = %s, duration = %s WHERE id = %s', (status, duration, call_id))
    conn.commit()
    conn.close()


def get_call_history(user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT c.*,
               CASE WHEN c.caller_id = %s THEN u2.display_name ELSE u1.display_name END as contact_name,
               CASE WHEN c.caller_id = %s THEN u2.username ELSE u1.username END as contact_username,
               CASE WHEN c.caller_id = %s THEN u2.id ELSE u1.id END as contact_id,
               c.caller_id = %s as is_outgoing
        FROM calls c
        JOIN users u1 ON c.caller_id = u1.id
        JOIN users u2 ON c.receiver_id = u2.id
        WHERE (c.caller_id = %s OR c.receiver_id = %s)
          AND (c.caller_id != c.receiver_id)
        ORDER BY c.created_at DESC
        LIMIT 50
    ''', (user_id, user_id, user_id, user_id, user_id, user_id))
    calls = cur.fetchall()
    conn.close()
    return calls


# ----- КОНТАКТЫ -----
def get_contacts(user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT u.*, cn.name as custom_name 
        FROM contacts c
        JOIN users u ON c.contact_id = u.id
        LEFT JOIN contact_names cn ON cn.user_id = %s AND cn.contact_id = u.id
        WHERE c.user_id = %s AND u.is_deleted = FALSE
        ORDER BY COALESCE(cn.name, u.display_name, u.username)
    ''', (user_id, user_id))
    contacts = cur.fetchall()
    conn.close()
    return contacts


def add_contact(user_id, contact_id):
    if user_id == contact_id:
        return False
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('INSERT INTO contacts (user_id, contact_id) VALUES (%s, %s)', (user_id, contact_id))
        conn.commit()
        return True
    except:
        return False
    finally:
        conn.close()


def rename_contact(user_id, contact_id, new_name):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('INSERT INTO contact_names (user_id, contact_id, name) VALUES (%s, %s, %s) ON CONFLICT (user_id, contact_id) DO UPDATE SET name = excluded.name',
                   (user_id, contact_id, new_name))
    conn.commit()
    conn.close()


# ----- ИЗБРАННОЕ -----
def add_to_favorites(user_id, file_type, file_path, file_name, note=None):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        INSERT INTO favorites (user_id, file_type, file_path, file_name, note)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id
    ''', (user_id, file_type, file_path, file_name, note))
    conn.commit()
    fav_id = cur.fetchone()['id']
    conn.close()
    return fav_id


def get_favorites(user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT * FROM favorites WHERE user_id = %s ORDER BY created_at DESC', (user_id,))
    favorites = cur.fetchall()
    conn.close()
    return favorites


# ----- СЕССИИ -----
def add_session(user_id, session_token, device, ip, location=''):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        INSERT INTO user_sessions (user_id, session_token, device, ip, location, last_active)
        VALUES (%s, %s, %s, %s, %s, %s)
    ''', (user_id, session_token, device, ip, location, get_moscow_time()))
    conn.commit()
    conn.close()


def get_user_sessions(user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT * FROM user_sessions WHERE user_id = %s ORDER BY created_at DESC', (user_id,))
    sessions = cur.fetchall()
    conn.close()
    return sessions


def delete_session(session_token):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('DELETE FROM user_sessions WHERE session_token = %s', (session_token,))
    conn.commit()
    conn.close()


def delete_all_sessions_except(user_id, current_token):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('DELETE FROM user_sessions WHERE user_id = %s AND session_token != %s', (user_id, current_token))
    conn.commit()
    conn.close()


# ----- ПРЕДЗАГРУЗОЧНЫЕ АВАТАРКИ -----
def get_preloaded_avatars():
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute("SELECT * FROM preloaded_avatars WHERE category != 'system' ORDER BY id")
    avatars = cur.fetchall()
    conn.close()
    return avatars


def get_deleted_avatar():
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute("SELECT filename FROM preloaded_avatars WHERE filename = 'deleted.png'")
    avatar = cur.fetchone()
    conn.close()
    return avatar['filename'] if avatar else 'static/avatar-swg/deleted.png'


# ----- НАСТРОЙКИ -----
def get_user_settings(user_id):
    user = get_user_by_id(user_id)
    if not user:
        return None
    return {
        'theme': user['theme'],
        'font_size': user['font_size'],
        'bubble_radius': user['bubble_radius'],
        'font_family': user['font_family'],
        'my_message_color': user['my_message_color'],
        'their_message_color': user['their_message_color'],
        'wallpaper': user['wallpaper'],
        'wallpaper_image': user['wallpaper_image'],
        'banner_color': user['banner_color'] if 'banner_color' in user else None,
        'banner_image': user['banner_image'] if 'banner_image' in user else None
    }


def get_privacy_settings(user_id):
    user = get_user_by_id(user_id)
    if not user:
        return None
    return {
        'last_seen': user['privacy_last_seen'],
        'profile_photo': user['privacy_photo'],
        'forward_messages': user['privacy_forward'],
        'calls': user['privacy_calls'],
        'messages': user['privacy_messages']
    }


def update_privacy_settings(user_id, last_seen, profile_photo, forward_messages, calls, messages):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        UPDATE users SET
            privacy_last_seen = %s,
            privacy_photo = %s,
            privacy_forward = %s,
            privacy_calls = %s,
            privacy_messages = %s
        WHERE id = %s
    ''', (last_seen, profile_photo, forward_messages, calls, messages, user_id))
    conn.commit()
    conn.close()


# ----- НОВЫЕ ФУНКЦИИ ДЛЯ СТАТИСТИКИ ИСТОРИЙ И ПОИСКА В ЧАТЕ -----
def get_story_stats(story_id, user_id):
    """Получает полную статистику по истории (только для владельца)"""
    conn = get_db()
    cur = dict_cursor(conn)

    cur.execute('SELECT user_id FROM stories WHERE id = %s', (story_id,))
    story = cur.fetchone()

    if not story or story['user_id'] != user_id:
        conn.close()
        return None

    cur.execute('''
        SELECT u.id, u.unique_id, u.username, u.display_name, u.avatar, sv.viewed_at
        FROM story_views sv
        JOIN users u ON sv.user_id = u.id
        WHERE sv.story_id = %s
        ORDER BY sv.viewed_at DESC
    ''', (story_id,))
    viewers = cur.fetchall()

    cur.execute('''
        SELECT u.id, u.unique_id, u.username, u.display_name, u.avatar, si.created_at
        FROM story_interactions si
        JOIN users u ON si.user_id = u.id
        WHERE si.story_id = %s AND si.type = 'like'
        ORDER BY si.created_at DESC
    ''', (story_id,))
    likes = cur.fetchall()

    cur.execute('''
        SELECT u.id, u.unique_id, u.username, u.display_name, u.avatar, sr.reaction, sr.created_at
        FROM story_reactions sr
        JOIN users u ON sr.user_id = u.id
        WHERE sr.story_id = %s
        ORDER BY sr.created_at DESC
    ''', (story_id,))
    reactions = cur.fetchall()

    cur.execute('''
        SELECT u.id, u.unique_id, u.username, u.display_name, u.avatar, si.reply_text, si.created_at
        FROM story_interactions si
        JOIN users u ON si.user_id = u.id
        WHERE si.story_id = %s AND si.type = 'reply' AND si.reply_text IS NOT NULL
        ORDER BY si.created_at DESC
    ''', (story_id,))
    replies = cur.fetchall()

    conn.close()

    return {
        'viewers': [dict(v) for v in viewers],
        'likes': [dict(l) for l in likes],
        'reactions': [dict(r) for r in reactions],
        'replies': [dict(r) for r in replies],
        'total_views': len(viewers),
        'total_likes': len(likes),
        'total_reactions': len(reactions),
        'total_replies': len(replies)
    }


def get_story_by_id(story_id):
    """Получает историю по ID"""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT s.*, u.username, u.display_name, u.avatar
        FROM stories s
        JOIN users u ON s.user_id = u.id
        WHERE s.id = %s
    ''', (story_id,))
    story = cur.fetchone()
    conn.close()
    return story


def search_messages_in_chat(chat_id, user_id, query):
    """Поиск сообщений в чате по ключевому слову"""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT m.*, u.username, u.display_name, u.avatar,
               CASE WHEN m.sender_id = %s THEN 1 ELSE 0 END as is_mine
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE m.chat_id = %s 
          AND m.is_deleted = FALSE
          AND (m.content LIKE %s OR m.file_name LIKE %s)
        ORDER BY m.created_at DESC
        LIMIT 100
    ''', (user_id, chat_id, f'%{query}%', f'%{query}%'))
    messages = cur.fetchall()
    conn.close()
    return  messages

#----CALL----

# database.py - добавьте в конец файла

def create_call_room(initiator_id, receiver_id, call_type='audio'):
    """Создает запись о звонке в БД"""
    conn = get_db()
    cur = dict_cursor(conn)
    room_id = f"call_{initiator_id}_{receiver_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"

    cur.execute('''
        INSERT INTO calls (caller_id, receiver_id, call_type, status, created_at)
        VALUES (%s, %s, %s, 'ringing', %s)
        RETURNING id
    ''', (initiator_id, receiver_id, call_type, get_moscow_time()))
    call_id = cur.fetchone()['id']
    conn.commit()
    conn.close()

    return call_id, room_id


def update_call(call_id, status, duration=0):
    """Обновляет статус звонка"""
    conn = get_db()
    cur = dict_cursor(conn)
    if status == 'ended':
        cur.execute('''
            UPDATE calls SET status = %s, duration = %s WHERE id = %s
        ''', (status, duration, call_id))
    else:
        cur.execute('''
            UPDATE calls SET status = %s WHERE id = %s
        ''', (status, call_id))
    conn.commit()
    conn.close()

def add_call(caller_id, receiver_id, call_type, status):
    """Добавляет запись о звонке"""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        INSERT INTO calls (caller_id, receiver_id, call_type, status, created_at)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id
    ''', (caller_id, receiver_id, call_type, status, get_moscow_time()))
    conn.commit()
    call_id = cur.fetchone()['id']
    conn.close()
    return call_id


# database.py - добавьте в конец файла

def get_contact_with_name(user_id, contact_id):
    """Получает контакт с пользовательским именем"""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT u.*, cn.name as custom_name 
        FROM contacts c
        JOIN users u ON c.contact_id = u.id
        LEFT JOIN contact_names cn ON cn.user_id = %s AND cn.contact_id = u.id
        WHERE c.user_id = %s AND c.contact_id = %s AND u.is_deleted = FALSE
    ''', (user_id, user_id, contact_id))
    contact = cur.fetchone()
    conn.close()
    return contact

def get_contact_name(user_id, contact_id):
    """Получает имя контакта (пользовательское или оригинальное)"""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT name FROM contact_names WHERE user_id = %s AND contact_id = %s',
                   (user_id, contact_id))
    result = cur.fetchone()
    conn.close()
    return result['name'] if result else None

def is_contact(user_id, contact_id):
    """Проверяет, есть ли пользователь в контактах"""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT id FROM contacts WHERE user_id = %s AND contact_id = %s',
                   (user_id, contact_id))
    result = cur.fetchone()
    conn.close()
    return result is not None

def remove_contact(user_id, contact_id):
    """Удаляет контакт"""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('DELETE FROM contacts WHERE user_id = %s AND contact_id = %s',
                   (user_id, contact_id))
    cur.execute('DELETE FROM contact_names WHERE user_id = %s AND contact_id = %s',
                   (user_id, contact_id))
    conn.commit()
    conn.close()
    return True


# database.py - убедитесь что эти функции есть

def is_contact(user_id, contact_id):
    """Проверяет, есть ли пользователь в контактах"""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT id FROM contacts WHERE user_id = %s AND contact_id = %s',
                   (user_id, contact_id))
    result = cur.fetchone()
    conn.close()
    return result is not None

# database.py - проверьте эту функцию

def get_contacts(user_id):
    """Получает контакты пользователя с их именами"""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT u.id, u.username, u.display_name, u.avatar, u.phone, u.unique_id,
               u.is_banned, cn.name as custom_name 
        FROM contacts c
        JOIN users u ON c.contact_id = u.id
        LEFT JOIN contact_names cn ON cn.user_id = %s AND cn.contact_id = u.id
        WHERE c.user_id = %s AND u.is_deleted = FALSE
        ORDER BY COALESCE(cn.name, u.display_name, u.username)
    ''', (user_id, user_id))
    contacts = cur.fetchall()
    conn.close()
    return contacts



def get_contact_name(user_id, contact_id):
    """Получает имя контакта (пользовательское или оригинальное)"""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT name FROM contact_names WHERE user_id = %s AND contact_id = %s',
                   (user_id, contact_id))
    result = cur.fetchone()
    conn.close()
    return result['name'] if result else None


def remove_contact(user_id, contact_id):
    """Удаляет контакт и его переименование"""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('DELETE FROM contacts WHERE user_id = %s AND contact_id = %s',
                   (user_id, contact_id))
    cur.execute('DELETE FROM contact_names WHERE user_id = %s AND contact_id = %s',
                   (user_id, contact_id))
    conn.commit()
    conn.close()
    return True





# ===== МУЛЬТИАККАУНТЫ =====

def link_account(master_user_id, linked_user_id):
    """Привязывает аккаунт к мастер-аккаунту"""
    print(f"🔗 Linking {linked_user_id} to {master_user_id}")

    if master_user_id == linked_user_id:
        print("❌ Cannot link to self")
        return False

    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('''
            INSERT INTO linked_accounts (master_user_id, linked_user_id)
            VALUES (%s, %s) ON CONFLICT DO NOTHING
        ''', (master_user_id, linked_user_id))
        conn.commit()
        print(f"✅ Link successful")
        return True
    except Exception as e:
        print(f"❌ Error linking account: {e}")
        return False
    finally:
        conn.close()


def get_linked_accounts(user_id):
    """Возвращает список привязанных аккаунтов"""
    print(f"🔍 Getting linked accounts for {user_id}")
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('''
            SELECT u.id, u.unique_id, u.username, u.display_name, u.avatar
            FROM linked_accounts la
            JOIN users u ON la.linked_user_id = u.id
            WHERE la.master_user_id = %s AND u.is_deleted = FALSE
            ORDER BY la.created_at DESC
        ''', (user_id,))
        accounts = cur.fetchall()
        print(f"✅ Found {len(accounts)} accounts")
        return accounts
    except Exception as e:
        print(f"❌ Error getting linked accounts: {e}")
        return []
    finally:
        conn.close()


def get_master_account(user_id):
    """Возвращает мастер-аккаунт для данного пользователя"""
    print(f"🔍 Getting master account for {user_id}")
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('''
            SELECT master_user_id FROM linked_accounts 
            WHERE linked_user_id = %s
        ''', (user_id,))
        result = cur.fetchone()
        conn.close()

        if result:
            print(f"✅ Master account found: {result['master_user_id']}")
            return result['master_user_id']
        print(f"✅ No master found, returning self: {user_id}")
        return user_id
    except Exception as e:
        print(f"❌ Error getting master account: {e}")
        return user_id


# ===== ПАПКИ ЧАТОВ =====

def resolve_folder_chat_info(cur, chat_id, chat_type=None):
    """Возвращает {chat_type, chat_name, chat_avatar, other_user_id} для чата.
    chat_type можно передать явно — тогда никаких каскадов и коллизий id
    (личный/группа/канал могут иметь одинаковые id)."""
    if chat_type not in ('personal', 'group', 'channel'):
        cur.execute('''
            SELECT 'personal' as t FROM chats WHERE id = %s
            UNION SELECT 'group' as t FROM groups WHERE id = %s
            UNION SELECT 'channel' as t FROM channels WHERE id = %s
        ''', (chat_id, chat_id, chat_id))
        row = cur.fetchone()
        chat_type = row['t'] if row else None

    if chat_type == 'personal':
        cur.execute('''
            SELECT
                CASE WHEN c.user1_id = c.user2_id THEN 'Избранное'
                     ELSE COALESCE(u.display_name, u.username) END as chat_name,
                u.avatar as chat_avatar,
                CASE WHEN c.user1_id = %s THEN c.user2_id ELSE c.user1_id END as other_user_id
            FROM chats c
            LEFT JOIN users u ON (CASE WHEN c.user1_id = %s THEN c.user2_id ELSE c.user1_id END) = u.id
            WHERE c.id = %s
        ''', (chat_id, chat_id, chat_id))
        row = cur.fetchone()
        if not row:
            return None
        return {'chat_type': 'personal', 'chat_name': row['chat_name'] or 'Чат',
                'chat_avatar': row['chat_avatar'] or '', 'other_user_id': row['other_user_id']}

    if chat_type == 'group':
        cur.execute('SELECT name, avatar FROM groups WHERE id = %s', (chat_id,))
    elif chat_type == 'channel':
        cur.execute('SELECT name, avatar FROM channels WHERE id = %s', (chat_id,))
    else:
        return None

    row = cur.fetchone()
    if not row:
        return None
    return {'chat_type': chat_type, 'chat_name': row['name'] or 'Чат',
            'chat_avatar': row['avatar'] or '', 'other_user_id': None}


def create_folder(user_id, name, chat_ids, chat_types=None):
    """Создает новую папку с чатами"""
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        print(f"📁 create_folder: user_id={user_id}, name='{name}', chat_ids={chat_ids}, chat_types={chat_types}")

        # Проверяем количество папок (без учёта дефолтной "Все чаты")
        cur.execute("SELECT COUNT(*) as count FROM chat_folders WHERE user_id = %s AND name != 'Все чаты'", (user_id,))
        count = cur.fetchone()['count']
        if count >= 3:
            return {'success': False, 'error': 'limit_reached'}

        # Проверяем, существует ли уже папка с таким именем
        cur.execute('SELECT id FROM chat_folders WHERE user_id = %s AND name = %s', (user_id, name))
        existing = cur.fetchone()
        if existing:
            return {'success': False, 'error': 'folder_exists'}

        # Получаем максимальный порядок
        cur.execute('SELECT MAX(sort_order) as max_order FROM chat_folders WHERE user_id = %s', (user_id,))
        max_order = cur.fetchone()['max_order'] or 0
        new_order = max_order + 1

        # Вставляем папку
        cur.execute('''
            INSERT INTO chat_folders (user_id, name, sort_order)
            VALUES (%s, %s, %s)
            RETURNING id
        ''', (user_id, name, new_order))
        folder_id = cur.fetchone()['id']

        # Добавляем чаты в папку с полной информацией
        if chat_ids and len(chat_ids) > 0:
            for i, chat_id in enumerate(chat_ids):
                chat_type = None
                if chat_types and i < len(chat_types):
                    chat_type = chat_types[i]
                info = resolve_folder_chat_info(cur, chat_id, chat_type)
                if not info:
                    continue

                cur.execute('''
                    INSERT INTO folder_chats (folder_id, chat_id, chat_type, chat_name, chat_avatar, other_user_id)
                    VALUES (%s, %s, %s, %s, %s, %s)
                ''', (folder_id, chat_id, info['chat_type'], info['chat_name'], info['chat_avatar'], info['other_user_id']))

            print(f"📁 Added {len(chat_ids)} chats to folder")

        conn.commit()
        return {'success': True, 'folder_id': folder_id}
    except Exception as e:
        print(f"❌ Error in create_folder: {e}")
        import traceback
        traceback.print_exc()
        conn.rollback()
        return {'success': False, 'error': str(e)}
    finally:
        conn.close()


def update_folder_name(folder_id, new_name):
    """Обновляет название папки"""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('UPDATE chat_folders SET name = %s WHERE id = %s', (new_name, folder_id))
    conn.commit()
    conn.close()
    return True


def get_user_folders(user_id):
    """Получает все папки пользователя с их чатами"""
    conn = get_db()
    cur = dict_cursor(conn)

    # Получаем папки
    cur.execute('''
        SELECT id, name, sort_order, created_at
        FROM chat_folders
        WHERE user_id = %s
        ORDER BY sort_order ASC
    ''', (user_id,))
    folders = cur.fetchall()

    result = []
    for folder in folders:
        folder_dict = dict(folder)
        # Получаем чаты в папке
        cur.execute('''
            SELECT fc.chat_id, fc.chat_type, fc.chat_name, fc.chat_avatar, fc.other_user_id
            FROM folder_chats fc
            WHERE fc.folder_id = %s
            ORDER BY fc.id
        ''', (folder_dict['id'],))
        chats = cur.fetchall()
        folder_dict['chats'] = [dict(chat) for chat in chats]
        folder_dict['is_default'] = (folder_dict['name'] == 'Все чаты' and folder_dict['sort_order'] == 0)
        result.append(folder_dict)

    conn.close()
    return result


def delete_folder(folder_id, user_id):
    """Удаляет папку (только не 'Все чаты')"""
    conn = get_db()
    cur = dict_cursor(conn)
    # Проверяем, не является ли папка дефолтной
    cur.execute('SELECT name FROM chat_folders WHERE id = %s AND user_id = %s', (folder_id, user_id))
    folder = cur.fetchone()
    if folder and folder['name'] == 'Все чаты':
        return False
    cur.execute('DELETE FROM chat_folders WHERE id = %s', (folder_id,))
    conn.commit()
    conn.close()
    return True


def update_folder_chats(folder_id, chat_ids, chat_types=None):
    """Обновляет список чатов в папке"""
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        # Удаляем все текущие чаты
        cur.execute('DELETE FROM folder_chats WHERE folder_id = %s', (folder_id,))

        # Добавляем новые чаты с полной информацией
        for i, chat_id in enumerate(chat_ids):
            chat_type = None
            if chat_types and i < len(chat_types):
                chat_type = chat_types[i]
            info = resolve_folder_chat_info(cur, chat_id, chat_type)
            if not info:
                continue

            cur.execute('''
                INSERT INTO folder_chats (folder_id, chat_id, chat_type, chat_name, chat_avatar, other_user_id)
                VALUES (%s, %s, %s, %s, %s, %s)
            ''', (folder_id, chat_id, info['chat_type'], info['chat_name'], info['chat_avatar'], info['other_user_id']))

        conn.commit()
        return True
    except Exception as e:
        print(f"❌ Error updating folder chats: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()


def get_chat_info_for_folder(chat_id, chat_type):
    """Получает информацию о чате для добавления в папку"""
    conn = get_db()
    cur = dict_cursor(conn)

    if chat_type == 'personal':
        cur.execute('''
            SELECT 
                'personal' as chat_type,
                CASE WHEN c.user1_id = c.user2_id THEN 'Избранное'
                     ELSE COALESCE(u.display_name, u.username) END as chat_name,
                u.avatar as chat_avatar,
                CASE WHEN c.user1_id = %s THEN c.user2_id ELSE c.user1_id END as other_user_id
            FROM chats c
            LEFT JOIN users u ON (CASE WHEN c.user1_id = %s THEN c.user2_id ELSE c.user1_id END) = u.id
            WHERE c.id = %s
        ''', (chat_id, chat_id, chat_id))
    elif chat_type == 'group':
        cur.execute('''
            SELECT 
                'group' as chat_type,
                name as chat_name,
                avatar as chat_avatar,
                NULL as other_user_id
            FROM groups
            WHERE id = %s
        ''', (chat_id,))
    elif chat_type == 'channel':
        cur.execute('''
            SELECT 
                'channel' as chat_type,
                name as chat_name,
                avatar as chat_avatar,
                NULL as other_user_id
            FROM channels
            WHERE id = %s
        ''', (chat_id,))

    info = cur.fetchone()
    conn.close()
    return info


def get_folder_accessible_chats(user_id):
    """Возвращает все доступные чаты для добавления в папки"""
    conn = get_db()
    cur = dict_cursor(conn)

    # Личные чаты
    cur.execute('''
        SELECT 
            c.id as chat_id,
            'personal' as chat_type,
            CASE WHEN c.user1_id = %s THEN c.user2_id ELSE c.user1_id END as other_user_id,
            CASE WHEN c.user1_id = c.user2_id THEN 'Избранное'
                 ELSE COALESCE(cn.name, u.display_name, u.username) END as name,
            u.avatar,
            'personal' as type_label
        FROM chats c
        LEFT JOIN users u ON (CASE WHEN c.user1_id = %s THEN c.user2_id ELSE c.user1_id END) = u.id
        LEFT JOIN contact_names cn ON cn.user_id = %s AND cn.contact_id = u.id
        WHERE (c.user1_id = %s OR c.user2_id = %s) AND u.is_deleted = FALSE
    ''', (user_id, user_id, user_id, user_id, user_id))
    personal = cur.fetchall()

    # Группы
    cur.execute('''
        SELECT 
            g.id as chat_id,
            'group' as chat_type,
            g.id as group_id,
            g.name,
            g.avatar,
            'group' as type_label
        FROM groups g
        JOIN group_members gm ON g.id = gm.group_id
        WHERE gm.user_id = %s
    ''', (user_id,))
    groups = cur.fetchall()

    # Каналы
    cur.execute('''
        SELECT 
            c.id as chat_id,
            'channel' as chat_type,
            c.id as channel_id,
            c.name,
            c.avatar,
            'channel' as type_label
        FROM channels c
        JOIN channel_subscribers cs ON c.id = cs.channel_id
        WHERE cs.user_id = %s
    ''', (user_id,))
    channels = cur.fetchall()

    conn.close()

    all_chats = []
    for chat in personal:
        all_chats.append(dict(chat))
    for chat in groups:
        all_chats.append(dict(chat))
    for chat in channels:
        all_chats.append(dict(chat))

    return all_chats


def migrate_existing_users_with_folders():
    """Создает папку 'Все чаты' для существующих пользователей"""
    conn = get_db()
    cur = dict_cursor(conn)

    # Получаем всех пользователей
    cur.execute('SELECT id FROM users WHERE registration_complete = TRUE')
    users = cur.fetchall()

    for user in users:
        user_id = user['id']
        # Проверяем, есть ли уже папка "Все чаты"
        cur.execute('''
            SELECT id FROM chat_folders 
            WHERE user_id = %s AND name = 'Все чаты'
        ''', (user_id,))
        existing = cur.fetchone()

        if not existing:
            cur.execute('''
                INSERT INTO chat_folders (user_id, name, sort_order)
                VALUES (%s, 'Все чаты', 0) ON CONFLICT DO NOTHING
            ''', (user_id,))
            print(f"✅ Создана папка 'Все чаты' для пользователя {user_id}")

    conn.commit()
    conn.close()
    print("✅ Миграция папок завершена")



def update_privacy_settings(user_id, last_seen, profile_photo, forward_messages, calls, messages):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        UPDATE users SET
            privacy_last_seen = %s,
            privacy_photo = %s,
            privacy_forward = %s,
            privacy_calls = %s,
            privacy_messages = %s
        WHERE id = %s
    ''', (last_seen, profile_photo, forward_messages, calls, messages, user_id))
    conn.commit()
    conn.close()


# ===== ПРОВЕРКИ ПРИВАТНОСТИ =====

def can_see_last_seen(viewer_id, target_id):
    """Может ли viewer_id видеть время захода target_id"""
    if viewer_id == target_id:
        return True

    conn = get_db()
    cur = dict_cursor(conn)

    # Получаем настройки приватности целевого пользователя
    cur.execute('SELECT privacy_last_seen FROM users WHERE id = %s', (target_id,))
    user = cur.fetchone()

    if not user:
        conn.close()
        return False

    privacy = user['privacy_last_seen']

    if privacy == 'everyone':
        conn.close()
        return True

    if privacy == 'contacts':
        # Проверяем, являются ли они контактами
        cur.execute('''
            SELECT id FROM contacts 
            WHERE (user_id = %s AND contact_id = %s) OR (user_id = %s AND contact_id = %s)
        ''', (viewer_id, target_id, target_id, viewer_id))
        is_contact = cur.fetchone()
        conn.close()
        return is_contact is not None

    if privacy == 'nobody':
        conn.close()
        return False

    conn.close()
    return False


def can_see_profile_photo(viewer_id, target_id):
    """Может ли viewer_id видеть фото профиля target_id"""
    if viewer_id == target_id:
        return True

    conn = get_db()
    cur = dict_cursor(conn)

    cur.execute('SELECT privacy_photo FROM users WHERE id = %s', (target_id,))
    user = cur.fetchone()

    if not user:
        conn.close()
        return False

    privacy = user['privacy_photo']

    if privacy == 'everyone':
        conn.close()
        return True

    if privacy == 'contacts':
        cur.execute('''
            SELECT id FROM contacts 
            WHERE (user_id = %s AND contact_id = %s) OR (user_id = %s AND contact_id = %s)
        ''', (viewer_id, target_id, target_id, viewer_id))
        is_contact = cur.fetchone()
        conn.close()
        return is_contact is not None

    if privacy == 'nobody':
        conn.close()
        return False

    conn.close()
    return False


def can_call_user(caller_id, target_id):
    """Может ли caller_id звонить target_id"""
    if caller_id == target_id:
        return False

    conn = get_db()
    cur = dict_cursor(conn)

    cur.execute('SELECT privacy_calls FROM users WHERE id = %s', (target_id,))
    user = cur.fetchone()

    if not user:
        conn.close()
        return False

    privacy = user['privacy_calls']

    if privacy == 'everyone':
        conn.close()
        return True

    if privacy == 'contacts':
        cur.execute('''
            SELECT id FROM contacts 
            WHERE (user_id = %s AND contact_id = %s) OR (user_id = %s AND contact_id = %s)
        ''', (caller_id, target_id, target_id, caller_id))
        is_contact = cur.fetchone()
        conn.close()
        return is_contact is not None

    if privacy == 'nobody':
        conn.close()
        return False

    conn.close()
    return False


def can_send_message(sender_id, receiver_id):
    """Может ли sender_id отправлять сообщения receiver_id"""
    if sender_id == receiver_id:  # Избранное — всегда можно
        return True

    conn = get_db()
    cur = dict_cursor(conn)

    cur.execute('SELECT privacy_messages FROM users WHERE id = %s', (receiver_id,))
    user = cur.fetchone()

    if not user:
        conn.close()
        return False

    privacy = user['privacy_messages']

    if privacy == 'everyone':
        conn.close()
        return True

    if privacy == 'contacts':
        cur.execute('''
            SELECT id FROM contacts 
            WHERE (user_id = %s AND contact_id = %s) OR (user_id = %s AND contact_id = %s)
        ''', (sender_id, receiver_id, receiver_id, sender_id))
        is_contact = cur.fetchone()
        conn.close()
        return is_contact is not None

    conn.close()
    return False


def can_forward_message(sender_id, target_id):
    """Может ли sender_id пересылать сообщения target_id"""
    # Аналогично can_send_message, но для пересылок
    return can_send_message(sender_id, target_id)


# =============================================================================
#  v0.58.0 — КРУЖКИ / АЛЬБОМЫ / ФОРМАТИРОВАНИЕ / СТИКЕРЫ / ПРЕМИУМ / 2FA / PASSCODE
# =============================================================================

# ---------- ПРЕМИУМ ----------
def get_user_premium(user_id):
    """Возвращает словарь с информацией о премиуме пользователя."""
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT id, premium_until, premium_emoji FROM users WHERE id = %s', (user_id,))
    u = cur.fetchone()
    conn.close()
    if not u:
        return None
    return _premium_pack(u)


def _premium_pack(row):
    until = row.get('premium_until')
    active = False
    if until:
        try:
            if isinstance(until, str):
                until_dt = datetime.fromisoformat(until.replace('Z', ''))
            else:
                until_dt = until
            active = until_dt > datetime.now()
        except Exception:
            active = False
    return {
        'is_premium': active,
        'premium_until': until,
        'premium_emoji': row.get('premium_emoji') or '⭐️',
    }


def is_premium_active(user_id):
    p = get_user_premium(user_id)
    return bool(p and p['is_premium'])


def set_user_premium_emoji(user_id, emoji):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('UPDATE users SET premium_emoji = %s WHERE id = %s', (emoji, user_id))
    conn.commit()
    conn.close()
    return True


# ---------- ПРОМОКОДЫ ПРЕМИУМА ----------
def create_premium_promo(code, days, max_activations, note=None, expires_at=None, created_by='admin'):
    code = (code or '').strip().upper()
    if not code or not re.match(r'^[A-Z0-9_-]{3,32}$', code):
        return None, 'Промокод: 3-32 символа, латиница, цифры, дефис и подчёркивание'
    try:
        days = int(days)
        max_activations = int(max_activations)
    except (TypeError, ValueError):
        return None, 'Срок и лимит должны быть числами'
    if days < 1:
        return None, 'Срок премиума должен быть минимум 1 день'
    if max_activations < 1:
        return None, 'Лимит активаций должен быть минимум 1'

    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT id FROM premium_promos WHERE code = %s', (code,))
    if cur.fetchone():
        conn.close()
        return None, 'Такой промокод уже существует'
    cur.execute('''
        INSERT INTO premium_promos (code, days, max_activations, note, expires_at, created_by)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id
    ''', (code, days, max_activations, (note or '').strip() or None, expires_at, created_by))
    row = cur.fetchone()
    conn.commit()
    conn.close()
    return dict(row) if row else None, None


def list_premium_promos():
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT p.*, (SELECT COUNT(*) FROM premium_activations a WHERE a.promo_id = p.id) AS used
        FROM premium_promos p ORDER BY p.id DESC
    ''')
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def update_premium_promo(promo_id, is_active=None, days=None, max_activations=None):
    conn = get_db()
    cur = dict_cursor(conn)
    sets, params = [], []
    if is_active is not None:
        sets.append('is_active = ?')
        params.append(bool(is_active))
    if days is not None:
        sets.append('days = ?')
        params.append(int(days))
    if max_activations is not None:
        sets.append('max_activations = ?')
        params.append(int(max_activations))
    if not sets:
        conn.close()
        return False
    params.append(promo_id)
    cur.execute('UPDATE premium_promos SET %s WHERE id = ?' % ', '.join(sets), tuple(params))
    conn.commit()
    conn.close()
    return True


def delete_premium_promo(promo_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('DELETE FROM premium_promos WHERE id = %s', (promo_id,))
    conn.commit()
    conn.close()
    return True


def activate_premium_promo(user_id, code):
    """Активирует промокод. Возвращает (ok, payload_or_error)."""
    code = (code or '').strip().upper()
    if not code:
        return False, 'Введите промокод'

    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('SELECT * FROM premium_promos WHERE code = %s', (code,))
        promo = cur.fetchone()
        if not promo:
            return False, 'Промокод не найден'
        if not promo.get('is_active'):
            return False, 'Промокод отключён'

        # Срок действия самого промокода
        if promo.get('expires_at'):
            try:
                exp = promo['expires_at']
                if isinstance(exp, str):
                    exp = datetime.fromisoformat(exp.replace('Z', ''))
                if exp < datetime.now():
                    return False, 'Срок действия промокода истёк'
            except Exception:
                pass

        # Один пользователь — одна активация промокода
        cur.execute('SELECT id FROM premium_activations WHERE promo_id = %s AND user_id = %s',
                    (promo['id'], user_id))
        if cur.fetchone():
            return False, 'Вы уже активировали этот промокод'

        used = cur.execute('SELECT COUNT(*) AS c FROM premium_activations WHERE promo_id = %s',
                           (promo['id'],)).fetchone()['c']
        if used >= (promo.get('max_activations') or 0):
            return False, 'Промокод исчерпал лимит активаций'

        days = int(promo.get('days') or 30)

        # Продлеваем с текущего момента (или с момента окончания текущего премиума)
        cur.execute('SELECT premium_until FROM users WHERE id = %s', (user_id,))
        row = cur.fetchone()
        base = datetime.now()
        if row and row.get('premium_until'):
            try:
                prev = row['premium_until']
                if isinstance(prev, str):
                    prev = datetime.fromisoformat(prev.replace('Z', ''))
                if prev > base:
                    base = prev
            except Exception:
                pass
        new_until = base + timedelta(days=days)

        cur.execute('UPDATE users SET premium_until = %s WHERE id = %s', (new_until, user_id))
        cur.execute('''
            INSERT INTO premium_activations (user_id, promo_id, promo_code, days, expires_at)
            VALUES (%s, %s, %s, %s, %s)
        ''', (user_id, promo['id'], code, days, new_until))
        conn.commit()
        return True, {
            'code': code,
            'days': days,
            'premium_until': new_until.isoformat(),
        }
    finally:
        conn.close()


def list_premium_activations(limit=200):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        SELECT a.*, u.username, u.display_name, u.phone
        FROM premium_activations a LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.id DESC LIMIT %s
    ''', (int(limit),))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def premium_stats():
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute("SELECT COUNT(*) AS c FROM users WHERE premium_until IS NOT NULL AND premium_until > datetime('now')")
    active = cur.fetchone()['c']
    cur.execute('SELECT COUNT(*) AS c FROM premium_promos')
    promos = cur.fetchone()['c']
    cur.execute('SELECT COUNT(*) AS c FROM premium_activations')
    acts = cur.fetchone()['c']
    conn.close()
    return {'active_users': active, 'promos_total': promos, 'activations_total': acts}


# ---------- 2FA: ОБЛАЧНЫЙ ПАРОЛЬ ----------
def set_cloud_password(user_id, plain_password, hint=None, recovery_email=None):
    if not plain_password or len(plain_password) < 4:
        return False
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        UPDATE users SET cloud_password_hash = %s, cloud_password_hint = %s, recovery_email = %s
        WHERE id = %s
    ''', (_hash_secret(plain_password), (hint or '').strip() or None,
          (recovery_email or '').strip() or None, user_id))
    conn.commit()
    conn.close()
    return True


def clear_cloud_password(user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''UPDATE users SET cloud_password_hash = NULL, cloud_password_hint = NULL WHERE id = %s''',
                (user_id,))
    conn.commit()
    conn.close()
    return True


def check_cloud_password(user_id, plain_password):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT cloud_password_hash FROM users WHERE id = %s', (user_id,))
    row = cur.fetchone()
    conn.close()
    if not row or not row.get('cloud_password_hash'):
        return None  # 2FA не настроена
    return _verify_secret(row['cloud_password_hash'], plain_password or '')


def get_cloud_password_info(user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''SELECT cloud_password_hash, cloud_password_hint, recovery_email, email
                   FROM users WHERE id = %s''', (user_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return {
        'enabled': bool(row.get('cloud_password_hash')),
        'hint': row.get('cloud_password_hint'),
        'recovery_email': row.get('recovery_email'),
        'email': row.get('email'),
    }


# ---------- PASSCODE (блокировка приложения) ----------
def set_app_passcode(user_id, plain_passcode, hint=None, autolock=0, enabled=True):
    if enabled and (not plain_passcode or len(str(plain_passcode)) < 4):
        return False
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        UPDATE users SET app_passcode_hash = %s, app_passcode_hint = %s,
                         app_lock_enabled = %s, app_lock_autolock = %s,
                         app_passcode_len = %s
        WHERE id = %s
    ''', (_hash_secret(str(plain_passcode)) if enabled else None,
          (hint or '').strip() or None, bool(enabled), int(autolock or 0),
          len(str(plain_passcode)) if enabled and plain_passcode else 0,
          user_id))
    conn.commit()
    conn.close()
    return True


def check_app_passcode(user_id, plain_passcode):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT app_passcode_hash, app_lock_enabled FROM users WHERE id = %s', (user_id,))
    row = cur.fetchone()
    conn.close()
    if not row or not row.get('app_lock_enabled') or not row.get('app_passcode_hash'):
        return None
    return _verify_secret(row['app_passcode_hash'], str(plain_passcode or ''))


def get_app_lock_info(user_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''SELECT app_passcode_hash, app_passcode_hint, app_lock_enabled, app_lock_autolock,
                        app_passcode_len
                   FROM users WHERE id = %s''', (user_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return {
        'enabled': bool(row.get('app_lock_enabled') and row.get('app_passcode_hash')),
        'hint': row.get('app_passcode_hint'),
        'autolock': row.get('app_lock_autolock') or 0,
        # Сколько цифр в коде — фронтенд по этому числу знает, когда пора проверять
        'passcode_length': int(row.get('app_passcode_len') or 4),
    }


# ---------- ХЕШИ ДЛЯ СЕКРЕТОВ (2FA / PASSCODE) ----------
def _hash_secret(plain):
    return hashlib.sha256(('sp1n:' + str(plain)).encode('utf-8')).hexdigest()


def _verify_secret(stored, plain):
    if not stored:
        return False
    return hashlib.sha256(('sp1n:' + str(plain)).encode('utf-8')).hexdigest() == stored


# ---------- ОТЛОЖЕННЫЕ СООБЩЕНИЯ ----------
def create_scheduled_message(sender_id, chat_id, group_id, channel_id, content,
                             scheduled_for, file_type=None, file_path=None,
                             file_name=None, file_size=None, media_duration=None,
                             reply_to_id=None):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        INSERT INTO scheduled_messages
            (sender_id, chat_id, group_id, channel_id, content, file_type, file_path,
             file_name, file_size, media_duration, reply_to_id, scheduled_for)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    ''', (sender_id, chat_id, group_id, channel_id, content, file_type, file_path,
          file_name, file_size, media_duration, reply_to_id, scheduled_for))
    row = cur.fetchone()
    conn.commit()
    conn.close()
    return dict(row) if row else None


def get_scheduled_messages(user_id, status='pending'):
    conn = get_db()
    cur = dict_cursor(conn)
    if status:
        cur.execute('''SELECT * FROM scheduled_messages WHERE sender_id = %s AND status = %s
                       ORDER BY scheduled_for ASC''', (user_id, status))
    else:
        cur.execute('''SELECT * FROM scheduled_messages WHERE sender_id = %s
                       ORDER BY scheduled_for ASC''', (user_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def get_scheduled_message(message_id, user_id=None):
    conn = get_db()
    cur = dict_cursor(conn)
    if user_id:
        cur.execute('SELECT * FROM scheduled_messages WHERE id = %s AND sender_id = %s',
                    (message_id, user_id))
    else:
        cur.execute('SELECT * FROM scheduled_messages WHERE id = %s', (message_id,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def update_scheduled_message(message_id, sender_id, **fields):
    allowed = {'content', 'scheduled_for', 'status', 'file_path', 'file_name'}
    sets, params = [], []
    for k, v in fields.items():
        if k in allowed:
            sets.append(k + ' = ?')
            params.append(v)
    if not sets:
        return False
    params.extend([message_id, sender_id])
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('UPDATE scheduled_messages SET %s WHERE id = ? AND sender_id = ?' % ', '.join(sets),
                tuple(params))
    conn.commit()
    conn.close()
    return True


def delete_scheduled_message(message_id, sender_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('DELETE FROM scheduled_messages WHERE id = %s AND sender_id = %s',
                (message_id, sender_id))
    conn.commit()
    conn.close()
    return True


def due_scheduled_messages(now=None, limit=20):
    now = now or datetime.now()
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''SELECT * FROM scheduled_messages
                   WHERE status = 'pending' AND scheduled_for <= %s
                   ORDER BY scheduled_for ASC LIMIT %s''', (now, int(limit)))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


# ---------- СТИКЕРЫ ----------
def create_sticker(user_id, file_path, emoji=None, caption=None, is_favorite=False, set_name='Мои стикеры'):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''
        INSERT INTO stickers (user_id, file_path, emoji, caption, is_favorite, set_name)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT(user_id, file_path) DO UPDATE SET
            emoji = COALESCE(excluded.emoji, stickers.emoji),
            caption = COALESCE(excluded.caption, stickers.caption),
            is_favorite = TRUE
        RETURNING id
    ''', (user_id, file_path, emoji, caption, bool(is_favorite), set_name or 'Мои стикеры'))
    row = cur.fetchone()
    conn.commit()
    conn.close()
    return dict(row) if row else None


def get_user_stickers(user_id, favorites_only=False):
    conn = get_db()
    cur = dict_cursor(conn)
    if favorites_only:
        cur.execute('''SELECT * FROM stickers WHERE user_id = %s AND is_favorite = TRUE
                       ORDER BY id DESC''', (user_id,))
    else:
        cur.execute('SELECT * FROM stickers WHERE user_id = %s ORDER BY id DESC', (user_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def get_favorite_stickers(user_id):
    return get_user_stickers(user_id, favorites_only=True)


def sticker_by_path(user_id, file_path):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT * FROM stickers WHERE user_id = %s AND file_path = %s', (user_id, file_path))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def toggle_sticker_favorite(user_id, sticker_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT is_favorite FROM stickers WHERE id = %s AND user_id = %s', (sticker_id, user_id))
    row = cur.fetchone()
    if not row:
        conn.close()
        return None
    new_val = not bool(row['is_favorite'])
    cur.execute('UPDATE stickers SET is_favorite = %s WHERE id = %s AND user_id = %s',
                (new_val, sticker_id, user_id))
    conn.commit()
    conn.close()
    return {'is_favorite': new_val}


def delete_sticker(user_id, sticker_id):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('DELETE FROM stickers WHERE id = %s AND user_id = %s', (sticker_id, user_id))
    conn.commit()
    conn.close()
    return True


# ---------- АЛЬБОМЫ МЕДИА ----------
def next_album_id():
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('SELECT COALESCE(MAX(album_id), 0) + 1 AS n FROM messages WHERE album_id IS NOT NULL')
    row = cur.fetchone()
    conn.close()
    return int(row['n']) if row else 1


def set_message_album(message_id, album_id, order):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('UPDATE messages SET album_id = %s, album_order = %s WHERE id = %s',
                (album_id, int(order), message_id))
    conn.commit()
    conn.close()
    return True


def get_album_messages(album_id, user_id=None):
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('''SELECT * FROM messages WHERE album_id = %s
                   ORDER BY album_order ASC, id ASC''', (album_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def reorder_album(album_id, message_ids, user_id=None):
    """Сохраняет новый порядок фото в альбоме."""
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('SELECT id, sender_id FROM messages WHERE album_id = %s', (album_id,))
        rows = [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()
    by_id = {r['id']: r for r in rows}
    for i, mid in enumerate(message_ids):
        row = by_id.get(int(mid))
        # Переставлять может только автор альбома
        if not row:
            continue
        if user_id is not None and row['sender_id'] != user_id:
            continue
        by_id[int(mid)] = row
    saved = []
    for i, mid in enumerate(message_ids):
        mid = int(mid)
        if mid not in by_id:
            continue
        set_message_album(mid, album_id, i)
        saved.append(mid)
    return saved


# ---------- ЭКСПОРТ ДАННЫХ АККАУНТА ----------
def export_user_data(user_id):
    """Полная выгрузка аккаунта в структуру, пригодную для json.dump."""
    conn = get_db()
    cur = dict_cursor(conn)
    out = {'format': 'sputnik-account-export', 'version': 1, 'profile': {}, 'chats': [],
           'groups': [], 'channels': [], 'contacts': [], 'favorites': [],
           'stickers': [], 'settings': {}, 'premium': {}, 'counts': {}}

    cur.execute('''SELECT id, unique_id, phone, username, display_name, bio, birthday,
                          avatar, created_at, last_seen, email,
                          privacy_last_seen, privacy_photo, privacy_forward,
                          privacy_calls, privacy_messages,
                          theme, font_size, bubble_radius, font_family,
                          my_message_color, their_message_color, wallpaper, wallpaper_image,
                          banner_color, banner_image, premium_until, premium_emoji,
                          (premium_until IS NOT NULL AND premium_until > datetime('now')) AS is_premium,
                          registration_complete
                   FROM users WHERE id = %s''', (user_id,))
    u = cur.fetchone()
    if not u:
        conn.close()
        return None
    u = dict(u)
    u.pop('password', None)
    out['profile'] = u
    out['settings'] = get_user_settings(user_id) or {}
    out['premium'] = get_user_premium(user_id) or {}

    cur.execute('''SELECT c.id, c.user1_id, c.user2_id, c.created_at,
                          u1.username AS u1_username, u1.display_name AS u1_name, u1.unique_id AS u1_uid,
                          u2.username AS u2_username, u2.display_name AS u2_name, u2.unique_id AS u2_uid
                   FROM chats c
                   LEFT JOIN users u1 ON u1.id = c.user1_id
                   LEFT JOIN users u2 ON u2.id = c.user2_id
                   WHERE c.user1_id = %s OR c.user2_id = %s''', (user_id, user_id))
    for r in cur.fetchall():
        r = dict(r)
        me_is_1 = r['user1_id'] == user_id
        other_id = r['user2_id'] if me_is_1 else r['user1_id']
        other_name = r['u2_name'] if me_is_1 else r['u1_name']
        other_username = r['u2_username'] if me_is_1 else r['u1_username']
        msgs = get_messages(chat_id=r['id'], user_id=user_id, limit=100000)
        out['chats'].append({
            'chat_id': r['id'],
            'chat_type': 'personal',
            'title': other_name or other_username or 'Избранное',
            'other_username': other_username,
            'other_unique_id': (r['u2_uid'] if me_is_1 else r['u1_uid']),
            'created_at': r['created_at'],
            'messages': [dict(m) for m in msgs],
        })

    cur.execute('''SELECT g.id, g.name, g.username, g.created_at,
                          (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS members
                   FROM groups g JOIN group_members gm ON gm.group_id = g.id
                   WHERE gm.user_id = %s GROUP BY g.id''', (user_id,))
    for r in cur.fetchall():
        r = dict(r)
        msgs = get_messages(group_id=r['id'], user_id=user_id, limit=100000)
        out['groups'].append({
            'group_id': r['id'], 'title': r['name'], 'username': r['username'],
            'members': r['members'], 'created_at': r['created_at'],
            'messages': [dict(m) for m in msgs],
        })

    cur.execute('''SELECT ch.id, ch.name, ch.username, ch.created_at,
                          (SELECT COUNT(*) FROM channel_subscribers cs WHERE cs.channel_id = ch.id) AS subs
                   FROM channels ch JOIN channel_subscribers cs ON cs.channel_id = ch.id
                   WHERE cs.user_id = %s GROUP BY ch.id''', (user_id,))
    for r in cur.fetchall():
        r = dict(r)
        msgs = get_messages(channel_id=r['id'], user_id=user_id, limit=100000)
        out['channels'].append({
            'channel_id': r['id'], 'title': r['name'], 'username': r['username'],
            'subscribers': r['subs'], 'created_at': r['created_at'],
            'messages': [dict(m) for m in msgs],
        })

    cur.execute('''SELECT cu.id AS contact_id, cu.username, cu.unique_id, cu.display_name, cu.phone
                   FROM contacts c JOIN users cu ON cu.id = c.contact_id
                   WHERE c.user_id = %s''', (user_id,))
    out['contacts'] = [dict(r) for r in cur.fetchall()]

    cur.execute('SELECT * FROM favorites WHERE user_id = %s ORDER BY id', (user_id,))
    out['favorites'] = [dict(r) for r in cur.fetchall()]

    cur.execute('SELECT * FROM stickers WHERE user_id = %s ORDER BY id', (user_id,))
    out['stickers'] = [dict(r) for r in cur.fetchall()]

    out['counts'] = {
        'chats': len(out['chats']),
        'groups': len(out['groups']),
        'channels': len(out['channels']),
        'messages': sum(len(c['messages']) for c in out['chats'])
                     + sum(len(g['messages']) for g in out['groups'])
                     + sum(len(c['messages']) for c in out['channels']),
        'contacts': len(out['contacts']),
        'favorites': len(out['favorites']),
        'stickers': len(out['stickers']),
    }
    conn.close()
    return out


# ---------- ИМПОРТ КОНТАКТОВ ----------
def add_contact_with_name(user_id, contact_user_id, name=None):
    """Добавляет пользователя в контакты (с сохранением локального имени)."""
    if user_id == contact_user_id:
        return False, 'Нельзя добавить себя'
    conn = get_db()
    cur = dict_cursor(conn)
    try:
        cur.execute('SELECT id FROM users WHERE id = %s AND registration_complete = TRUE',
                    (contact_user_id,))
        if not cur.fetchone():
            return False, 'Аккаунт не найден'
        cur.execute('''INSERT INTO contacts (user_id, contact_id) VALUES (%s, %s)
                       ON CONFLICT(user_id, contact_id) DO NOTHING''', (user_id, contact_user_id))
        if name:
            cur.execute('''INSERT INTO contact_names (user_id, contact_id, name) VALUES (%s, %s, %s)
                           ON CONFLICT(user_id, contact_id) DO UPDATE SET name = excluded.name''',
                        (user_id, contact_user_id, name))
        conn.commit()
        return True, 'Контакт добавлен'
    finally:
        conn.close()


def find_users_by_phones(phones, exclude_user_id=None):
    """Ищет зарегистрированных пользователей по списку номеров телефона."""
    if not phones:
        return []
    clean = []
    for p in phones:
        digits = re.sub(r'\D', '', str(p or ''))
        if len(digits) >= 7:
            clean.append('+' + digits)
    if not clean:
        return []
    conn = get_db()
    cur = dict_cursor(conn)
    out = []
    chunk = 400
    for i in range(0, len(clean), chunk):
        part = clean[i:i + chunk]
        marks = ', '.join(['%s'] * len(part))
        sql = ('SELECT id, unique_id, phone, username, display_name, avatar FROM users '
               'WHERE phone IN (%s) AND registration_complete = TRUE AND is_deleted = FALSE' % marks)
        params = list(part)
        if exclude_user_id:
            sql += ' AND id != %s'
            params.append(exclude_user_id)
        cur.execute(sql, tuple(params))
        for r in cur.fetchall():
            out.append(dict(r))
    conn.close()
    return out


if __name__ == '__main__':
    init_db()