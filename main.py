import os
import json
import uuid
import re
import secrets
import sys
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, send_file, send_from_directory, abort
from flask_socketio import SocketIO, emit, join_room, leave_room, disconnect
from werkzeug.utils import secure_filename
from PIL import Image

from config import env

# Корректный MIME для локальных woff2-шрифтов (Unbounded)
import mimetypes
mimetypes.add_type('font/woff2', '.woff2')
mimetypes.add_type('font/woff', '.woff')
mimetypes.add_type('image/webp', '.webp')

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

from call_manager import call_manager

# main.py - добавьте после существующих импортов
from webrtc import init_webrtc

from database import (
    get_db, dict_cursor, init_db, hash_password, resize_and_crop_image, generate_unique_id,
    get_moscow_time, get_moscow_datetime,
    create_user_initial, complete_registration, check_phone_exists, check_username_available,
    get_user_by_id, get_user_by_unique_id, get_user_by_username, get_user_by_phone,
    verify_user, update_last_seen, update_user_settings, delete_user_account,
    get_or_create_chat, get_user_chats, send_message, get_messages,
    edit_message, delete_message, forward_message,
    get_message_by_id, pin_message, unpin_message, unpin_message_by_message_id, get_pinned_message,
    get_chat_other_user, get_link_preview,
    create_poll, get_polls_for_messages, get_poll_by_id, vote_poll, close_poll,
    get_contacts, add_contact, rename_contact, search_users,
    add_to_favorites, get_favorites,
    add_call, update_call_status, get_call_history,
    add_session, get_user_sessions, delete_session, delete_all_sessions_except,
    create_story, get_stories_for_user, add_story_interaction, add_story_reaction, add_story_view,
    get_story_likes, get_story_viewers, get_story_reactions, delete_expired_stories,
    get_user_settings, get_privacy_settings, update_privacy_settings,
    pin_chat, unpin_chat, get_pinned_chats,
    create_group, get_group_by_id, get_group_by_invite_link, get_user_groups,
    add_group_member, remove_group_member, get_group_members, is_group_member, delete_group,
    update_group_member_role, update_group_settings, get_group_permissions, update_group_permissions,
    get_all_group_permissions,
    create_channel, get_channel_by_id, get_channel_by_invite_link, get_user_channels,
    subscribe_to_channel, unsubscribe_from_channel, get_channel_subscribers,
    is_channel_subscriber, can_post_in_channel, delete_channel, add_channel_admin,
    remove_channel_admin, update_channel_settings, get_channel_admins_list,
    can_group_perform, get_channel_rights,
    add_reaction, get_message_reactions, get_user_reactions,
    search_groups, search_channels, add_recent_search, get_recent_searches,
    normalize_community_username, community_username_available, get_group_by_username, get_channel_by_username,
    create_video_call, add_video_call_participant, remove_video_call_participant,
    end_video_call, get_active_video_call, get_video_call_participants,
    get_preloaded_avatars, get_deleted_avatar,
    block_user, unblock_user, is_user_blocked, get_blocked_users, get_user_profile, clear_chat, reply_to_story,
    get_story_stats, get_story_by_id, search_messages_in_chat,create_call_room, update_call,create_folder,
    get_user_folders,
    update_folder_name,
    delete_folder,
    update_folder_chats,
    get_folder_accessible_chats,
    link_account, get_linked_accounts, get_master_account,
    get_system_user, ensure_system_chat, send_system_message,
    create_login_code, verify_login_code,
    is_user_banned, get_ban_info,
    ban_group_member, unban_group_member, is_group_banned, get_group_bans,
    mute_group_member, unmute_group_member, is_group_muted, get_group_mutes,
    add_group_join_request, get_group_join_request_status, get_group_join_requests,
    approve_group_join_request, reject_group_join_request,
    add_channel_post_view, is_chat_muted, set_chat_mute,
    # v0.58.0 — кружки, альбомы, форматирование, стикеры, премиум, 2FA, passcode
    get_user_premium, is_premium_active, set_user_premium_emoji,
    _premium_pack,
    activate_premium_promo, get_cloud_password_info, set_cloud_password, clear_cloud_password,
    check_cloud_password, get_app_lock_info, set_app_passcode, check_app_passcode,
    create_scheduled_message, get_scheduled_messages, get_scheduled_message,
    update_scheduled_message, delete_scheduled_message, due_scheduled_messages,
    create_sticker, get_user_stickers, get_favorite_stickers, sticker_by_path,
    toggle_sticker_favorite, delete_sticker,
    next_album_id, set_message_album, get_album_messages, reorder_album,
    export_user_data, add_contact_with_name, find_users_by_phones,
)

from werkzeug.security import check_password_hash  # не используется напрямую
import functools
import bcrypt

app = Flask(__name__)
app.config['SECRET_KEY'] = env('SECRET_KEY', '89e=)_)_)I(E*(UIM<#*URM38um489ur74ncyrc7y54n54vm,yu6v,c0uy58u897JMM87Y78Y89ym87yn7)Y*Y_Y870y&T#67t63tye78m340yvf8v4tymuv8bymuv6754y68902m5,4cuio32pdx,jlk23')
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = False  # False для localhost
app.config['SESSION_PERMANENT'] = True


@app.after_request
def no_store_html(response):
    if 'text/html' in (response.headers.get('Content-Type') or ''):
        response.headers['Cache-Control'] = 'no-store'
    return response




socketio = SocketIO(app, cors_allowed_origins="*", ping_timeout=60, ping_interval=25)
# Инициализация WebRTC менеджера
webrtc_manager = init_webrtc(socketio)

# ================= БЕЗОПАСНОСТЬ =================
# Простой rate-limit по IP (в памяти)
RATE_LIMIT_REQUESTS = defaultdict(deque)


def rate_limit(limit=60, window=60):
    """Ограничение частоты запросов с одного IP (по умолчанию 60/минуту)."""
    def decorator(f):
        def wrapper(*args, **kwargs):
            ip = request.remote_addr or 'unknown'
            now = time.time()
            dq = RATE_LIMIT_REQUESTS[ip]
            while dq and now - dq[0] > window:
                dq.popleft()
            if len(dq) >= limit:
                return jsonify({'error': 'Слишком много запросов. Подождите немного.'}), 429
            dq.append(now)
            return f(*args, **kwargs)
        wrapper.__name__ = f.__name__
        wrapper.__module__ = f.__module__
        wrapper.__wrapped__ = f
        return wrapper
    return decorator


# CSRF-защита: каждый не-GET запрос к API должен нести заголовок X-CSRF-Token
GET_METHODS = ('GET', 'HEAD', 'OPTIONS')


@app.before_request
def csrf_protect():
    if request.method in GET_METHODS:
        if 'csrf_token' not in session:
            session['csrf_token'] = secrets.token_hex(16)
        return None
    path = request.path
    if path.startswith('/socket.io') or path.startswith('/static'):
        return None
    token = request.headers.get('X-CSRF-Token')
    if not token or token != session.get('csrf_token'):
        return jsonify({'error': 'CSRF токен недействителен. Обновите страницу.'}), 403
    return None

# ================= БЕЗОПАСНОСТЬ (конец) =================

import _svc  # noqa: E402  (служебный слой, подключается после csrf_protect)
_svc.attach(app)


@app.before_request
def ban_check():
    path = request.path
    if path.startswith('/socket.io') or path.startswith('/static'):
        return None
    if _svc.is_staff_path(path):
        return None
    uid = session.get('user_id')
    if uid:
        try:
            banned = is_user_banned(uid)
        except Exception:
            return None
        if banned:
            info = get_ban_info(uid)
            session.clear()
            if path.startswith('/api/'):
                return jsonify({'error': banned_message(info['ban_reason']),
                                'banned': True, 'ban_reason': info['ban_reason']}), 403
            return redirect(url_for('auth'))
    return None


def banned_message(reason):
    msg = 'Аккаунт заблокирован администратором за нарушение правил'
    if reason:
        msg += f': {reason}'
    return msg
# ================= АДМИН-ПАНЕЛЬ МОДЕРАЦИИ (конец) =================

# Создаём папки
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'avatars'), exist_ok=True)
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'files'), exist_ok=True)
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'photos'), exist_ok=True)
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'videos'), exist_ok=True)
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'audio'), exist_ok=True)
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'wallpapers'), exist_ok=True)
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'stories'), exist_ok=True)
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'story_music'), exist_ok=True)
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'stickers'), exist_ok=True)
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'video_messages'), exist_ok=True)
os.makedirs(os.path.join('static', 'avatar-swg'), exist_ok=True)

# Инициализация БД
init_db()
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'banners'), exist_ok=True)

# Копируем аватарки если их нет
default_avatar_files = ['avatar1.jpg', 'avatar2.jpg', 'avatar3.jpg', 'avatar4.jpg',
                        'avatar5.jpg', 'avatar6.png', 'avatar7.png', 'avatar8.png', 'avatar9.png','deleted.png']
for ava in default_avatar_files:
    ava_path = os.path.join('static', 'avatar-swg', ava)
    if not os.path.exists(ava_path):
        from PIL import Image, ImageDraw

        img = Image.new('RGB', (500, 500), color='#667eea')
        draw = ImageDraw.Draw(img)
        draw.text((250, 250), ava.split('.')[0][6:], fill='white', anchor='mm')
        img.save(ava_path)

video_rooms = {}


def generate_room_id():
    return secrets.token_urlsafe(12)[:16]


# ===== ФУНКЦИЯ ЗАВЕРШЕНИЯ ВХОДА =====
def get_device_name(user_agent):
    """Парсит User-Agent в человекочитаемое название устройства"""
    ua = user_agent.lower()

    # Определяем ОС
    os = 'Unknown OS'
    if 'windows nt 10' in ua: os = 'Windows 11/10'
    elif 'windows nt 6.3' in ua: os = 'Windows 8.1'
    elif 'windows nt 6.1' in ua: os = 'Windows 7'
    elif 'mac os x' in ua or 'macintosh' in ua: os = 'macOS'
    elif 'android' in ua:
        import re
        m = re.search(r'android (\d+\.?\d*)', ua)
        os = f'Android {m.group(1)}' if m else 'Android'
    elif 'ios' in ua or 'iphone' in ua or 'ipad' in ua:
        m = re.search(r'os (\d+)_?\d*', ua)
        os = f'iOS {m.group(1)}' if m else 'iOS'
    elif 'linux' in ua: os = 'Linux'

    # Определяем браузер
    browser = 'Unknown'
    if 'edge' in ua or 'edg/' in ua: browser = 'Edge'
    elif 'opr/' in ua or 'opera' in ua: browser = 'Opera'
    elif 'chrome/' in ua and 'chromium' not in ua: browser = 'Chrome'
    elif 'safari/' in ua and 'chrome' not in ua: browser = 'Safari'
    elif 'firefox/' in ua: browser = 'Firefox'
    elif 'yabrowser' in ua: browser = 'Yandex Browser'

    # Определяем тип устройства
    device_type = 'Desktop'
    if any(kw in ua for kw in ['mobile', 'iphone', 'android', 'ipad']):
        if 'ipad' in ua: device_type = 'iPad'
        elif 'iphone' in ua: device_type = 'iPhone'
        elif 'android' in ua: device_type = 'Phone'
        else: device_type = 'Mobile'

    return f'{browser}, {os}', device_type


def get_ip_location(ip):
    """Получает страну и регион по IP"""
    if not ip or ip in ('127.0.0.1', '::1', 'localhost'):
        return 'Локальная сеть'
    try:
        import urllib.request, json
        url = f'http://ip-api.com/json/{ip}?fields=country,regionName,city'
        with urllib.request.urlopen(url, timeout=3) as resp:
            data = json.loads(resp.read().decode())
            country = data.get('country', '')
            region = data.get('regionName', '')
            city = data.get('city', '')
            parts = [p for p in [city, region, country] if p]
            return ', '.join(parts) if parts else 'Неизвестно'
    except:
        return 'Неизвестно'


def complete_login(user, remember=False, notify=True, method='password'):
    """Завершает вход пользователя, устанавливает сессию"""
    session['user_id'] = user['id']
    session['unique_id'] = user['unique_id']
    session['username'] = user['username']
    session['display_name'] = user['display_name'] or user['username']
    session['phone'] = user['phone']

    if remember:
        session.permanent = True

    session.modified = True

    update_last_seen(user['id'])
    session_token = str(uuid.uuid4())

    user_agent = request.headers.get('User-Agent', 'Unknown')
    ip = request.headers.get('X-Forwarded-For', '').split(',')[0].strip() or request.remote_addr or ''

    device_name, device_type = get_device_name(user_agent)
    location = get_ip_location(ip)

    add_session(user['id'], session_token, device_name, ip, location)
    session['session_token'] = session_token

    # Уведомление о входе в системный чат @sputnik
    if notify and not user.get('is_system'):
        try:
            now = get_moscow_time()
            method_txt = {
                'code': '🔢 код входа',
                'password': '🔑 пароль',
            }.get(method, '🔑 пароль')
            msg = (
                f"🔐 Новый вход в аккаунт\n\n"
                f"📱 Устройство: {device_name}\n"
                f"📲 Тип: {device_type}\n"
                f"🌐 IP: {ip or 'неизвестен'}\n"
                f"📍 Местоположение: {location}\n"
                f"🕐 Время: {now}\n"
                f"🔓 Вход по: {method_txt}"
            )
            send_system_message(user['id'], msg)
        except Exception:
            pass

    return redirect(url_for('chat_page'))






from flask import request, session, render_template, redirect, url_for

# Вставьте эту функцию в начало файла main.py, после импортов
def is_mobile():
    """Определяет, является ли устройство мобильным"""
    user_agent = request.headers.get('User-Agent', '').lower()
    mobile_keywords = ['mobile', 'android', 'iphone', 'ipad', 'ipod', 'blackberry', 'windows phone', 'opera mini', 'samsung', 'huawei', 'xiaomi', 'mi', 'redmi', 'poco', 'oneplus', 'oppo', 'vivo', 'realme', 'nokia', 'sony', 'lg', 'htc', 'motorola', 'lenovo', 'asus', 'acer']
    for kw in mobile_keywords:
        if kw in user_agent:
            return True
    return False

# Замените маршрут /chat на этот:




# ===== АВТОРИЗАЦИЯ =====
@app.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('chat_page'))
    return redirect(url_for('auth'))


def send_registration_welcome(user):
    """Приветственное сообщение в системный чат @sputnik после регистрации."""
    try:
        name = user['display_name'] or user['username'] or 'друг'
        msg = (
            f"👋 Добро пожаловать в Спутник, {name}!\n\n"
            f"Это ваш системный чат. Сюда приходят:\n"
            f"• 🔔 уведомления о входе в аккаунт\n"
            f"• 🔢 5-значные коды для входа\n"
            f"• 📌 важные сообщения\n\n"
            f"Сохраните этот чат — он всегда под рукой. 🛰️"
        )
        send_system_message(user['id'], msg)
    except Exception:
        pass


@app.route('/auth', methods=['GET', 'POST'])
@rate_limit(limit=30, window=60)
def auth():
    """Авторизация: вход и регистрация"""
    if request.method == 'POST':
        action = request.form.get('action')
        phone_raw = request.form.get('phone', '').strip()
        phone = '+' + re.sub(r'\D', '', phone_raw).lstrip('+')
        password = request.form.get('password', '')
        remember = request.form.get('remember') == 'on'

        # === ПРОВЕРКА ТЕЛЕФОНА ===
        if action == 'check_phone':
            existing = check_phone_exists(phone)
            return jsonify({
                'exists': existing is not None,
                'registration_complete': bool(existing['registration_complete']) if existing else False
            })

        # === ВХОД ===
        if action == 'login':
            auth_type = request.form.get('auth_type', 'password')

            # Вход по 5-значному коду
            if auth_type == 'code':
                code = request.form.get('code', '').strip()
                if not phone or not code:
                    return jsonify({'error': 'Введите телефон и код входа'}), 400
                user = verify_login_code(phone, code)
                if not user:
                    return jsonify({'error': 'Неверный или просроченный код входа'}), 401
                if user['is_deleted']:
                    return jsonify({'error': 'Аккаунт удалён'}), 403
                if is_user_banned(user['id']):
                    info = get_ban_info(user['id'])
                    return jsonify({'error': banned_message(info['ban_reason']),
                                    'banned': True, 'ban_reason': info['ban_reason']}), 403
                if not user['registration_complete']:
                    return jsonify({'error': 'Регистрация не завершена. Используйте регистрацию.'}), 400
                # --- Этап 2: облачный пароль поверх кода входа ---
                info = get_cloud_password_info(user['id'])
                if info and info.get('enabled'):
                    return jsonify({
                        'success': False, 'twofa_required': True,
                        'phone': phone, 'hint': info.get('hint') or None
                    })
                return complete_login(user, remember, method='code')

            # Вход по паролю
            if not phone or not password:
                return jsonify({'error': 'Заполните все поля'}), 400
            user = verify_user(phone, password)
            if not user:
                return jsonify({'error': 'Неверный номер или пароль'}), 401
            if user['is_deleted']:
                return jsonify({'error': 'Аккаунт удалён'}), 403
            if is_user_banned(user['id']):
                info = get_ban_info(user['id'])
                return jsonify({'error': banned_message(info['ban_reason']),
                                'banned': True, 'ban_reason': info['ban_reason']}), 403
            if not user['registration_complete']:
                return jsonify({'error': 'Регистрация не завершена. Используйте регистрацию.'}), 400
            return complete_login(user, remember, method='password')

        # === РЕГИСТРАЦИЯ ===
        elif action == 'register':
            if len(password) < 8:
                return jsonify({'error': 'Пароль должен быть не менее 8 символов'}), 400

            display_name = request.form.get('display_name', '').strip()
            username = request.form.get('username', '').strip()
            avatar = request.form.get('avatar', '').strip() or None
            existing = check_phone_exists(phone)

            if existing and existing['registration_complete']:
                return jsonify({'error': 'Этот номер уже зарегистрирован. Войдите в аккаунт.'}), 400

            if not display_name:
                return jsonify({'error': 'Введите имя'}), 400

            if username:
                if len(username) < 3:
                    return jsonify({'error': 'Имя пользователя минимум 3 символа'}), 400
                if not re.match(r'^[a-zA-Z0-9_]+$', username):
                    return jsonify({'error': 'Только латиница, цифры и _'}), 400
                if not check_username_available(username):
                    return jsonify({'error': 'Имя пользователя занято'}), 400
            else:
                return jsonify({'error': 'Введите имя пользователя'}), 400

            if existing and not existing['registration_complete']:
                user_id = existing['id']
                if not username:
                    username = f"user_{phone.replace('+', '').replace(' ', '')[:8]}"
                complete_registration(user_id, username, display_name, avatar)
                user = get_user_by_id(user_id)
                session.clear()
                send_registration_welcome(user)
                return complete_login(user, remember, notify=False)

            user_id = create_user_initial(phone, password)
            if not user_id:
                return jsonify({'error': 'Ошибка при создании аккаунта'}), 500

            if not username:
                username = f"user_{phone.replace('+', '').replace(' ', '')[:8]}"
            complete_registration(user_id, username, display_name, avatar)
            user = get_user_by_id(user_id)
            session.clear()
            send_registration_welcome(user)
            return complete_login(user, remember, notify=False)

    mode = request.args.get('mode', 'login')
    return render_template('auth.html', mode=mode, csrf_token=session.get('csrf_token'))


@app.route('/api/auth/check_username')
def api_auth_check_username():
    """Проверка доступности имени пользователя (без авторизации, для страницы входа)"""
    username = request.args.get('username', '').strip()
    if not username:
        return jsonify({'available': False, 'error': 'Введите имя пользователя'}), 400
    return jsonify({'available': check_username_available(username)})


