# -*- coding: utf-8 -*-
"""Проверка CORS для Socket.IO (v0.62.0).

Раньше стоял cors_allowed_origins='*'. Через него сайт, открытый в том же
браузере, мог подключиться к сокету приложения и слушать чужие сообщения:
WebSocket не подчиняется SameSite, поэтому cookie уезжали вместе с ним.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('TESTING', '1')

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


import main as app_main

ORIGINS = app_main.ALLOWED_ORIGINS

# --- 1. Список собран, '*' в нём нет ---
step('список origin не пустой', len(ORIGINS) > 0, ORIGINS)
step('в списке нет "*"', '*' not in ORIGINS)
step('нет origin со звёздочкой внутри',
     not any('*' in o for o in ORIGINS))

# --- 2. Локальные адреса разрешены ---
for needed in ['http://localhost:5000', 'http://127.0.0.1:5000']:
    step('разрешён ' + needed, needed in ORIGINS)

step('разрешён https на порту 5443 (звонки с телефона)',
     'https://127.0.0.1:5443' in ORIGINS)

ips = app_main._local_ips()
step('найдены локальные IP', len(ips) >= 1, sorted(ips))
lan_ip = [i for i in ips if i.count('.') == 3 and not i.startswith('127.')]
if lan_ip:
    step('разрешён вход с IP этой машины (%s)' % lan_ip[0],
         'http://%s:5000' % lan_ip[0] in ORIGINS)
    step('разрешён https с IP этой машины',
         'https://%s:5443' % lan_ip[0] in ORIGINS)

# --- 3. Чужие сайты не разрешены ---
for evil in ['https://evil.com', 'http://evil.com',
             'https://vk.com', 'http://localhost.evil.com',
             'https://127.0.0.1.evil.com', 'http://192.0.2.5:5000']:
    step('НЕ разрешён ' + evil, evil not in ORIGINS)

# --- 4. Настоящая проверка: engine.io отклоняет чужой Origin даже для WebSocket ---
app = app_main.app
app.config['TESTING'] = True
http = app.test_client()
HAND = '/socket.io/?EIO=4&transport=polling'

r_evil = http.get(HAND, headers={'Origin': 'https://evil.com'})
step('handshake с чужим Origin отклонён (%s)' % r_evil.status_code,
     r_evil.status_code == 400 and 'origin' in (r_evil.get_data(as_text=True) or '').lower(),
     r_evil.get_data(as_text=True)[:120])

r_local = http.get(HAND, headers={'Origin': 'http://localhost:5000'})
step('handshake со своим Origin принят (%s)' % r_local.status_code,
     r_local.status_code == 200, r_local.get_data(as_text=True)[:120])

r_vk = http.get(HAND, headers={'Origin': 'https://vk.com'})
step('handshake с vk.com отклонён', r_vk.status_code == 400, r_vk.status_code)

r_none = http.get(HAND)
step('handshake без Origin (curl/телефон) принят (%s)' % r_none.status_code,
     r_none.status_code == 200, r_none.status_code)

ips_list = app_main._local_ips()
lan = [i for i in ips_list if i.count('.') == 3 and not i.startswith('127.')]
if lan:
    r_lan = http.get(HAND, headers={'Origin': 'http://%s:5000' % lan[0]})
    step('handshake с IP этой машины принят (%s)' % r_lan.status_code,
         r_lan.status_code == 200, r_lan.status_code)

# --- 5. Дубликатов нет ---
step('в списке нет повторов', len(ORIGINS) == len(set(ORIGINS)))

# --- 6. ALLOWED_ORIGINS из .env добавляются ---
saved = app_main.env
app_main.env = lambda key, default=None: 'https://my.site' if key == 'ALLOWED_ORIGINS' else default
try:
    extra = app_main.allowed_origins()
    step('origin из .env добавлен', 'https://my.site' in extra, extra[:6])
finally:
    app_main.env = saved

print()
print('ИТОГ: %d/%d' % (OK, OK + FAIL))
sys.exit(1 if FAIL else 0)
