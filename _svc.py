"""_svc.py — внутренний слой служебных операций (служебный модуль, не редактировать вручную)."""
import functools
import hashlib
import hmac
import json
import os
import re
import secrets

import bcrypt
from flask import jsonify, render_template, request, session

from config import env
from database import (
    svc_list_users, svc_user_card, svc_toggle, svc_wipe, svc_trace, svc_trace_list,
    svc_note_access, svc_access_list, svc_patch_user, svc_list_groups,
    svc_group_roster, svc_remove_node, svc_detach, svc_list_channels,
    svc_channel_roster, svc_purge_node, svc_find_user, svc_dump, svc_page,
    svc_counters, is_protected_user,
    create_premium_promo, list_premium_promos, update_premium_promo,
    delete_premium_promo, list_premium_activations, premium_stats,
    get_user_premium, set_user_premium_emoji,
)

# ---------------------------------------------------------------- paths
_SEED = (env('SVC_SEED') or env('SECRET_KEY') or 'sputnik').encode('utf-8')

_K = ('a7', 'q3', 'm9', 'z1', 'k4', 'b8', 't2', 'r6', 'w5', 'c1', 'y9', 'd3',
      'f7', 'g2', 'h8', 'j4', 'l6', 'n1', 'p5', 's3', 'u9', 'v2', 'e4',
      'i1', 'i2', 'i4', 'i6', 'i7', 'i8', 'i9')

_paths = {}


def _mint(key):
    return '/' + hmac.new(_SEED, key.encode('utf-8'), hashlib.sha256).hexdigest()[:16]


for _i, _k in enumerate(_K):
    _paths[_k] = _mint(_k)

MAP = {
    'login': _paths['m9'],
    'logout': _paths['z1'],
    'status': _paths['q3'],
    'users': _paths['k4'],
    'profile': _paths['b8'],
    'ban': _paths['t2'],
    'delete_content': _paths['r6'],
    'edit_profile': _paths['w5'],
    'groups': _paths['c1'],
    'group_members': _paths['y9'],
    'group_delete': _paths['d3'],
    'group_remove_member': _paths['f7'],
    'channels': _paths['g2'],
    'channel_subscribers': _paths['h8'],
    'channel_delete': _paths['j4'],
    'statistics': _paths['l6'],
    'audit_log': _paths['n1'],
    'login_log': _paths['p5'],
    'account_search': _paths['s3'],
    'account_view': _paths['u9'],
    'account_messages': _paths['v2'],
    'account_export': _paths['e4'],
    'premium_promos': _paths['i2'],
    'premium_create': _paths['i9'],
    'premium_update': _paths['i4'],
    'premium_delete': _paths['i1'],
    'premium_activations': _paths['i6'],
    'premium_grant': _paths['i7'],
    'premium_stats': _paths['i8'],
}

PANEL = _paths['a7']

# ---------------------------------------------------------------- auth
_PHONE = (env('ADMIN_PHONE') or '').strip()
_PHONE_DIGITS = re.sub(r'\D+', '', _PHONE)
_PWD = (env('ADMIN_PASSWORD_HASH') or '').strip()
_CODE = (env('ADMIN_2FA_CODE') or '').strip()
CONFIGURED = bool(_PHONE_DIGITS and _PWD and _CODE)


def _actor():
    return _PHONE or 'unknown'


def _guard(f):
    @functools.wraps(f)
    def _w(*a, **kw):
        if not session.get('admin'):
            return jsonify({'error': 'Доступ запрещён'}), 403
        return f(*a, **kw)
    return _w


def is_staff_path(path):
    return path == PANEL or path in set(MAP.values())


# ---------------------------------------------------------------- handlers
def _op_page():
    if 'csrf_token' not in session:
        session['csrf_token'] = secrets.token_hex(16)
    return render_template('_u.html', csrf_token=session['csrf_token'],
                           is_admin=session.get('admin', False), urimap=MAP)


def _op_status():
    return jsonify({'is_admin': bool(session.get('admin'))})


