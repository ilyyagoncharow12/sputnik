# -*- coding: utf-8 -*-
"""Проверка техподдержки (v1.1.0): категории, создание тикета, ответ, админка."""

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


print('--- support ---')

app = main.app
app.config['TESTING'] = True
client = app.test_client()

with client.session_transaction() as s:
    s['user_id'] = 4
    s['admin'] = True
    s['csrf_token'] = 'test-csrf'

with client.session_transaction() as s:
    csrf = s.get('csrf_token')

# Категории
r = client.get('/api/support/categories')
cats = r.get_json()
check('категории отдаются', r.status_code == 200 and len(cats) >= 5, len(cats))

# Создание тикета
r = client.post('/api/support/tickets', json={
    'category': 'account', 'subject': 'Тест', 'message': 'Тестовое обращение'
}, headers={'X-CSRF-Token': csrf})
data = r.get_json()
check('создание тикета', r.status_code == 200 and data.get('success'), data)
ticket_id = data.get('ticket_id')

# Список тикетов пользователя
r = client.get('/api/support/tickets')
tickets = r.get_json()
check('список тикетов', r.status_code == 200 and any(t['id'] == ticket_id for t in tickets), len(tickets))

# Получение тикета
r = client.get('/api/support/tickets/%s' % ticket_id)
t = r.get_json()
check('получение тикета', r.status_code == 200 and t.get('subject') == 'Тест')

# Ответ пользователя
r = client.post('/api/support/tickets/%s/reply' % ticket_id,
                json={'message': 'Дополнение'}, headers={'X-CSRF-Token': csrf})
check('ответ пользователя', r.status_code == 200 and r.get_json().get('success'))

# Админка: список
r = client.get('/api/admin/support/tickets')
check('админ: список', r.status_code == 200 and isinstance(r.get_json(), list))

# Админка: получение тикета
r = client.get('/api/admin/support/tickets/%s' % ticket_id)
check('админ: тикет', r.status_code == 200 and r.get_json().get('id') == ticket_id)

# Админка: ответ
r = client.post('/api/admin/support/tickets/%s/reply' % ticket_id,
                json={'message': 'Ответ поддержки'}, headers={'X-CSRF-Token': csrf})
check('админ: ответ', r.status_code == 200 and r.get_json().get('success'))

# Админка: статус
r = client.post('/api/admin/support/tickets/%s/status' % ticket_id,
                json={'status': 'answered'}, headers={'X-CSRF-Token': csrf})
check('админ: статус', r.status_code == 200 and r.get_json().get('success'))

# Проверка, что статус изменился
r = client.get('/api/admin/support/tickets/%s' % ticket_id)
check('статус answered', r.get_json().get('status') == 'answered')

print('-' * 40)
print('ИТОГ: %d OK, %d FAIL' % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
