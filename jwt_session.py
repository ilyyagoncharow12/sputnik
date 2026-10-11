"""JWT-сессии для Спутника (v0.64.0).

Заменяет встроенный во Flask cookie-сеанс (itsdangerous) на подписанный
JWT в HttpOnly-cookie. Все существующие обращения к `session[...]` в
коде продолжают работать без изменений: меняется только транспорт —
как данные сеанса попадают в cookie и как читаются обратно.

Почему JWT здесь:
  * токен подписан SECRET_KEY (HS256), подделать user_id нельзя;
  * cookie — HttpOnly + SameSite (см. SESSION_COOKIE_* в main.py),
    JS до токена не достаёт.

Отзыв токенов (revocation):
  В JWT кладётся claim `sid` — идентификатор серверной сессии, тот же
  session_token, что хранится в таблице user_sessions. На каждом запросе
  open_session сверяет sid с БД, поэтому:
    * выход (logout) убивает токен сразу;
    * кнопки «Завершить сессию» / «Завершить все, кроме текущей» реально
      разлогинивают устройства (раньше это только удаляло строку из
      списка, а cookie продолжала работать);
    * бан / удаление аккаунта отсекаются в before_request (ban_check).

Полностью stateless-JWT (без сверки с БД) здесь сознательно НЕ
используется: иначе нельзя было бы мгновенно разлогинить украденный
токен.
"""
import uuid
from datetime import datetime, timezone

import jwt
from flask.sessions import SecureCookieSession, SessionInterface


COOKIE_NAME = 'sputnik_session'
ALGORITHM = 'HS256'

# Служебные claims JWT — их не нужно возвращать в сам словарь сеанса.
_CLAIMS = ('iat', 'exp', 'nbf', 'jti', 'sid')


class JwtSession(SecureCookieSession):
    """Сеанс, который знает свой серверный sid и id токена (jti)."""

    sid = None
    jti = None


def _session_token_active(sid):
    """Проверяет, что серверная сессия (session_token) ещё жива.

    При недоступности БД считаем сессию активной (fail-open): устойчивость
    важнее, а аккаунт всё равно проверяется в before_request (ban_check).
    """
    try:
        from database import session_token_active
        return session_token_active(sid)
    except Exception:
        return True


class JwtSessionInterface(SessionInterface):
    """Хранит сеанс в подписанном JWT внутри HttpOnly-cookie."""

    session_class = JwtSession

    def __init__(self, cookie_name=COOKIE_NAME):
        self.cookie_name = cookie_name

    def get_cookie_name(self, app):
        return self.cookie_name

    def _secret(self, app):
        return app.config['SECRET_KEY']

    def open_session(self, app, request):
        token = request.cookies.get(self.get_cookie_name(app))
        if not token:
            return self.session_class()
        try:
            payload = jwt.decode(
                token, self._secret(app), algorithms=[ALGORITHM],
                options={'require': ['exp']},
            )
        except jwt.PyJWTError:
            return self.session_class()

        data = dict(payload)
        sid = data.pop('sid', None) or data.get('session_token')
        jti = data.pop('jti', None)
        for claim in _CLAIMS:
            if claim != 'sid':
                data.pop(claim, None)

        # Отзыв: токен с серверным sid должен опираться на живую сессию.
        if sid and not _session_token_active(sid):
            return self.session_class()

        session = self.session_class(data)
        session.sid = sid
        session.jti = jti
        return session

    def save_session(self, app, session, response):
        name = self.get_cookie_name(app)
        domain = self.get_cookie_domain(app)
        path = self.get_cookie_path(app)
        secure = self.get_cookie_secure(app)
        samesite = self.get_cookie_samesite(app)
        httponly = self.get_cookie_httponly(app)

        if session.accessed:
            response.vary.add('Cookie')

        # Пустой сеанс: если его очистили (logout/бан) — удаляем cookie.
        if not session:
            if session.modified:
                response.delete_cookie(
                    name, domain=domain, path=path,
                    secure=secure, samesite=samesite, httponly=httponly,
                )
                response.vary.add('Cookie')
            return

        if not self.should_set_cookie(app, session):
            return

        expires = self.get_expiration_time(app, session)
        lifetime = app.permanent_session_lifetime
        now = datetime.now(timezone.utc)

        payload = dict(session)
        # sid = серверный session_token (живёт в user_sessions). Кладём его
        # явным claim, чтобы отзыв не зависел от имени ключа в словаре.
        sid = session.get('session_token') or session.sid
        if sid:
            session.sid = sid
            payload['sid'] = sid
        if not session.jti:
            session.jti = uuid.uuid4().hex
        payload['jti'] = session.jti
        payload['iat'] = int(now.timestamp())
        payload['exp'] = int(now.timestamp() + lifetime.total_seconds())

        token = jwt.encode(payload, self._secret(app), algorithm=ALGORITHM)
        response.set_cookie(
            name, token, expires=expires, httponly=httponly,
            domain=domain, path=path, secure=secure, samesite=samesite,
        )