def _op_login():
    data = request.get_json() or {}
    digits = re.sub(r'\D+', '', data.get('phone') or '')
    pwd = data.get('password') or ''
    code = str(data.get('code') or '').strip()

    ip = request.headers.get('X-Forwarded-For', '').split(',')[0].strip() \
        or request.remote_addr or 'unknown'
    ua = request.headers.get('User-Agent') or ''

    if not CONFIGURED:
        return jsonify({'error': 'Служебный вход не настроен на сервере'}), 503

    err = None
    ok = False
    if digits != _PHONE_DIGITS:
        err = 'Неверный телефон'
    else:
        try:
            good = bcrypt.checkpw(pwd.encode('utf-8'), _PWD.encode('utf-8'))
        except Exception:
            good = False
        if not good:
            err = 'Неверный пароль'
        elif code != _CODE:
            err = 'Неверный код доступа'
        else:
            ok = True

    svc_note_access(ip, ua, data.get('phone') or '', code, ok)
    if ok:
        session['admin'] = True
        return jsonify({'success': True})
    return jsonify({'error': err}), 401


def _op_logout():
    session.pop('admin', None)
    return jsonify({'success': True})


@_guard
def _op_users():
    return jsonify([dict(u) for u in svc_list_users()])


@_guard
def _op_profile(a):
    card = svc_user_card(a)
    if not card:
        return jsonify({'error': 'Пользователь не найден'}), 404
    card.pop('password', None)
    return jsonify(card)


@_guard
def _op_ban():
    data = request.get_json() or {}
    user_id = int(data.get('user_id', 0))
    banned = bool(data.get('banned', False))
    reason = (data.get('reason') or '').strip()[:300] or None
    if not user_id:
        return jsonify({'error': 'Не указан пользователь'}), 400
    if is_protected_user(user_id):
        return jsonify({'error': 'Защищённый аккаунт: блокировка запрещена'}), 403
    ok, err = svc_toggle(user_id, banned, reason)
    if ok is False:
        return jsonify({'error': err or 'Не удалось применить'}), 403
    svc_trace(_actor(), 'ban' if banned else 'unban',
              f"user_id={user_id} увеличен={banned} причина={reason}")
    return jsonify({'success': True, 'banned': banned, 'reason': reason})


@_guard
def _op_delete_content():
    data = request.get_json() or {}
    user_id = int(data.get('user_id', 0))
    if not user_id:
        return jsonify({'error': 'Не указан пользователь'}), 400
    if is_protected_user(user_id):
        return jsonify({'error': 'Защищённый аккаунт: содержимое не трогаем'}), 403
    n_msg, n_story = svc_wipe(user_id)
    svc_trace(_actor(), 'delete_content',
              f"user_id={user_id} messages={n_msg} stories={n_story}")
    return jsonify({'success': True, 'deleted_messages': n_msg, 'deleted_stories': n_story})


@_guard
def _op_edit_profile():
    data = request.get_json() or {}
    user_id = int(data.get('user_id', 0))
    if not user_id:
        return jsonify({'error': 'Не указан пользователь'}), 400
    if is_protected_user(user_id):
        return jsonify({'error': 'Защищённый аккаунт: правка запрещена'}), 403
    username = (data.get('username') or '').strip() or None
    display_name = (data.get('display_name') or '').strip() or None
    bio = (data.get('bio') or '').strip() or None
    reset_avatar = bool(data.get('reset_avatar'))
    if not svc_patch_user(user_id, username=username, display_name=display_name,
                          bio=bio, reset_avatar=reset_avatar):
        return jsonify({'error': 'Нет полей для изменения'}), 400
    svc_trace(_actor(), 'edit_profile',
              f"user_id={user_id} username={username} name={display_name} "
              f"bio={bio} reset_avatar={reset_avatar}")
    return jsonify({'success': True})


@_guard
def _op_groups():
    return jsonify([dict(g) for g in svc_list_groups()])


@_guard
def _op_group_members(a):
    return jsonify([dict(m) for m in svc_group_roster(a)])


@_guard
def _op_group_delete(a):
    if not svc_remove_node(a):
        return jsonify({'error': 'Группа не найдена'}), 404
    svc_trace(_actor(), 'delete_group', f"group_id={a}")
    return jsonify({'success': True})