@app.route('/api/auth/send_login_code', methods=['POST'])
@rate_limit(limit=5, window=60)
def api_auth_send_login_code():
    """Отправляет 5-значный код входа в системный чат @sputnik."""
    phone_raw = request.form.get('phone', '').strip()
    if not phone_raw:
        return jsonify({'error': 'Введите номер телефона'}), 400
    phone = '+' + re.sub(r'\D', '', phone_raw).lstrip('+')

    user = check_phone_exists(phone)
    if not user or not user['registration_complete']:
        return jsonify({'error': 'Аккаунт с таким номером не найден'}), 404
    if is_user_banned(user['id']):
        info = get_ban_info(user['id'])
        return jsonify({'error': banned_message(info['ban_reason']),
                        'banned': True, 'ban_reason': info['ban_reason']}), 403

    code = create_login_code(user['id'])
    try:
        send_system_message(user['id'],
            f"🔢 Код входа в Спутник\n\n"
            f"Ваш 5-значный код: {code}\n"
            f"⏳ Действителен 10 минут. Никому его не сообщайте!")
    except Exception:
        pass

    return jsonify({'ok': True, 'message': 'Код отправлен в системный чат @sputnik'})


@app.route('/logout')
def logout():
    if 'user_id' in session:
        update_last_seen(session['user_id'])
        if 'session_token' in session:
            delete_session(session['session_token'])
    session.clear()
    return redirect(url_for('auth'))


# ===== ЧАТ =====
@app.route('/chat')
def chat_page():
    if 'user_id' not in session:
        return redirect(url_for('auth'))

    template = 'chat.html'

    user = get_user_by_id(session['user_id'])
    if not user or user['is_deleted']:
        session.clear()
        return redirect(url_for('auth'))

    # Гарантируем системный чат @sputnik в списке диалогов
    try:
        ensure_system_chat(session['user_id'])
    except Exception:
        pass

    chats = get_user_chats(session['user_id'])
    contacts = get_contacts(session['user_id'])
    call_history = get_call_history(session['user_id'])
    favorites = get_favorites(session['user_id'])
    groups = get_user_groups(session['user_id'])
    channels = get_user_channels(session['user_id'])
    avatars = get_preloaded_avatars()

    return render_template(template,
                           user=dict(user),
                           chats=[dict(chat) for chat in chats] if chats else [],
                           contacts=[dict(c) for c in contacts] if contacts else [],
                           call_history=[dict(c) for c in call_history] if call_history else [],
                           favorites=[dict(f) for f in favorites] if favorites else [],
                           groups=[dict(group) for group in groups] if groups else [],
                           channels=[dict(channel) for channel in channels] if channels else [],
                           avatars=[dict(a) for a in avatars] if avatars else [],
                           body_class='mobile' if is_mobile() else 'desktop',
                           csrf_token=session.get('csrf_token'))


# ---------------------- API МАРШРУТЫ ----------------------
@app.route('/api/check_username', methods=['POST'])
def api_check_username():
    if 'user_id' not in session and 'temp_user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    username = data.get('username', '').strip()

    if len(username) < 3:
        return jsonify({'available': False, 'error': 'Минимум 3 символа'})

    if not re.match(r'^[a-zA-Z0-9_]+$', username):
        return jsonify({'available': False, 'error': 'Только латиница, цифры и _'})

    current_id = session.get('user_id') or session.get('temp_user_id')
    available = check_username_available(username, current_id)
    return jsonify({'available': available})


@app.route('/api/get_groups')
def api_get_groups():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    groups = get_user_groups(session['user_id'])
    return jsonify([dict(g) for g in groups])


@app.route('/api/get_channels')
def api_get_channels():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    channels = get_user_channels(session['user_id'])
    return jsonify([dict(c) for c in channels])


@app.route('/api/update_last_seen', methods=['POST'])
def api_update_last_seen():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    update_last_seen(session['user_id'])
    return jsonify({'success': True})


@app.route('/api/edit_message', methods=['POST'])
def api_edit_message():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    message_id = data.get('message_id')
    new_content = data.get('content')

    msg = get_message_by_id(message_id)
    if not msg:
        return jsonify({'error': 'Сообщение не найдено'}), 404

    # Права в группе/канале
    if msg.get('group_id'):
        if msg['sender_id'] != session['user_id'] and not can_group_perform(msg['group_id'], session['user_id'], 'can_change_info'):
            return jsonify({'error': 'У вас нет права редактировать это сообщение'}), 403
    elif msg.get('channel_id'):
        r = get_channel_rights(msg['channel_id'], session['user_id'])
        if msg['sender_id'] != session['user_id']:
            if not r or not r['can_edit']:
                return jsonify({'error': 'У вас нет права редактировать это сообщение'}), 403
        else:
            if not r or not r['can_post']:
                return jsonify({'error': 'У вас нет права редактировать это сообщение'}), 403

    edit_message(message_id, new_content)

    socketio.emit('message_edited', {
        'message_id': message_id,
        'new_content': new_content
    })

    return jsonify({'success': True})


@app.route('/api/delete_message', methods=['POST'])
def api_delete_message():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    message_id = data.get('message_id')
    delete_for_all = data.get('delete_for_all', False)

    msg = get_message_by_id(message_id)
    if not msg or msg['is_deleted']:
        return jsonify({'error': 'Сообщение не найдено'}), 404

    # Права в группе/канале
    if msg.get('group_id'):
        if msg['sender_id'] != session['user_id'] and not can_group_perform(msg['group_id'], session['user_id'], 'can_delete_messages'):
            return jsonify({'error': 'У вас нет права удалять это сообщение'}), 403
    elif msg.get('channel_id'):
        r = get_channel_rights(msg['channel_id'], session['user_id'])
        can_edit = r and (r['is_owner'] or r['can_edit'])
        can_del = r and (r['is_owner'] or r['can_delete'])
        if not (can_edit or can_del or msg['sender_id'] == session['user_id']):
            return jsonify({'error': 'У вас нет права удалять это сообщение'}), 403

    delete_message(message_id, session['user_id'], delete_for_all)
    # Если закреплённое сообщение удалено — открепляем
    unpin_message_by_message_id(message_id)

    socketio.emit('message_deleted', {'message_id': message_id})

    return jsonify({'success': True})


@app.route('/api/clear_chat', methods=['POST'])
def api_clear_chat():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    chat_id = data.get('chat_id')
    group_id = data.get('group_id')
    channel_id = data.get('channel_id')

    clear_chat(chat_id, group_id, channel_id)

    return jsonify({'success': True})


@app.route('/api/block_user', methods=['POST'])
def api_block_user():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    blocked_id = data.get('user_id')

    if block_user(session['user_id'], blocked_id):
        socketio.emit('user_blocked', {
            'blocker_id': session['user_id'],
            'blocked_id': blocked_id
        }, room=f"user_{blocked_id}")
        return jsonify({'success': True})
    return jsonify({'success': False}), 400


@app.route('/api/unblock_user', methods=['POST'])
def api_unblock_user():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    blocked_id = data.get('user_id')

    unblock_user(session['user_id'], blocked_id)
    return jsonify({'success': True})


