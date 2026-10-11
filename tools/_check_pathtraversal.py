# -*- coding: utf-8 -*-
"""Проверка защиты от path traversal (v0.64.0).

Раньше /api/download_file/<path> присоединял пользовательский путь к
static/ без проверки `..`, поэтому можно было скачать main.py, .env,
sputnik.db и т.п. Проверяем, что теперь любой выход за пределы static/
отклоняется, а легитимные файлы отдаются.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main

PASS = 0
FAIL = 0


def check(name, cond, extra=''):
    global PASS, FAIL
    if cond:
        PASS += 1
        print('OK   %s' % name)
    else:
        FAIL += 1
        print('FAIL %s %s' % (name, extra))


print('--- v0.64.0: path traversal ---')

# ---- юнит-уровень: _resolve_media_path ----
bad = [
    'static/../main.py',
    'static/../.env',
    'static/../sputnik.db',
    'static/../../etc/passwd',
    'uploads/../../main.py',
    '../main.py',
    '../../main.py',
    'static/..%2fmain.py',
    'static\\..\\main.py',
    'static/./../../requirements.txt',
]
for p in bad:
    r = main._resolve_media_path(p)
    check('traversal отклонён: %r' % p, r is None, r)

# легитимный файл внутри static/uploads
os.makedirs(os.path.join('static', 'uploads', 'files'), exist_ok=True)
probe_rel = os.path.join('uploads', 'files', '_pt_probe.txt')
probe_abs = os.path.join('static', probe_rel)
with open(probe_abs, 'w', encoding='utf-8') as f:
    f.write('probe')

check('легитимный uploads/… найден',
      main._resolve_media_path('uploads/files/_pt_probe.txt') == os.path.abspath(probe_abs))
check('легитимный static/… найден',
      main._resolve_media_path('static/uploads/files/_pt_probe.txt') == os.path.abspath(probe_abs))


# ---- HTTP-уровень: /api/download_file ----
app = main.app
app.config['TESTING'] = True
c = app.test_client()
with c.session_transaction() as s:
    s['user_id'] = 4  # admin — реально существующий аккаунт (1 удалён)


def dl(path):
    return c.get('/api/download_file/' + path)


r = dl('static/../main.py')
check('HTTP: static/../main.py не отдаётся (404)', r.status_code == 404, r.status_code)
check('HTTP: в теле нет исходника main.py',
      b'def get_secret_key' not in r.data and b'SECRET_KEY' not in r.data)

r = dl('static/../.env')
check('HTTP: ../.env не отдаётся (404)', r.status_code == 404, r.status_code)

r = dl('static/../sputnik.db')
check('HTTP: ../sputnik.db не отдаётся (404)', r.status_code == 404, r.status_code)

r = dl('uploads/files/_pt_probe.txt')
check('HTTP: легитимный файл отдаётся (200)', r.status_code == 200, r.status_code)
check('HTTP: содержимое верное', r.data == b'probe', r.data[:20])

r = dl('files/_pt_probe.txt')
check('HTTP: путь без префикса ищется в uploads (200)', r.status_code == 200, r.status_code)


# уборка
try:
    os.remove(probe_abs)
except OSError:
    pass

print('-' * 40)
print('ИТОГ: %d OK, %d FAIL' % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
