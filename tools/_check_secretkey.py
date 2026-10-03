# -*- coding: utf-8 -*-
"""Проверка SECRET_KEY (v0.62.0).

Раньше в main.py стоял захардкоженный ключ подписи сессий: того, кто его
видел, мог подделать cookie и зайти под любым user_id. Теперь ключ живёт
только в .env (или переменной окружения) и генерируется при первом старте.
"""
import io
import os
import sys
import shutil
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('TESTING', '1')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OK = 0
FAIL = 0

HARDCODE = '89e=)_)_)I(E*(UIM<#*URM38um489ur74ncyrc7y54n54vm'


def step(name, cond, extra=''):
    global OK, FAIL
    if cond:
        OK += 1
        print('OK   ' + name)
    else:
        FAIL += 1
        print('FAIL ' + name + (' -> ' + str(extra)[:200] if extra else ''))


# --- 1. Захардкоженного ключа больше нет в коде ---
src = io.open(os.path.join(ROOT, 'main.py'), encoding='utf-8').read()
step('захардкоженный SECRET_KEY удалён из main.py', HARDCODE not in src)
step('в main.py нет строки с app.config[\'SECRET_KEY\'] = env(...)',
     "env('SECRET_KEY', '" not in src and 'env("SECRET_KEY", "' not in src)
step('есть функция get_secret_key', 'def get_secret_key()' in src)

# --- 2. Ключ достаточно длины и он в .env ---
import config

key = config.env('SECRET_KEY')
step('SECRET_KEY задан', bool(key), 'длина %s' % (len(key) if key else 0))
step('SECRET_KEY не короче 32 символов', bool(key) and len(key) >= 32,
     len(key) if key else 0)

if key:
    env_path = os.path.join(ROOT, '.env')
    if os.path.exists(env_path):
        env_text = io.open(env_path, encoding='utf-8').read()
        step('ключ действительно лежит в .env', key in env_text)

# --- 3. save_env корректно пишет новую переменную ---
tmpdir = tempfile.mkdtemp()
saved_env_path = config._ENV_PATH
try:
    config._ENV_PATH = os.path.join(tmpdir, '.env')
    config._ENV = {}
    step('save_env создал файл', config.save_env('TEST_KEY_ONE', 'abc123') is True)
    text = io.open(config._ENV_PATH, encoding='utf-8').read()
    step('в файле есть строка TEST_KEY_ONE=abc123',
         'TEST_KEY_ONE=abc123' in text, text[:120])

    config.save_env('TEST_KEY_TWO', 'second')
    text = io.open(config._ENV_PATH, encoding='utf-8').read()
    step('вторая переменная не затерла первую',
         'TEST_KEY_ONE=abc123' in text and 'TEST_KEY_TWO=second' in text, text[:160])

    config.save_env('TEST_KEY_ONE', 'replaced')
    text = io.open(config._ENV_PATH, encoding='utf-8').read()
    step('повторная запись заменяет значение, а не дублирует',
         'TEST_KEY_ONE=replaced' in text and text.count('TEST_KEY_ONE=') == 1, text[:160])
finally:
    config._ENV_PATH = saved_env_path
    shutil.rmtree(tmpdir, ignore_errors=True)

# --- 4. Приложение поднимается с ключом из окружения ---
os.environ['SECRET_KEY'] = 'x' * 64
try:
    for mod in [m for m in list(sys.modules) if m in ('main', 'config')]:
        del sys.modules[mod]
    import main as app_main
    used = app_main.app.config['SECRET_KEY']
    step('приложение взяло ключ из окружения', used == 'x' * 64, used[:20])
    step('ключ в приложении не короче 32 символов', len(used) >= 32)
finally:
    del os.environ['SECRET_KEY']

# --- 5. Без ключа приложение всё равно стартует со случайным ---
try:
    for mod in [m for m in list(sys.modules) if m in ('main', 'config')]:
        del sys.modules[mod]
    saved_path = config._ENV_PATH if 'config' in sys.modules else None
    import config as cfg2
    saved_path = cfg2._ENV_PATH
    cfg2._ENV = {}
    cfg2._ENV_PATH = os.path.join(tempfile.gettempdir(), 'sputnik_no_env_test', '.env')
    os.environ.pop('SECRET_KEY', None)
    for mod in [m for m in list(sys.modules) if m == 'main']:
        del sys.modules[mod]
    import main as app_main2
    gen1 = app_main2.app.config['SECRET_KEY']
    step('без .env ключ всё равно есть', bool(gen1) and len(gen1) >= 32,
         len(gen1) if gen1 else 0)
    step('сгенерированный ключ НЕ равен захардкоженному', HARDCODE not in gen1)
    shutil.rmtree(os.path.dirname(cfg2._ENV_PATH), ignore_errors=True)
    cfg2._ENV_PATH = saved_path
except Exception as e:
    step('приложение стартует без ключа в .env', False, e)

print()
print('ИТОГ: %d/%d' % (OK, OK + FAIL))
sys.exit(1 if FAIL else 0)