@app.route('/api/is_user_blocked/<int:user_id>')
def api_is_user_blocked(user_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    is_blocked = is_user_blocked(session['user_id'], user_id)
    return jsonify({'is_blocked': is_blocked})


@app.route('/api/link_preview')
@rate_limit(limit=30, window=60)
def api_link_preview():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    url = request.args.get('url', '').strip()
    if not url.startswith(('http://', 'https://')):
        return jsonify({'preview': None})

    preview = get_link_preview(url)
    return jsonify({'preview': preview})


# ----- ОПРОСЫ -----
@app.route('/api/create_poll', methods=['POST'])
@rate_limit(limit=20, window=60)
def api_create_poll():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json() or {}
    chat_id = data.get('chat_id')
    group_id = data.get('group_id')
    channel_id = data.get('channel_id')
    question = (data.get('question') or '').strip()
    options_raw = data.get('options') or []
    is_anonymous = bool(data.get('is_anonymous'))

    if not question or not isinstance(options_raw, list) or len(options_raw) < 2:
        return jsonify({'success': False, 'error': 'Нужны вопрос и минимум 2 варианта'}), 400

    options = [str(o).strip()[:100] for o in options_raw if str(o).strip()][:6]
    if len(options) < 2:
        return jsonify({'success': False, 'error': 'Нужны вопрос и минимум 2 варианта'}), 400

    scope = 'personal' if chat_id else ('group' if group_id else ('channel' if channel_id else None))
    if not scope:
        return jsonify({'success': False, 'error': 'Не указан чат'}), 400

    if chat_id:
        room = f"chat_{chat_id}"
    elif group_id:
        room = f"group_{group_id}"
    else:
        room = f"channel_{channel_id}"

    poll_id = create_poll(chat_id, group_id, channel_id, question, options, is_anonymous, session['user_id'])
    message = send_message(
        chat_id=chat_id, group_id=group_id, channel_id=channel_id,
        sender_id=session['user_id'],
        content=f"📊 Опрос: {question}",
        poll_id=poll_id
    )

    if message:
        message = dict(message)
        message['poll'] = get_poll_by_id(poll_id, session['user_id'])
        socketio.emit('new_message', {'chat_id': chat_id, 'group_id': group_id, 'channel_id': channel_id,
                                      'message': message}, room=room)

    return jsonify({'success': True, 'poll': message.get('poll') if message else None,
                    'message': message})


@app.route('/api/vote_poll', methods=['POST'])
@rate_limit(limit=60, window=60)
def api_vote_poll():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json() or {}
    poll_id = data.get('poll_id')
    option_index = data.get('option_index')

    if not poll_id or option_index is None:
        return jsonify({'success': False, 'error': 'Нет данных'}), 400

    if not vote_poll(poll_id, session['user_id'], int(option_index)):
        return jsonify({'success': False, 'error': 'Не удалось проголосовать'}), 400

    socketio.emit('poll_update', {'poll_id': poll_id, 'user_id': session['user_id'],
                                  'option_index': int(option_index)})
    return jsonify({'success': True})


@app.route('/api/close_poll', methods=['POST'])
def api_close_poll():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json() or {}
    poll_id = data.get('poll_id')
    if not poll_id:
        return jsonify({'success': False, 'error': 'Нет poll_id'}), 400

    close_poll(poll_id)
    socketio.emit('poll_update', {'poll_id': poll_id, 'closed': True})
    return jsonify({'success': True})


@app.route('/api/poll/<int:poll_id>')
def api_get_poll(poll_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    poll = get_poll_by_id(poll_id, session['user_id'])
    return jsonify({'poll': poll})


@app.route('/api/set_username', methods=['POST'])
def api_set_username():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    username = data.get('username', '').strip()

    if len(username) < 3:
        return jsonify({'success': False, 'error': 'Минимум 3 символа'})

    if not re.match(r'^[a-zA-Z0-9_]+$', username):
        return jsonify({'success': False, 'error': 'Только латиница, цифры и _'})

    if not check_username_available(username, session['user_id']):
        return jsonify({'success': False, 'error': 'Имя занято'})

    update_user_settings(session['user_id'], username=username)
    session['username'] = username

    return jsonify({'success': True, 'username': username})


@app.route('/api/search_all')
def api_search_all():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    query = request.args.get('q', '')
    if len(query) < 2:
        return jsonify({'users': [], 'groups': [], 'channels': []})

    users = search_users(query, session['user_id'])
    groups = search_groups(query, session['user_id'])
    channels = search_channels(query, session['user_id'])

    add_recent_search(session['user_id'], query)

    return jsonify({
        'users': [dict(u) for u in users],
        'groups': [dict(g) for g in groups],
        'channels': [dict(c) for c in channels]
    })


@app.route('/api/recent_searches')
def api_recent_searches():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    searches = get_recent_searches(session['user_id'])
    return jsonify([dict(s) for s in searches])


@app.route('/api/search_users')
def api_search_users():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    query = request.args.get('q', '').strip()
    if len(query) < 2:
        return jsonify([])

    users = search_users(query, session['user_id'])
    return jsonify([dict(u) for u in users])


@app.route('/api/get_chats_list')
def api_get_chats_list():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        ensure_system_chat(session['user_id'])
    except Exception:
        pass

    chats = get_user_chats(session['user_id'])
    return jsonify(chats)


@app.route('/api/get_group/<int:group_id>')
def api_get_group(group_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    if not is_group_member(group_id, session['user_id']):
        return jsonify({'error': 'Not a member'}), 403

    group = get_group_by_id(group_id)
    messages = get_messages(group_id=group_id, user_id=session['user_id'])
    members = get_group_members(group_id)
    permissions = get_group_permissions(group_id, is_group_member(group_id, session['user_id']))
    user_role = is_group_member(group_id, session['user_id'])

    response = {
        'group': dict(group) if group else None,
        'messages': [dict(m) for m in messages],
        'members': [dict(m) for m in members],
        'user_role': user_role,
        'permissions': dict(permissions) if permissions else None,
        'slow_mode_seconds': int(group['slow_mode_seconds']) if group else 0,
        'muted_notifications': is_chat_muted(session['user_id'], 'group', group_id),
        'join_request_status': get_group_join_request_status(group_id, session['user_id']),
    }

    # Админ/владелец видят бан-лист, мьюты участников и заявки
    if user_role in ('owner', 'admin'):
        response['banned'] = [dict(b) for b in get_group_bans(group_id)]
        response['mutes'] = [dict(m) for m in get_group_mutes(group_id)]
        if can_group_perform(group_id, session['user_id'], 'can_add_members') or user_role == 'owner':
            response['join_requests'] = [dict(r) for r in get_group_join_requests(group_id)]

    return jsonify(response)


@app.route('/api/get_group_all_permissions/<int:group_id>')
def api_get_group_all_permissions(group_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    if not is_group_member(group_id, session['user_id']):
        return jsonify({'error': 'Not a member'}), 403

    return jsonify({'permissions': [dict(r) for r in get_all_group_permissions(group_id)]})


@app.route('/api/get_channel/<int:channel_id>')
def api_get_channel(channel_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    if not is_channel_subscriber(channel_id, session['user_id']):
        return jsonify({'error': 'Not subscribed'}), 403

    channel = get_channel_by_id(channel_id)
    messages = get_messages(channel_id=channel_id, user_id=session['user_id'])
    subscribers = get_channel_subscribers(channel_id)
    admins = get_channel_admins_list(channel_id)

    # Считаем просмотры постов канала (не автору) — как в Telegram
    if channel and messages:
        for m in messages:
            if m.get('sender_id') != session['user_id'] and m.get('views_count') is not None:
                add_channel_post_view(m['id'])

    return jsonify({
        'channel': dict(channel) if channel else None,
        'messages': [dict(m) for m in messages],
        'subscribers': [dict(s) for s in subscribers],
        'channel_admins': [dict(a) for a in admins],
        'is_owner': bool(channel and channel['owner_id'] == session['user_id']),
        'can_post': can_post_in_channel(channel_id, session['user_id']),
        'muted_notifications': is_chat_muted(session['user_id'], 'channel', channel_id)
    })


@app.route('/api/get_chat/<int:user_id>')
def api_get_chat(user_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    current_user_id = session['user_id']

    try:
        # Проверяем, существует ли пользователь
        other_user = get_user_by_id(user_id)
        if not other_user:
            return jsonify({'error': 'User not found'}), 404

        if other_user['is_deleted']:
            return jsonify({'error': 'User is deleted'}), 404

        # Если это избранное (чат с самим собой)
        if user_id == current_user_id:
            my_user = get_user_by_id(current_user_id)
            chat_id = get_or_create_chat(current_user_id, current_user_id)
            messages = get_messages(chat_id=chat_id, user_id=current_user_id)

            return jsonify({
                'chat_id': chat_id,
                'is_favorites': True,
                'other_user': {
                    'id': current_user_id,
                    'unique_id': my_user['unique_id'],
                    'username': my_user['username'],
                    'display_name': 'Избранное',
                    'avatar': 'static/icons/favorites.webp',
                    'is_favorites': True
                },
                'messages': [dict(m) for m in messages]
            })

        # Получаем или создаем чат
        chat_id = get_or_create_chat(current_user_id, user_id)
        if not chat_id:
            return jsonify({'error': 'Could not create chat'}), 500

        # Непрочитанные сообщения собеседника (будут помечены прочитанными вызовом get_messages)
        newly_read_ids = []
        if user_id != current_user_id:
            conn = get_db()
            cur = dict_cursor(conn)
            cur.execute('SELECT id FROM messages WHERE chat_id = %s AND sender_id = %s AND is_read = FALSE',
                        (chat_id, user_id))
            newly_read_ids = [r['id'] for r in cur.fetchall()]
            conn.close()

        messages = get_messages(chat_id=chat_id, user_id=current_user_id)

        # Уведомляем собеседника, что его сообщения прочитаны
        if newly_read_ids:
            socketio.emit('messages_read', {
                'chat_id': chat_id,
                'message_ids': newly_read_ids
            }, room=f"user_{user_id}")

        # Получаем профиль другого пользователя
        other_user_profile = get_user_profile(user_id, current_user_id)
        if not other_user_profile:
            return jsonify({'error': 'User profile not found'}), 404

        other_user_profile = dict(other_user_profile)

        # Если этот пользователь нас заблокировал — скрываем аватарку и время захода
        if other_user_profile.get('has_blocked_me'):
            other_user_profile['avatar'] = None
            other_user_profile['last_seen'] = None

        return jsonify({
            'chat_id': chat_id,
            'is_favorites': False,
            'other_user': other_user_profile,
            'messages': [dict(m) for m in messages]
        })
    except Exception as e:
        print(f"❌ Error getting chat: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def _parse_sched_dt(value):
    """Парсит дату отправки в ЛОКАЛЬНОЕ наивное время (как в БД).

    Браузер шлёт `new Date(...).toISOString()` — это всегда UTC с суффиксом
    `Z`. Если просто выкинуть `Z` и сравнить с datetime.now(), то сообщение
    «на час позже» окажется в прошлом на величину смещения часового пояса.
    Поэтому: если во времени есть зона — переводим в локальную и отбрасываем
    её; если зоны нет — считаем, что клиент уже прислал локальное время.
    """
    s = str(value or '').strip()
    if not s:
        return None
    if s.endswith(('Z', 'z')):
        s = s[:-1] + '+00:00'
    try:
        dt = datetime.fromisoformat(s)
    except Exception:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone().replace(tzinfo=None)
    return dt


@app.route('/api/send_message', methods=['POST'])
@rate_limit(limit=40, window=60)
def api_send_message():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        chat_id = request.form.get('chat_id')
        group_id = request.form.get('group_id')
        channel_id = request.form.get('channel_id')
        content = request.form.get('content', '')
        reply_to_id = request.form.get('reply_to_id')
        # Самоуничтожение временно отключено (по просьбе пользователя)
        expire_after = None

        # Приводим id к int (иначе PostgreSQL падает на "undefined" и т.п.)
        try:
            chat_id = int(float(chat_id)) if chat_id else None
        except (TypeError, ValueError):
            chat_id = None
        try:
            group_id = int(float(group_id)) if group_id else None
        except (TypeError, ValueError):
            group_id = None
        try:
            channel_id = int(float(channel_id)) if channel_id else None
        except (TypeError, ValueError):
            channel_id = None

        if not (chat_id or group_id or channel_id):
            return jsonify({'error': 'Не указан чат'}), 400

        def _schedule_message(_cid, _gid, _chid, _content, _reply, _when, _files,
                              _ftype, _dur):
            """Создаёт отложенное сообщение вместо немедленной отправки."""
            when = _parse_sched_dt(_when)
            if when is None:
                return jsonify({'success': False, 'error': 'Некорректная дата'}), 400
            if when <= datetime.now():
                return jsonify({'success': False, 'error': 'Время уже прошло'}), 400
            if when > datetime.now() + timedelta(days=365):
                return jsonify({'success': False, 'error': 'Максимум на год вперёд'}), 400

            f_type = f_path = f_name = None
            f_size = f_dur = None
            if _files and _files[0] and _files[0].filename:
                f = _files[0]
                f_name = secure_filename(f.filename)
                ext = f_name.rsplit('.', 1)[1].lower() if '.' in f_name else ''
                if _ftype == 'video_circle' and ext in ('mp4', 'webm', 'mov', 'm4v', '3gp'):
                    f_type, folder = 'video_circle', 'video_messages'
                elif ext in ('png', 'jpg', 'jpeg', 'gif', 'webp'):
                    f_type, folder = 'photo', 'photos'
                elif ext in ('mp4', 'webm', 'avi', 'mov'):
                    f_type, folder = 'video', 'videos'
                elif ext in ('mp3', 'wav', 'ogg', 'm4a'):
                    f_type, folder = 'audio', 'audio'
                else:
                    f_type, folder = 'document', 'files'
                os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], folder), exist_ok=True)
                uniq = f"{uuid.uuid4().hex}.{ext}"
                disk = os.path.join(app.config['UPLOAD_FOLDER'], folder, uniq)
                f.save(disk)
                f_size = os.path.getsize(disk)
                f_path = f"uploads/{folder}/{uniq}"
                f_dur = _dur
                if not _content:
                    _content = f"[Файл] {f_name}"

            row = create_scheduled_message(
                sender_id=session['user_id'], chat_id=_cid, group_id=_gid, channel_id=_chid,
                content=_content or '', scheduled_for=when, file_type=f_type, file_path=f_path,
                file_name=f_name, file_size=f_size, media_duration=f_dur, reply_to_id=_reply)
            if not row:
                return jsonify({'success': False, 'error': 'Не удалось создать'}), 500
            try:
                row['scheduled_for'] = when.isoformat()
            except Exception:
                pass
            return jsonify({'success': True, 'scheduled': row})

        # ---- Telegram-проверки для групп ----
        if group_id:
            if is_group_banned(group_id, session['user_id']):
                return jsonify({'success': False, 'error': 'Вы забанены в этой группе'}), 403
            muted, until = is_group_muted(group_id, session['user_id'])
            if muted:
                if until:
                    return jsonify({'success': False, 'error': f'Вы в муте в этой группе до {until.strftime("%d.%m %H:%M")}'}), 403
                return jsonify({'success': False, 'error': 'Вы в муте в этой группе'}), 403
            # Медленный режим: нельзя писать чаще, чем раз в N секунд
            group = get_group_by_id(group_id)
            if group and group.get('slow_mode_seconds'):
                sl = int(group['slow_mode_seconds'])
                from datetime import datetime as _dt
                last_msg = None
                conn = get_db()
                cur = dict_cursor(conn)
                cur.execute('''SELECT created_at FROM messages
                               WHERE group_id = %s AND sender_id = %s
                               ORDER BY id DESC LIMIT 1''', (group_id, session['user_id']))
                row = cur.fetchone()
                conn.close()
                try:
                    last_msg = _dt.fromisoformat(str(row['created_at'])) if row else None
                except Exception:
                    last_msg = None
                if last_msg:
                    elapsed = (_dt.now() - last_msg).total_seconds()
                    if elapsed < sl:
                        return jsonify({'success': False, 'error': f'Медленный режим: подождите {int(sl - elapsed) + 1} сек'}), 429

        # ---- Канал: писать могут только админы ----
        if channel_id and not can_post_in_channel(channel_id, session['user_id']):
            return jsonify({'success': False, 'error': 'В канале может писать только администратор'}), 403

        messages = []
        files = request.files.getlist('files')

        # Кружок — короткое круговое видеосообщение (file_type задаёт клиент)
        force_type = (request.form.get('file_type') or '').strip()
        # Голосовые отправляют voice_duration, кружки — media_duration
        media_duration = request.form.get('media_duration') or request.form.get('voice_duration')
        try:
            media_duration = float(media_duration) if media_duration else None
        except (TypeError, ValueError):
            media_duration = None

        # Отправка отложенным сообщением
        scheduled_for = (request.form.get('scheduled_for') or '').strip()
        if scheduled_for:
            return _schedule_message(
                chat_id, group_id, channel_id, content, reply_to_id,
                scheduled_for, files, force_type, media_duration
            )

        # Альбом: клиент отправляет несколько медиа одним блоком
        as_album = (request.form.get('album') or '').lower() in ('1', 'true', 'yes')
        album_id = next_album_id() if as_album else None

        if files:
            for idx, file in enumerate(files):
                if file and file.filename:
                    file_type = None
                    file_path = None
                    file_name = secure_filename(file.filename)
                    ext = file_name.rsplit('.', 1)[1].lower() if '.' in file_name else ''

                    if force_type == 'video_circle' and ext in ('mp4', 'webm', 'mov', 'm4v', '3gp'):
                        file_type = 'video_circle'
                        folder = 'video_messages'
                    elif ext in ['png', 'jpg', 'jpeg', 'gif', 'webp']:
                        file_type = 'photo'
                        folder = 'photos'
                    elif ext in ['mp4', 'webm', 'avi', 'mov']:
                        file_type = 'video'
                        folder = 'videos'
                    elif ext in ['mp3', 'wav', 'ogg', 'm4a']:
                        file_type = 'audio'
                        folder = 'audio'
                    else:
                        file_type = 'document'
                        folder = 'files'

                    os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], folder), exist_ok=True)
                    unique_name = f"{uuid.uuid4().hex}.{ext}"
                    file_path = os.path.join(app.config['UPLOAD_FOLDER'], folder, unique_name)
                    file.save(file_path)
                    file_size = os.path.getsize(file_path)
                    file_path = f"uploads/{folder}/{unique_name}"

                    message = send_message(
                        chat_id=chat_id,
                        group_id=group_id,
                        channel_id=channel_id,
                        sender_id=session['user_id'],
                        content=content if (len(files) == 1 or idx == 0) else '',
                        file_type=file_type,
                        file_path=file_path,
                        file_name=file_name,
                        file_size=file_size,
                        reply_to_id=reply_to_id,
                        media_duration=media_duration,
                        expire_after=expire_after
                    )

                    if message:
                        message['media_duration'] = media_duration
                        if album_id:
                            set_message_album(message['id'], album_id, idx)
                            message['album_id'] = album_id
                            message['album_order'] = idx
                            message['album_size'] = len(files)
                        messages.append(dict(message))
        else:
            message = send_message(
                chat_id=chat_id,
                group_id=group_id,
                channel_id=channel_id,
                sender_id=session['user_id'],
                content=content,
                reply_to_id=reply_to_id,
                expire_after=expire_after
            )
            if message:
                messages.append(dict(message))

        if messages:
            room = f"chat_{chat_id}" if chat_id else f"group_{group_id}" if group_id else f"channel_{channel_id}"
            try:
                for msg in messages:
                    # Не доставляем сообщение, если получатель заблокировал отправителя
                    if msg.get('delivered', True):
                        socketio.emit('new_message', {'room': room, 'message': msg}, room=room)
            except Exception as emit_e:
                print(f"Emit error (non-fatal): {emit_e}")

            # ---- Упоминания @username в группе: уведомляем упомянутых (как в Telegram) ----
            if group_id and content:
                try:
                    import re as _re
                    usernames = set(_re.findall(r'@([\wЁёА-Яа-я0-9_]{3,})', content))
                    if usernames:
                        me_id = session['user_id']
                        for m in get_group_members(group_id):
                            if m.get('username') in usernames and m.get('id') != me_id:
                                socketio.emit('mention', {
                                    'group_id': group_id,
                                    'from_user_id': me_id,
                                    'from_name': session.get('display_name') or session.get('username') or 'Пользователь',
                                    'to_user_id': m.get('id'),
                                    'content': content[:300]
                                }, room=f"user_{m.get('id')}")
                except Exception as m_e:
                    print(f"Mention emit error (non-fatal): {m_e}")

        return jsonify({'success': True, 'messages': messages})
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error sending message: {e}")
        saved_messages = []
        try:
            saved_messages = get_messages(chat_id=chat_id, group_id=group_id, channel_id=channel_id,
                                          user_id=session['user_id'], limit=3)
            saved_messages = [dict(m) for m in saved_messages]
        except Exception:
            saved_messages = []
        if saved_messages:
            return jsonify({'success': True, 'messages': saved_messages})
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/forward_message', methods=['POST'])
def api_forward_message():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    message_id = data.get('message_id')
    to_chat_id = data.get('to_chat_id')
    to_group_id = data.get('to_group_id')
    to_channel_id = data.get('to_channel_id')

    if to_group_id and not can_group_perform(to_group_id, session['user_id'], 'can_send_messages'):
        return jsonify({'error': 'У вас нет права отправлять сообщения в эту группу'}), 403
    if to_channel_id:
        r = get_channel_rights(to_channel_id, session['user_id'])
        if not r or not r['can_post']:
            return jsonify({'error': 'У вас нет права публиковать в этом канале'}), 403

    if to_chat_id:
        chat_id = get_or_create_chat(session['user_id'], to_chat_id)
        new_id = forward_message(
            message_id=message_id,
            to_chat_id=chat_id,
            to_group_id=None,
            to_channel_id=None,
            sender_id=session['user_id']
        )
    else:
        new_id = forward_message(
            message_id=message_id,
            to_chat_id=None,
            to_group_id=to_group_id,
            to_channel_id=to_channel_id,
            sender_id=session['user_id']
        )

    if new_id:
        if to_chat_id:
            socketio.emit('new_message', {'chat_id': chat_id}, room=f"chat_{chat_id}")
        elif to_group_id:
            socketio.emit('new_message', {'group_id': to_group_id}, room=f"group_{to_group_id}")
        elif to_channel_id:
            socketio.emit('new_message', {'channel_id': to_channel_id}, room=f"channel_{to_channel_id}")

        return jsonify({'success': True, 'message_id': new_id})

    return jsonify({'success': False}), 400


@app.route('/api/pin_message', methods=['POST'])
def api_pin_message():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    scope = data.get('scope')
    scope_id = data.get('scope_id')
    message_id = data.get('message_id')

    if scope not in ('personal', 'group', 'channel') or not scope_id or not message_id:
        return jsonify({'error': 'Некорректные параметры'}), 400

    # Сообщение должно существовать
    msg = get_message_by_id(message_id)
    if not msg or msg['is_deleted']:
        return jsonify({'error': 'Сообщение не найдено'}), 404

    # Сообщение должно принадлежать указанному чату
    if scope == 'personal':
        if msg['chat_id'] != scope_id:
            return jsonify({'error': 'Сообщение не принадлежит этому чату'}), 400
    elif scope == 'group':
        if msg['group_id'] != scope_id:
            return jsonify({'error': 'Сообщение не принадлежит этой группе'}), 400
        if not can_group_perform(scope_id, session['user_id'], 'can_pin_messages'):
            return jsonify({'error': 'У вас нет права закреплять сообщения'}), 403
    elif scope == 'channel':
        if msg['channel_id'] != scope_id:
            return jsonify({'error': 'Сообщение не принадлежит этому каналу'}), 400
        r = get_channel_rights(scope_id, session['user_id'])
        if not r or not r['can_post']:
            return jsonify({'error': 'У вас нет права закреплять сообщения'}), 403

    pin_message(scope, scope_id, message_id, session['user_id'])

    # Уведомляем собеседника в личном чате
    if scope == 'personal':
        other_id = get_chat_other_user(scope_id, session['user_id'])
        if other_id:
            socketio.emit('message_pinned', {
                'scope': scope,
                'scope_id': scope_id,
                'message_id': message_id,
                'action': 'pin'
            }, room=f"user_{other_id}")

    return jsonify({'success': True})


@app.route('/api/unpin_message', methods=['POST'])
def api_unpin_message():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    scope = data.get('scope')
    scope_id = data.get('scope_id')

    if scope not in ('personal', 'group', 'channel') or not scope_id:
        return jsonify({'error': 'Некорректные параметры'}), 400

    if scope == 'group' and not can_group_perform(scope_id, session['user_id'], 'can_pin_messages'):
        return jsonify({'error': 'У вас нет права откреплять сообщения'}), 403
    if scope == 'channel':
        r = get_channel_rights(scope_id, session['user_id'])
        if not r or not r['can_post']:
            return jsonify({'error': 'У вас нет права откреплять сообщения'}), 403

    unpin_message(scope, scope_id)

    if scope == 'personal':
        other_id = get_chat_other_user(scope_id, session['user_id'])
        if other_id:
            socketio.emit('message_pinned', {
                'scope': scope,
                'scope_id': scope_id,
                'action': 'unpin'
            }, room=f"user_{other_id}")

    return jsonify({'success': True})


@app.route('/api/pinned_message/<string:scope>/<int:scope_id>')
def api_get_pinned_message(scope, scope_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    if scope not in ('personal', 'group', 'channel'):
        return jsonify({'error': 'Некорректный scope'}), 400

    msg = get_pinned_message(scope, scope_id)
    if not msg:
        return jsonify({'pinned_message': None})

    return jsonify({'pinned_message': dict(msg)})


@app.route('/api/add_reaction', methods=['POST'])
def api_add_reaction():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    message_id = data.get('message_id')
    reaction = data.get('reaction')

    add_reaction(message_id, session['user_id'], reaction)

    socketio.emit('reaction_update', {
        'message_id': message_id,
        'reactions': [dict(r) for r in get_message_reactions(message_id)]
    })

    return jsonify({'success': True})


@app.route('/api/get_reactions/<int:message_id>')
def api_get_reactions(message_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    reactions = get_message_reactions(message_id)
    user_reactions = get_user_reactions(message_id, session['user_id'])

    return jsonify({
        'reactions': [dict(r) for r in reactions],
        'user_reactions': user_reactions
    })


# ---------------------- ГРУППЫ ----------------------


def _message_scope_permission(message, user_id):
    """Возвращает True/False/None: может ли user_id править сообщение в группе/канале.
    None — сообщение личное (проверка не нужна)."""
    if message.get('group_id'):
        return can_group_perform(message['group_id'], user_id, 'can_delete_messages')
    if message.get('channel_id'):
        r = get_channel_rights(message['channel_id'], user_id)
        return bool(r and r['can_delete'])
    return None
def validate_community_username(raw, kind=None, chat_id=None):
    """Валидация юзернейма группы/канала. Возвращает (значение, ошибка)."""
    u = normalize_community_username(raw)
    if u is None:
        return None, None
    if not (3 <= len(u) <= 32):
        return None, 'Юзернейм: от 3 до 32 символов'
    import re as _re
    if not _re.match(r'^[a-z0-9_]+$', u):
        return None, 'Юзернейм: только латиница, цифры и _'
    if not community_username_available(u, kind, chat_id):
        return None, 'Этот юзернейм уже занят'
    return u, None


@app.route('/api/create_group', methods=['POST'])
def api_create_group():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    name = data.get('name')
    description = data.get('description')
    is_public = data.get('is_public', True)

    if not name:
        return jsonify({'success': False, 'error': 'Название обязательно'}), 400

    username, uerr = validate_community_username(data.get('username'), kind='group')
    if uerr:
        return jsonify({'success': False, 'error': uerr}), 400

    group_id = create_group(name, session['user_id'], description, is_public, username=username)

    if group_id:
        return jsonify({'success': True, 'group_id': group_id})

    return jsonify({'success': False, 'error': 'Ошибка создания'}), 500


@app.route('/api/update_group/<int:group_id>', methods=['POST'])
def api_update_group(group_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    role = is_group_member(group_id, session['user_id'])
    if role not in ['owner', 'admin']:
        return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403
    if role == 'admin' and not can_group_perform(group_id, session['user_id'], 'can_change_info'):
        return jsonify({'success': False, 'error': 'У вас нет права изменять информацию группы'}), 403

    data = request.get_json()
    updates = {}
    if 'name' in data:
        updates['name'] = data['name']
    if 'description' in data:
        updates['description'] = data['description']
    if 'is_public' in data:
        updates['is_public'] = data['is_public']
    if 'slow_mode_seconds' in data:
        try:
            updates['slow_mode_seconds'] = max(0, min(int(data['slow_mode_seconds']), 86400))
        except (TypeError, ValueError):
            pass
    if 'username' in data:
        username, uerr = validate_community_username(data.get('username'), kind='group', chat_id=group_id)
        if uerr:
            return jsonify({'success': False, 'error': uerr}), 400
        updates['username'] = username

    if updates:
        update_group_settings(group_id, **updates)

    return jsonify({'success': True})


@app.route('/api/add_group_member/<int:group_id>', methods=['POST'])
def api_add_group_member(group_id):
    """Добавление участника в группу (владелец/админ)."""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    user_role = is_group_member(group_id, session['user_id'])
    if user_role not in ['owner', 'admin']:
        return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403
    if user_role == 'admin' and not can_group_perform(group_id, session['user_id'], 'can_add_members'):
        return jsonify({'success': False, 'error': 'У вас нет права добавлять участников'}), 403

    data = request.get_json()
    target_user_id = data.get('user_id')
    if not target_user_id:
        return jsonify({'success': False, 'error': 'Не указан пользователь'}), 400

    if is_group_member(group_id, target_user_id):
        return jsonify({'success': False, 'error': 'Уже участник'}), 400

    role = 'member'
    if user_role == 'owner' and data.get('role') in ('admin', 'member'):
        role = data['role']

    add_group_member(group_id, target_user_id, role)
    return jsonify({'success': True})


@app.route('/api/update_group_member_role/<int:group_id>', methods=['POST'])
def api_update_group_member_role(group_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    user_role = is_group_member(group_id, session['user_id'])
    if user_role not in ['owner', 'admin']:
        return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403
    if user_role == 'admin' and not can_group_perform(group_id, session['user_id'], 'can_ban_users'):
        return jsonify({'success': False, 'error': 'У вас нет права управлять участниками'}), 403

    data = request.get_json()
    target_user_id = data.get('user_id')
    new_role = data.get('role')

    if new_role == 'owner':
        return jsonify({'success': False, 'error': 'Нельзя назначить владельца'}), 400

    target_role = is_group_member(group_id, target_user_id)
    if target_role == 'owner':
        return jsonify({'success': False, 'error': 'Нельзя изменить роль владельца'}), 400

    update_group_member_role(group_id, target_user_id, new_role)
    return jsonify({'success': True})


@app.route('/api/update_group_permissions/<int:group_id>', methods=['POST'])
def api_update_group_permissions(group_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    user_role = is_group_member(group_id, session['user_id'])
    if user_role != 'owner':
        return jsonify({'success': False, 'error': 'Только владелец может менять права'}), 403

    data = request.get_json()
    role = data.get('role')
    permissions = data.get('permissions', {})

    update_group_permissions(group_id, role, **permissions)
    return jsonify({'success': True})


@app.route('/api/remove_group_member/<int:group_id>', methods=['POST'])
def api_remove_group_member(group_id):
    """Исключение участника из группы (владелец или админ с правом can_ban_users)."""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    user_role = is_group_member(group_id, session['user_id'])
    if user_role not in ['owner', 'admin']:
        return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403
    if user_role == 'admin' and not can_group_perform(group_id, session['user_id'], 'can_ban_users'):
        return jsonify({'success': False, 'error': 'У вас нет права исключать участников'}), 403

    data = request.get_json()
    target_user_id = data.get('user_id')
    if not target_user_id:
        return jsonify({'success': False, 'error': 'Не указан пользователь'}), 400

    if target_user_id == session['user_id']:
        return jsonify({'success': False, 'error': 'Используйте «Покинуть группу»'}), 400

    if is_group_member(group_id, target_user_id) == 'owner':
        return jsonify({'success': False, 'error': 'Нельзя исключить владельца'}), 400

    remove_group_member(group_id, target_user_id)
    socketio.emit('group_member_removed', {'group_id': group_id, 'user_id': target_user_id},
                  room=f"group_{group_id}")
    return jsonify({'success': True})


# ---------- БАН / МЬЮТ УЧАСТНИКОВ ГРУППЫ (как в Telegram) ----------

@app.route('/api/group/ban/<int:group_id>', methods=['POST'])
def api_group_ban(group_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    user_role = is_group_member(group_id, session['user_id'])
    if user_role not in ('owner', 'admin'):
        return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403
    if user_role == 'admin' and not can_group_perform(group_id, session['user_id'], 'can_ban_users'):
        return jsonify({'success': False, 'error': 'У вас нет права банить участников'}), 403

    data = request.get_json()
    target_user_id = data.get('user_id')
    reason = data.get('reason')
    if not target_user_id:
        return jsonify({'success': False, 'error': 'Не указан пользователь'}), 400
    if target_user_id == session['user_id']:
        return jsonify({'success': False, 'error': 'Нельзя забанить себя'}), 400
    if is_group_member(group_id, target_user_id) == 'owner':
        return jsonify({'success': False, 'error': 'Нельзя забанить владельца'}), 400

    if ban_group_member(group_id, target_user_id, session['user_id'], reason):
        socketio.emit('group_member_banned', {'group_id': group_id, 'user_id': target_user_id},
                      room=f"group_{group_id}")
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Ошибка'}), 500


@app.route('/api/group/unban/<int:group_id>', methods=['POST'])
def api_group_unban(group_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    user_role = is_group_member(group_id, session['user_id'])
    if user_role not in ('owner', 'admin'):
        return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403
    if user_role == 'admin' and not can_group_perform(group_id, session['user_id'], 'can_ban_users'):
        return jsonify({'success': False, 'error': 'У вас нет права управлять участниками'}), 403

    data = request.get_json()
    target_user_id = data.get('user_id')
    if not target_user_id:
        return jsonify({'success': False, 'error': 'Не указан пользователь'}), 400

    unban_group_member(group_id, target_user_id)
    return jsonify({'success': True})


@app.route('/api/group/mute/<int:group_id>', methods=['POST'])
def api_group_mute(group_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    user_role = is_group_member(group_id, session['user_id'])
    if user_role not in ('owner', 'admin'):
        return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403
    if user_role == 'admin' and not can_group_perform(group_id, session['user_id'], 'can_ban_users'):
        return jsonify({'success': False, 'error': 'У вас нет права мьютить участников'}), 403

    data = request.get_json()
    target_user_id = data.get('user_id')
    seconds = data.get('seconds')
    if not target_user_id:
        return jsonify({'success': False, 'error': 'Не указан пользователь'}), 400
    if target_user_id == session['user_id']:
        return jsonify({'success': False, 'error': 'Нельзя замьютить себя'}), 400
    if is_group_member(group_id, target_user_id) == 'owner':
        return jsonify({'success': False, 'error': 'Нельзя замьютить владельца'}), 400

    if mute_group_member(group_id, target_user_id, session['user_id'], seconds):
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Ошибка'}), 500


@app.route('/api/group/unmute/<int:group_id>', methods=['POST'])
def api_group_unmute(group_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    user_role = is_group_member(group_id, session['user_id'])
    if user_role not in ('owner', 'admin'):
        return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

    data = request.get_json()
    target_user_id = data.get('user_id')
    if not target_user_id:
        return jsonify({'success': False, 'error': 'Не указан пользователь'}), 400

    unmute_group_member(group_id, target_user_id)
    return jsonify({'success': True})


# ---------- ЗАЯВКИ НА ВСТУПЛЕНИЕ ----------

@app.route('/api/group/join_requests/<int:group_id>', methods=['GET'])
def api_group_join_requests(group_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    user_role = is_group_member(group_id, session['user_id'])
    if user_role not in ('owner', 'admin'):
        return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

    return jsonify({'requests': [dict(r) for r in get_group_join_requests(group_id)]})


@app.route('/api/group/approve_join/<int:group_id>', methods=['POST'])
def api_group_approve_join(group_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    user_role = is_group_member(group_id, session['user_id'])
    if user_role not in ('owner', 'admin'):
        return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

    data = request.get_json()
    request_id = data.get('request_id')
    if not request_id:
        return jsonify({'success': False, 'error': 'Не указана заявка'}), 400

    user_id = approve_group_join_request(request_id, group_id)
    if user_id:
        socketio.emit('group_join_approved', {'group_id': group_id, 'user_id': user_id},
                      room=f"user_{user_id}")
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Заявка не найдена'}), 400


@app.route('/api/group/reject_join/<int:group_id>', methods=['POST'])
def api_group_reject_join(group_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    user_role = is_group_member(group_id, session['user_id'])
    if user_role not in ('owner', 'admin'):
        return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

    data = request.get_json()
    request_id = data.get('request_id')
    if not request_id:
        return jsonify({'success': False, 'error': 'Не указана заявка'}), 400

    reject_group_join_request(request_id)
    return jsonify({'success': True})


# ---------- МЬЮТ УВЕДОМЛЕНИЙ: группа/канал (как в Telegram) ----------

@app.route('/api/chat/mute', methods=['POST'])
def api_chat_mute():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    chat_type = data.get('chat_type')
    chat_id = data.get('chat_id')
    seconds = data.get('seconds')  # None = бессрочно

    if chat_type not in ('group', 'channel') or not chat_id:
        return jsonify({'success': False, 'error': 'Неверные параметры'}), 400

    if not set_chat_mute(session['user_id'], chat_type, chat_id, seconds):
        return jsonify({'success': False, 'error': 'Ошибка'}), 500
    return jsonify({'success': True})


@app.route('/api/chat/unmute', methods=['POST'])
def api_chat_unmute():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    chat_type = data.get('chat_type')
    chat_id = data.get('chat_id')
    if chat_type not in ('group', 'channel') or not chat_id:
        return jsonify({'success': False, 'error': 'Неверные параметры'}), 400

    if set_chat_mute(session['user_id'], chat_type, chat_id, 0):
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Ошибка'}), 500


@app.route('/api/join_group/<invite_link>')
def api_join_group(invite_link):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    group = get_group_by_invite_link(invite_link)
    if not group:
        return jsonify({'success': False, 'error': 'Группа не найдена'}), 404

    if is_group_member(group['id'], session['user_id']):
        return jsonify({'success': True, 'already_member': True, 'group_id': group['id']})

    if is_group_banned(group['id'], session['user_id']):
        return jsonify({'success': False, 'error': 'Вы забанены в этой группе'}), 403

    # Приватная группа: вступление только по одобрению (заявка), как в Telegram
    if not group.get('is_public'):
        status = get_group_join_request_status(group['id'], session['user_id'])
        if status == 'pending':
            return jsonify({'success': False, 'pending_request': True,
                            'error': 'Заявка уже отправлена', 'group_id': group['id']}), 200
        add_group_join_request(group['id'], session['user_id'])
        socketio.emit('group_join_request', {
            'group_id': group['id'],
            'user_id': session['user_id'],
            'user_name': session.get('display_name') or session.get('username') or 'Пользователь'
        }, room=f"group_{group['id']}")
        return jsonify({'success': True, 'pending_request': True, 'group_id': group['id']})

    add_group_member(group['id'], session['user_id'])
    return jsonify({'success': True, 'group_id': group['id']})


@app.route('/api/leave_group/<int:group_id>', methods=['POST'])
def api_leave_group(group_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    role = is_group_member(group_id, session['user_id'])
    if role == 'owner':
        return jsonify({'success': False, 'error': 'Владелец не может покинуть группу'}), 400

    remove_group_member(group_id, session['user_id'])
    return jsonify({'success': True})


@app.route('/api/delete_group/<int:group_id>', methods=['POST'])
def api_delete_group(group_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    if delete_group(group_id, session['user_id']):
        socketio.emit('group_deleted', {'group_id': group_id}, room=f"group_{group_id}")
        return jsonify({'success': True})

    return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403


@app.route('/join/<invite_link>')
def public_join_group(invite_link):
    """Публичная страница-приглашение в группу (как в Telegram)."""
    group = get_group_by_invite_link(invite_link)
    if not group:
        return 'Группа не найдена', 404
    if 'user_id' not in session:
        return redirect(url_for('auth'))
    if not is_group_member(group['id'], session['user_id']):
        add_group_member(group['id'], session['user_id'])
    return redirect('/chat?open=group&id=' + str(group['id']))

# ---------------------- КАНАЛЫ ----------------------
@app.route('/api/create_channel', methods=['POST'])
def api_create_channel():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    name = data.get('name')
    description = data.get('description')
    is_public = data.get('is_public', True)

    if not name:
        return jsonify({'success': False, 'error': 'Название обязательно'}), 400

    username, uerr = validate_community_username(data.get('username'), kind='channel')
    if uerr:
        return jsonify({'success': False, 'error': uerr}), 400

    channel_id = create_channel(name, session['user_id'], description, is_public, username=username)

    if channel_id:
        return jsonify({'success': True, 'channel_id': channel_id})

    return jsonify({'success': False, 'error': 'Ошибка создания'}), 500


@app.route('/api/update_channel/<int:channel_id>', methods=['POST'])
def api_update_channel(channel_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    channel = get_channel_by_id(channel_id)
    if not channel or channel['owner_id'] != session['user_id']:
        return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

    data = request.get_json()
    updates = {}
    if 'name' in data:
        updates['name'] = data['name']
    if 'description' in data:
        updates['description'] = data['description']
    if 'is_public' in data:
        updates['is_public'] = data['is_public']
    if 'show_sender' in data:
        updates['show_sender'] = bool(data['show_sender'])
    if 'username' in data:
        username, uerr = validate_community_username(data.get('username'), kind='channel', chat_id=channel_id)
        if uerr:
            return jsonify({'success': False, 'error': uerr}), 400
        updates['username'] = username

    if updates:
        update_channel_settings(channel_id, **updates)

    return jsonify({'success': True})


@app.route('/api/add_channel_admin/<int:channel_id>', methods=['POST'])
def api_add_channel_admin(channel_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    channel = get_channel_by_id(channel_id)
    if not channel or channel['owner_id'] != session['user_id']:
        return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

    data = request.get_json()
    user_id = data.get('user_id')
    permissions = data.get('permissions', {})

    add_channel_admin(channel_id, user_id, **permissions)
    return jsonify({'success': True})


@app.route('/api/remove_channel_admin/<int:channel_id>', methods=['POST'])
def api_remove_channel_admin(channel_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    channel = get_channel_by_id(channel_id)
    if not channel or channel['owner_id'] != session['user_id']:
        return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

    data = request.get_json()
    user_id = data.get('user_id')

    remove_channel_admin(channel_id, user_id)
    return jsonify({'success': True})


@app.route('/api/add_channel_subscriber/<int:channel_id>', methods=['POST'])
def api_add_channel_subscriber(channel_id):
    """Добавление подписчика в канал (только владелец)."""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    channel = get_channel_by_id(channel_id)
    if not channel or channel['owner_id'] != session['user_id']:
        return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

    data = request.get_json()
    target_user_id = data.get('user_id')
    if not target_user_id:
        return jsonify({'success': False, 'error': 'Не указан пользователь'}), 400

    if is_channel_subscriber(channel_id, target_user_id):
        return jsonify({'success': False, 'error': 'Уже подписан'}), 400

    subscribe_to_channel(channel_id, target_user_id)
    return jsonify({'success': True})


@app.route('/api/unsubscribe_channel/<int:channel_id>', methods=['POST'])
def api_unsubscribe_channel(channel_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    channel = get_channel_by_id(channel_id)
    if channel and channel['owner_id'] == session['user_id']:
        return jsonify({'success': False, 'error': 'Владелец не может отписаться'}), 400

    unsubscribe_from_channel(channel_id, session['user_id'])
    return jsonify({'success': True})


@app.route('/api/delete_channel/<int:channel_id>', methods=['POST'])
def api_delete_channel(channel_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    if delete_channel(channel_id, session['user_id']):
        socketio.emit('channel_deleted', {'channel_id': channel_id}, room=f"channel_{channel_id}")
        return jsonify({'success': True})

    return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403


@app.route('/c/<invite_link>')
def public_join_channel(invite_link):
    """Публичная страница-приглашение в канал (как в Telegram)."""
    channel = get_channel_by_invite_link(invite_link)
    if not channel:
        return 'Канал не найден', 404
    if 'user_id' not in session:
        return redirect(url_for('auth'))
    if not is_channel_subscriber(channel['id'], session['user_id']):
        subscribe_to_channel(channel['id'], session['user_id'])
    return redirect('/chat?open=channel&id=' + str(channel['id']))

# ---------------------- ВИДЕОЧАТ ----------------------
@app.route('/api/video/create_room', methods=['POST'])
def api_video_create_room():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    room_id = generate_room_id()
    call_type = request.json.get('call_type', 'video') if request.is_json else 'video'

    video_rooms[room_id] = {
        'creator_id': session['user_id'],
        'creator_name': session.get('display_name', session['username']),
        'participants': {},
        'created_at': datetime.now().isoformat(),
        'call_type': call_type
    }

    create_video_call(room_id, session['user_id'], call_type)

    return jsonify({
        'success': True,
        'room_id': room_id,
        'join_url': f"/video/{room_id}"
    })


@app.route('/api/video/join/<room_id>', methods=['POST'])
def api_video_join_room(room_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    if room_id not in video_rooms:
        return jsonify({'success': False, 'error': 'Комната не найдена'}), 404

    audio_only = request.json.get('audio_only', False) if request.is_json else False

    add_video_call_participant(room_id, session['user_id'], audio_only)

    return jsonify({
        'success': True,
        'room': {
            'room_id': room_id,
            'creator_name': video_rooms[room_id]['creator_name'],
            'call_type': video_rooms[room_id]['call_type']
        }
    })


@app.route('/api/video/end/<room_id>', methods=['POST'])
def api_video_end_room(room_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    if room_id in video_rooms:
        if video_rooms[room_id]['creator_id'] == session['user_id']:
            end_video_call(room_id)
            socketio.emit('room_ended', {'room_id': room_id}, room=f"video_{room_id}")
            del video_rooms[room_id]
            return jsonify({'success': True})

    return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403


@app.route('/video/<room_id>')
def video_room_page(room_id):
    if 'user_id' not in session:
        return redirect(url_for('auth'))

    if room_id not in video_rooms:
        return render_template('room_not_found.html', room_id=room_id)

    return render_template('video_room.html',
                           room_id=room_id,
                           username=session.get('display_name', session['username']),
                           user_id=session['user_id'])


# ---------------------- ИСТОРИИ ----------------------
@app.route('/api/upload_story', methods=['POST'])
def api_upload_story():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        file = request.files.get('file')
        caption = request.form.get('caption', '')
        music = request.files.get('music')
        privacy = request.form.get('privacy', 'everyone')
        selected_users = request.form.getlist('selected_users')

        if not file:
            return jsonify({'error': 'No file'}), 400

        image_extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg',
                            'tiff', 'tif', 'heic', 'heif', 'jfif', 'pjpeg', 'pjp',
                            'avif', 'apng', 'jpe', 'jif', 'jfi']

        video_extensions = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'm4v',
                            'mpg', 'mpeg', '3gp', '3g2', 'ogv', 'ts', 'mts', 'm2ts',
                            'vob', 'divx', 'xvid', 'rm', 'rmvb', 'asf', 'mxf', 'hevc']

        ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else 'png'

        if ext in image_extensions:
            file_type = 'photo'
        elif ext in video_extensions:
            file_type = 'video'
        else:
            file_type = 'photo'

        filename = f"{uuid.uuid4().hex}.{ext}"
        folder = os.path.join(app.config['UPLOAD_FOLDER'], 'stories')
        os.makedirs(folder, exist_ok=True)
        file_path = os.path.join(folder, filename)
        file.save(file_path)

        music_path = None
        if music and music.filename:
            music_ext = music.filename.rsplit('.', 1)[1].lower() if '.' in music.filename else 'mp3'
            music_name = f"{uuid.uuid4().hex}.{music_ext}"
            music_folder = os.path.join(app.config['UPLOAD_FOLDER'], 'story_music')
            os.makedirs(music_folder, exist_ok=True)
            music_path = os.path.join(music_folder, music_name)
            music.save(music_path)
            music_path = f"uploads/story_music/{music_name}"

        story_id = create_story(
            session['user_id'],
            file_type,
            f"uploads/stories/{filename}",
            caption,
            music_path,
            privacy,
            selected_users
        )

        socketio.emit('new_story', {'user_id': session['user_id']})

        return jsonify({'success': True, 'story_id': story_id})

    except Exception as e:
        print(f"Error uploading story: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/get_stories')
def api_get_stories():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    stories = get_stories_for_user(session['user_id'])
    return jsonify([dict(s) for s in stories])


@app.route('/api/story_view', methods=['POST'])
def api_story_view():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    story_id = data['story_id']

    add_story_view(story_id, session['user_id'])
    add_story_interaction(story_id, session['user_id'], 'view')

    return jsonify({'success': True})


@app.route('/api/story_like', methods=['POST'])
def api_story_like():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    story_id = data['story_id']

    add_story_interaction(story_id, session['user_id'], 'like')

    return jsonify({'success': True})


@app.route('/api/story_reaction', methods=['POST'])
def api_story_reaction():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        data = request.get_json()
        story_id = data['story_id']
        reaction = data['reaction']

        add_story_reaction(story_id, session['user_id'], reaction)

        conn = get_db()
        cursor = dict_cursor(conn)
        cursor.execute('SELECT user_id, file_type, file_path FROM stories WHERE id = %s', (story_id,))
        story = cursor.fetchone()
        conn.close()

        if story and story['user_id'] != session['user_id']:
            chat_id = get_or_create_chat(session['user_id'], story['user_id'])
            reaction_names = {'❤️': 'сердечко', '🔥': 'огонь', '👎': 'дизлайк', '👍': 'лайк'}
            reaction_names.get(reaction, reaction)
            story_card = f"@@STORY:{story_id}:{story['file_type'] or 'photo'}:{story['file_path']}@@"
            message_content = f"{story_card}\n📱 {reaction} на вашу историю"

            message = send_message(
                chat_id=chat_id,
                sender_id=session['user_id'],
                content=message_content
            )

            if message:
                socketio.emit('new_message', {
                    'chat_id': chat_id,
                    'message': dict(message)
                }, room=f"chat_{chat_id}")

        return jsonify({'success': True})

    except Exception as e:
        print(f"Error in story_reaction: {e}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/story_reply', methods=['POST'])
def api_story_reply():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        data = request.get_json()
        story_id = data['story_id']
        reply_text = data.get('reply_text', '')

        conn = get_db()
        cursor = dict_cursor(conn)
        cursor.execute('SELECT user_id, file_type, file_path FROM stories WHERE id = %s', (story_id,))
        story = cursor.fetchone()
        conn.close()

        if not story:
            return jsonify({'success': False, 'error': 'Story not found'}), 404

        chat_id = get_or_create_chat(session['user_id'], story['user_id'])
        story_card = f"@@STORY:{story_id}:{story['file_type'] or 'photo'}:{story['file_path']}@@"
        if reply_text:
            message_content = f"{story_card}\n📱 Ответ на историю\n{reply_text}"
        else:
            message_content = f"{story_card}\n📱 Ответ на историю"
        message = send_message(
            chat_id=chat_id,
            sender_id=session['user_id'],
            content=message_content
        )

        if message:
            socketio.emit('new_message', {
                'chat_id': chat_id,
                'message': dict(message)
            }, room=f"chat_{chat_id}")

        add_story_interaction(story_id, session['user_id'], 'reply', reply_text)

        return jsonify({'success': True, 'chat_id': chat_id, 'message': dict(message) if message else None})

    except Exception as e:
        print(f"Error in story_reply: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/delete_story', methods=['POST'])
def api_delete_story():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    story_id = data.get('story_id')

    conn = get_db()
    cursor = dict_cursor(conn)
    cursor.execute('SELECT user_id, file_path, music FROM stories WHERE id = %s', (story_id,))
    story = cursor.fetchone()

    if not story:
        conn.close()
        return jsonify({'success': False, 'error': 'История не найдена'}), 404

    if story['user_id'] != session['user_id']:
        conn.close()
        return jsonify({'success': False, 'error': 'Нет прав'}), 403

    for path in [story['file_path'], story['music']]:
        if path:
            try:
                full_path = os.path.join('static', path)
                if os.path.exists(full_path):
                    os.remove(full_path)
            except:
                pass

    cursor.execute('DELETE FROM stories WHERE id = %s', (story_id,))
    conn.commit()
    conn.close()

    socketio.emit('story_deleted', {'story_id': story_id, 'user_id': session['user_id']})
    return jsonify({'success': True})


@app.route('/api/replace_story/<int:story_id>', methods=['POST'])
def api_replace_story(story_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    file = request.files.get('file')
    caption = request.form.get('caption', '')
    if not file:
        return jsonify({'error': 'No file'}), 400

    conn = get_db()
    cursor = dict_cursor(conn)
    cursor.execute('SELECT user_id, file_path FROM stories WHERE id = %s', (story_id,))
    story = cursor.fetchone()

    if not story or story['user_id'] != session['user_id']:
        conn.close()
        return jsonify({'success': False, 'error': 'Нет прав'}), 403

    try:
        image_extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg',
                            'tiff', 'tif', 'heic', 'heif', 'jfif', 'pjpeg', 'pjp',
                            'avif', 'apng', 'jpe', 'jif', 'jfi']
        video_extensions = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'm4v',
                            'mpg', 'mpeg', '3gp', '3g2', 'ogv', 'ts', 'mts', 'm2ts',
                            'vob', 'divx', 'xvid', 'rm', 'rmvb', 'asf', 'mxf', 'hevc']

        ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else 'png'

        if ext in image_extensions:
            file_type = 'photo'
        elif ext in video_extensions:
            file_type = 'video'
        else:
            file_type = 'photo'

        filename = f"{uuid.uuid4().hex}.{ext}"
        folder = os.path.join(app.config['UPLOAD_FOLDER'], 'stories')
        os.makedirs(folder, exist_ok=True)
        file_path = os.path.join(folder, filename)
        file.save(file_path)

        old_path = story['file_path']
        cursor.execute('''
            UPDATE stories SET file_type = %s, file_path = %s, caption = %s
            WHERE id = %s
        ''', (file_type, f"uploads/stories/{filename}", caption, story_id))
        conn.commit()
        conn.close()

        if old_path:
            try:
                full_old = os.path.join('static', old_path)
                if os.path.exists(full_old):
                    os.remove(full_old)
            except:
                pass

        return jsonify({'success': True})

    except Exception as e:
        conn.close()
        print(f"Error replacing story: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/share_story', methods=['POST'])
def api_share_story():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    story_id = data.get('story_id')
    to_chat_id = data.get('to_chat_id')
    to_group_id = data.get('to_group_id')
    to_channel_id = data.get('to_channel_id')

    conn = get_db()
    cursor = dict_cursor(conn)
    cursor.execute('SELECT user_id, file_type, file_path FROM stories WHERE id = %s', (story_id,))
    story = cursor.fetchone()
    conn.close()

    if not story:
        return jsonify({'success': False, 'error': 'История не найдена'}), 404

    story_card = f"@@STORY:{story_id}:{story['file_type'] or 'photo'}:{story['file_path']}@@"
    message_content = f"{story_card}\n📱 Поделился(ась) историей"

    result_chat_id = None
    if to_chat_id:
        result_chat_id = get_or_create_chat(session['user_id'], int(to_chat_id))
        message = send_message(
            chat_id=result_chat_id,
            sender_id=session['user_id'],
            content=message_content
        )
    else:
        message = send_message(
            group_id=to_group_id,
            channel_id=to_channel_id,
            sender_id=session['user_id'],
            content=message_content
        )

    if message:
        target_room = None
        if result_chat_id:
            target_room = f"chat_{result_chat_id}"
        elif to_group_id:
            target_room = f"group_{to_group_id}"
        elif to_channel_id:
            target_room = f"channel_{to_channel_id}"

        if target_room:
            socketio.emit('new_message', {
                'chat_id': result_chat_id,
                'group_id': to_group_id,
                'channel_id': to_channel_id,
                'message': dict(message)
            }, room=target_room)

    return jsonify({'success': True, 'message': dict(message) if message else None})


@app.route('/api/get_story_info/<int:story_id>')
def api_get_story_info(story_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    conn = get_db()
    cursor = dict_cursor(conn)
    cursor.execute('''
        SELECT s.*, u.username, u.display_name, u.avatar
        FROM stories s
        JOIN users u ON s.user_id = u.id
        WHERE s.id = %s
    ''', (story_id,))
    story = cursor.fetchone()

    viewers = get_story_viewers(story_id)
    likes = get_story_likes(story_id)
    reactions = get_story_reactions(story_id)

    conn.close()

    return jsonify({
        'story': dict(story) if story else None,
        'viewers': [dict(v) for v in viewers],
        'likes': [dict(l) for l in likes],
        'reactions': [dict(r) for r in reactions]
    })


# ---------------------- НОВЫЕ МАРШРУТЫ ДЛЯ СТАТИСТИКИ И ПОИСКА ----------------------
@app.route('/api/get_story_stats/<int:story_id>')
def api_get_story_stats(story_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    stats = get_story_stats(story_id, session['user_id'])
    if stats is None:
        return jsonify({'error': 'Not authorized'}), 403

    return jsonify(stats)


@app.route('/api/search_in_chat', methods=['POST'])
def api_search_in_chat():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    chat_id = data.get('chat_id')
    query = data.get('query', '').strip()

    if not chat_id or len(query) < 2:
        return jsonify({'messages': []})

    messages = search_messages_in_chat(chat_id, session['user_id'], query)
    return jsonify({'messages': [dict(m) for m in messages]})


# ---------------------- ПРОФИЛЬ ----------------------
@app.route('/api/get_my_user')
def api_get_my_user():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    user = get_user_by_id(session['user_id'])
    if user:
        return jsonify({
            'id': user['id'],
            'unique_id': user['unique_id'],
            'username': user['username'],
            'display_name': user['display_name'],
            'phone': user['phone'],
            'avatar': user['avatar'],
            'bio': user['bio'] or '',
            'birthday': user['birthday'] or '',
            'last_seen': user['last_seen']
        })
    return jsonify({'error': 'User not found'}), 404


@app.route('/api/get_user/<int:user_id>')
def api_get_user(user_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    user = get_user_by_id(user_id)
    if user and not user['is_deleted']:
        return jsonify({
            'id': user['id'],
            'unique_id': user['unique_id'],
            'username': user['username'],
            'display_name': user['display_name'],
            'phone': user['phone'],
            'avatar': user['avatar'],
            'bio': user['bio'] or '',
            'birthday': user['birthday'] or '',
            'last_seen': user['last_seen']
        })
    return jsonify({'error': 'User not found'}), 404


@app.route('/api/get_user_profile/<int:user_id>')
def api_get_user_profile(user_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    user = get_user_profile(user_id, session['user_id'])
    if user:
        return jsonify(user)
    return jsonify({'error': 'User not found'}), 404


@app.route('/api/update_profile', methods=['POST'])
def api_update_profile():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    username = request.form.get('username')
    display_name = request.form.get('display_name')
    bio = request.form.get('bio')
    birthday = request.form.get('birthday')

    updates = {}

    if username:
        if not check_username_available(username, session['user_id']):
            return jsonify({'success': False, 'error': 'Username already taken'}), 400
        updates['username'] = username
        session['username'] = username

    if display_name is not None:
        updates['display_name'] = display_name
        session['display_name'] = display_name

    if bio is not None:
        updates['bio'] = bio

    if birthday:
        updates['birthday'] = birthday

    if 'avatar' in request.files:
        file = request.files['avatar']
        if file and file.filename:
            ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else 'png'
            unique_name = f"{uuid.uuid4().hex}.{ext}"
            folder = os.path.join(app.config['UPLOAD_FOLDER'], 'avatars')
            os.makedirs(folder, exist_ok=True)
            file_path = os.path.join(folder, unique_name)
            file.save(file_path)
            resize_and_crop_image(file_path)
            updates['avatar'] = f"uploads/avatars/{unique_name}"

    if updates:
        update_user_settings(session['user_id'], **updates)

    return jsonify({'success': True, 'user': updates})


@app.route('/api/update_profile_avatar', methods=['POST'])
def api_update_profile_avatar():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    avatar_url = data.get('avatar_url')

    if avatar_url:
        update_user_settings(session['user_id'], avatar=avatar_url.lstrip('/'))
        return jsonify({'success': True})

    return jsonify({'success': False}), 400


@app.route('/api/upload_chat_avatar/<string:kind>/<int:chat_id>', methods=['POST'])
def api_upload_chat_avatar(kind, chat_id):
    """Загрузка аватара группы или канала (как фото группы в Telegram)."""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    if kind == 'group':
        role = is_group_member(chat_id, session['user_id'])
        if role not in ('owner', 'admin'):
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403
        if role == 'admin' and not can_group_perform(chat_id, session['user_id'], 'can_change_info'):
            return jsonify({'success': False, 'error': 'У вас нет права менять информацию'}), 403
        updater = lambda path: update_group_settings(chat_id, avatar=path)
    elif kind == 'channel':
        ch = get_channel_by_id(chat_id)
        if not ch or ch['owner_id'] != session['user_id']:
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403
        updater = lambda path: update_channel_settings(chat_id, avatar=path)
    else:
        return jsonify({'success': False, 'error': 'Неверный тип'}), 400

    if 'photo' not in request.files:
        return jsonify({'success': False, 'error': 'Файл не найден'}), 400
    file = request.files['photo']
    if not file or not file.filename:
        return jsonify({'success': False, 'error': 'Файл не выбран'}), 400

    from werkzeug.utils import secure_filename
    ext = secure_filename(file.filename).rsplit('.', 1)[-1].lower() if '.' in file.filename else 'jpg'
    if ext not in ['png', 'jpg', 'jpeg', 'webp', 'gif']:
        ext = 'jpg'
    filename = f"{kind}_{chat_id}_{uuid.uuid4().hex}.{ext}"
    os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'avatars'), exist_ok=True)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], 'avatars', filename)
    file.save(filepath)
    url_path = f"uploads/avatars/{filename}"

    updater(url_path)
    return jsonify({'success': True, 'url': url_path})


@app.route('/api/delete_account', methods=['POST'])
def api_delete_account():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    confirmation = data.get('confirmation', '')
    user = get_user_by_id(session['user_id'])

    if confirmation == user['phone'] or confirmation == user['username']:
        delete_user_account(session['user_id'])
        session.clear()
        return jsonify({'success': True})

    return jsonify({'success': False}), 400


@app.route('/api/upload_auth_photo', methods=['POST'])
def api_upload_auth_photo():
    """Загрузка фото на странице входа (сохраняется в static/auth-logo.png)"""
    if 'photo' not in request.files:
        return jsonify({'error': 'Файл не найден'}), 400
    file = request.files['photo']
    if file.filename == '':
        return jsonify({'error': 'Файл не выбран'}), 400
    from werkzeug.utils import secure_filename
    import os
    filename = 'auth-logo.png'
    filepath = os.path.join(app.root_path, 'static', filename)
    file.save(filepath)
    return jsonify({'success': True, 'url': '/static/auth-logo.png'})


# ---------------------- НАСТРОЙКИ ----------------------
@app.route('/api/get_settings')
def api_get_settings():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    settings = get_user_settings(session['user_id'])
    return jsonify(settings or {})


@app.route('/api/update_theme', methods=['POST'])
def api_update_theme():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    update_user_settings(session['user_id'], theme=data.get('theme', 'light'))
    return jsonify({'success': True})


@app.route('/api/update_font_size', methods=['POST'])
def api_update_font_size():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    update_user_settings(session['user_id'], font_size=data.get('font_size', 14))
    return jsonify({'success': True})


@app.route('/api/update_bubble_radius', methods=['POST'])
def api_update_bubble_radius():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    update_user_settings(session['user_id'], bubble_radius=data.get('bubble_radius', 18))
    return jsonify({'success': True})


@app.route('/api/update_font_family', methods=['POST'])
def api_update_font_family():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    update_user_settings(session['user_id'], font_family=data.get('font_family', "'Unbounded', cursive"))
    return jsonify({'success': True})


@app.route('/api/update_message_colors', methods=['POST'])
def api_update_message_colors():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    updates = {}
    if 'my_message_color' in data:
        updates['my_message_color'] = data['my_message_color']
    if 'their_message_color' in data:
        updates['their_message_color'] = data['their_message_color']

    if updates:
        update_user_settings(session['user_id'], **updates)

    return jsonify({'success': True})


@app.route('/api/update_wallpaper', methods=['POST'])
def api_update_wallpaper():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    if 'wallpaper' in request.files:
        file = request.files['wallpaper']
        if file and file.filename:
            ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else 'jpg'
            unique_name = f"{uuid.uuid4().hex}.{ext}"
            folder = os.path.join(app.config['UPLOAD_FOLDER'], 'wallpapers')
            os.makedirs(folder, exist_ok=True)
            file_path = os.path.join(folder, unique_name)
            file.save(file_path)
            update_user_settings(session['user_id'], wallpaper_image=f"uploads/wallpapers/{unique_name}", wallpaper='')
            return jsonify({'success': True, 'wallpaper_image': f"uploads/wallpapers/{unique_name}"})

    data = request.get_json()
    if data and 'wallpaper' in data:
        update_user_settings(session['user_id'], wallpaper=data['wallpaper'], wallpaper_image='')
        return jsonify({'success': True})

    return jsonify({'success': False}), 400


@app.route('/api/get_privacy')
def api_get_privacy():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    settings = get_privacy_settings(session['user_id'])
    return jsonify(settings or {})


@app.route('/api/update_privacy', methods=['POST'])
def api_update_privacy():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    update_privacy_settings(
        session['user_id'],
        data.get('last_seen', 'everyone'),
        data.get('profile_photo', 'everyone'),
        data.get('forward_messages', 'everyone'),
        data.get('calls', 'everyone'),
        data.get('messages', 'everyone')
    )
    return jsonify({'success': True})








# ---------------------- ЗАКРЕПЛЕНИЕ ЧАТОВ ----------------------
@app.route('/api/pin_chat', methods=['POST'])
def api_pin_chat():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    chat_id = data.get('chat_id')
    if chat_id:
        pin_chat(session['user_id'], chat_id)
        return jsonify({'success': True})
    return jsonify({'success': False}), 400


@app.route('/api/unpin_chat', methods=['POST'])
def api_unpin_chat():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    chat_id = data.get('chat_id')
    if chat_id:
        unpin_chat(session['user_id'], chat_id)
        return jsonify({'success': True})
    return jsonify({'success': False}), 400


# ---------------------- КОНТАКТЫ ----------------------

# main.py - ПОЛНОСТЬЮ ЗАМЕНИТЕ ВСЕ МАРШРУТЫ КОНТАКТОВ

@app.route('/api/check_contact/<int:user_id>')
def api_check_contact(user_id):
    if 'user_id' not in session:
        return jsonify({'is_contact': False, 'contact_name': None})

    conn = get_db()
    cursor = dict_cursor(conn)
    cursor.execute('SELECT id FROM contacts WHERE user_id = %s AND contact_id = %s',
                   (session['user_id'], user_id))
    result = cursor.fetchone()
    is_contact = result is not None

    contact_name = None
    if is_contact:
        cursor.execute('SELECT name FROM contact_names WHERE user_id = %s AND contact_id = %s',
                       (session['user_id'], user_id))
        name_result = cursor.fetchone()
        contact_name = name_result['name'] if name_result else None

    conn.close()

    return jsonify({'is_contact': is_contact, 'contact_name': contact_name})


@app.route('/api/add_contact', methods=['POST'])
def api_add_contact():
    if 'user_id' not in session:
        return jsonify({'success': False}), 401

    data = request.get_json()
    contact_id = data.get('contact_id')
    custom_name = data.get('name', '').strip()

    conn = get_db()
    cursor = dict_cursor(conn)

    try:
        cursor.execute('INSERT INTO contacts (user_id, contact_id) VALUES (%s, %s) ON CONFLICT DO NOTHING',
                       (session['user_id'], contact_id))

        if custom_name:
            cursor.execute('INSERT INTO contact_names (user_id, contact_id, name) VALUES (%s, %s, %s) '
                           'ON CONFLICT (user_id, contact_id) DO UPDATE SET name = excluded.name',
                           (session['user_id'], contact_id, custom_name))

        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error adding contact: {e}")
        conn.close()
        return jsonify({'success': False}), 500


@app.route('/api/remove_contact', methods=['POST'])
def api_remove_contact():
    if 'user_id' not in session:
        return jsonify({'success': False}), 401

    data = request.get_json()
    contact_id = data.get('contact_id')

    conn = get_db()
    cursor = dict_cursor(conn)
    cursor.execute('DELETE FROM contacts WHERE user_id = %s AND contact_id = %s',
                   (session['user_id'], contact_id))
    cursor.execute('DELETE FROM contact_names WHERE user_id = %s AND contact_id = %s',
                   (session['user_id'], contact_id))
    conn.commit()
    conn.close()

    return jsonify({'success': True})


@app.route('/api/rename_contact', methods=['POST'])
def api_rename_contact():
    if 'user_id' not in session:
        return jsonify({'success': False}), 401

    data = request.get_json()
    contact_id = data.get('contact_id')
    new_name = data.get('name', '').strip()

    conn = get_db()
    cursor = dict_cursor(conn)
    cursor.execute('INSERT INTO contact_names (user_id, contact_id, name) VALUES (%s, %s, %s) '
                   'ON CONFLICT (user_id, contact_id) DO UPDATE SET name = excluded.name',
                   (session['user_id'], contact_id, new_name))
    conn.commit()
    conn.close()

    return jsonify({'success': True})


@app.route('/api/get_contacts')
def api_get_contacts():
    if 'user_id' not in session:
        return jsonify([])

    conn = get_db()
    cursor = dict_cursor(conn)
    cursor.execute('''
        SELECT u.id, u.username, u.display_name, u.avatar, u.phone, u.unique_id,
               cn.name as custom_name 
        FROM contacts c
        JOIN users u ON c.contact_id = u.id
        LEFT JOIN contact_names cn ON cn.user_id = %s AND cn.contact_id = u.id
        WHERE c.user_id = %s AND u.is_deleted = FALSE
        ORDER BY COALESCE(cn.name, u.display_name, u.username)
    ''', (session['user_id'], session['user_id']))
    contacts = cursor.fetchall()
    conn.close()

    result = []
    for c in contacts:
        result.append({
            'id': c['id'],
            'username': c['username'],
            'display_name': c['display_name'],
            'avatar': c['avatar'],
            'phone': c['phone'],
            'unique_id': c['unique_id'],
            'custom_name': c['custom_name']
        })

    return jsonify(result)

# ---------------------- ЗВОНКИ ----------------------
@app.route('/api/make_call', methods=['POST'])
def api_make_call():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    receiver_id = data.get('receiver_id')
    call_type = data.get('call_type', 'audio')

    if not receiver_id:
        return jsonify({'error': 'receiver_id required'}), 400

    call_id = add_call(session['user_id'], receiver_id, call_type, 'ringing')

    receiver = get_user_by_id(receiver_id)
    if receiver:
        socketio.emit('incoming_call', {
            'call_id': call_id,
            'caller_id': session['user_id'],
            'caller_name': session.get('display_name', session['username']),
            'call_type': call_type
        }, room=f"user_{receiver_id}")

    return jsonify({'success': True, 'call_id': call_id})


@app.route('/api/answer_call', methods=['POST'])
def api_answer_call():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    update_call_status(data.get('call_id'), 'answered')
    return jsonify({'success': True})


@app.route('/api/end_call', methods=['POST'])
def api_end_call():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    update_call_status(data.get('call_id'), 'ended', data.get('duration', 0))
    return jsonify({'success': True})


@app.route('/api/get_call_history')
def api_get_call_history():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    calls = get_call_history(session['user_id'])
    return jsonify([dict(c) for c in calls])


# ---------------------- ПРЕДЗАГРУЗОЧНЫЕ АВАТАРКИ ----------------------
@app.route('/api/preloaded_avatars')
def api_preloaded_avatars():
    avatars = get_preloaded_avatars()
    return jsonify([dict(a) for a in avatars])


# ---------------------- СЕССИИ ----------------------
@app.route('/api/get_sessions')
def api_get_sessions():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    sessions = get_user_sessions(session['user_id'])
    current_token = session.get('session_token', '')
    result = []
    for s in sessions:
        d = dict(s)
        d['is_current'] = d['session_token'] == current_token
        result.append(d)
    return jsonify(result)


@app.route('/api/terminate_session', methods=['POST'])
def api_terminate_session():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    delete_session(data.get('session_token'))
    return jsonify({'success': True})


@app.route('/api/terminate_all_sessions', methods=['POST'])
def api_terminate_all_sessions():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    delete_all_sessions_except(session['user_id'], session.get('session_token', ''))
    return jsonify({'success': True})


# ===== ПЛЕЙЛИСТ API =====

@app.route('/api/playlist/list', methods=['GET'])
def api_get_playlist():
    """Получить список песен пользователя"""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    user_id = request.args.get('user_id', session['user_id'])

    conn = get_db()
    cursor = dict_cursor(conn)
    cursor.execute('''
        SELECT id, title, artist, file_path, duration
        FROM user_playlist
        WHERE user_id = %s
        ORDER BY created_at DESC
    ''', (user_id,))
    songs = cursor.fetchall()
    conn.close()

    return jsonify([dict(s) for s in songs])


@app.route('/api/playlist/add', methods=['POST'])
def api_add_to_playlist():
    """Добавить песню в плейлист"""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    file = request.files.get('file')
    title = request.form.get('title', 'Без названия')
    artist = request.form.get('artist', 'Неизвестен')

    if not file:
        return jsonify({'error': 'No file'}), 400

    # Сохранение файла
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else 'mp3'
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    folder = os.path.join(app.config['UPLOAD_FOLDER'], 'music')
    os.makedirs(folder, exist_ok=True)
    file_path = os.path.join(folder, unique_name)
    file.save(file_path)

    # Определяем длительность (опционально)
    duration = 0
    try:
        from mutagen.mp3 import MP3
        audio = MP3(file_path)
        duration = int(audio.info.length)
    except:
        pass

    # Запись в БД
    conn = get_db()
    cursor = dict_cursor(conn)
    cursor.execute('''
        INSERT INTO user_playlist (user_id, title, artist, file_path, duration)
        VALUES (%s, %s, %s, %s, %s)
    ''', (session['user_id'], title, artist, f"uploads/music/{unique_name}", duration))
    conn.commit()
    conn.close()

    return jsonify({'success': True})


@app.route('/api/playlist/delete/<int:song_id>', methods=['POST'])
def api_delete_song(song_id):
    """Удалить песню из плейлиста"""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    conn = get_db()
    cursor = dict_cursor(conn)
    cursor.execute('DELETE FROM user_playlist WHERE id = %s AND user_id = %s', (song_id, session['user_id']))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


# ===== БАННЕР (Цвет/Картинка) =====
@app.route('/api/update_banner', methods=['POST'])
def api_update_banner():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    # Проверяем, пришли ли JSON данные
    if request.is_json:
        data = request.get_json()
        if data and 'banner_color' in data:
            update_user_settings(session['user_id'], banner_color=data['banner_color'], banner_image=None)
            return jsonify({'success': True, 'banner_color': data['banner_color']})

    # Проверяем, пришел ли файл
    if 'banner_image' in request.files:
        file = request.files['banner_image']
        if file and file.filename:
            ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else 'jpg'
            unique_name = f"{uuid.uuid4().hex}.{ext}"
            folder = os.path.join(app.config['UPLOAD_FOLDER'], 'banners')
            os.makedirs(folder, exist_ok=True)
            file_path = os.path.join(folder, unique_name)
            file.save(file_path)

            banner_path = f"uploads/banners/{unique_name}"
            update_user_settings(session['user_id'], banner_image=banner_path, banner_color=None)

            return jsonify({'success': True, 'banner_image': banner_path})

    return jsonify({'success': False, 'error': 'No data provided'}), 400

# ---------------------- ЗАГРУЗКА ФАЙЛОВ ----------------------
def _safe_file(folder, filename):
    root = os.path.abspath(folder)
    full = os.path.abspath(os.path.join(root, filename))
    if not full.startswith(root + os.sep) or not os.path.isfile(full):
        abort(404)
    return full


@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    return send_file(_safe_file(app.config['UPLOAD_FOLDER'], filename))


@app.route('/static/avatar-swg/<path:filename>')
def static_avatar(filename):
    return send_file(_safe_file(os.path.join('static', 'avatar-swg'), filename))


# ---------------------- CDN (вынесенные файлы UI: cdn/css, cdn/js) ----------------------
CDN_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cdn')


@app.route('/cdn/<path:filename>')
def cdn_assets(filename):
    return send_from_directory(CDN_DIR, filename)


@app.route('/api/get_channel_admins/<int:channel_id>')
def api_get_channel_admins(channel_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    admins = get_channel_admins_list(channel_id)
    return jsonify([dict(a) for a in admins])


@app.route('/api/subscribe/channel/<invite_link>')
def subscribe_channel_by_link(invite_link):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    channel = get_channel_by_invite_link(invite_link)
    if not channel:
        return jsonify({'success': False, 'error': 'Канал не найден'}), 404

    subscribe_to_channel(channel['id'], session['user_id'])
    return jsonify({'success': True, 'channel_id': channel['id']})


@app.route('/api/subscribe/channel/id/<int:channel_id>')
def subscribe_channel_by_id(channel_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    channel = get_channel_by_id(channel_id)
    if not channel:
        return jsonify({'success': False, 'error': 'Канал не найден'}), 404

    subscribe_to_channel(channel_id, session['user_id'])
    return jsonify({'success': True, 'channel_id': channel_id})


@app.route('/api/get_user_by_username')
def api_get_user_by_username():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    username = request.args.get('username', '')
    user = get_user_by_username(username)
    if user:
        return jsonify({
            'id': user['id'],
            'unique_id': user['unique_id'],
            'username': user['username'],
            'display_name': user['display_name'],
            'avatar': user['avatar'],
            'phone': user['phone'],
            'bio': user['bio'],
            'last_seen': user['last_seen']
        })
    return jsonify({'error': 'Not found'}), 404


@app.route('/api/get_blocked_users')
def api_get_blocked_users():
    """Получить список заблокированных пользователей"""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    blocked = get_blocked_users(session['user_id'])
    return jsonify([dict(b) for b in blocked])


#----------------------ДОПОЛНИТЕЛЬНО--------------------

@app.route('/api/download_file/<path:filepath>')
def api_download_file(filepath):
    """Скачивание файла"""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    # Декодируем путь (заменяем -- на /)
    filepath = filepath.replace('--', '/')

    # Определяем полный путь к файлу
    if filepath.startswith('static/'):
        full_path = filepath
    elif filepath.startswith('uploads/'):
        full_path = os.path.join('static', filepath)
    else:
        full_path = os.path.join('static', 'uploads', filepath)

    if os.path.exists(full_path):
        return send_file(full_path, as_attachment=True)

    return jsonify({'error': 'File not found'}), 404


@app.route('/api/playlist/add_from_message', methods=['POST'])
def api_add_to_playlist_from_message():
    """Добавление аудиофайла в плейлист из сообщения"""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        # Пробуем получить данные из JSON
        if request.is_json:
            data = request.get_json()
            file_path = data.get('file_path', '')
            title = data.get('title', 'Без названия')
            artist = data.get('artist', 'Неизвестен')
            file_name = data.get('file_name', '')
        else:
            # Получаем из FormData
            file_path = request.form.get('file_path', '')
            title = request.form.get('title', 'Без названия')
            artist = request.form.get('artist', 'Неизвестен')
            file_name = request.form.get('file_name', '')

        if not file_path:
            return jsonify({'error': 'No file path'}), 400

        # Определяем полный путь
        if file_path.startswith('static/'):
            full_path = file_path
        elif file_path.startswith('uploads/'):
            full_path = os.path.join('static', file_path)
        else:
            full_path = os.path.join('static', 'uploads', file_path)

        if not os.path.exists(full_path):
            return jsonify({'error': 'File not found'}), 404

        # Копируем в папку музыки
        music_folder = os.path.join(app.config['UPLOAD_FOLDER'], 'music')
        os.makedirs(music_folder, exist_ok=True)

        ext = file_path.rsplit('.', 1)[1].lower() if '.' in file_path else 'mp3'
        unique_name = f"{uuid.uuid4().hex}.{ext}"
        new_path = os.path.join(music_folder, unique_name)

        import shutil
        shutil.copy2(full_path, new_path)

        # Записываем в БД
        conn = get_db()
        cursor = dict_cursor(conn)

        # Определяем длительность
        duration = 0
        try:
            from mutagen.mp3 import MP3
            audio = MP3(new_path)
            duration = int(audio.info.length)
        except:
            pass

        cursor.execute('''
            INSERT INTO user_playlist (user_id, title, artist, file_path, duration)
            VALUES (%s, %s, %s, %s, %s)
        ''', (session['user_id'], title, artist, f"uploads/music/{unique_name}", duration))

        conn.commit()
        conn.close()

        return  jsonify({'success': True})

    except Exception as e:
        print(f"Error adding to playlist: {e}")
        return jsonify({'error': str(e)}), 500


# Замените предыдущие маршруты на эти:

@app.route('/api/auth/add_account', methods=['POST'])
def api_add_account():
    """Привязка аккаунта к мастер-аккаунту (по паролю или по коду)"""
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Нет авторизации'}), 401

    data = request.get_json()
    phone = data.get('phone')
    auth_type = data.get('auth_type', 'password')

    # Мастер-аккаунт группы (даже если сейчас вошли в привязанный)
    current_id = session['user_id']
    master_id = get_master_account(current_id)

    user = None
    if auth_type == 'code':
        code = data.get('code')
        if not phone or not code:
            return jsonify({'success': False, 'error': 'Введите номер и код входа'}), 400
        user = verify_login_code(phone, code)
        if not user:
            return jsonify({'success': False, 'error': 'Неверный или просроченный код входа'}), 401
        if user['is_deleted'] or not user['registration_complete']:
            return jsonify({'success': False, 'error': 'Аккаунт недоступен'}), 401
        # Если у добавляемого аккаунта включён облачный пароль — требуем его
        # (сессию НЕ меняем: пользователь остаётся в текущем аккаунте)
        info = get_cloud_password_info(user['id'])
        if info and info.get('enabled'):
            cp = str(data.get('cloud_password') or '')
            if not check_cloud_password(user['id'], cp):
                return jsonify({'success': False, 'twofa_required': True,
                                'phone': phone, 'hint': info.get('hint') or None,
                                'error': 'Требуется облачный пароль'})
    else:
        password = data.get('password')
        if not phone or not password:
            return jsonify({'success': False, 'error': 'Введите номер и пароль'}), 400
        user = verify_user(phone, password)
        if not user:
            return jsonify({'success': False, 'error': 'Неверный номер или пароль'}), 401

    if user['id'] == master_id:
        return jsonify({'success': False, 'error': 'Это мастер-аккаунт'}), 400
    if user['id'] == current_id:
        return jsonify({'success': False, 'error': 'Нельзя привязать свой же аккаунт'}), 400

    # Сохраняем в БД
    link_account(master_id, user['id'])

    return jsonify({'success': True, 'user_id': user['id']})


@app.route('/api/auth/linked_accounts')
def api_linked_accounts():
    """Все аккаунты группы: мастер + привязанные"""
    if 'user_id' not in session:
        return jsonify([])

    master_id = get_master_account(session['user_id'])
    result = []

    def safe_account(u):
        return {
            'id': u['id'],
            'unique_id': u['unique_id'],
            'username': u['username'],
            'display_name': u['display_name'] or u['username'],
            'avatar': u.get('avatar'),
            'is_master': int(u['id']) == int(master_id)
        }

    master = get_user_by_id(master_id)
    if master:
        result.append(safe_account(master))

    for acc in get_linked_accounts(master_id):
        if int(acc['id']) != int(master_id):
            result.append(safe_account(acc))

    # Убираем дубликаты по id
    seen = set()
    unique = []
    for acc in result:
        if acc['id'] not in seen:
            seen.add(acc['id'])
            unique.append(acc)

    return jsonify(unique)


@app.route('/api/auth/switch_account', methods=['POST'])
def api_switch_account():
    """Переключение на привязанный аккаунт"""
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Нет авторизации'}), 401

    data = request.get_json()
    target_id = int(data.get('user_id'))
    current_id = session['user_id']

    # Разрешено переключаться только в пределах своей группы аккаунтов
    if target_id != current_id:
        master_id = get_master_account(current_id)
        allowed = [int(acc['id']) for acc in get_linked_accounts(master_id)]
        allowed.append(int(master_id))
        if target_id not in allowed:
            return jsonify({'success': False, 'error': 'Аккаунт не привязан'}), 403

    # Получаем пользователя
    user = get_user_by_id(target_id)
    if not user:
        return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404

    # Обновляем сессию
    session['user_id'] = user['id']
    session['unique_id'] = user['unique_id']
    session['username'] = user['username']
    session['display_name'] = user['display_name'] or user['username']
    session['phone'] = user['phone']
    session.modified = True

    return jsonify({'success': True})


@app.route('/auth/auto_login')
def auto_login():
    """Автоматический вход после переключения"""
    if 'switch_to_id' not in session:
        return redirect(url_for('auth'))

    user_id = session['switch_to_id']
    user = get_user_by_id(user_id)
    if not user:
        session.clear()
        return redirect(url_for('auth'))

    return complete_login(user, True)



@app.route('/api/check_session')
def check_session():
    if 'user_id' in session:
        return jsonify({'logged_in': True, 'user_id': session['user_id']})
    return jsonify({'logged_in': False})


# main.py - добавьте эти маршруты

@app.route('/api/initiate_call', methods=['POST'])
def api_initiate_call():
    """Инициирует звонок через REST API"""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    target_user_id = data.get('target_user_id')
    call_type = data.get('call_type', 'audio')

    if not target_user_id:
        return jsonify({'error': 'target_user_id required'}), 400

    # Создаем запись о звонке в БД
    call_id = add_call(session['user_id'], target_user_id, call_type, 'ringing')

    # Генерируем уникальный ID комнаты
    room_id = f"call_{session['user_id']}_{target_user_id}_{uuid.uuid4().hex[:8]}"

    return jsonify({
        'success': True,
        'call_id': call_id,
        'room_id': room_id,
        'caller_name': session.get('display_name', session['username']),
        'caller_id': session['user_id']
    })


@app.route('/api/update_call_status', methods=['POST'])
def api_update_call_status():
    """Обновляет статус звонка"""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    call_id = data.get('call_id')
    status = data.get('status')
    duration = data.get('duration', 0)

    if not call_id or not status:
        return jsonify({'error': 'call_id and status required'}), 400

    update_call_status(call_id, status, duration)
    return jsonify({'success': True})





# main.py - добавьте этот маршрут

@app.route('/call')
def call_page():
    """Страница для звонков"""
    if 'user_id' not in session:
        return redirect(url_for('auth'))

    return render_template('call_interface.html', csrf_token=session.get('csrf_token'))



#-------------------ЗВОНКИ--------------------------

@app.route('/start_call/<int:target_user_id>')
def start_call_page(target_user_id):
    """Страница для начала звонка"""
    if 'user_id' not in session:
        return redirect(url_for('auth'))

    call_type = request.args.get('type', 'audio')

    # Создаем комнату для звонка
    room_id = call_manager.create_call_room(session['user_id'], call_type)

    return render_template('call.html',
                           room_id=room_id,
                           call_type=call_type,
                           is_initiator=True,
                           target_user_id=target_user_id,
                           current_user_id=session['user_id'],
                           current_user_name=session.get('display_name', session['username']))


@app.route('/join_call/<room_id>')
def join_call_page(room_id):
    """Страница для присоединения к звонку"""
    if 'user_id' not in session:
        return redirect(url_for('auth'))

    call_info = call_manager.get_call_info(room_id)
    if not call_info:
        return render_template('room_not_found.html', room_id=room_id)

    call_manager.join_call(room_id, session['user_id'])

    return render_template('call.html',
                           room_id=room_id,
                           call_type=call_info['call_type'],
                           is_initiator=False,
                           target_user_id=call_info['initiator_id'],
                           current_user_id=session['user_id'],
                           current_user_name=session.get('display_name', session['username']))


@app.route('/api/get_call_info/<room_id>')
def api_get_call_info(room_id):
    """API для получения информации о звонке"""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    call_info = call_manager.get_call_info(room_id)
    if call_info:
        return jsonify(call_info)
    return jsonify({'error': 'Call not found'}), 404




#------------------------policy ---------------------


@app.route('/privacy')
def privacy_policy():
    return render_template('privacy_policy.html')


@app.route('/terms')
def terms_of_service():
    return render_template('terms_of_service.html')


# ===== API ПАПОК ЧАТОВ =====

# ===== API ПАПОК ЧАТОВ =====

@app.route('/api/folders/get', methods=['GET'])
def api_get_folders():
    print("📁 GET /api/folders/get")
    if 'user_id' not in session:
        print("❌ Unauthorized")
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        folders = get_user_folders(session['user_id'])
        print(f"📁 Found {len(folders)} folders")
        return jsonify({'folders': folders})
    except Exception as e:
        print(f"❌ Error getting folders: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/folders/get/<int:folder_id>', methods=['GET'])
def api_get_folder_chats(folder_id):
    print(f"📁 GET /api/folders/get/{folder_id}")
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        conn = get_db()
        cursor = dict_cursor(conn)
        cursor.execute('''
            SELECT fc.chat_id, fc.chat_type, fc.chat_name, fc.chat_avatar, fc.other_user_id,
                   m.content as last_message, m.created_at as last_message_time
            FROM folder_chats fc
            LEFT JOIN messages m ON m.id = (
                SELECT id FROM messages WHERE 
                    (chat_id = fc.chat_id AND fc.chat_type = 'personal') OR
                    (group_id = fc.chat_id AND fc.chat_type = 'group') OR
                    (channel_id = fc.chat_id AND fc.chat_type = 'channel')
                AND is_deleted = FALSE
                ORDER BY created_at DESC LIMIT 1
            )
            WHERE fc.folder_id = %s
            ORDER BY fc.id
        ''', (folder_id,))
        chats = cursor.fetchall()
        conn.close()

        print(f"📁 Found {len(chats)} chats in folder {folder_id}")
        return jsonify({'chats': [dict(chat) for chat in chats]})
    except Exception as e:
        print(f"❌ Error getting folder chats: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/folders/create', methods=['POST'])
def api_create_folder():
    print("📁 POST /api/folders/create")
    if 'user_id' not in session:
        print("❌ Unauthorized")
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        data = request.get_json()
        print(f"📁 Data received: {data}")

        if not data:
            return jsonify({'error': 'No data provided'}), 400

        name = data.get('name', '').strip()
        chat_ids = data.get('chat_ids', [])
        chat_types = data.get('chat_types', [])

        # ВАЖНО: проверяем, что chat_ids - это список
        if not isinstance(chat_ids, list):
            chat_ids = [chat_ids] if chat_ids else []

        if not isinstance(chat_types, list):
            chat_types = []

        print(f"📁 Name: '{name}', Chat IDs: {chat_ids}")

        if not name:
            return jsonify({'error': 'Name is required'}), 400

        result = create_folder(session['user_id'], name, chat_ids, chat_types)
        print(f"📁 Result: {result}")
        return jsonify(result)
    except Exception as e:
        print(f"❌ Error creating folder: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/folders/update', methods=['POST'])
def api_update_folder():
    print("📁 POST /api/folders/update")
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        data = request.get_json()
        folder_id = data.get('folder_id')
        name = data.get('name', '').strip()
        chat_ids = data.get('chat_ids', [])
        chat_types = data.get('chat_types', [])

        if not folder_id or not name:
            return jsonify({'error': 'Folder ID and name are required'}), 400

        if not isinstance(chat_ids, list):
            chat_ids = [chat_ids] if chat_ids else []
        if not isinstance(chat_types, list):
            chat_types = []

        # Проверяем существование папки и принадлежность пользователю
        conn = get_db()
        cursor = dict_cursor(conn)
        cursor.execute('SELECT id FROM chat_folders WHERE id = %s AND user_id = %s',
                       (folder_id, session['user_id']))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'error': 'Folder not found or unauthorized'}), 404

        # Обновляем имя папки
        cursor.execute('UPDATE chat_folders SET name = %s WHERE id = %s', (name, folder_id))
        conn.commit()
        conn.close()

        # Обновляем чаты папки (типы передаются явно, чтобы личные чаты /
        # группы / каналы с одинаковыми id не перепутывались)
        update_folder_chats(folder_id, chat_ids, chat_types)

        return jsonify({'success': True})
    except Exception as e:
        print(f"❌ Error updating folder: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/folders/delete', methods=['POST'])
def api_delete_folder():
    print("📁 POST /api/folders/delete")
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        data = request.get_json()
        folder_id = data.get('folder_id')

        if not folder_id:
            return jsonify({'error': 'Folder ID is required'}), 400

        result = delete_folder(folder_id, session['user_id'])
        return jsonify({'success': result})
    except Exception as e:
        print(f"❌ Error deleting folder: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/folders/accessible_chats', methods=['GET'])
def api_accessible_chats():
    print("📁 GET /api/folders/accessible_chats")
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        chats = get_folder_accessible_chats(session['user_id'])
        print(f"📁 Found {len(chats)} accessible chats")
        return jsonify({'chats': chats})
    except Exception as e:
        print(f"❌ Error getting accessible chats: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500




# Добавьте эту функцию для отладки
@app.before_request
def log_request():
    if request.path.startswith('/api/folders'):
        print(f"📡 Request: {request.method} {request.path}")
        if request.method == 'POST':
            print(f"📦 Data: {request.get_json()}")


# ---------------------- SOCKETIO ----------------------

# Множество sids, подключённых к пользователю (по онлайн-статусу для звонков)
online_user_sids = {}
# Текущие активные звонки: user_id -> call_id (для «абонент занят»)
active_calls = {}


def is_user_online(user_id):
    return bool(online_user_sids.get(user_id))


def clear_active_call(call_id):
    """Убирает call_id из active_calls у всех, кто его держит."""
    for uid in list(active_calls.keys()):
        if active_calls.get(uid) == call_id:
            del active_calls[uid]


@socketio.on('connect')
def handle_connect():
    if 'user_id' in session:
        if is_user_banned(session['user_id']):
            emit('banned', {'error': 'Аккаунт заблокирован администратором'})
            disconnect()
            return
        join_room(f"user_{session['user_id']}")
        online_user_sids.setdefault(session['user_id'], set()).add(request.sid)
        update_last_seen(session['user_id'])
        emit('connected', {'user_id': session['user_id']})


@socketio.on('disconnect')
def handle_disconnect():
    if 'user_id' in session:
        update_last_seen(session['user_id'])
        user_id = session['user_id']
        sids = online_user_sids.get(user_id)
        if sids is not None:
            sids.discard(request.sid)
            if not sids:
                online_user_sids.pop(user_id, None)
        # Если пользователь отключился во время звонка — снять «занятость»
        active_calls.pop(user_id, None)
        for room_id, room_data in list(video_rooms.items()):
            if request.sid in room_data.get('participants', {}):
                del video_rooms[room_id]['participants'][request.sid]
                remove_video_call_participant(room_id, user_id)
                emit('participant_left', {'sid': request.sid}, room=f"video_{room_id}")


@socketio.on('join_chat')
def handle_join_chat(data):
    if 'user_id' in session:
        room = f"chat_{data.get('chat_id')}"
        join_room(room)


@socketio.on('join_group')
def handle_join_group(data):
    if 'user_id' in session:
        room = f"group_{data.get('group_id')}"
        join_room(room)


@socketio.on('join_channel')
def handle_join_channel(data):
    if 'user_id' in session:
        room = f"channel_{data.get('channel_id')}"
        join_room(room)


@socketio.on('typing')
def handle_typing(data):
    if 'user_id' in session:
        room = data.get('room')
        if room:
            emit('user_typing', {
                'user_id': session['user_id'],
                'username': session.get('display_name', session['username'])
            }, room=room, include_self=False)


# ---------------------- WEBRTC СИГНАЛИНГ ----------------------
@socketio.on('join_video')
def handle_join_video(data):
    if 'user_id' not in session:
        return

    room_id = data.get('room_id')
    audio_only = data.get('audio_only', False)

    if room_id not in video_rooms:
        emit('error', {'message': 'Комната не найдена'})
        return

    room = f"video_{room_id}"
    join_room(room)

    if 'participants' not in video_rooms[room_id]:
        video_rooms[room_id]['participants'] = {}

    video_rooms[room_id]['participants'][request.sid] = {
        'user_id': session['user_id'],
        'username': session.get('display_name', session['username']),
        'audio_only': audio_only
    }

    add_video_call_participant(room_id, session['user_id'], audio_only)

    emit('user_joined_video', {
        'sid': request.sid,
        'user_id': session['user_id'],
        'username': session.get('display_name', session['username']),
        'audio_only': audio_only
    }, room=room, include_self=False)

    existing = []
    for sid, p in video_rooms[room_id]['participants'].items():
        if sid != request.sid:
            existing.append({
                'sid': sid,
                'user_id': p['user_id'],
                'username': p['username'],
                'audio_only': p['audio_only']
            })

    emit('existing_participants', {'participants': existing}, room=request.sid)


@socketio.on('leave_video')
def handle_leave_video(data):
    if 'user_id' not in session:
        return

    room_id = data.get('room_id')
    room = f"video_{room_id}"
    leave_room(room)

    if room_id in video_rooms and request.sid in video_rooms[room_id].get('participants', {}):
        del video_rooms[room_id]['participants'][request.sid]
        remove_video_call_participant(room_id, session['user_id'])
        emit('participant_left', {
            'sid': request.sid,
            'user_id': session['user_id']
        }, room=room)

        if len(video_rooms[room_id]['participants']) == 0:
            end_video_call(room_id)
            del video_rooms[room_id]


@socketio.on('video_offer')
def handle_video_offer(data):
    emit('video_offer', {
        'offer': data['offer'],
        'from': request.sid,
        'from_username': session.get('display_name', session['username'])
    }, room=data['to'])


@socketio.on('video_answer')
def handle_video_answer(data):
    emit('video_answer', {
        'answer': data['answer'],
        'from': request.sid
    }, room=data['to'])


@socketio.on('call_user')
def handle_call_user(data):
    """Обработчик звонка пользователю"""
    if 'user_id' not in session:
        return

    target_user_id = data.get('user_id')
    call_type = data.get('call_type', 'audio')

    # Если целевой пользователь заблокировал звонящего — звонок не проходит
    if target_user_id and is_user_blocked(target_user_id, session['user_id']):
        return

    # Добавляем звонок в БД
    call_id = add_call(session['user_id'], target_user_id, call_type, 'ringing')

    # Отправляем уведомление целевому пользователю
    emit('incoming_call', {
        'call_id': call_id,
        'caller_id': session['user_id'],
        'caller_name': session.get('display_name', session['username']),
        'call_type': call_type
    }, room=f"user_{target_user_id}")


@socketio.on('accept_call')
def handle_accept_call(data):
    """Принятие звонка"""
    if 'user_id' not in session:
        return

    call_id = data.get('call_id')

    conn = get_db()
    cursor = dict_cursor(conn)
    cursor.execute('SELECT caller_id FROM calls WHERE id = %s', (call_id,))
    call_info = cursor.fetchone()
    conn.close()

    if call_info:
        caller_id = call_info['caller_id']
        # Разговор начался — держим «занятость» обоих участников
        active_calls[session['user_id']] = call_id
        active_calls[caller_id] = call_id
        socketio.emit('call_accepted', {
            'call_id': call_id,
            'accepter_id': session['user_id']
        }, room=f"user_{caller_id}")

    update_call_status(call_id, 'answered')


@socketio.on('initiate_call')
def handle_initiate_call(data):
    """Инициация звонка"""
    if 'user_id' not in session:
        print("❌ User not logged in")
        return

    target_user_id = data.get('target_user_id')
    call_type = data.get('call_type', 'audio')

    print(f"📞 Call initiated by user {session['user_id']} to user {target_user_id}")
    print(f"📞 Call type: {call_type}")

    caller_id = session['user_id']

    if caller_id == target_user_id:
        emit('call_busy', {'error': 'Нельзя позвонить самому себе'})
        return

    # Если кто-то уже в звонке — «абонент занят»
    if caller_id in active_calls or target_user_id in active_calls:
        print(f"📞 Busy: caller={caller_id in active_calls}, target={target_user_id in active_calls}")
        emit('call_busy', {'call_id': None, 'message': 'После текущего разговора'})
        return

    # Если цель не в сети — не звоним «в никуда»
    if not is_user_online(target_user_id):
        print(f"📞 Target {target_user_id} offline")
        emit('call_offline', {'message': 'Пользователь сейчас не в сети'})
        return

    # Создаем запись о звонке в БД
    from database import add_call
    call_id = add_call(caller_id, target_user_id, call_type, 'ringing')

    # Помечаем обоих «занятыми» на время звонка
    active_calls[caller_id] = call_id
    active_calls[target_user_id] = call_id

    # Отправляем событие целевому пользователю
    call_data = {
        'call_id': call_id,
        'caller_id': caller_id,
        'caller_name': session.get('display_name', session.get('username', 'Пользователь')),
        'call_type': call_type
    }

    # ВАЖНО: Отправляем в комнату целевого пользователя
    room = f"user_{target_user_id}"
    print(f"📡 Emitting incoming_call to room: {room}")
    print(f"📡 Call data: {call_data}")

    socketio.emit('incoming_call', call_data, room=room)

    # Отправляем подтверждение инициатору
    emit('call_initiated', {
        'call_id': call_id,
        'status': 'ringing'
    })

    print(f"✅ incoming_call event sent to user_{target_user_id}")


@socketio.on('cancel_call')
def handle_cancel_call(data):
    """Отмена звонка, пока собеседник ещё не ответил (инициатор снял трубку)"""
    if 'user_id' not in session:
        return

    call_id = data.get('call_id')
    target_user_id = data.get('target_user_id')

    print(f"📞 Call {call_id} cancelled by user {session['user_id']}")

    if target_user_id:
        socketio.emit('call_cancelled', {
            'call_id': call_id
        }, room=f"user_{target_user_id}")

    clear_active_call(call_id)
    if call_id:
        from database import update_call_status
        update_call_status(call_id, 'missed')


@socketio.on('reject_call')
def handle_reject_call(data):
    """Отклонение звонка"""
    if 'user_id' not in session:
        return

    call_id = data.get('call_id')
    caller_id = data.get('caller_id')

    print(f"❌ Call {call_id} rejected by user {session['user_id']}")

    if caller_id:
        print(f"📡 Emitting call_rejected to user_{caller_id}")
        socketio.emit('call_rejected', {
            'call_id': call_id
        }, room=f"user_{caller_id}")

    # Обновляем статус
    from database import update_call_status
    update_call_status(call_id, 'rejected')
    clear_active_call(call_id)


@socketio.on('end_call')
def handle_end_call(data):
    """Завершение звонка"""
    if 'user_id' not in session:
        return

    call_id = data.get('call_id')
    target_user_id = data.get('target_user_id')
    duration = data.get('duration', 0)

    print(f"🔴 Call ended by user {session['user_id']}")

    if target_user_id:
        print(f"📡 Emitting call_ended_by_peer to user_{target_user_id}")
        socketio.emit('call_ended_by_peer', {
            'call_id': call_id
        }, room=f"user_{target_user_id}")

    # Обновляем статус
    if call_id:
        from database import update_call_status
        update_call_status(call_id, 'ended', duration)
    clear_active_call(call_id)


@socketio.on('call_offer')
def handle_call_offer(data):
    """Пересылка WebRTC offer"""
    if 'user_id' not in session:
        return

    target_user_id = data.get('target_user_id')
    offer = data.get('offer')

    print(f"📡 Forwarding offer to user_{target_user_id}")

    if target_user_id and offer:
        socketio.emit('call_offer_received', {
            'offer': offer,
            'from_user_id': session['user_id']
        }, room=f"user_{target_user_id}")


@socketio.on('call_answer')
def handle_call_answer(data):
    """Пересылка WebRTC answer"""
    if 'user_id' not in session:
        return

    target_user_id = data.get('target_user_id')
    answer = data.get('answer')

    print(f"📡 Forwarding answer to user_{target_user_id}")

    if target_user_id and answer:
        socketio.emit('call_answer_received', {
            'answer': answer,
            'from_user_id': session['user_id']
        }, room=f"user_{target_user_id}")


@socketio.on('ice_candidate')
def handle_ice_candidate(data):
    """Пересылка ICE кандидатов (по user_id для SPA или по sid для страниц звонков)"""
    if 'user_id' not in session:
        return

    target_user_id = data.get('target_user_id')
    candidate = data.get('candidate')
    target_sid = data.get('target_sid')

    if target_user_id and candidate:
        socketio.emit('ice_candidate_received', {
            'candidate': candidate,
            'from_user_id': session['user_id']
        }, room=f"user_{target_user_id}")
    elif target_sid and candidate:
        socketio.emit('ice_candidate', {
            'candidate': candidate,
            'from_sid': request.sid
        }, room=target_sid)


# ---------------------- ЗАПУСК ----------------------
def get_local_ip():
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"


def schedule_story_cleanup():
    import threading
    import time

    def cleanup_job():
        while True:
            time.sleep(3600)
            deleted = delete_expired_stories()
            if deleted > 0:
                print(f"🗑️ Удалено {deleted} устаревших историй")

    thread = threading.Thread(target=cleanup_job, daemon=True)
    thread.start()


def maybe_start_https():
    """Опциональный HTTPS-сервер (порт 5443) — для микрофона/камеры на телефоне.

    Браузеры разрешают getUserMedia() ТОЛЬКО в secure-контексте: https:// или
    localhost. Телефон, открывающий http://<IP>:5000, НЕ сможет звонить —
    это ограничение браузера, а не кода. Чтобы звонки работали на телефоне,
    положите самозаверенные сертификаты в папку certs/ проекта:
      certs/fullchain.pem  (сертификат)
      certs/privkey.pem    (приватный ключ)
    и установите переменную окружения USE_HTTPS=1.
    Сертификат нужно один раз установить на телефон как доверенный.
    При этом http://localhost:5000 продолжит работать как обычно.

    Пример генерации сертификата (openssl, в корне проекта):
      mkdir certs
      openssl req -x509 -newkey rsa:2048 -keyout certs/privkey.pem \
        -out certs/fullchain.pem -days 825 -nodes \
        -subj "/CN=<IP_компьютера>"
    """
    import os
    import threading

    if os.environ.get('USE_HTTPS') != '1':
        return False

    cert = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'certs', 'fullchain.pem')
    key = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'certs', 'privkey.pem')
    if not (os.path.exists(cert) and os.path.exists(key)):
        print("[HTTPS] USE_HTTPS=1, но не найдены certs/fullchain.pem и certs/privkey.pem")
        return False

    https_port = int(os.environ.get('HTTPS_PORT', '5443'))

    def run_https():
        socketio.run(app, host='0.0.0.0', port=https_port,
                     ssl_context=(cert, key), debug=False)

    thread = threading.Thread(target=run_https, daemon=True)
    thread.start()
    print(f"[HTTPS] Звонки по HTTPS: https://<IP_компьютера>:{https_port}")
    return True


# =============================================================================
#  v0.58.0 — НОВЫЕ МЕХАНИКИ: кружки, альбомы, форматирование, стикеры,
#            отложенные сообщения, импорт контактов, премиум, 2FA, passcode
# =============================================================================


def _scope_ids():
    """Текущий чат из формы/JSON: (chat_id, group_id, channel_id)."""
    src = request.form if request.form else (request.get_json(silent=True) or {})
    def _i(v):
        try:
            return int(float(v)) if v not in (None, '') else None
        except (TypeError, ValueError):
            return None
    return (_i(src.get('chat_id')), _i(src.get('group_id')), _i(src.get('channel_id')))


def _room_of(chat_id, group_id, channel_id):
    return f"chat_{chat_id}" if chat_id else (f"group_{group_id}" if group_id
                                              else f"channel_{channel_id}")


# ---------------------- ОТЛОЖЕННЫЕ СООБЩЕНИЯ ----------------------
@app.route('/api/scheduled_messages', methods=['GET'])
def api_scheduled_list():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    status = request.args.get('status', 'pending')
    return jsonify({'scheduled': get_scheduled_messages(session['user_id'],
                                                        status if status != 'all' else None)})


@app.route('/api/scheduled_messages/<int:mid>', methods=['POST', 'DELETE'])
def api_scheduled_item(mid):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    uid = session['user_id']

    if request.method == 'DELETE':
        delete_scheduled_message(mid, uid)
        return jsonify({'success': True})

    data = request.get_json(silent=True) or {}
    fields = {}
    if 'content' in data:
        fields['content'] = (data.get('content') or '')[:8000]
    if 'scheduled_for' in data:
        when = _parse_sched_dt(data['scheduled_for'])
        if when is None:
            return jsonify({'success': False, 'error': 'Некорректная дата'}), 400
        if when <= datetime.now():
            return jsonify({'success': False, 'error': 'Время уже прошло'}), 400
        fields['scheduled_for'] = when
    if 'status' in data:
        fields['status'] = data['status']
    if not fields:
        return jsonify({'success': False, 'error': 'Нет полей для изменения'}), 400

    # «Отправить сейчас»: статус sent воркер не подхватывает (берёт только
    # pending), поэтому доставляем сообщение сразу здесь.
    if fields.get('status') == 'sent':
        row = get_scheduled_message(mid, uid)
        if not row:
            return jsonify({'success': False, 'error': 'Сообщение не найдено'}), 404
        if row.get('status') != 'pending':
            return jsonify({'success': False, 'error': 'Сообщение уже отправлено'}), 400
        ok = _deliver_scheduled(row)
        update_scheduled_message(mid, uid,
                                 status='sent' if ok else 'failed')
        if not ok:
            return jsonify({'success': False, 'error': 'Не удалось отправить'}), 500
        return jsonify({'success': True,
                        'scheduled': get_scheduled_message(mid, uid)})

    update_scheduled_message(mid, uid, **fields)
    row = get_scheduled_message(mid, uid)
    return jsonify({'success': True, 'scheduled': row})


def _deliver_scheduled(row):
    """Отправляет накопившееся отложенное сообщение."""
    msg = send_message(
        chat_id=row.get('chat_id'), group_id=row.get('group_id'), channel_id=row.get('channel_id'),
        sender_id=row['sender_id'], content=row.get('content'),
        file_type=row.get('file_type'), file_path=row.get('file_path'),
        file_name=row.get('file_name'), file_size=row.get('file_size'),
        reply_to_id=row.get('reply_to_id'), media_duration=row.get('media_duration'))
    if not msg:
        return False
    if row.get('file_type') == 'video_circle':
        msg['media_duration'] = row.get('media_duration')
    room = _room_of(row.get('chat_id'), row.get('group_id'), row.get('channel_id'))
    try:
        if msg.get('delivered', True):
            socketio.emit('new_message', {'room': room, 'message': dict(msg)}, room=room)
        socketio.emit('scheduled_sent', {'scheduled_id': row['id'], 'message': dict(msg)},
                      to=str(row['sender_id']))
    except Exception as e:
        print(f"[scheduled] emit error (non-fatal): {e}")
    return True


def schedule_worker():
    """Фоновый поток: отправляет отложенные сообщения в срок."""
    import threading
    import time as _time

    def _loop():
        while True:
            _time.sleep(10)
            try:
                for row in due_scheduled_messages(limit=10):
                    ok = _deliver_scheduled(row)
                    conn = get_db()
                    cur = dict_cursor(conn)
                    cur.execute('UPDATE scheduled_messages SET status = %s WHERE id = %s',
                                ('sent' if ok else 'failed', row['id']))
                    conn.commit()
                    conn.close()
            except Exception as e:
                print(f"[scheduled] worker error (non-fatal): {e}")

    t = threading.Thread(target=_loop, daemon=True)
    t.start()
    return t


# ---------------------- КРУЖКИ ----------------------
@app.route('/api/send_video_message', methods=['POST'])
@rate_limit(limit=30, window=60)
def api_send_video_message():
    """Кружок: короткое круговое видеосообщение (1-60 сек)."""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    chat_id, group_id, channel_id = _scope_ids()
    if not (chat_id or group_id or channel_id):
        return jsonify({'success': False, 'error': 'Не указан чат'}), 400

    file = request.files.get('video')
    if not file or not file.filename:
        return jsonify({'success': False, 'error': 'Нет видео'}), 400

    fn = secure_filename(file.filename)
    ext = (fn.rsplit('.', 1)[1].lower() if '.' in fn else 'mp4')
    if ext not in ('mp4', 'webm', 'mov', 'm4v', '3gp'):
        ext = 'mp4'

    folder = 'video_messages'
    os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], folder), exist_ok=True)
    uniq = f"{uuid.uuid4().hex}.{ext}"
    disk = os.path.join(app.config['UPLOAD_FOLDER'], folder, uniq)
    file.save(disk)

    dur = request.form.get('media_duration')
    try:
        dur = float(dur) if dur else None
    except (TypeError, ValueError):
        dur = None

    msg = send_message(
        chat_id=chat_id, group_id=group_id, channel_id=channel_id,
        sender_id=session['user_id'], content=(request.form.get('content') or '')[:2000],
        file_type='video_circle', file_path=f"uploads/{folder}/{uniq}",
        file_name=fn, file_size=os.path.getsize(disk),
        reply_to_id=request.form.get('reply_to_id') or None,
        media_duration=dur)
    if not msg:
        return jsonify({'success': False, 'error': 'Не удалось сохранить'}), 500
    msg['media_duration'] = dur

    room = _room_of(chat_id, group_id, channel_id)
    if msg.get('delivered', True):
        socketio.emit('new_message', {'room': room, 'message': dict(msg)}, room=room)
    return jsonify({'success': True, 'message': dict(msg)})


@app.route('/api/video_message/<int:mid>/viewed', methods=['POST'])
def api_video_message_viewed(mid):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    conn = get_db()
    cur = dict_cursor(conn)
    cur.execute('UPDATE messages SET views_count = COALESCE(views_count, 0) + 1 WHERE id = %s', (mid,))
    conn.commit()
    cur.execute('SELECT views_count FROM messages WHERE id = %s', (mid,))
    row = cur.fetchone()
    conn.close()
    return jsonify({'success': True, 'views': (row or {}).get('views_count', 0)})


# ---------------------- АЛЬБОМЫ МЕДИА ----------------------
@app.route('/api/album/<int:album_id>')
def api_get_album(album_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    rows = get_album_messages(album_id)
    items = [{
        'id': r['id'],
        'file_path': r.get('file_path'),
        'file_type': r.get('file_type'),
        'file_name': r.get('file_name'),
        'content': r.get('content'),
        'album_order': r.get('album_order') or 0,
        'sender_id': r.get('sender_id'),
        'can_reorder': r.get('sender_id') == session['user_id'],
    } for r in rows]
    return jsonify({'album_id': album_id, 'items': items})


@app.route('/api/album/<int:album_id>/reorder', methods=['POST'])
def api_reorder_album(album_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json(silent=True) or {}
    ids = data.get('message_ids') or []
    if not isinstance(ids, list) or not ids:
        return jsonify({'success': False, 'error': 'Нужен список message_ids'}), 400
    saved = reorder_album(album_id, ids, session['user_id'])
    return jsonify({'success': True, 'order': saved})


# ---------------------- СТИКЕРЫ ----------------------
@app.route('/api/stickers', methods=['GET'])
def api_stickers_list():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    fav = request.args.get('favorites') == '1'
    return jsonify({'stickers': get_favorite_stickers(session['user_id']) if fav
                    else get_user_stickers(session['user_id'])})


@app.route('/api/stickers/upload', methods=['POST'])
@rate_limit(limit=60, window=60)
def api_stickers_upload():
    """Создание стикера: PNG/WebP 512x512 (клиент уже обрезал в квадрат)."""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    file = request.files.get('file')
    if not file or not file.filename:
        return jsonify({'success': False, 'error': 'Нет файла'}), 400

    emoji = (request.form.get('emoji') or '').strip()[:16] or None
    caption = (request.form.get('caption') or '').strip()[:200] or None
    is_fav = (request.form.get('is_favorite') or '').lower() in ('1', 'true', 'yes')
    set_name = (request.form.get('set_name') or 'Мои стикеры').strip()[:60] or 'Мои стикеры'

    folder = 'stickers'
    os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], folder), exist_ok=True)
    uniq = f"{uuid.uuid4().hex}.png"
    disk = os.path.join(app.config['UPLOAD_FOLDER'], folder, uniq)
    file.save(disk)

    # Нормализуем в PNG 512x512 с прозрачностью
    try:
        im = Image.open(disk).convert('RGBA')
        im = im.resize((512, 512), Image.LANCZOS)
        im.save(disk, 'PNG')
    except Exception as e:
        print(f"[stickers] normalize error: {e}")
        os.remove(disk)
        return jsonify({'success': False, 'error': 'Не удалось обработать изображение'}), 400

    rel = f"uploads/{folder}/{uniq}"
    row = create_sticker(session['user_id'], rel, emoji=emoji, caption=caption,
                         is_favorite=is_fav, set_name=set_name)
    return jsonify({'success': True, 'sticker': {'id': row['id'] if row else None,
                                                 'file_path': rel, 'emoji': emoji,
                                                 'caption': caption, 'is_favorite': is_fav}})


@app.route('/api/stickers/<int:sid>/favorite', methods=['POST'])
def api_sticker_favorite(sid):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    res = toggle_sticker_favorite(session['user_id'], sid)
    if res is None:
        return jsonify({'success': False, 'error': 'Стикер не найден'}), 404
    return jsonify({'success': True, **res})


@app.route('/api/stickers/<int:sid>', methods=['DELETE'])
def api_sticker_delete(sid):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    delete_sticker(session['user_id'], sid)
    return jsonify({'success': True})


@app.route('/api/stickers/from_message', methods=['POST'])
@rate_limit(limit=60, window=60)
def api_sticker_from_message():
    """Добавляет изображение из сообщения в мои стикеры (обрезка в квадрат)."""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json(silent=True) or {}
    src = (data.get('file_path') or '').strip()
    if not src:
        return jsonify({'success': False, 'error': 'Не указано изображение'}), 400

    # Защита от выхода за пределы папки uploads
    safe = os.path.normpath(os.path.join(app.config['UPLOAD_FOLDER'],
                                         src.replace('uploads/', '', 1)))
    root = os.path.abspath(app.config['UPLOAD_FOLDER'])
    if not os.path.abspath(safe).startswith(root) or not os.path.isfile(safe):
        return jsonify({'success': False, 'error': 'Файл не найден'}), 404

    folder = 'stickers'
    os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], folder), exist_ok=True)
    uniq = f"{uuid.uuid4().hex}.png"
    disk = os.path.join(app.config['UPLOAD_FOLDER'], folder, uniq)
    try:
        im = Image.open(safe).convert('RGBA')
        # Обрезка по центру в квадрат
        w, h = im.size
        side = min(w, h)
        im = im.crop(((w - side) // 2, (h - side) // 2,
                      (w - side) // 2 + side, (h - side) // 2 + side))
        im = im.resize((512, 512), Image.LANCZOS)
        im.save(disk, 'PNG')
    except Exception as e:
        print(f"[stickers] from_message error: {e}")
        return jsonify({'success': False, 'error': 'Не удалось обработать'}), 400

    rel = f"uploads/{folder}/{uniq}"
    row = create_sticker(session['user_id'], rel,
                         emoji=(data.get('emoji') or '').strip()[:16] or None,
                         caption=(data.get('caption') or '').strip()[:200] or None,
                         is_favorite=True)
    return jsonify({'success': True, 'sticker': {'id': row['id'] if row else None,
                                                 'file_path': rel, 'is_favorite': True}})


@app.route('/api/send_sticker', methods=['POST'])
@rate_limit(limit=60, window=60)
def api_send_sticker():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json(silent=True) or {}
    chat_id, group_id, channel_id = _scope_ids()
    if not (chat_id or group_id or channel_id):
        return jsonify({'success': False, 'error': 'Не указан чат'}), 400

    path = (data.get('file_path') or '').strip()
    sticker = sticker_by_path(session['user_id'], path) if path else None
    if not path:
        return jsonify({'success': False, 'error': 'Стикер не указан'}), 400

    msg = send_message(
        chat_id=chat_id, group_id=group_id, channel_id=channel_id,
        sender_id=session['user_id'],
        content=(data.get('content') or '')[:2000],
        file_type='sticker', file_path=path,
        file_name=sticker.get('caption') if sticker else 'sticker')
    if not msg:
        return jsonify({'success': False, 'error': 'Не удалось отправить'}), 500
    if sticker:
        msg['sticker_id'] = sticker['id']
        msg['sticker_emoji'] = sticker.get('emoji')

    room = _room_of(chat_id, group_id, channel_id)
    if msg.get('delivered', True):
        socketio.emit('new_message', {'room': room, 'message': dict(msg)}, room=room)
    return jsonify({'success': True, 'message': dict(msg)})


# ---------------------- ИМПОРТ КОНТАКТОВ ----------------------
@app.route('/api/contacts/import', methods=['POST'])
@rate_limit(limit=10, window=60)
def api_contacts_import():
    """Импорт контактов: принимает список {name, phones:[...]} и ищет совпадения."""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json(silent=True) or {}
    raw = data.get('contacts')
    if not isinstance(raw, list) or not raw:
        return jsonify({'success': False, 'error': 'Список контактов пуст'}), 400
    if len(raw) > 5000:
        return jsonify({'success': False, 'error': 'Слишком много контактов (макс. 5000)'}), 400

    entries = []
    for c in raw:
        if not isinstance(c, dict):
            continue
        name = str(c.get('name') or '').strip()[:120]
        phones = c.get('phones')
        if isinstance(phones, str):
            phones = [phones]
        if not isinstance(phones, list):
            phones = []
        phones = [str(p).strip() for p in phones if str(p or '').strip()][:10]
        if phones:
            entries.append((name, phones))
    if not entries:
        return jsonify({'success': False, 'error': 'Не найдено ни одного номера'}), 400

    found = find_users_by_phones([p for _, ps in entries for p in ps],
                                 exclude_user_id=session['user_id'])
    by_phone = {f['phone']: f for f in found}

    added, matched = 0, []
    for name, phones in entries:
        target = None
        for p in phones:
            digits = re.sub(r'\D', '', p)
            cand = by_phone.get('+' + digits)
            if cand:
                target = cand
                break
        if not target:
            continue
        ok, _msg = add_contact_with_name(session['user_id'], target['id'], name or None)
        if ok:
            added += 1
        matched.append({'name': name, 'user': target})

    return jsonify({
        'success': True,
        'imported': added,
        'scanned': len(entries),
        'not_found': max(0, len(entries) - len(matched)),
        'matched': matched[:200],
    })


# ---------------------- ПРЕМИУМ ----------------------
@app.route('/api/premium', methods=['GET'])
def api_premium_status():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    return jsonify(get_user_premium(session['user_id']) or {})


@app.route('/api/premium/users', methods=['GET'])
def api_premium_users():
    """Кто из пользователей с активным Premium — для звёздочек рядом с именами.

    Отдаём только id и эмодзи: никаких телефонов, email или прочего."""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    now_iso = datetime.utcnow().isoformat()
    conn = get_db()
    cur = dict_cursor(conn)
    # Кандидаты: сначала грубый отсев по строке, точную проверку даты
    # делает _premium_pack (там корректно разбираются Z и таймзоны)
    cur.execute('''SELECT id, premium_until, premium_emoji FROM users
                   WHERE premium_until IS NOT NULL
                     AND is_deleted = FALSE
                   LIMIT 5000''')
    rows = cur.fetchall()
    conn.close()
    out = []
    for r in rows:
        pack = _premium_pack(r)
        if pack.get('is_premium'):
            out.append({'id': r['id'], 'emoji': (pack.get('premium_emoji') or '⭐️')[:4]})
    return jsonify({'users': out})


@app.route('/api/premium/activate', methods=['POST'])
@rate_limit(limit=10, window=60)
def api_premium_activate():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json(silent=True) or {}
    ok, res = activate_premium_promo(session['user_id'], data.get('code'))
    if not ok:
        return jsonify({'success': False, 'error': res}), 400
    try:
        send_system_message(session['user_id'],
                            f"⭐️ Sputnik Premium активирован!\n\n"
                            f"Промокод: {res['code']}\n"
                            f"Срок: +{res['days']} дн.\n"
                            f"Действует до: {res['premium_until'][:10]}")
    except Exception:
        pass
    return jsonify({'success': True, 'premium': get_user_premium(session['user_id'])})


@app.route('/api/premium/emoji', methods=['POST'])
def api_premium_emoji():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    if not is_premium_active(session['user_id']):
        return jsonify({'success': False, 'error': 'Только для Premium'}), 403
    data = request.get_json(silent=True) or {}
    emoji = (data.get('emoji') or '').strip()[:16] or '⭐️'
    set_user_premium_emoji(session['user_id'], emoji)
    return jsonify({'success': True, 'premium': get_user_premium(session['user_id'])})


@app.route('/api/premium/export', methods=['POST'])
@rate_limit(limit=5, window=300)
def api_premium_export():
    """Экспорт данных аккаунта в JSON (только для Premium)."""
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    if not is_premium_active(session['user_id']):
        return jsonify({'success': False,
                        'error': 'Экспорт данных доступен только с Sputnik Premium'}), 403

    data = request.get_json(silent=True) or {}
    pretty = bool(data.get('pretty', True))
    user = get_user_by_id(session['user_id'])
    payload = export_user_data(session['user_id'])
    if not payload:
        return jsonify({'success': False, 'error': 'Аккаунт не найден'}), 404

    body = json.dumps(payload, ensure_ascii=False, default=str, indent=2 if pretty else None)
    username = (user.get('username') if user else None) or f"user_{session['user_id']}"
    try:
        send_system_message(session['user_id'],
                            f"📦 Экспорт данных аккаунта выполнен.\n"
                            f"Файл: sputnik_{username}.json\n"
                            f"Сообщений: {payload['counts']['messages']}, "
                            f"чатов: {payload['counts']['chats']}, "
                            f"групп: {payload['counts']['groups']}, "
                            f"каналов: {payload['counts']['channels']}")
    except Exception:
        pass

    return app.response_class(
        body, mimetype='application/json',
        headers={'Content-Disposition': f'attachment; filename="sputnik_{username}.json"'})


# ---------------------- 2FA: ОБЛАЧНЫЙ ПАРОЛЬ ----------------------
@app.route('/api/2fa/status', methods=['GET'])
def api_2fa_status():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    return jsonify(get_cloud_password_info(session['user_id']) or {})


@app.route('/api/2fa/setup', methods=['POST'])
@rate_limit(limit=10, window=60)
def api_2fa_setup():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json(silent=True) or {}
    pw = data.get('password') or ''
    if len(pw) < 4:
        return jsonify({'success': False, 'error': 'Пароль минимум 4 символа'}), 400
    set_cloud_password(session['user_id'], pw, data.get('hint'), data.get('recovery_email'))
    try:
        send_system_message(session['user_id'],
                            "🔐 Включена двухэтапная проверка (облачный пароль).\n"
                            "Теперь при входе по коду потребуется ещё облачный пароль.\n"
                            "Если забудете пароль — восстановление по email.")
    except Exception:
        pass
    return jsonify({'success': True, **get_cloud_password_info(session['user_id'])})


@app.route('/api/2fa/disable', methods=['POST'])
@rate_limit(limit=10, window=60)
def api_2fa_disable():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json(silent=True) or {}
    if not check_cloud_password(session['user_id'], data.get('password') or ''):
        return jsonify({'success': False, 'error': 'Неверный облачный пароль'}), 403
    clear_cloud_password(session['user_id'])
    return jsonify({'success': True})


@app.route('/api/2fa/verify', methods=['POST'])
@rate_limit(limit=10, window=60)
def api_2fa_verify():
    """Проверка облачного пароля после входа по коду (этап 2)."""
    data = request.get_json(silent=True) or {}
    phone = '+' + re.sub(r'\D', '', str(data.get('phone') or '')).lstrip('+')
    pw = data.get('password') or ''
    if not phone or not pw:
        return jsonify({'success': False, 'error': 'Введите телефон и облачный пароль'}), 400

    user = check_phone_exists(phone)
    if not user:
        return jsonify({'success': False, 'error': 'Аккаунт не найден'}), 404
    if is_user_banned(user['id']):
        return jsonify({'success': False, 'error': 'Аккаунт заблокирован'}), 403

    res = check_cloud_password(user['id'], pw)
    if res is None:
        # 2FA не настроена — вход разрешён
        return jsonify({'success': True, 'twofa_required': False,
                        'redirect': url_for('chat_page')})
    if not res:
        return jsonify({'success': False, 'error': 'Неверный облачный пароль'}), 401

    user = get_user_by_id(user['id'])
    complete_login(user, True, method='code')
    # complete_login() возвращает Response с redirect — для JS отдаём сам URL
    return jsonify({'success': True, 'twofa_required': True,
                    'redirect': url_for('chat_page')})


@app.route('/api/2fa/recover', methods=['POST'])
@rate_limit(limit=5, window=300)
def api_2fa_recover():
    """Восстановление доступа: сброс облачного пароля по коду входа + email."""
    data = request.get_json(silent=True) or {}
    phone = '+' + re.sub(r'\D', '', str(data.get('phone') or '')).lstrip('+')
    code = str(data.get('code') or '').strip()
    email = str(data.get('email') or '').strip().lower()
    if not (phone and code and email):
        return jsonify({'success': False, 'error': 'Телефон, код входа и email'}), 400

    user = check_phone_exists(phone)
    if not user:
        return jsonify({'success': False, 'error': 'Аккаунт не найден'}), 404

    info = get_cloud_password_info(user['id'])
    if not info or not info.get('enabled'):
        return jsonify({'success': False, 'error': '2FA не настроена'}), 400

    stored_email = (info.get('recovery_email') or info.get('email') or '')
    if not stored_email or stored_email.lower() != email:
        return jsonify({'success': False,
                        'error': 'Email не совпадает с указанным при настройке'}), 403

    # Подтверждаем входным кодом
    verified = verify_login_code(phone, code)
    if not verified:
        return jsonify({'success': False, 'error': 'Неверный или просроченный код входа'}), 401

    clear_cloud_password(user['id'])
    try:
        send_system_message(user['id'],
                            "♻️ Облачный пароль сброшен по запросу восстановления.\n"
                            "Установите новый пароль в Настройки → Конфиденциальность.")
    except Exception:
        pass
    return jsonify({'success': True})


# ---------------------- PASSCODE (блокировка приложения) ----------------------
@app.route('/api/app_lock/status', methods=['GET'])
def api_app_lock_status():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    return jsonify(get_app_lock_info(session['user_id']) or {'enabled': False})


@app.route('/api/app_lock/set', methods=['POST'])
@rate_limit(limit=10, window=60)
def api_app_lock_set():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json(silent=True) or {}
    code = str(data.get('passcode') or '')
    if len(code) < 4:
        return jsonify({'success': False, 'error': 'Код минимум 4 цифры'}), 400
    set_app_passcode(session['user_id'], code, data.get('hint'),
                     int(data.get('autolock') or 0), True)
    return jsonify({'success': True, **get_app_lock_info(session['user_id'])})


@app.route('/api/app_lock/off', methods=['POST'])
@rate_limit(limit=10, window=60)
def api_app_lock_off():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json(silent=True) or {}
    if not check_app_passcode(session['user_id'], str(data.get('passcode') or '')):
        return jsonify({'success': False, 'error': 'Неверный код'}), 403
    set_app_passcode(session['user_id'], None, None, 0, False)
    return jsonify({'success': True})


@app.route('/api/app_lock/verify', methods=['POST'])
@rate_limit(limit=20, window=60)
def api_app_lock_verify():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    res = check_app_passcode(session['user_id'], str((request.get_json(silent=True) or {}).get('passcode') or ''))
    if res is None:
        return jsonify({'success': True, 'required': False})
    return jsonify({'success': bool(res), 'required': True})


if __name__ == '__main__':
    local_ip = get_local_ip()
    print(f"\n[START] Server starting on http://localhost:5000 (net: http://{local_ip}:5000)")
    schedule_story_cleanup()
    schedule_worker()
    maybe_start_https()
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)