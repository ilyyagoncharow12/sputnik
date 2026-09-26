# config.py — загрузка настроек из .env (файл лежит рядом с проектом, переносится на флешке)
import os

_ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
_ENV = {}


def load_env():
    global _ENV
    if _ENV:
        return _ENV
    try:
        with open(_ENV_PATH, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                key, value = line.split('=', 1)
                _ENV[key.strip()] = value.strip().strip('"').strip("'")
    except OSError:
        pass
    return _ENV


def env(key, default=None):
    """Значение переменной: сначала окружение ОС, потом .env, потом дефолт."""
    load_env()
    return os.environ.get(key, _ENV.get(key, default))