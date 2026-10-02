"""Web Push (Push API + Service Worker) для «Спутника».

Что делает модуль:
  * хранит/генерирует пару VAPID-ключей (в .env или vapid_keys.json);
  * шлёт push всем подпискам пользователя через pywebpush;
  * самозарастает: подписки, на которые сервер отвечает 404/410
    (браузер их удалил), автоматически чистятся из базы.

Модуль НИКОГДА не роняет запрос: любая ошибка отправки ловится и
логируется, потому что push — «best effort» (без него чат работает).

Зависимость: pywebpush (pip install pywebpush). Если её нет — модуль
молча выключается, приложение работает как раньше.
"""
import json
import os

from config import env
from database import (add_push_subscription, delete_push_subscription,
                      get_push_subscriptions, prune_push_subscriptions)

try:
    from pywebpush import WebPushException, webpush
    HAVE_PYWEBPUSH = True
except ImportError:  # pragma: no cover - зависит от окружения
    webpush = None
    WebPushException = Exception
    HAVE_PYWEBPUSH = False

_HERE = os.path.dirname(os.path.abspath(__file__))
_KEYS_FILE = os.path.join(_HERE, 'vapid_keys.json')
_SUBJECT = 'mailto:%s' % (env('VAPID_CLAIM_EMAIL', 'admin@sputnik.local'),)

_keys_cache = None


# ---------------- VAPID-ключи ----------------
def _generate_keys():
    """Генерирует новую пару ключей (нужна библиотека py_vapid)."""
    try:
        import base64
        from cryptography.hazmat.primitives import serialization
        from py_vapid import Vapid
        v = Vapid()
        v.generate_keys()
        # Новая cryptography (rust bindings): public_bytes требует encoding/format,
        # а urlsafe_b64encode у ключа больше нет — кодируем сами.
        pub = v.public_key.public_bytes(
            serialization.Encoding.X962,
            serialization.PublicFormat.UncompressedPoint)
        priv = v.private_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption())
        public = base64.urlsafe_b64encode(pub).decode().rstrip('=')
        private = priv.decode()
        return public, private
    except Exception as e:  # pragma: no cover
        print('[push] не удалось сгенерировать VAPID-ключи: %s' % e)
        return None, None


def _save_keys_file(public_key, private_key):
    try:
        with open(_KEYS_FILE, 'w', encoding='utf-8') as f:
            json.dump({'public_key': public_key,
                       'private_key': private_key}, f, indent=2)
    except Exception as e:
        print('[push] не удалось записать vapid_keys.json: %s' % e)


def get_vapid_keys():
    """Возвращает (public_key, private_key) или (None, None)."""
    global _keys_cache
    if _keys_cache is not None:
        return _keys_cache
    public = env('VAPID_PUBLIC_KEY', '').strip()
    private = env('VAPID_PRIVATE_KEY', '').strip()
    # Приватный ключ в .env хранится одной строкой с \n — разворачиваем
    # в настоящие переводы строк (dotenv-формат не умеет многострочные значения).
    if private and '\\n' in private:
        private = private.replace('\\n', '\n')
    if not public or not private:
        # 2) файл рядом с проектом (удобно: не светить ключи в .env)
        try:
            with open(_KEYS_FILE, encoding='utf-8') as f:
                data = json.load(f)
            public = public or data.get('public_key', '')
            private = private or data.get('private_key', '')
        except Exception:
            pass
    if not public or not private:
        # 3) сгенерировать новые (один раз) и сохранить
        public, private = _generate_keys()
        if public:
            _save_keys_file(public, private)
    _keys_cache = (public or None, private or None)
    return _keys_cache


def get_public_key():
    public, _ = get_vapid_keys()
    return public


def is_push_available():
    """Готов ли сервер к отправке push."""
    return bool(HAVE_PYWEBPUSH and get_vapid_keys()[1])


def status():
    """Диагностика для /api/push/state и админки."""
    public, private = get_vapid_keys()
    return {
        'available': bool(HAVE_PYWEBPUSH),
        'configured': bool(public and private),
        'enabled': is_push_available(),
        'public_key': public or '',
        'lib': 'pywebpush' if HAVE_PYWEBPUSH else 'нет (установи pywebpush)',
    }


# ---------------- Отправка ----------------
def _clean_payload(payload):
    import json as _json
    return _json.dumps(payload, ensure_ascii=False)


def push_to_user(user_id, payload, ttl=86400, urgent=False):
    """Шлёт push одному пользователю. Возвращает (доставлено, детали)."""
    if not is_push_available():
        return 0, 'push выключен'
    user_id = int(user_id)
    try:
        subs = get_push_subscriptions(user_id)
    except Exception as e:
        print('[push] не удалось прочитать подписки user=%s: %s' % (user_id, e))
        return 0, str(e)
    if not subs:
        return 0, 'нет подписок'

    _, private = get_vapid_keys()
    data = _clean_payload(payload)
    sent, errors = 0, []
    for sub in subs:
        subscription = {
            'endpoint': sub['endpoint'],
            'keys': {'p256dh': sub['p256dh'], 'auth': sub['auth']},
        }
        try:
            webpush(
                subscription_info=subscription,
                data=data,
                vapid_private_key=private,
                vapid_claims={'sub': _SUBJECT},
                ttl=ttl,
                urgent=urgent,
            )
            sent += 1
        except WebPushException as e:
            status_code = getattr(getattr(e, 'response', None), 'status_code', None)
            if status_code in (404, 410):
                # Браузер больше не считает endpoint живым — чистим.
                try:
                    delete_push_subscription(sub['endpoint'])
                except Exception as ce:
                    print('[push] не удалось удалить подписку: %s' % ce)
            errors.append('%s%s' % (status_code or 'ошибка', getattr(e, 'message', '')))
        except Exception as e:
            errors.append(str(e))
    if errors:
        print('[push] user=%s: %d отправлено, ошибки: %s'
              % (user_id, sent, '; '.join(errors[:3])))
    return sent, errors


def push_to_users(user_ids, payload, ttl=86400):
    """Шлёт push нескольким пользователям (сколько получилось — столько)."""
    total = 0
    for uid in set(int(u) for u in user_ids if u):
        n, _ = push_to_user(uid, payload, ttl=ttl)
        total += n
    return total


def subscribe_user(user_id, subscription, user_agent=None):
    """Сохраняет подписку. subscription = {endpoint, keys:{p256dh, auth}}."""
    endpoint = (subscription or {}).get('endpoint')
    keys = (subscription or {}).get('keys') or {}
    p256dh, auth = keys.get('p256dh'), keys.get('auth')
    if not endpoint or not p256dh or not auth:
        return False, 'неполная подписка'
    add_push_subscription(int(user_id), endpoint, p256dh, auth, user_agent)
    return True, 'ok'


def unsubscribe_user(user_id=None, endpoint=None):
    delete_push_subscription(endpoint, user_id)
    return True, 'ok'


def prune(max_age_days=60):
    """Чистит протухшие подписки (старше N дней)."""
    try:
        return prune_push_subscriptions(max_age_days)
    except Exception as e:
        print('[push] prune не удался: %s' % e)
        return 0
