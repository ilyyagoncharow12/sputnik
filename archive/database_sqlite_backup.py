import sqlite3
import hashlib
import os
from datetime import datetime, timedelta
from PIL import Image

DB_PATH = 'sputnik.db'

def get_moscow_time():
    """Возвращает текущее московское время (UTC+3)"""
    return (datetime.utcnow() + timedelta(hours=3)).strftime('%Y-%m-%d %H:%M:%S')

def get_moscow_datetime():
    """Возвращает объект datetime с московским временем"""
    return datetime.utcnow() + timedelta(hours=3)


def get_db():
    """Возвращает соединение с БД с row_factory=sqlite3.Row"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Инициализация базы данных: создание всех таблиц"""
    conn = get_db()
    cursor = conn.cursor()

    # Таблица users
    cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                unique_id INTEGER UNIQUE NOT NULL,
                phone TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE,
                display_name TEXT,
                password TEXT NOT NULL,
                avatar TEXT,
                bio TEXT,
                birthday TEXT,
                last_seen DATETIME,
                created_at DATETIME DEFAULT (datetime('now', '+3 hours')),
                privacy_last_seen TEXT DEFAULT 'everyone',
                privacy_photo TEXT DEFAULT 'everyone',
                privacy_forward TEXT DEFAULT 'everyone',
                privacy_calls TEXT DEFAULT 'everyone',
                privacy_messages TEXT DEFAULT 'everyone',
                theme TEXT DEFAULT 'light',
                font_size INTEGER DEFAULT 14,
                bubble_radius INTEGER DEFAULT 18,
                font_family TEXT DEFAULT "'Unbounded', cursive",
                my_message_color TEXT DEFAULT '#667eea',
                their_message_color TEXT DEFAULT '#f3f4f6',
                wallpaper TEXT DEFAULT '',
                wallpaper_image TEXT,
                email TEXT,
                is_deleted BOOLEAN DEFAULT 0,
                deleted_at DATETIME,
                registration_complete BOOLEAN DEFAULT 0
            )
        ''')

    # Таблица chats
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user1_id INTEGER NOT NULL,
            user2_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            UNIQUE(user1_id, user2_id)
        )
    ''')

    # В init_db() добавьте эту таблицу:
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS linked_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            master_user_id INTEGER NOT NULL,
            linked_user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            UNIQUE(master_user_id, linked_user_id),
            FOREIGN KEY (master_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (linked_user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')


    # Таблица messages
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER,
            group_id INTEGER,
            channel_id INTEGER,
            sender_id INTEGER NOT NULL,
            content TEXT,
            file_type TEXT,
            file_path TEXT,
            file_name TEXT,
            file_size INTEGER,
            is_read BOOLEAN DEFAULT 0,
            is_deleted BOOLEAN DEFAULT 0,
            deleted_for_all BOOLEAN DEFAULT 0,
            edited_at DATETIME,
            created_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            reply_to_id INTEGER,
            forwarded_from_id INTEGER,
            forwarded_from_user_id INTEGER,
            forwarded_from_username TEXT,
            forwarded_from_display_name TEXT
        )
    ''')

    # Таблица contacts
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            contact_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            UNIQUE(user_id, contact_id)
        )
    ''')

    # Таблица contact_names
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contact_names (
            user_id INTEGER NOT NULL,
            contact_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            PRIMARY KEY (user_id, contact_id)
        )
    ''')

    # Таблица favorites
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            file_type TEXT,
            file_path TEXT,
            file_name TEXT,
            note TEXT,
            created_at DATETIME DEFAULT (datetime('now', '+3 hours'))
        )
    ''')




    # Таблица calls
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS calls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            caller_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            call_type TEXT,
            status TEXT,
            duration INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT (datetime('now', '+3 hours'))
        )
    ''')

    # Таблица папок чатов - ДОБАВИТЬ
    cursor.execute('''
            CREATE TABLE IF NOT EXISTS chat_folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT (datetime('now', '+3 hours')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ''')

    # Таблица чатов в папках - ДОБАВИТЬ
    # В init_db() замените создание таблицы folder_chats на:
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS folder_chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_id INTEGER NOT NULL,
            chat_id INTEGER NOT NULL,
            chat_type TEXT NOT NULL,
            chat_name TEXT,
            chat_avatar TEXT,
            other_user_id INTEGER,
            created_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            FOREIGN KEY (folder_id) REFERENCES chat_folders(id) ON DELETE CASCADE
        )
    ''')

    # Таблица video_calls
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS video_calls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT UNIQUE NOT NULL,
            creator_id INTEGER NOT NULL,
            call_type TEXT DEFAULT 'video',
            status TEXT DEFAULT 'active',
            started_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            ended_at DATETIME,
            duration INTEGER DEFAULT 0,
            participant_count INTEGER DEFAULT 1
        )
    ''')

    # Таблица video_call_participants
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS video_call_participants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            call_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            joined_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            left_at DATETIME,
            audio_only BOOLEAN DEFAULT 0,
            screensharing BOOLEAN DEFAULT 0
        )
    ''')

    # Таблица user_sessions
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            session_token TEXT UNIQUE NOT NULL,
            device TEXT,
            ip TEXT,
            location TEXT,
            created_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            last_active DATETIME
        )
    ''')

    # Таблица stories
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS stories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            file_type TEXT,
            file_path TEXT,
            caption TEXT,
            music TEXT,
            created_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            expires_at DATETIME
        )
    ''')

    # Таблица story_interactions
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS story_interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            story_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            type TEXT,
            reply_text TEXT,
            created_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            UNIQUE(story_id, user_id, type)
        )
    ''')

    # Таблица story_privacy
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS story_privacy (
            story_id INTEGER PRIMARY KEY,
            privacy_type TEXT,
            FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
        )
    ''')

    # Таблица story_allowed_users
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS story_allowed_users (
            story_id INTEGER,
            user_id INTEGER,
            PRIMARY KEY (story_id, user_id)
        )
    ''')

    # Таблица pinned_chats
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS pinned_chats (
            user_id INTEGER NOT NULL,
            chat_id INTEGER NOT NULL,
            pinned_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            PRIMARY KEY (user_id, chat_id)
        )
    ''')

    # Таблица groups
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            owner_id INTEGER NOT NULL,
            is_public BOOLEAN DEFAULT 1,
            invite_link TEXT UNIQUE,
            avatar TEXT,
            created_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            FOREIGN KEY (owner_id) REFERENCES users(id)
        )
    ''')

    # Таблица group_members
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS group_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT DEFAULT 'member',
            joined_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            UNIQUE(group_id, user_id),
            FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')

    # Таблица group_permissions
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS group_permissions (
            group_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            can_send_messages BOOLEAN DEFAULT 1,
            can_send_media BOOLEAN DEFAULT 1,
            can_add_members BOOLEAN DEFAULT 0,
            can_pin_messages BOOLEAN DEFAULT 0,
            can_change_info BOOLEAN DEFAULT 0,
            can_delete_messages BOOLEAN DEFAULT 0,
            can_ban_users BOOLEAN DEFAULT 0,
            PRIMARY KEY (group_id, role),
            FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
        )
    ''')

    # Таблица channels
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            owner_id INTEGER NOT NULL,
            is_public BOOLEAN DEFAULT 1,
            invite_link TEXT UNIQUE,
            avatar TEXT,
            created_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            FOREIGN KEY (owner_id) REFERENCES users(id)
        )
    ''')

    # Таблица channel_subscribers
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS channel_subscribers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            subscribed_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            UNIQUE(channel_id, user_id),
            FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')

    # Таблица channel_admins
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS channel_admins (
            channel_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            can_post BOOLEAN DEFAULT 1,
            can_edit BOOLEAN DEFAULT 0,
            can_delete BOOLEAN DEFAULT 0,
            can_add_admins BOOLEAN DEFAULT 0,
            added_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            PRIMARY KEY (channel_id, user_id),
            FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')

    # Таблица message_reactions
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS message_reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            reaction TEXT NOT NULL,
            created_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            UNIQUE(message_id, user_id, reaction)
        )
    ''')

    # Таблица recent_searches
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS recent_searches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            search_query TEXT NOT NULL,
            search_type TEXT,
            created_at DATETIME DEFAULT (datetime('now', '+3 hours'))
        )
    ''')

    # Таблица preloaded_avatars
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS preloaded_avatars (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT UNIQUE NOT NULL,
            display_name TEXT,
            category TEXT DEFAULT 'default'
        )
    ''')

    # Таблица blocked_users
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS blocked_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            blocked_user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            UNIQUE(user_id, blocked_user_id)
        )
    ''')


    # Таблица story_reactions
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS story_reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            story_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            reaction TEXT NOT NULL,
            created_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            UNIQUE(story_id, user_id, reaction)
        )
    ''')

    # Таблица story_views
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS story_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            story_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            viewed_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            UNIQUE(story_id, user_id)
        )
    ''')

    # В функции init_db() добавьте:
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS chat_folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS folder_chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_id INTEGER NOT NULL,
            chat_id INTEGER NOT NULL,
            chat_type TEXT NOT NULL,
            chat_name TEXT,
            chat_avatar TEXT,
            created_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            FOREIGN KEY (folder_id) REFERENCES chat_folders(id) ON DELETE CASCADE
        )
    ''')




    # Индексы
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_blocked_users_user_id ON blocked_users(user_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_group_id ON messages(group_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_users_unique_id ON users(unique_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_channel_subscribers_user_id ON channel_subscribers(user_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_stories_user_id ON stories(user_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON stories(expires_at)')

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

    # Добавляем новые колонки, если их нет
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN banner_color TEXT DEFAULT '#2b8d8d'")
    except sqlite3.OperationalError:
        pass  # Колонка уже существует

    try:
        cursor.execute("ALTER TABLE users ADD COLUMN banner_image TEXT")
    except sqlite3.OperationalError:
        pass

    # Таблица для плейлиста
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_playlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            artist TEXT,
            file_path TEXT NOT NULL,
            duration INTEGER,
            created_at DATETIME DEFAULT (datetime('now', '+3 hours')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')

    # Таблица для прикрепленного канала
    cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_attached_channel (
                user_id INTEGER PRIMARY KEY,
                channel_id INTEGER NOT NULL,
                attached_at DATETIME DEFAULT (datetime('now', '+3 hours')),
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (channel_id) REFERENCES channels(id)
            )
        ''')

    for ava in default_avatars:
        cursor.execute('''
            INSERT OR IGNORE INTO preloaded_avatars (filename, display_name, category)
            VALUES (?, ?, ?)
        ''', ava)

    # Начальные права для групп
    cursor.execute('''
        INSERT OR IGNORE INTO group_permissions (group_id, role, can_send_messages, can_send_media, 
            can_add_members, can_pin_messages, can_change_info, can_delete_messages, can_ban_users)
        SELECT id, 'owner', 1, 1, 1, 1, 1, 1, 1 FROM groups
    ''')

    cursor.execute('''
        INSERT OR IGNORE INTO group_permissions (group_id, role, can_send_messages, can_send_media, 
            can_add_members, can_pin_messages, can_change_info, can_delete_messages, can_ban_users)
        SELECT id, 'admin', 1, 1, 1, 1, 1, 1, 1 FROM groups
    ''')

    cursor.execute('''
        INSERT OR IGNORE INTO group_permissions (group_id, role, can_send_messages, can_send_media, 
            can_add_members, can_pin_messages, can_change_info, can_delete_messages, can_ban_users)
        SELECT id, 'member', 1, 1, 0, 0, 0, 0, 0 FROM groups
    ''')

    conn.commit()
    conn.close()


# ----- ФУНКЦИИ БЛОКИРОВКИ -----
def block_user(user_id, blocked_user_id):
    """Блокирует пользователя"""
    if user_id == blocked_user_id:
        return False
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT OR IGNORE INTO blocked_users (user_id, blocked_user_id)
            VALUES (?, ?)
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
    cursor = conn.cursor()
    cursor.execute('''
        DELETE FROM blocked_users 
        WHERE user_id = ? AND blocked_user_id = ?
    ''', (user_id, blocked_user_id))
    conn.commit()
    conn.close()
    return True


def is_user_blocked(user_id, blocked_user_id):
    """Проверяет, заблокирован ли пользователь"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id FROM blocked_users 
        WHERE user_id = ? AND blocked_user_id = ?
    ''', (user_id, blocked_user_id))
    result = cursor.fetchone()
    conn.close()
    return result is not None


def get_blocked_users(user_id):
    """Получает список заблокированных пользователей"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT u.id, u.unique_id, u.username, u.display_name, u.avatar
        FROM blocked_users bu
        JOIN users u ON bu.blocked_user_id = u.id
        WHERE bu.user_id = ?
    ''', (user_id,))
    blocked = cursor.fetchall()
    conn.close()
    return blocked


def get_user_profile(user_id, current_user_id):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT id, unique_id, username, display_name, phone, avatar, bio, birthday, 
               last_seen, is_deleted, banner_color, banner_image
        FROM users 
        WHERE id = ? AND is_deleted = 0
    ''', (user_id,))
    user = cursor.fetchone()
    conn.close()

    if not user:
        return None

    user_dict = dict(user)
    user_dict['is_blocked_by_me'] = is_user_blocked(current_user_id, user_id)
    user_dict['has_blocked_me'] = is_user_blocked(user_id, current_user_id)

    return user_dict


def clear_chat(chat_id=None, group_id=None, channel_id=None):
    """Очищает историю сообщений в чате"""
    conn = get_db()
    cursor = conn.cursor()

    if chat_id:
        cursor.execute('UPDATE messages SET is_deleted = 1 WHERE chat_id = ?', (chat_id,))
    elif group_id:
        cursor.execute('UPDATE messages SET is_deleted = 1 WHERE group_id = ?', (group_id,))
    elif channel_id:
        cursor.execute('UPDATE messages SET is_deleted = 1 WHERE channel_id = ?', (channel_id,))

    conn.commit()
    conn.close()
    return True


def reply_to_story(story_id, user_id, reply_text):
    """Отправляет ответ на историю"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT user_id FROM stories WHERE id = ?', (story_id,))
    story = cursor.fetchone()

    if story:
        chat_id = get_or_create_chat(user_id, story['user_id'])
        message_content = f"📱 Ответ на историю: {reply_text}"
        send_message(chat_id=chat_id, sender_id=user_id, content=message_content)
        return chat_id

    conn.close()
    return None


# ----- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ -----
def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()


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
    cursor = conn.cursor()
    cursor.execute('SELECT MAX(unique_id) as max_id FROM users')
    result = cursor.fetchone()
    conn.close()

    if result and result['max_id'] and result['max_id'] >= 1000000:
        return result['max_id'] + 1
    else:
        return 1000000


# ----- ПОЛЬЗОВАТЕЛИ -----
def create_user_initial(phone, password, email=None):
    """Первый этап регистрации"""
    conn = get_db()
    cursor = conn.cursor()
    try:
        unique_id = generate_unique_id()
        temp_username = f"user_{phone.replace('+', '').replace(' ', '')[:8]}"
        cursor.execute('''
            INSERT INTO users (unique_id, phone, username, display_name, password, last_seen, email, registration_complete)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        ''', (unique_id, phone, temp_username, temp_username, hash_password(password), get_moscow_time(), email))
        conn.commit()
        user_id = cursor.lastrowid

        cursor.execute('INSERT INTO chats (user1_id, user2_id) VALUES (?, ?)', (user_id, user_id))
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
    cursor = conn.cursor()
    try:
        cursor.execute('''
            UPDATE users 
            SET username = ?, display_name = ?, avatar = ?, registration_complete = 1
            WHERE id = ?
        ''', (username, display_name or username, avatar, user_id))

        # ===== ВАЖНО: Создаем папку "Все чаты" для нового пользователя =====
        cursor.execute('''
            INSERT OR IGNORE INTO chat_folders (user_id, name, sort_order)
            VALUES (?, 'Все чаты', 0)
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
    cursor = conn.cursor()
    cursor.execute('SELECT id, registration_complete FROM users WHERE phone = ? AND is_deleted = 0', (phone,))
    user = cursor.fetchone()
    conn.close()
    return user


def get_user_by_id(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE id = ? AND is_deleted = 0', (user_id,))
    user = cursor.fetchone()
    conn.close()
    return user


def get_user_by_unique_id(unique_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE unique_id = ? AND is_deleted = 0', (unique_id,))
    user = cursor.fetchone()
    conn.close()
    return user


def get_user_by_username(username):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE username = ? AND is_deleted = 0', (username,))
    user = cursor.fetchone()
    conn.close()
    return user


def get_user_by_phone(phone):
    import re
    conn = get_db()
    cursor = conn.cursor()
    normalized = re.sub(r'\s+', '', phone)
    cursor.execute('SELECT * FROM users WHERE REPLACE(phone, " ", "") = ? AND is_deleted = 0', (normalized,))
    user = cursor.fetchone()
    if not user:
        cursor.execute('SELECT * FROM users WHERE phone = ? AND is_deleted = 0', (phone,))
        user = cursor.fetchone()
    conn.close()
    return user


def verify_user(phone, password):
    user = get_user_by_phone(phone)
    if user and user['password'] == hash_password(password):
        return user
    return None


def update_last_seen(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE users SET last_seen = ? WHERE id = ?', (get_moscow_time(), user_id))
    conn.commit()
    conn.close()





def update_user_settings(user_id, **kwargs):
    conn = get_db()
    cursor = conn.cursor()
    for key, value in kwargs.items():
        if value is not None:
            cursor.execute(f'UPDATE users SET {key} = ? WHERE id = ?', (value, user_id))
    conn.commit()
    conn.close()


def delete_user_account(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT username FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()

    if user:
        new_username = f"deleted_{user['username']}_{get_moscow_datetime().strftime('%Y%m%d%H%M%S')}"
        cursor.execute('''
            UPDATE users SET 
                is_deleted = 1,
                deleted_at = ?,
                username = ?,
                display_name = 'Удалённый аккаунт',
                avatar = 'static/avatar-swg/deleted.png',
                bio = NULL,
                phone = ?,
                password = ?
            WHERE id = ?
        ''', (get_moscow_time(), new_username, f"deleted_{user_id}", hash_password("deleted"), user_id))
        conn.commit()
    conn.close()
    return True


def check_username_available(username, current_user_id=None):
    conn = get_db()
    cursor = conn.cursor()

    if current_user_id:
        cursor.execute('SELECT id FROM users WHERE username = ? AND id != ? AND is_deleted = 0',
                       (username, current_user_id))
    else:
        cursor.execute('SELECT id FROM users WHERE username = ? AND is_deleted = 0', (username,))

    user = cursor.fetchone()
    conn.close()
    return user is None


# ----- ПОИСК (ПРОСТОЙ) -----
def search_users(query, current_user_id):
    """Простой поиск только по телефону или username"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, unique_id, username, display_name, phone, avatar, bio, last_seen
        FROM users
        WHERE (username = ? OR phone = ?) 
          AND id != ? 
          AND is_deleted = 0
          AND registration_complete = 1
        LIMIT 20
    ''', (query, query, current_user_id))
    users = cursor.fetchall()
    conn.close()
    return users


# ----- ГРУППЫ -----
def create_group(name, owner_id, description=None, is_public=True, avatar=None):
    conn = get_db()
    cursor = conn.cursor()
    try:
        import secrets
        invite_link = secrets.token_urlsafe(16)

        cursor.execute('''
            INSERT INTO groups (name, description, owner_id, is_public, invite_link, avatar)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (name, description, owner_id, is_public, invite_link, avatar))

        group_id = cursor.lastrowid

        cursor.execute('''
            INSERT INTO group_members (group_id, user_id, role)
            VALUES (?, ?, 'owner')
        ''', (group_id, owner_id))

        # Добавляем права для owner
        cursor.execute('''
            INSERT INTO group_permissions (group_id, role, can_send_messages, can_send_media, 
                can_add_members, can_pin_messages, can_change_info, can_delete_messages, can_ban_users)
            VALUES (?, 'owner', 1, 1, 1, 1, 1, 1, 1)
        ''', (group_id,))

        cursor.execute('''
            INSERT INTO group_permissions (group_id, role, can_send_messages, can_send_media, 
                can_add_members, can_pin_messages, can_change_info, can_delete_messages, can_ban_users)
            VALUES (?, 'admin', 1, 1, 1, 1, 1, 1, 1)
        ''', (group_id,))

        cursor.execute('''
            INSERT INTO group_permissions (group_id, role, can_send_messages, can_send_media, 
                can_add_members, can_pin_messages, can_change_info, can_delete_messages, can_ban_users)
            VALUES (?, 'member', 1, 1, 0, 0, 0, 0, 0)
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
    cursor = conn.cursor()
    cursor.execute('''
        SELECT g.*, u.username as owner_username, u.display_name as owner_display_name,
               (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
        FROM groups g
        JOIN users u ON g.owner_id = u.id
        WHERE g.id = ?
    ''', (group_id,))
    group = cursor.fetchone()
    conn.close()
    return group


def get_group_by_invite_link(invite_link):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM groups WHERE invite_link = ?', (invite_link,))
    group = cursor.fetchone()
    conn.close()
    return group


def get_user_groups(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT g.*, gm.role,
               (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
        FROM groups g
        JOIN group_members gm ON g.id = gm.group_id
        WHERE gm.user_id = ?
        ORDER BY g.created_at DESC
    ''', (user_id,))
    groups = cursor.fetchall()
    conn.close()
    return groups


def add_group_member(group_id, user_id, role='member'):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT OR IGNORE INTO group_members (group_id, user_id, role)
            VALUES (?, ?, ?)
        ''', (group_id, user_id, role))
        conn.commit()
        return True
    except:
        return False
    finally:
        conn.close()


def remove_group_member(group_id, user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM group_members WHERE group_id = ? AND user_id = ? AND role != "owner"',
                   (group_id, user_id))
    conn.commit()
    conn.close()
    return True


def get_group_members(group_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT u.id, u.username, u.display_name, u.avatar, u.last_seen, gm.role, gm.joined_at
        FROM group_members gm
        JOIN users u ON gm.user_id = u.id
        WHERE gm.group_id = ? AND u.is_deleted = 0
        ORDER BY 
            CASE gm.role 
                WHEN 'owner' THEN 1 
                WHEN 'admin' THEN 2 
                ELSE 3 
            END,
            gm.joined_at ASC
    ''', (group_id,))
    members = cursor.fetchall()
    conn.close()
    return members


def is_group_member(group_id, user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?', (group_id, user_id))
    member = cursor.fetchone()
    conn.close()
    return member['role'] if member else None


def update_group_member_role(group_id, user_id, new_role):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ? AND role != "owner"',
                   (new_role, group_id, user_id))
    conn.commit()
    conn.close()
    return True


def delete_group(group_id, user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT owner_id FROM groups WHERE id = ?', (group_id,))
    group = cursor.fetchone()

    if group and group['owner_id'] == user_id:
        cursor.execute('DELETE FROM groups WHERE id = ?', (group_id,))
        conn.commit()
        conn.close()
        return True

    conn.close()
    return False


def update_group_settings(group_id, **kwargs):
    conn = get_db()
    cursor = conn.cursor()
    for key, value in kwargs.items():
        if value is not None:
            cursor.execute(f'UPDATE groups SET {key} = ? WHERE id = ?', (value, group_id))
    conn.commit()
    conn.close()


def get_group_permissions(group_id, role):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM group_permissions WHERE group_id = ? AND role = ?', (group_id, role))
    perms = cursor.fetchone()
    conn.close()
    return perms


def update_group_permissions(group_id, role, **kwargs):
    conn = get_db()
    cursor = conn.cursor()
    for key, value in kwargs.items():
        if value is not None:
            cursor.execute(f'UPDATE group_permissions SET {key} = ? WHERE group_id = ? AND role = ?',
                           (value, group_id, role))
    conn.commit()
    conn.close()


# ----- КАНАЛЫ -----
def create_channel(name, owner_id, description=None, is_public=True, avatar=None):
    conn = get_db()
    cursor = conn.cursor()
    try:
        import secrets
        invite_link = secrets.token_urlsafe(16)

        cursor.execute('''
            INSERT INTO channels (name, description, owner_id, is_public, invite_link, avatar)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (name, description, owner_id, is_public, invite_link, avatar))

        channel_id = cursor.lastrowid

        cursor.execute('''
            INSERT INTO channel_subscribers (channel_id, user_id)
            VALUES (?, ?)
        ''', (channel_id, owner_id))

        cursor.execute('''
            INSERT INTO channel_admins (channel_id, user_id, can_post, can_edit, can_delete, can_add_admins)
            VALUES (?, ?, 1, 1, 1, 1)
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
    cursor = conn.cursor()
    cursor.execute('''
        SELECT c.*, u.username as owner_username, u.display_name as owner_display_name,
               (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id = c.id) as subscriber_count
        FROM channels c
        JOIN users u ON c.owner_id = u.id
        WHERE c.id = ?
    ''', (channel_id,))
    channel = cursor.fetchone()
    conn.close()
    return channel


def get_channel_by_invite_link(invite_link):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM channels WHERE invite_link = ?', (invite_link,))
    channel = cursor.fetchone()
    conn.close()
    return channel


def get_user_channels(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT c.*,
               (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id = c.id) as subscriber_count
        FROM channels c
        JOIN channel_subscribers cs ON c.id = cs.channel_id
        WHERE cs.user_id = ?
        ORDER BY c.created_at DESC
    ''', (user_id,))
    channels = cursor.fetchall()
    conn.close()
    return channels


def subscribe_to_channel(channel_id, user_id):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT OR IGNORE INTO channel_subscribers (channel_id, user_id)
            VALUES (?, ?)
        ''', (channel_id, user_id))
        conn.commit()
        return True
    except:
        return False
    finally:
        conn.close()


def unsubscribe_from_channel(channel_id, user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM channel_subscribers WHERE channel_id = ? AND user_id = ?', (channel_id, user_id))
    conn.commit()
    conn.close()
    return True


def get_channel_subscribers(channel_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT u.id, u.username, u.display_name, u.avatar, cs.subscribed_at
        FROM channel_subscribers cs
        JOIN users u ON cs.user_id = u.id
        WHERE cs.channel_id = ? AND u.is_deleted = 0
        ORDER BY cs.subscribed_at DESC
    ''', (channel_id,))
    subscribers = cursor.fetchall()
    conn.close()
    return subscribers


def is_channel_subscriber(channel_id, user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM channel_subscribers WHERE channel_id = ? AND user_id = ?', (channel_id, user_id))
    subscriber = cursor.fetchone()
    conn.close()
    return subscriber is not None


def can_post_in_channel(channel_id, user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT owner_id FROM channels WHERE id = ?', (channel_id,))
    channel = cursor.fetchone()
    if channel and channel['owner_id'] == user_id:
        return True

    cursor.execute('SELECT can_post FROM channel_admins WHERE channel_id = ? AND user_id = ?', (channel_id, user_id))
    admin = cursor.fetchone()
    conn.close()
    return admin and admin['can_post']


def add_channel_admin(channel_id, user_id, **permissions):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT OR REPLACE INTO channel_admins (channel_id, user_id, can_post, can_edit, can_delete, can_add_admins)
            VALUES (?, ?, ?, ?, ?, ?)
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


def remove_channel_admin(channel_id, user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM channel_admins WHERE channel_id = ? AND user_id = ?', (channel_id, user_id))
    conn.commit()
    conn.close()
    return True


def delete_channel(channel_id, user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT owner_id FROM channels WHERE id = ?', (channel_id,))
    channel = cursor.fetchone()

    if channel and channel['owner_id'] == user_id:
        cursor.execute('DELETE FROM channels WHERE id = ?', (channel_id,))
        conn.commit()
        conn.close()
        return True

    conn.close()
    return False


def update_channel_settings(channel_id, **kwargs):
    conn = get_db()
    cursor = conn.cursor()
    for key, value in kwargs.items():
        if value is not None:
            cursor.execute(f'UPDATE channels SET {key} = ? WHERE id = ?', (value, channel_id))
    conn.commit()
    conn.close()


# ----- СООБЩЕНИЯ -----
def get_or_create_chat(user1_id, user2_id):
    if user1_id == user2_id:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM chats WHERE user1_id = ? AND user2_id = ?', (user1_id, user1_id))
        chat = cursor.fetchone()
        conn.close()
        return chat['id'] if chat else None

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        'SELECT id FROM chats WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)',
        (user1_id, user2_id, user2_id, user1_id)
    )
    chat = cursor.fetchone()
    if chat:
        conn.close()
        return chat['id']

    cursor.execute('INSERT INTO chats (user1_id, user2_id) VALUES (?, ?)', (user1_id, user2_id))
    conn.commit()
    chat_id = cursor.lastrowid
    conn.close()
    return chat_id


def get_user_chats(user_id):
    conn = get_db()
    cursor = conn.cursor()

    pinned_ids = get_pinned_chats(user_id)
    pinned_ids_str = ','.join(map(str, pinned_ids)) if pinned_ids else '0'

    cursor.execute(f'''
        SELECT 
            'personal' as chat_type,
            c.id as chat_id, 
            CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END as other_user_id,
            CASE WHEN c.user1_id = c.user2_id THEN 'Избранное'
                 ELSE COALESCE(cn.name, u.display_name, u.username) END as name,
            u.avatar,
            u.last_seen,
            m.content as last_message,
            m.file_type as last_file_type,
            m.created_at as last_message_time,
            (SELECT COUNT(*) FROM messages WHERE chat_id = c.id AND sender_id != ? AND is_read = 0 AND is_deleted = 0) as unread_count,
            c.id IN ({pinned_ids_str}) as is_pinned
        FROM chats c
        LEFT JOIN users u ON (CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END) = u.id
        LEFT JOIN contact_names cn ON cn.user_id = ? AND cn.contact_id = u.id
        LEFT JOIN messages m ON m.id = (SELECT id FROM messages WHERE chat_id = c.id AND is_deleted = 0 ORDER BY created_at DESC LIMIT 1)
        WHERE (c.user1_id = ? OR c.user2_id = ?) AND u.is_deleted = 0
    ''', (user_id, user_id, user_id, user_id, user_id, user_id))

    personal_chats = cursor.fetchall()

    cursor.execute('''
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
            0 as unread_count,
            0 as is_pinned,
            (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
        FROM groups g
        JOIN group_members gm ON g.id = gm.group_id
        LEFT JOIN messages m ON m.id = (SELECT id FROM messages WHERE group_id = g.id AND is_deleted = 0 ORDER BY created_at DESC LIMIT 1)
        WHERE gm.user_id = ?
        ORDER BY m.created_at DESC
    ''', (user_id,))

    group_chats = cursor.fetchall()

    cursor.execute('''
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
            0 as unread_count,
            0 as is_pinned,
            (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id = c.id) as subscriber_count
        FROM channels c
        JOIN channel_subscribers cs ON c.id = cs.channel_id
        LEFT JOIN messages m ON m.id = (SELECT id FROM messages WHERE channel_id = c.id AND is_deleted = 0 ORDER BY created_at DESC LIMIT 1)
        WHERE cs.user_id = ?
        ORDER BY m.created_at DESC
    ''', (user_id,))

    channel_chats = cursor.fetchall()

    conn.close()

    all_chats = []
    for chat in personal_chats:
        all_chats.append(dict(chat))
    for chat in group_chats:
        all_chats.append(dict(chat))
    for chat in channel_chats:
        all_chats.append(dict(chat))

    def get_sort_key(chat):
        time_val = chat.get('last_message_time')
        if time_val is None or time_val == '':
            return datetime.min
        if isinstance(time_val, str):
            try:
                return datetime.fromisoformat(time_val.replace('Z', '+00:00'))
            except:
                return datetime.min
        return time_val

    all_chats.sort(key=get_sort_key, reverse=True)
    return all_chats


def send_message(chat_id=None, group_id=None, channel_id=None, sender_id=None, content=None,
                 file_type=None, file_path=None, file_name=None, file_size=None,
                 reply_to_id=None, forwarded_from_id=None, forwarded_from_user_id=None,
                 forwarded_from_username=None, forwarded_from_display_name=None):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO messages (chat_id, group_id, channel_id, sender_id, content, file_type, file_path, file_name, file_size,
                             reply_to_id, forwarded_from_id, forwarded_from_user_id, forwarded_from_username, forwarded_from_display_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (chat_id, group_id, channel_id, sender_id, content, file_type, file_path, file_name, file_size,
          reply_to_id, forwarded_from_id, forwarded_from_user_id, forwarded_from_username, forwarded_from_display_name))
    conn.commit()
    message_id = cursor.lastrowid

    cursor.execute('''
        SELECT m.*, u.username, u.display_name, u.avatar 
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE m.id = ?
    ''', (message_id,))
    message = cursor.fetchone()
    conn.close()
    return message


def get_messages(chat_id=None, group_id=None, channel_id=None, user_id=None, limit=100, offset=0):
    conn = get_db()
    cursor = conn.cursor()

    if chat_id:
        cursor.execute('UPDATE messages SET is_read = 1 WHERE chat_id = ? AND sender_id != ?', (chat_id, user_id))

    query = '''
        SELECT m.*, u.username, u.display_name, u.avatar,
               r.content as reply_content, r.sender_id as reply_sender_id,
               ru.username as reply_username, ru.display_name as reply_display_name
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        LEFT JOIN messages r ON m.reply_to_id = r.id
        LEFT JOIN users ru ON r.sender_id = ru.id
        WHERE m.is_deleted = 0
    '''
    params = []

    if chat_id:
        query += ' AND m.chat_id = ?'
        params.append(chat_id)
    elif group_id:
        query += ' AND m.group_id = ?'
        params.append(group_id)
    elif channel_id:
        query += ' AND m.channel_id = ?'
        params.append(channel_id)

    query += ' ORDER BY m.created_at ASC LIMIT ? OFFSET ?'
    params.extend([limit, offset])

    cursor.execute(query, params)
    messages = cursor.fetchall()
    conn.commit()
    conn.close()
    return messages


def forward_message(message_id, to_chat_id=None, to_group_id=None, to_channel_id=None, sender_id=None):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM messages WHERE id = ?', (message_id,))
    msg = cursor.fetchone()

    if msg:
        forward_user = get_user_by_id(msg['sender_id'])
        cursor.execute('''
            INSERT INTO messages (chat_id, group_id, channel_id, sender_id, content, file_type, file_path, file_name, file_size,
                                 forwarded_from_id, forwarded_from_user_id, forwarded_from_username, forwarded_from_display_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (to_chat_id, to_group_id, to_channel_id, sender_id, msg['content'], msg['file_type'],
              msg['file_path'], msg['file_name'], msg['file_size'], msg['id'], msg['sender_id'],
              forward_user['username'] if forward_user else None,
              forward_user['display_name'] if forward_user else None))
        conn.commit()
        new_id = cursor.lastrowid
        conn.close()
        return new_id
    conn.close()
    return None


def edit_message(message_id, new_content):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?',
                   (new_content, get_moscow_time(), message_id))
    conn.commit()
    conn.close()


def delete_message(message_id, user_id, delete_for_all=False):
    conn = get_db()
    cursor = conn.cursor()
    if delete_for_all:
        cursor.execute('UPDATE messages SET is_deleted = 1, deleted_for_all = 1 WHERE id = ?', (message_id,))
    else:
        cursor.execute('UPDATE messages SET is_deleted = 1 WHERE id = ?', (message_id,))
    conn.commit()
    conn.close()


# ----- РЕАКЦИИ (максимум 3 на пользователя) -----
def add_reaction(message_id, user_id, reaction):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('SELECT reaction FROM message_reactions WHERE message_id = ? AND user_id = ?',
                       (message_id, user_id))
        user_reactions = [row['reaction'] for row in cursor.fetchall()]

        if reaction in user_reactions:
            cursor.execute('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND reaction = ?',
                           (message_id, user_id, reaction))
        else:
            if len(user_reactions) >= 3:
                cursor.execute('''
                    DELETE FROM message_reactions 
                    WHERE message_id = ? AND user_id = ? AND created_at = (
                        SELECT MIN(created_at) FROM message_reactions 
                        WHERE message_id = ? AND user_id = ?
                    )
                ''', (message_id, user_id, message_id, user_id))

            cursor.execute('''
                INSERT INTO message_reactions (message_id, user_id, reaction)
                VALUES (?, ?, ?)
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
    cursor = conn.cursor()
    cursor.execute('''
        SELECT reaction, COUNT(*) as count,
               GROUP_CONCAT(user_id) as user_ids
        FROM message_reactions
        WHERE message_id = ?
        GROUP BY reaction
    ''', (message_id,))
    reactions = cursor.fetchall()
    conn.close()
    return reactions


def get_user_reactions(message_id, user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT reaction FROM message_reactions WHERE message_id = ? AND user_id = ?', (message_id, user_id))
    reactions = [row['reaction'] for row in cursor.fetchall()]
    conn.close()
    return reactions


# ----- ИСТОРИИ -----
def create_story(user_id, file_type, file_path, caption, music_path, privacy, selected_users=None):
    expires_at = get_moscow_datetime() + timedelta(hours=24)
    expires_at_str = expires_at.strftime('%Y-%m-%d %H:%M:%S')
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO stories (user_id, file_type, file_path, caption, music, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (user_id, file_type, file_path, caption, music_path, expires_at_str))
    story_id = cursor.lastrowid
    cursor.execute('INSERT INTO story_privacy (story_id, privacy_type) VALUES (?, ?)', (story_id, privacy))
    if privacy == 'selected' and selected_users:
        for uid in selected_users:
            cursor.execute('INSERT INTO story_allowed_users (story_id, user_id) VALUES (?, ?)', (story_id, uid))
    conn.commit()
    conn.close()
    return story_id


def get_stories_for_user(viewer_id):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT s.*, u.username, u.display_name, u.avatar,
               (SELECT COUNT(*) FROM story_interactions WHERE story_id = s.id AND type='like') as likes_count,
               (SELECT COUNT(*) FROM story_interactions WHERE story_id = s.id AND type='view') as views_count,
               (SELECT COUNT(*) FROM story_reactions WHERE story_id = s.id) as reactions_count
        FROM stories s
        JOIN users u ON s.user_id = u.id
        WHERE s.expires_at > datetime('now', '+3 hours')
          AND u.is_deleted = 0
          AND (
              s.user_id = ?
              OR EXISTS (
                  SELECT 1 FROM story_privacy sp
                  WHERE sp.story_id = s.id AND sp.privacy_type = 'everyone'
              )
              OR EXISTS (
                  SELECT 1 FROM story_privacy sp
                  WHERE sp.story_id = s.id AND sp.privacy_type = 'contacts'
                  AND EXISTS (
                      SELECT 1 FROM contacts 
                      WHERE (user_id = ? AND contact_id = s.user_id) 
                      OR (user_id = s.user_id AND contact_id = ?)
                  )
              )
              OR EXISTS (
                  SELECT 1 FROM story_privacy sp
                  WHERE sp.story_id = s.id AND sp.privacy_type = 'selected'
                  AND EXISTS (
                      SELECT 1 FROM story_allowed_users 
                      WHERE story_id = s.id AND user_id = ?
                  )
              )
          )
        ORDER BY 
            CASE WHEN s.user_id = ? THEN 0 ELSE 1 END,
            s.created_at DESC
    ''', (viewer_id, viewer_id, viewer_id, viewer_id, viewer_id))

    stories = cursor.fetchall()
    conn.close()
    return stories


def add_story_interaction(story_id, user_id, interaction_type, reply_text=None):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO story_interactions (story_id, user_id, type, reply_text)
            VALUES (?, ?, ?, ?)
        ''', (story_id, user_id, interaction_type, reply_text))
        conn.commit()
    except sqlite3.IntegrityError:
        pass
    finally:
        conn.close()


def add_story_reaction(story_id, user_id, reaction):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT OR IGNORE INTO story_reactions (story_id, user_id, reaction)
            VALUES (?, ?, ?)
        ''', (story_id, user_id, reaction))
        conn.commit()
        return True
    except:
        return False
    finally:
        conn.close()


def add_story_view(story_id, user_id):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT OR IGNORE INTO story_views (story_id, user_id)
            VALUES (?, ?)
        ''', (story_id, user_id))
        conn.commit()
    except:
        pass
    finally:
        conn.close()


def get_story_reactions(story_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT reaction, COUNT(*) as count
        FROM story_reactions
        WHERE story_id = ?
        GROUP BY reaction
    ''', (story_id,))
    reactions = cursor.fetchall()
    conn.close()
    return reactions


def delete_expired_stories():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT file_path, music FROM stories WHERE expires_at < datetime("now", "+3 hours")')
    expired = cursor.fetchall()

    for story in expired:
        for path in [story['file_path'], story['music']]:
            if path:
                try:
                    full_path = os.path.join('static', path)
                    if os.path.exists(full_path):
                        os.remove(full_path)
                except:
                    pass

    cursor.execute('DELETE FROM stories WHERE expires_at < datetime("now", "+3 hours")')
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    return deleted


def get_story_viewers(story_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT u.id, u.username, u.display_name, u.avatar, sv.viewed_at
        FROM story_views sv
        JOIN users u ON sv.user_id = u.id
        WHERE sv.story_id = ?
        ORDER BY sv.viewed_at DESC
    ''', (story_id,))
    viewers = cursor.fetchall()
    conn.close()
    return viewers


def get_story_likes(story_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT u.id, u.username, u.display_name, u.avatar
        FROM story_interactions si
        JOIN users u ON si.user_id = u.id
        WHERE si.story_id = ? AND si.type = 'like'
    ''', (story_id,))
    likes = cursor.fetchall()
    conn.close()
    return likes


# ----- ЗАКРЕПЛЕННЫЕ ЧАТЫ -----
def pin_chat(user_id, chat_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('INSERT OR REPLACE INTO pinned_chats (user_id, chat_id, pinned_at) VALUES (?, ?, ?)',
                   (user_id, chat_id, get_moscow_time()))
    conn.commit()
    conn.close()


def unpin_chat(user_id, chat_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM pinned_chats WHERE user_id = ? AND chat_id = ?', (user_id, chat_id))
    conn.commit()
    conn.close()


def get_pinned_chats(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT chat_id FROM pinned_chats WHERE user_id = ? ORDER BY pinned_at DESC', (user_id,))
    pinned = [row['chat_id'] for row in cursor.fetchall()]
    conn.close()
    return pinned


# ----- ВИДЕОЗВОНКИ -----
def create_video_call(room_id, creator_id, call_type='video'):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO video_calls (room_id, creator_id, call_type)
        VALUES (?, ?, ?)
    ''', (room_id, creator_id, call_type))
    conn.commit()
    call_id = cursor.lastrowid

    cursor.execute('''
        INSERT INTO video_call_participants (call_id, user_id)
        VALUES (?, ?)
    ''', (call_id, creator_id))
    conn.commit()
    conn.close()
    return call_id


def add_video_call_participant(room_id, user_id, audio_only=False):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM video_calls WHERE room_id = ? AND status = "active"', (room_id,))
    call = cursor.fetchone()

    if call:
        cursor.execute('''
            INSERT OR IGNORE INTO video_call_participants (call_id, user_id, audio_only)
            VALUES (?, ?, ?)
        ''', (call['id'], user_id, audio_only))
        cursor.execute('''
            UPDATE video_calls 
            SET participant_count = (SELECT COUNT(*) FROM video_call_participants WHERE call_id = ? AND left_at IS NULL)
            WHERE id = ?
        ''', (call['id'], call['id']))
        conn.commit()

    conn.close()
    return call['id'] if call else None


def remove_video_call_participant(room_id, user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM video_calls WHERE room_id = ? AND status = "active"', (room_id,))
    call = cursor.fetchone()

    if call:
        cursor.execute('''
            UPDATE video_call_participants 
            SET left_at = ?
            WHERE call_id = ? AND user_id = ?
        ''', (get_moscow_time(), call['id'], user_id))
        conn.commit()
    conn.close()


def end_video_call(room_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id, started_at FROM video_calls WHERE room_id = ? AND status = "active"', (room_id,))
    call = cursor.fetchone()

    if call:
        duration = 0
        if call['started_at']:
            started = datetime.fromisoformat(call['started_at']) if isinstance(call['started_at'], str) else call[
                'started_at']
            duration = int((get_moscow_datetime() - started).total_seconds())

        cursor.execute('''
            UPDATE video_calls 
            SET status = "ended", ended_at = ?, duration = ?
            WHERE id = ?
        ''', (get_moscow_time(), duration, call['id']))
        cursor.execute('''
            UPDATE video_call_participants 
            SET left_at = ?
            WHERE call_id = ? AND left_at IS NULL
        ''', (get_moscow_time(), call['id']))
        conn.commit()
    conn.close()


def get_active_video_call(room_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM video_calls WHERE room_id = ? AND status = "active"', (room_id,))
    call = cursor.fetchone()
    conn.close()
    return call


def get_video_call_participants(room_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT u.id, u.username, u.display_name, u.avatar, vcp.audio_only, vcp.screensharing, vcp.joined_at
        FROM video_calls vc
        JOIN video_call_participants vcp ON vc.id = vcp.call_id
        JOIN users u ON vcp.user_id = u.id
        WHERE vc.room_id = ? AND vcp.left_at IS NULL
    ''', (room_id,))
    participants = cursor.fetchall()
    conn.close()
    return participants


# ----- ПОИСК -----
def search_groups(query, current_user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT g.*, 
               (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count,
               EXISTS(SELECT 1 FROM group_members WHERE group_id = g.id AND user_id = ?) as is_member
        FROM groups g
        WHERE g.name LIKE ? AND g.is_public = 1
        LIMIT 20
    ''', (current_user_id, f'%{query}%'))
    groups = cursor.fetchall()
    conn.close()
    return groups


def search_channels(query, current_user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT c.*, 
               (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id = c.id) as subscriber_count,
               EXISTS(SELECT 1 FROM channel_subscribers WHERE channel_id = c.id AND user_id = ?) as is_subscribed
        FROM channels c
        WHERE c.name LIKE ? AND c.is_public = 1
        LIMIT 20
    ''', (current_user_id, f'%{query}%'))
    channels = cursor.fetchall()
    conn.close()
    return channels


def add_recent_search(user_id, query, search_type='all'):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO recent_searches (user_id, search_query, search_type)
        VALUES (?, ?, ?)
    ''', (user_id, query, search_type))
    conn.commit()
    conn.close()


def get_recent_searches(user_id, limit=10):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT DISTINCT search_query, search_type, MAX(created_at) as last_searched
        FROM recent_searches
        WHERE user_id = ?
        GROUP BY search_query
        ORDER BY last_searched DESC
        LIMIT ?
    ''', (user_id, limit))
    searches = cursor.fetchall()
    conn.close()
    return searches


# ----- ЗВОНКИ -----
def add_call(caller_id, receiver_id, call_type, status):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO calls (caller_id, receiver_id, call_type, status)
        VALUES (?, ?, ?, ?)
    ''', (caller_id, receiver_id, call_type, status))
    conn.commit()
    call_id = cursor.lastrowid
    conn.close()
    return call_id


def update_call_status(call_id, status, duration=0):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE calls SET status = ?, duration = ? WHERE id = ?', (status, duration, call_id))
    conn.commit()
    conn.close()


def get_call_history(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT c.*,
               CASE WHEN c.caller_id = ? THEN u2.display_name ELSE u1.display_name END as contact_name,
               CASE WHEN c.caller_id = ? THEN u2.username ELSE u1.username END as contact_username,
               CASE WHEN c.caller_id = ? THEN u2.id ELSE u1.id END as contact_id,
               c.caller_id = ? as is_outgoing
        FROM calls c
        JOIN users u1 ON c.caller_id = u1.id
        JOIN users u2 ON c.receiver_id = u2.id
        WHERE (c.caller_id = ? OR c.receiver_id = ?)
          AND (c.caller_id != c.receiver_id)
        ORDER BY c.created_at DESC
        LIMIT 50
    ''', (user_id, user_id, user_id, user_id, user_id, user_id))
    calls = cursor.fetchall()
    conn.close()
    return calls


# ----- КОНТАКТЫ -----
def get_contacts(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT u.*, cn.name as custom_name 
        FROM contacts c
        JOIN users u ON c.contact_id = u.id
        LEFT JOIN contact_names cn ON cn.user_id = ? AND cn.contact_id = u.id
        WHERE c.user_id = ? AND u.is_deleted = 0
        ORDER BY COALESCE(cn.name, u.display_name, u.username)
    ''', (user_id, user_id))
    contacts = cursor.fetchall()
    conn.close()
    return contacts


def add_contact(user_id, contact_id):
    if user_id == contact_id:
        return False
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('INSERT INTO contacts (user_id, contact_id) VALUES (?, ?)', (user_id, contact_id))
        conn.commit()
        return True
    except:
        return False
    finally:
        conn.close()


def rename_contact(user_id, contact_id, new_name):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('INSERT OR REPLACE INTO contact_names (user_id, contact_id, name) VALUES (?, ?, ?)',
                   (user_id, contact_id, new_name))
    conn.commit()
    conn.close()


# ----- ИЗБРАННОЕ -----
def add_to_favorites(user_id, file_type, file_path, file_name, note=None):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO favorites (user_id, file_type, file_path, file_name, note)
        VALUES (?, ?, ?, ?, ?)
    ''', (user_id, file_type, file_path, file_name, note))
    conn.commit()
    fav_id = cursor.lastrowid
    conn.close()
    return fav_id


def get_favorites(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC', (user_id,))
    favorites = cursor.fetchall()
    conn.close()
    return favorites


# ----- СЕССИИ -----
def add_session(user_id, session_token, device, ip, location=''):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO user_sessions (user_id, session_token, device, ip, location, last_active)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (user_id, session_token, device, ip, location, get_moscow_time()))
    conn.commit()
    conn.close()


def get_user_sessions(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM user_sessions WHERE user_id = ? ORDER BY created_at DESC', (user_id,))
    sessions = cursor.fetchall()
    conn.close()
    return sessions


def delete_session(session_token):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM user_sessions WHERE session_token = ?', (session_token,))
    conn.commit()
    conn.close()


def delete_all_sessions_except(user_id, current_token):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM user_sessions WHERE user_id = ? AND session_token != ?', (user_id, current_token))
    conn.commit()
    conn.close()


# ----- ПРЕДЗАГРУЗОЧНЫЕ АВАТАРКИ -----
def get_preloaded_avatars():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM preloaded_avatars WHERE category != "system" ORDER BY id')
    avatars = cursor.fetchall()
    conn.close()
    return avatars


def get_deleted_avatar():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT filename FROM preloaded_avatars WHERE filename = "deleted.png"')
    avatar = cursor.fetchone()
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
        'banner_color': user['banner_color'] if 'banner_color' in user.keys() else None,
        'banner_image': user['banner_image'] if 'banner_image' in user.keys() else None
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
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE users SET
            privacy_last_seen = ?,
            privacy_photo = ?,
            privacy_forward = ?,
            privacy_calls = ?,
            privacy_messages = ?
        WHERE id = ?
    ''', (last_seen, profile_photo, forward_messages, calls, messages, user_id))
    conn.commit()
    conn.close()


# ----- НОВЫЕ ФУНКЦИИ ДЛЯ СТАТИСТИКИ ИСТОРИЙ И ПОИСКА В ЧАТЕ -----
def get_story_stats(story_id, user_id):
    """Получает полную статистику по истории (только для владельца)"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT user_id FROM stories WHERE id = ?', (story_id,))
    story = cursor.fetchone()

    if not story or story['user_id'] != user_id:
        conn.close()
        return None

    cursor.execute('''
        SELECT u.id, u.unique_id, u.username, u.display_name, u.avatar, sv.viewed_at
        FROM story_views sv
        JOIN users u ON sv.user_id = u.id
        WHERE sv.story_id = ?
        ORDER BY sv.viewed_at DESC
    ''', (story_id,))
    viewers = cursor.fetchall()

    cursor.execute('''
        SELECT u.id, u.unique_id, u.username, u.display_name, u.avatar, si.created_at
        FROM story_interactions si
        JOIN users u ON si.user_id = u.id
        WHERE si.story_id = ? AND si.type = 'like'
        ORDER BY si.created_at DESC
    ''', (story_id,))
    likes = cursor.fetchall()

    cursor.execute('''
        SELECT u.id, u.unique_id, u.username, u.display_name, u.avatar, sr.reaction, sr.created_at
        FROM story_reactions sr
        JOIN users u ON sr.user_id = u.id
        WHERE sr.story_id = ?
        ORDER BY sr.created_at DESC
    ''', (story_id,))
    reactions = cursor.fetchall()

    cursor.execute('''
        SELECT u.id, u.unique_id, u.username, u.display_name, u.avatar, si.reply_text, si.created_at
        FROM story_interactions si
        JOIN users u ON si.user_id = u.id
        WHERE si.story_id = ? AND si.type = 'reply' AND si.reply_text IS NOT NULL
        ORDER BY si.created_at DESC
    ''', (story_id,))
    replies = cursor.fetchall()

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
    cursor = conn.cursor()
    cursor.execute('''
        SELECT s.*, u.username, u.display_name, u.avatar
        FROM stories s
        JOIN users u ON s.user_id = u.id
        WHERE s.id = ?
    ''', (story_id,))
    story = cursor.fetchone()
    conn.close()
    return story


def search_messages_in_chat(chat_id, user_id, query):
    """Поиск сообщений в чате по ключевому слову"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT m.*, u.username, u.display_name, u.avatar,
               CASE WHEN m.sender_id = ? THEN 1 ELSE 0 END as is_mine
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE m.chat_id = ? 
          AND m.is_deleted = 0
          AND (m.content LIKE ? OR m.file_name LIKE ?)
        ORDER BY m.created_at DESC
        LIMIT 100
    ''', (user_id, chat_id, f'%{query}%', f'%{query}%'))
    messages = cursor.fetchall()
    conn.close()
    return  messages

#----CALL----

# database.py - добавьте в конец файла

def create_call_room(initiator_id, receiver_id, call_type='audio'):
    """Создает запись о звонке в БД"""
    conn = get_db()
    cursor = conn.cursor()
    room_id = f"call_{initiator_id}_{receiver_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"

    cursor.execute('''
        INSERT INTO calls (caller_id, receiver_id, call_type, status, created_at)
        VALUES (?, ?, ?, 'ringing', ?)
    ''', (initiator_id, receiver_id, call_type, get_moscow_time()))

    call_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return call_id, room_id


def update_call(call_id, status, duration=0):
    """Обновляет статус звонка"""
    conn = get_db()
    cursor = conn.cursor()
    if status == 'ended':
        cursor.execute('''
            UPDATE calls SET status = ?, duration = ? WHERE id = ?
        ''', (status, duration, call_id))
    else:
        cursor.execute('''
            UPDATE calls SET status = ? WHERE id = ?
        ''', (status, call_id))
    conn.commit()
    conn.close()

def add_call(caller_id, receiver_id, call_type, status):
    """Добавляет запись о звонке"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO calls (caller_id, receiver_id, call_type, status, created_at)
        VALUES (?, ?, ?, ?, ?)
    ''', (caller_id, receiver_id, call_type, status, get_moscow_time()))
    conn.commit()
    call_id = cursor.lastrowid
    conn.close()
    return call_id


# database.py - добавьте в конец файла

def get_contact_with_name(user_id, contact_id):
    """Получает контакт с пользовательским именем"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT u.*, cn.name as custom_name 
        FROM contacts c
        JOIN users u ON c.contact_id = u.id
        LEFT JOIN contact_names cn ON cn.user_id = ? AND cn.contact_id = u.id
        WHERE c.user_id = ? AND c.contact_id = ? AND u.is_deleted = 0
    ''', (user_id, user_id, contact_id))
    contact = cursor.fetchone()
    conn.close()
    return contact

def get_contact_name(user_id, contact_id):
    """Получает имя контакта (пользовательское или оригинальное)"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT name FROM contact_names WHERE user_id = ? AND contact_id = ?',
                   (user_id, contact_id))
    result = cursor.fetchone()
    conn.close()
    return result['name'] if result else None

def is_contact(user_id, contact_id):
    """Проверяет, есть ли пользователь в контактах"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM contacts WHERE user_id = ? AND contact_id = ?',
                   (user_id, contact_id))
    result = cursor.fetchone()
    conn.close()
    return result is not None

def remove_contact(user_id, contact_id):
    """Удаляет контакт"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM contacts WHERE user_id = ? AND contact_id = ?',
                   (user_id, contact_id))
    cursor.execute('DELETE FROM contact_names WHERE user_id = ? AND contact_id = ?',
                   (user_id, contact_id))
    conn.commit()
    conn.close()
    return True


# database.py - убедитесь что эти функции есть

def is_contact(user_id, contact_id):
    """Проверяет, есть ли пользователь в контактах"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM contacts WHERE user_id = ? AND contact_id = ?',
                   (user_id, contact_id))
    result = cursor.fetchone()
    conn.close()
    return result is not None

# database.py - проверьте эту функцию

def get_contacts(user_id):
    """Получает контакты пользователя с их именами"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT u.id, u.username, u.display_name, u.avatar, u.phone, u.unique_id,
               cn.name as custom_name 
        FROM contacts c
        JOIN users u ON c.contact_id = u.id
        LEFT JOIN contact_names cn ON cn.user_id = ? AND cn.contact_id = u.id
        WHERE c.user_id = ? AND u.is_deleted = 0
        ORDER BY COALESCE(cn.name, u.display_name, u.username)
    ''', (user_id, user_id))
    contacts = cursor.fetchall()
    conn.close()
    return contacts



def get_contact_name(user_id, contact_id):
    """Получает имя контакта (пользовательское или оригинальное)"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT name FROM contact_names WHERE user_id = ? AND contact_id = ?',
                   (user_id, contact_id))
    result = cursor.fetchone()
    conn.close()
    return result['name'] if result else None


def remove_contact(user_id, contact_id):
    """Удаляет контакт и его переименование"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM contacts WHERE user_id = ? AND contact_id = ?',
                   (user_id, contact_id))
    cursor.execute('DELETE FROM contact_names WHERE user_id = ? AND contact_id = ?',
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
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT OR IGNORE INTO linked_accounts (master_user_id, linked_user_id)
            VALUES (?, ?)
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
    cursor = conn.cursor()
    try:
        cursor.execute('''
            SELECT u.id, u.unique_id, u.username, u.display_name, u.avatar
            FROM linked_accounts la
            JOIN users u ON la.linked_user_id = u.id
            WHERE la.master_user_id = ? AND u.is_deleted = 0
            ORDER BY la.created_at DESC
        ''', (user_id,))
        accounts = cursor.fetchall()
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
    cursor = conn.cursor()
    try:
        cursor.execute('''
            SELECT master_user_id FROM linked_accounts 
            WHERE linked_user_id = ?
        ''', (user_id,))
        result = cursor.fetchone()
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

def create_folder(user_id, name, chat_ids):
    """Создает новую папку с чатами"""
    conn = get_db()
    cursor = conn.cursor()
    try:
        print(f"📁 create_folder: user_id={user_id}, name='{name}', chat_ids={chat_ids}")

        # Проверяем количество папок
        cursor.execute('SELECT COUNT(*) as count FROM chat_folders WHERE user_id = ?', (user_id,))
        count = cursor.fetchone()['count']
        if count >= 3:
            return {'success': False, 'error': 'limit_reached'}

        # Проверяем, существует ли уже папка с таким именем
        cursor.execute('SELECT id FROM chat_folders WHERE user_id = ? AND name = ?', (user_id, name))
        existing = cursor.fetchone()
        if existing:
            return {'success': False, 'error': 'folder_exists'}

        # Получаем максимальный порядок
        cursor.execute('SELECT MAX(sort_order) as max_order FROM chat_folders WHERE user_id = ?', (user_id,))
        max_order = cursor.fetchone()['max_order'] or 0
        new_order = max_order + 1

        # Вставляем папку
        cursor.execute('''
            INSERT INTO chat_folders (user_id, name, sort_order)
            VALUES (?, ?, ?)
        ''', (user_id, name, new_order))
        folder_id = cursor.lastrowid

        # Добавляем чаты в папку с полной информацией
        if chat_ids and len(chat_ids) > 0:
            for chat_id in chat_ids:
                # Упрощённый запрос с правильным количеством параметров
                cursor.execute('''
                    SELECT 
                        CASE 
                            WHEN EXISTS (SELECT 1 FROM chats WHERE id = ?) THEN 'personal'
                            WHEN EXISTS (SELECT 1 FROM groups WHERE id = ?) THEN 'group'
                            WHEN EXISTS (SELECT 1 FROM channels WHERE id = ?) THEN 'channel'
                            ELSE 'personal'
                        END as chat_type,
                        COALESCE(
                            (SELECT u.display_name FROM users u WHERE u.id = (
                                SELECT CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END FROM chats c WHERE c.id = ?
                            )),
                            (SELECT u.username FROM users u WHERE u.id = (
                                SELECT CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END FROM chats c WHERE c.id = ?
                            )),
                            (SELECT name FROM groups WHERE id = ?),
                            (SELECT name FROM channels WHERE id = ?),
                            'Чат'
                        ) as chat_name,
                        COALESCE(
                            (SELECT u.avatar FROM users u WHERE u.id = (
                                SELECT CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END FROM chats c WHERE c.id = ?
                            )),
                            (SELECT avatar FROM groups WHERE id = ?),
                            (SELECT avatar FROM channels WHERE id = ?),
                            ''
                        ) as chat_avatar,
                        (
                            SELECT CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END FROM chats c WHERE c.id = ?
                        ) as other_user_id
                ''', (chat_id, chat_id, chat_id, chat_id, chat_id, chat_id, chat_id, chat_id, chat_id, chat_id, chat_id,
                      chat_id, chat_id, chat_id, chat_id))
                chat_info = cursor.fetchone()

                chat_type = chat_info['chat_type'] if chat_info else 'personal'
                chat_name = chat_info['chat_name'] if chat_info else 'Чат'
                chat_avatar = chat_info['chat_avatar'] if chat_info else ''
                other_user_id = chat_info['other_user_id'] if chat_info else None

                cursor.execute('''
                    INSERT INTO folder_chats (folder_id, chat_id, chat_type, chat_name, chat_avatar, other_user_id)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (folder_id, chat_id, chat_type, chat_name, chat_avatar, other_user_id))

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
    cursor = conn.cursor()
    cursor.execute('UPDATE chat_folders SET name = ? WHERE id = ?', (new_name, folder_id))
    conn.commit()
    conn.close()
    return True


def get_user_folders(user_id):
    """Получает все папки пользователя с их чатами"""
    conn = get_db()
    cursor = conn.cursor()

    # Получаем папки
    cursor.execute('''
        SELECT id, name, sort_order, created_at
        FROM chat_folders
        WHERE user_id = ?
        ORDER BY sort_order ASC
    ''', (user_id,))
    folders = cursor.fetchall()

    result = []
    for folder in folders:
        folder_dict = dict(folder)
        # Получаем чаты в папке
        cursor.execute('''
            SELECT fc.chat_id, fc.chat_type, fc.chat_name, fc.chat_avatar, fc.other_user_id
            FROM folder_chats fc
            WHERE fc.folder_id = ?
            ORDER BY fc.id
        ''', (folder_dict['id'],))
        chats = cursor.fetchall()
        folder_dict['chats'] = [dict(chat) for chat in chats]
        folder_dict['is_default'] = (folder_dict['name'] == 'Все чаты' and folder_dict['sort_order'] == 0)
        result.append(folder_dict)

    conn.close()
    return result


def delete_folder(folder_id, user_id):
    """Удаляет папку (только не 'Все чаты')"""
    conn = get_db()
    cursor = conn.cursor()
    # Проверяем, не является ли папка дефолтной
    cursor.execute('SELECT name FROM chat_folders WHERE id = ? AND user_id = ?', (folder_id, user_id))
    folder = cursor.fetchone()
    if folder and folder['name'] == 'Все чаты':
        return False
    cursor.execute('DELETE FROM chat_folders WHERE id = ?', (folder_id,))
    conn.commit()
    conn.close()
    return True


def update_folder_chats(folder_id, chat_ids):
    """Обновляет список чатов в папке"""
    conn = get_db()
    cursor = conn.cursor()
    try:
        # Удаляем все текущие чаты
        cursor.execute('DELETE FROM folder_chats WHERE folder_id = ?', (folder_id,))

        # Добавляем новые чаты с полной информацией
        for chat_id in chat_ids:
            # Получаем информацию о чате
            cursor.execute('''
                SELECT 
                    CASE 
                        WHEN EXISTS (SELECT 1 FROM chats WHERE id = ?) THEN 'personal'
                        WHEN EXISTS (SELECT 1 FROM groups WHERE id = ?) THEN 'group'
                        WHEN EXISTS (SELECT 1 FROM channels WHERE id = ?) THEN 'channel'
                        ELSE 'personal'
                    END as chat_type,
                    COALESCE(
                        (SELECT u.display_name FROM users u WHERE u.id = (
                            SELECT CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END FROM chats c WHERE c.id = ?
                        )),
                        (SELECT u.username FROM users u WHERE u.id = (
                            SELECT CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END FROM chats c WHERE c.id = ?
                        )),
                        (SELECT name FROM groups WHERE id = ?),
                        (SELECT name FROM channels WHERE id = ?),
                        'Чат'
                    ) as chat_name,
                    COALESCE(
                        (SELECT u.avatar FROM users u WHERE u.id = (
                            SELECT CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END FROM chats c WHERE c.id = ?
                        )),
                        (SELECT avatar FROM groups WHERE id = ?),
                        (SELECT avatar FROM channels WHERE id = ?),
                        ''
                    ) as chat_avatar,
                    (
                        SELECT CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END FROM chats c WHERE c.id = ?
                    ) as other_user_id
            ''', (chat_id, chat_id, chat_id, chat_id, chat_id, chat_id, chat_id, chat_id, chat_id, chat_id, chat_id,
                  chat_id, chat_id, chat_id, chat_id))
            chat_info = cursor.fetchone()

            chat_type = chat_info['chat_type'] if chat_info else 'personal'
            chat_name = chat_info['chat_name'] if chat_info else 'Чат'
            chat_avatar = chat_info['chat_avatar'] if chat_info else ''
            other_user_id = chat_info['other_user_id'] if chat_info else None

            cursor.execute('''
                INSERT INTO folder_chats (folder_id, chat_id, chat_type, chat_name, chat_avatar, other_user_id)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (folder_id, chat_id, chat_type, chat_name, chat_avatar, other_user_id))

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
    cursor = conn.cursor()

    if chat_type == 'personal':
        cursor.execute('''
            SELECT 
                'personal' as chat_type,
                CASE WHEN c.user1_id = c.user2_id THEN 'Избранное'
                     ELSE COALESCE(u.display_name, u.username) END as chat_name,
                u.avatar as chat_avatar,
                CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END as other_user_id
            FROM chats c
            LEFT JOIN users u ON (CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END) = u.id
            WHERE c.id = ?
        ''', (chat_id, chat_id, chat_id))
    elif chat_type == 'group':
        cursor.execute('''
            SELECT 
                'group' as chat_type,
                name as chat_name,
                avatar as chat_avatar,
                NULL as other_user_id
            FROM groups
            WHERE id = ?
        ''', (chat_id,))
    elif chat_type == 'channel':
        cursor.execute('''
            SELECT 
                'channel' as chat_type,
                name as chat_name,
                avatar as chat_avatar,
                NULL as other_user_id
            FROM channels
            WHERE id = ?
        ''', (chat_id,))

    info = cursor.fetchone()
    conn.close()
    return info


def get_folder_accessible_chats(user_id):
    """Возвращает все доступные чаты для добавления в папки"""
    conn = get_db()
    cursor = conn.cursor()

    # Личные чаты
    cursor.execute('''
        SELECT 
            c.id as chat_id,
            'personal' as chat_type,
            CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END as other_user_id,
            CASE WHEN c.user1_id = c.user2_id THEN 'Избранное'
                 ELSE COALESCE(cn.name, u.display_name, u.username) END as name,
            u.avatar,
            'personal' as type_label
        FROM chats c
        LEFT JOIN users u ON (CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END) = u.id
        LEFT JOIN contact_names cn ON cn.user_id = ? AND cn.contact_id = u.id
        WHERE (c.user1_id = ? OR c.user2_id = ?) AND u.is_deleted = 0
        GROUP BY c.id
    ''', (user_id, user_id, user_id, user_id, user_id))
    personal = cursor.fetchall()

    # Группы
    cursor.execute('''
        SELECT 
            g.id as chat_id,
            'group' as chat_type,
            g.id as group_id,
            g.name,
            g.avatar,
            'group' as type_label
        FROM groups g
        JOIN group_members gm ON g.id = gm.group_id
        WHERE gm.user_id = ?
    ''', (user_id,))
    groups = cursor.fetchall()

    # Каналы
    cursor.execute('''
        SELECT 
            c.id as chat_id,
            'channel' as chat_type,
            c.id as channel_id,
            c.name,
            c.avatar,
            'channel' as type_label
        FROM channels c
        JOIN channel_subscribers cs ON c.id = cs.channel_id
        WHERE cs.user_id = ?
    ''', (user_id,))
    channels = cursor.fetchall()

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
    cursor = conn.cursor()

    # Получаем всех пользователей
    cursor.execute('SELECT id FROM users WHERE registration_complete = 1')
    users = cursor.fetchall()

    for user in users:
        user_id = user['id']
        # Проверяем, есть ли уже папка "Все чаты"
        cursor.execute('''
            SELECT id FROM chat_folders 
            WHERE user_id = ? AND name = 'Все чаты'
        ''', (user_id,))
        existing = cursor.fetchone()

        if not existing:
            cursor.execute('''
                INSERT OR IGNORE INTO chat_folders (user_id, name, sort_order)
                VALUES (?, 'Все чаты', 0)
            ''', (user_id,))
            print(f"✅ Создана папка 'Все чаты' для пользователя {user_id}")

    conn.commit()
    conn.close()
    print("✅ Миграция папок завершена")



def update_privacy_settings(user_id, last_seen, profile_photo, forward_messages, calls, messages):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE users SET
            privacy_last_seen = ?,
            privacy_photo = ?,
            privacy_forward = ?,
            privacy_calls = ?,
            privacy_messages = ?
        WHERE id = ?
    ''', (last_seen, profile_photo, forward_messages, calls, messages, user_id))
    conn.commit()
    conn.close()


# ===== ПРОВЕРКИ ПРИВАТНОСТИ =====

def can_see_last_seen(viewer_id, target_id):
    """Может ли viewer_id видеть время захода target_id"""
    if viewer_id == target_id:
        return True

    conn = get_db()
    cursor = conn.cursor()

    # Получаем настройки приватности целевого пользователя
    cursor.execute('SELECT privacy_last_seen FROM users WHERE id = ?', (target_id,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        return False

    privacy = user['privacy_last_seen']

    if privacy == 'everyone':
        conn.close()
        return True

    if privacy == 'contacts':
        # Проверяем, являются ли они контактами
        cursor.execute('''
            SELECT id FROM contacts 
            WHERE (user_id = ? AND contact_id = ?) OR (user_id = ? AND contact_id = ?)
        ''', (viewer_id, target_id, target_id, viewer_id))
        is_contact = cursor.fetchone()
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
    cursor = conn.cursor()

    cursor.execute('SELECT privacy_photo FROM users WHERE id = ?', (target_id,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        return False

    privacy = user['privacy_photo']

    if privacy == 'everyone':
        conn.close()
        return True

    if privacy == 'contacts':
        cursor.execute('''
            SELECT id FROM contacts 
            WHERE (user_id = ? AND contact_id = ?) OR (user_id = ? AND contact_id = ?)
        ''', (viewer_id, target_id, target_id, viewer_id))
        is_contact = cursor.fetchone()
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
    cursor = conn.cursor()

    cursor.execute('SELECT privacy_calls FROM users WHERE id = ?', (target_id,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        return False

    privacy = user['privacy_calls']

    if privacy == 'everyone':
        conn.close()
        return True

    if privacy == 'contacts':
        cursor.execute('''
            SELECT id FROM contacts 
            WHERE (user_id = ? AND contact_id = ?) OR (user_id = ? AND contact_id = ?)
        ''', (caller_id, target_id, target_id, caller_id))
        is_contact = cursor.fetchone()
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
    cursor = conn.cursor()

    cursor.execute('SELECT privacy_messages FROM users WHERE id = ?', (receiver_id,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        return False

    privacy = user['privacy_messages']

    if privacy == 'everyone':
        conn.close()
        return True

    if privacy == 'contacts':
        cursor.execute('''
            SELECT id FROM contacts 
            WHERE (user_id = ? AND contact_id = ?) OR (user_id = ? AND contact_id = ?)
        ''', (sender_id, receiver_id, receiver_id, sender_id))
        is_contact = cursor.fetchone()
        conn.close()
        return is_contact is not None

    conn.close()
    return False


def can_forward_message(sender_id, target_id):
    """Может ли sender_id пересылать сообщения target_id"""
    # Аналогично can_send_message, но для пересылок
    return can_send_message(sender_id, target_id)



# Инициализация БД при импорте
init_db()