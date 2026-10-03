# -*- coding: utf-8 -*-
"""Тесты TTL кэша превью ссылок и принудительного обновления (v0.62.3)."""
import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database as db
import main

PASS = 0
FAIL = 0
URL = 'https://example.com/telegram-article'


def check(name, cond, extra=''):
    global PASS, FAIL
    if cond:
        PASS += 1
        print('OK   %s' % name)
    else:
        FAIL += 1
        print('FAIL %s %s' % (name, extra))


def put_cache(url, title, fetched_at):
    conn = db.get_db()
    cur = db.dict_cursor(conn)
    cur.execute('''
        INSERT INTO link_previews (url, title, description, image_url, site_name, fetched_at)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (url) DO UPDATE SET title = EXCLUDED.title,
                                        description = EXCLUDED.description,
                                        image_url = EXCLUDED.image_url,
                                        site_name = EXCLUDED.site_name,
                                        fetched_at = EXCLUDED.fetched_at
    ''', (url, title, 'Описание', '', 'Example', fetched_at))
    conn.commit()
    conn.close()


def get_cached(url):
    conn = db.get_db()
    cur = db.dict_cursor(conn)
    cur.execute('SELECT title, fetched_at FROM link_previews WHERE url = %s', (url,))
    row = cur.fetchone()
    conn.close()
    return row


def drop(url):
    conn = db.get_db()
    cur = db.dict_cursor(conn)
    cur.execute('DELETE FROM link_previews WHERE url = %s', (url,))
    conn.commit()
    conn.close()


print('--- v0.62.3: TTL превью ссылок ---')

# 1) Настройка TTL
check('TTL по умолчанию 24 часа', db.link_preview_ttl_hours() == 24, db.link_preview_ttl_hours())
os.environ['LINK_PREVIEW_TTL_HOURS'] = '2'
check('TTL берётся из окружения', db.link_preview_ttl_hours() == 2)
os.environ['LINK_PREVIEW_TTL_HOURS'] = 'abc'
check('кривое значение -> дефолт 24', db.link_preview_ttl_hours() == 24)
os.environ['LINK_PREVIEW_TTL_HOURS'] = '0'
check('0 ограничивается минимумом 1 часом', db.link_preview_ttl_hours() == 1)
del os.environ['LINK_PREVIEW_TTL_HOURS']
check('после удаления переменной снова 24', db.link_preview_ttl_hours() == 24)

# 2) Свежая запись отдаётся из кэша без обращения к сети
now = db.get_moscow_datetime()
put_cache(URL, 'Свежий заголовок', now)
_orig_fetch = db.fetch_public_url
db.fetch_public_url = lambda u: (_ for _ in ()).throw(AssertionError('сеть не должна вызываться'))
try:
    p = db.get_link_preview(URL)
    check('свежий кэш отдан без сети', p is not None)
    check('заголовок из кэша', p and p.get('title') == 'Свежий заголовок', p and p.get('title'))
    check('поле cached=True', p and p.get('cached') is True)
    check('fetched_at не утекает наружу', p and 'fetched_at' not in p)
finally:
    db.fetch_public_url = _orig_fetch

# 3) Просроченная запись обновляется (сеть вызывается)
put_cache(URL, 'Старый заголовок', now - timedelta(hours=30))
called = {'n': 0}


def fake_fetch(u):
    called['n'] += 1
    return ('<html><head><title>Новый заголовок</title>'
            '<meta name="description" content="Новое описание">'
            '<meta property="og:site_name" content="Example"></head><body>x</body></html>')


db.fetch_public_url = fake_fetch
try:
    p = db.get_link_preview(URL)
    check('просроченный кэш обновлён', p and p.get('title') == 'Новый заголовок', p and p.get('title'))
    check('сеть вызвана один раз', called['n'] == 1, called['n'])
    check('поле cached=False', p and p.get('cached') is False)
    row = get_cached(URL)
    check('в БД записано новое значение', row and row['title'] == 'Новый заголовок')
    check('fetched_at обновлён', row and row['fetched_at'] is not None)

    # 4) Принудительное обновление свежей записи
    put_cache(URL, 'Заголовок перед обновлением', db.get_moscow_datetime())
    p = db.get_link_preview(URL, force_refresh=True)
    check('force_refresh обновляет свежую запись', p and p.get('title') == 'Новый заголовок', p and p.get('title'))
    row = get_cached(URL)
    check('force_refresh записал в БД', row and row['title'] == 'Новый заголовок')
    check('сеть вызвана второй раз', called['n'] == 2, called['n'])
finally:
    db.fetch_public_url = _orig_fetch

# 5) Запись без fetched_at (со времён до TTL) считается устаревшей
conn = db.get_db()
cur = db.dict_cursor(conn)
cur.execute('UPDATE link_previews SET fetched_at = NULL WHERE url = %s', (URL,))
conn.commit()
conn.close()
db.fetch_public_url = fake_fetch
try:
    called['n'] = 0
    p = db.get_link_preview(URL)
    check('пустой fetched_at = устарело, обновляем', p and p.get('title') == 'Новый заголовок')
    check('сеть вызвана', called['n'] == 1)
finally:
    db.fetch_public_url = _orig_fetch

# 6) force_refresh для неизвестной ссылки не делает запрос
db.fetch_public_url = lambda u: (_ for _ in ()).throw(AssertionError('сеть не должна вызываться'))
try:
    check('force_refresh неизвестной ссылки -> None', db.get_link_preview(URL + '/new', force_refresh=True) is None)
finally:
    db.fetch_public_url = _orig_fetch

# 7) Безопасность не ослабла: внутренний адрес по-прежнему отбрасывается
db.fetch_public_url = lambda u: (_ for _ in ()).throw(AssertionError('сеть не должна вызываться'))
try:
    check('SSRF: 127.0.0.1 -> None', db.get_link_preview('http://127.0.0.1:5000/') is None)
    check('SSRF: file:// -> None', db.get_link_preview('file:///etc/passwd') is None)
    check('SSRF: 169.254.169.254 -> None', db.get_link_preview('http://169.254.169.254/latest/meta-data/') is None)
finally:
    db.fetch_public_url = _orig_fetch

# 8) API: параметр force
app = main.app
app.config['TESTING'] = True
with app.test_client() as c:
    c.get('/auth?mode=login')
    with c.session_transaction() as s:
        s['user_id'] = 1
    r = c.get('/api/link_preview?url=' + URL)
    check('API без force отвечает 200', r.status_code == 200, r.status_code)
    check('API отдаёт ключ preview', 'preview' in (r.get_json() or {}))
    r = c.get('/api/link_preview?url=ftp://example.com')
    check('API: не-http схема -> preview None', (r.get_json() or {}).get('preview') is None)
    r = c.get('/api/link_preview?url=' + URL + '&force=1')
    check('API с force отвечает 200', r.status_code == 200, r.status_code)

with app.test_client() as cu:
    check('API без сессии -> 401', cu.get('/api/link_preview?url=' + URL).status_code == 401)

# 9) Чистим тестовую запись
drop(URL)
check('тестовая запись удалена', get_cached(URL) is None)

print('-' * 40)
print('ИТОГ: %d OK, %d FAIL' % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