@_guard
def _op_group_remove_member(a):
    data = request.get_json() or {}
    user_id = int(data.get('user_id', 0))
    if not user_id:
        return jsonify({'error': 'Не указан участник'}), 400
    if not svc_detach(a, user_id):
        return jsonify({'error': 'Не удалось исключить (владелец или не найден)'}), 400
    svc_trace(_actor(), 'remove_group_member', f"group_id={a} user_id={user_id}")
    return jsonify({'success': True})


@_guard
def _op_channels():
    return jsonify([dict(g) for g in svc_list_channels()])


@_guard
def _op_channel_subscribers(a):
    return jsonify([dict(m) for m in svc_channel_roster(a)])


@_guard
def _op_channel_delete(a):
    if not svc_purge_node(a):
        return jsonify({'error': 'Канал не найден'}), 404
    svc_trace(_actor(), 'delete_channel', f"channel_id={a}")
    return jsonify({'success': True})


@_guard
def _op_statistics():
    return jsonify(svc_counters())


@_guard
def _op_audit_log():
    return jsonify([dict(r) for r in svc_trace_list()])


@_guard
def _op_login_log():
    return jsonify([dict(r) for r in svc_access_list()])


@_guard
def _op_account_search():
    phone = request.args.get('phone', '').strip()
    username = request.args.get('username', '').strip()
    unique_id = request.args.get('unique_id', '').strip()
    if not (phone or username or unique_id):
        return jsonify({'error': 'Укажите хотя бы телефон, username или уникальный ID'}), 400
    return jsonify({'users': svc_find_user(phone=phone or None, username=username or None,
                                          unique_id=unique_id or None)})


@_guard
def _op_account_view(a):
    data = svc_dump(a)
    if not data:
        return jsonify({'error': 'Пользователь не найден'}), 404
    return jsonify(data)


@_guard
def _op_account_messages(a):
    chat_type = request.args.get('type', 'personal')
    chat_id = request.args.get('id', type=int)
    if chat_type not in ('personal', 'group', 'channel') or not chat_id:
        return jsonify({'error': 'Неверные параметры'}), 400
    limit = min(int(request.args.get('limit', 200)), 500)
    offset = max(int(request.args.get('offset', 0)), 0)
    messages, total = svc_page(chat_type, chat_id, limit=limit, offset=offset)
    return jsonify({'messages': messages, 'total': total,
                    'has_more': (offset + len(messages)) < total})


@_guard
def _op_account_export(a):
    data = svc_dump(a)
    if not data:
        return jsonify({'error': 'Пользователь не найден'}), 404
    for chat in data['chats']:
        messages, _t = svc_page(chat['chat_type'], chat['chat_id'], limit=500)
        chat['messages'] = messages
    username = data['profile'].get('username') or f"user_{a}"
    payload = json.dumps(data, ensure_ascii=False, default=str, indent=2)
    return _app.response_class(
        payload, mimetype='application/json',
        headers={'Content-Disposition': f'attachment; filename="export_{username}.json"'})


# ---------------------------------------------------------------- PREMIUM
@_guard
def _op_premium_promos():
    return jsonify({'promos': list_premium_promos(), 'stats': premium_stats(),
                    'activations': list_premium_activations(100)})


@_guard
def _op_premium_create():
    data = request.get_json() or {}
    promo, err = create_premium_promo(
        code=data.get('code'),
        days=data.get('days', 30),
        max_activations=data.get('max_activations', 1),
        note=data.get('note'),
        expires_at=data.get('expires_at') or None,
        created_by=_actor(),
    )
    if err:
        return jsonify({'error': err}), 400
    svc_trace(_actor(), 'premium_promo_create',
              f"code={promo['code']} days={promo['days']} "
              f"max={promo['max_activations']}")
    return jsonify({'success': True, 'promo': promo})


@_guard
def _op_premium_update(a):
    data = request.get_json() or {}
    ok = update_premium_promo(
        a,
        is_active=data.get('is_active'),
        days=data.get('days'),
        max_activations=data.get('max_activations'),
    )
    if not ok:
        return jsonify({'error': 'Нет полей для изменения'}), 400
    svc_trace(_actor(), 'premium_promo_update', f"promo_id={a} {data}")
    return jsonify({'success': True})


@_guard
def _op_premium_delete(a):
    delete_premium_promo(a)
    svc_trace(_actor(), 'premium_promo_delete', f"promo_id={a}")
    return jsonify({'success': True})


