# -*- coding: utf-8 -*-
"""Проверка защиты превью ссылок от SSRF (v0.62.0).

Сервер сам скачивает страницу по URL из сообщения. Без фильтра любой
пользователь заставил бы его открыть внутренние адреса (127.0.0.1,
метаданные облака 169.254.169.254) и увидеть содержимое ответа в превью.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('TESTING', '1')

import database as db

OK = 0
FAIL = 0


def step(name, cond, extra=''):
    global OK, FAIL
    if cond:
        OK += 1
        print('OK   ' + name)
    else:
        FAIL += 1
        print('FAIL ' + name + (' -> ' + str(extra)[:200] if extra else ''))


# --- 1. Адреса, которые обязаны быть отклонены ---
BLOCKED = [
    'http://127.0.0.1:5000/',
    'http://127.1.2.3/',
    'https://localhost/',
    'http://localhost:5000/admin',
    'http://[::1]/',
    'http://[fd00::1]/',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.1/',
    'http://172.16.5.4/',
    'http://192.168.0.1/',
    'http://100.64.0.1/',
    'http://0.0.0.0/',
    'http://255.255.255.255/',
    'file:///C:/Windows/win.ini',
    'ftp://example.com/x',
    'gopher://example.com/',
    'data:text/html,<script>alert(1)</script>',
    '',
    'javascript:alert(1)',
    'http:///no-host/',
    'не-url',
]
for u in BLOCKED:
    step('заблокирован: ' + (u[:44] or '(пусто)'), db.is_safe_public_url(u) is False)

# --- 2. Публичные адреса должны проходить ---
ALLOWED = ['https://example.com/', 'http://8.8.8.8/', 'https://telegram.org/faq']
for u in ALLOWED:
    step('разрешён: ' + u[:44], db.is_safe_public_url(u) is True)

# --- 3. Готовые IP-адреса (без DNS) ---
step('IPv4 loopback не публичный', db.is_public_ip('127.0.0.1') is False)
step('IPv6 loopback не публичный', db.is_public_ip('::1') is False)
step('публичный IPv4 публичный', db.is_public_ip('93.184.216.34') is True)
step('публичный IPv6 публичный', db.is_public_ip('2606:2800:220:1:248:1893:25c8:1946') is True)

# --- 4. get_link_preview не отдаёт содержимое внутренних адресов ---
prev = db.get_link_preview('http://127.0.0.1:5000/')
step('превью 127.0.0.1 не получено', prev is None, prev)
prev = db.get_link_preview('http://169.254.169.254/latest/meta-data/')
step('превью метаданных не получено', prev is None, prev)

# --- 5. Редирект на внутренний адрес блокируется ---
class _FakeResp:
    headers = {}

    def __init__(self):
        self._headers_called = False

try:
    handler = db._SafeRedirectHandler()
    req = db.urllib.request.Request('http://93.184.216.34/')
    blocked_redirect = False
    try:
        handler.redirect_request(req, _FakeResp(), 302, 'Found',
                                 {}, 'http://127.0.0.1:5000/api/get_users')
    except Exception:
        blocked_redirect = True
    step('редирект 302 на 127.0.0.1 заблокирован', blocked_redirect)

    allowed_redirect = None
    try:
        allowed_redirect = handler.redirect_request(req, _FakeResp(), 302, 'Found',
                                                   {}, 'https://example.com/next')
    except Exception as e:
        allowed_redirect = None
        allowed_redirect = ('error', str(e))
    step('редирект на публичный адрес разрешён',
         allowed_redirect is not None and not (isinstance(allowed_redirect, tuple)),
         allowed_redirect)
except Exception as e:
    step('редиректы проверены', False, e)

# --- 6. Внутренний URL не попадает в кеш ---
conn = db.get_db()
cur = db.dict_cursor(conn)
cur.execute('SELECT COUNT(*) AS n FROM link_previews WHERE url LIKE %s',
            ('%127.0.0.1%',))
n_localhost = cur.fetchone()['n']
cur.execute('SELECT COUNT(*) AS n FROM link_previews WHERE url LIKE %s',
            ('%169.254%',))
n_meta = cur.fetchone()['n']
step('внутренние URL не закешированы',
     n_localhost == 0 and n_meta == 0, 'localhost=%s meta=%s' % (n_localhost, n_meta))

# --- 7. Роут /api/link_preview ---
import main as app_main

app = app_main.app
app.config['TESTING'] = True
client = app.test_client()
with client.session_transaction() as s:
    s['user_id'] = 4
    s['csrf_token'] = 't'

r = client.get('/api/link_preview?url=http://127.0.0.1:5000/api/get_users')
d = r.get_json() or {}
step('роут отдаёт пустое превью для 127.0.0.1',
     r.status_code == 200 and d.get('preview') is None, d)

r = client.get('/api/link_preview?url=http://localhost:5000/')
d = r.get_json() or {}
step('роут отдаёт пустое превью для localhost',
     r.status_code == 200 and d.get('preview') is None, d)

r = client.get('/api/link_preview?url=file:///C:/Windows/win.ini')
d = r.get_json() or {}
step('роут отдаёт пустое превью для file://',
     r.status_code == 200 and d.get('preview') is None, d)

client2 = app.test_client()
r = client2.get('/api/link_preview?url=https://example.com/')
step('роут без сессии — 401', r.status_code == 401, r.status_code)

conn.close()

print()
print('ИТОГ: %d/%d' % (OK, OK + FAIL))
sys.exit(1 if FAIL else 0)