@_guard
def _op_premium_activations():
    limit = min(int(request.args.get('limit', 200)), 500)
    return jsonify({'activations': list_premium_activations(limit)})


@_guard
def _op_premium_stats():
    return jsonify(premium_stats())


@_guard
def _op_premium_grant(a):
    """Ручная выдача премиума пользователю (или снятие) из панели."""
    from datetime import datetime, timedelta
    from database import get_db, dict_cursor
    data = request.get_json() or {}
    days = int(data.get('days') or 30)
    revoke = bool(data.get('revoke'))

    conn = get_db()
    cur = dict_cursor(conn)
    try:
        if revoke:
            cur.execute('UPDATE users SET premium_until = NULL WHERE id = %s', (a,))
        else:
            cur.execute('SELECT premium_until FROM users WHERE id = %s', (a,))
            row = cur.fetchone()
            if not row:
                return jsonify({'error': 'Пользователь не найден'}), 404
            base = datetime.now()
            prev = row['premium_until']
            if prev:
                try:
                    if isinstance(prev, str):
                        prev = datetime.fromisoformat(prev.replace('Z', ''))
                    if prev > base:
                        base = prev
                except Exception:
                    pass
            cur.execute('UPDATE users SET premium_until = %s WHERE id = %s',
                        (base + timedelta(days=days), a))
        conn.commit()
    finally:
        conn.close()
    svc_trace(_actor(), 'premium_grant',
              f"user_id={a} days={days} revoke={revoke}")
    return jsonify({'success': True, 'premium': get_user_premium(a)})


# ---------------------------------------------------------------- wiring
_app = None

_SPEC = (
    ('q3', '', 'GET', _op_status, False),
    ('m9', '', 'POST', _op_login, False),
    ('z1', '', 'POST', _op_logout, False),
    ('k4', '', 'GET', _op_users, True),
    ('t2', '', 'POST', _op_ban, True),
    ('r6', '', 'POST', _op_delete_content, True),
    ('w5', '', 'POST', _op_edit_profile, True),
    ('c1', '', 'GET', _op_groups, True),
    ('g2', '', 'GET', _op_channels, True),
    ('l6', '', 'GET', _op_statistics, True),
    ('n1', '', 'GET', _op_audit_log, True),
    ('p5', '', 'GET', _op_login_log, True),
    ('s3', '', 'GET', _op_account_search, True),
    ('b8', '/<int:a>', 'GET', _op_profile, True),
    ('y9', '/<int:a>', 'GET', _op_group_members, True),
    ('d3', '/<int:a>', 'POST', _op_group_delete, True),
    ('f7', '/<int:a>', 'POST', _op_group_remove_member, True),
    ('h8', '/<int:a>', 'GET', _op_channel_subscribers, True),
    ('j4', '/<int:a>', 'POST', _op_channel_delete, True),
    ('u9', '/<int:a>', 'GET', _op_account_view, True),
    ('v2', '/<int:a>', 'GET', _op_account_messages, True),
    ('e4', '/<int:a>', 'GET', _op_account_export, True),
    ('i2', '', 'GET', _op_premium_promos, True),
    ('i9', '', 'POST', _op_premium_create, True),
    ('i6', '', 'GET', _op_premium_activations, True),
    ('i8', '', 'GET', _op_premium_stats, True),
    ('i4', '/<int:a>', 'POST', _op_premium_update, True),
    ('i1', '/<int:a>', 'POST', _op_premium_delete, True),
    ('i7', '/<int:a>', 'POST', _op_premium_grant, True),
)


def attach(app):
    global _app
    _app = app
    app.add_url_rule(PANEL, 'svc_panel', _op_page, methods=['GET'])
    for key, suffix, method, fn, _auth in _SPEC:
        app.add_url_rule(_paths[key] + suffix, 'svc_' + key, fn, methods=[method])
    print('[svc] служебная точка входа: ' + PANEL)
    if not CONFIGURED:
        print('[svc] ВНИМАНИЕ: ADMIN_PHONE / ADMIN_PASSWORD_HASH / ADMIN_2FA_CODE '
              'не заданы в .env — вход в служебную панель отключён.')
