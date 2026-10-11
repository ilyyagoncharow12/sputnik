# Инструкции для opencode — проект Спутник (мессенджер)

## Обязательное правило (НЕ нарушать)

Каждый раз, когда ты вносишь ЛЮБЫЕ изменения в этот проект (код, баги,
новые функции, рефакторинг, настройки, исправления), ты ОБЯЗАН
синхронно обновлять файл `CHANGELOG.txt` в корне проекта:

1. Открой `CHANGELOG.txt`.
2. В **раздел 3 «ЧТО ДОБАВЛЕНО В ЭТОТ РАЗ»** допиши краткое описание
   каждой сделанной правки (что именно изменил, какие файлы).
3. Если изменилась функциональность — подними **версию** в разделе
   «ТЕКУЩАЯ ВЕРСИЯ» (по схеме v0.65.0, v0.65.1, ... v0.66.0 ...).
4. Если ты заметил новые проблемы/идеи — добавь их в **раздел 2**
   (проблемы) или **раздел 4** (что добавить дальше).
5. Проставляй дату при каждом обновлении.

Это правило действует ВСЕГДА и не требует дополнительной просьбы
пользователя. Даже если пользователь не упомянул CHANGELOG —
всё равно обнови его.

## Запуск и среда

- Запуск: `python main.py` (слушает `0.0.0.0:5000`). `debug=True`
  захардкожен в `socketio.run` (main.py, конец файла) — сервер
  auto-reloadится от правок Python/JS/CSS, страницу в браузере обновляй
  вручную. Для прода `debug=True` неприемлем (дебаг-консоль) — прод-запуск
  только отдельным флагом/юнитом, не правь эту строку «втихую».
- База — **SQLite** (`sputnik.db` в корне, автосоздаётся в `init_db()`).
  В `main.py`, `database.py` и т.п. пиши SQL в стиле **PostgreSQL** — его
  транслирует `_translate_sql`/`_CompatCursor` в database.py:
  `%s`→`?`, `SERIAL PRIMARY KEY`→`AUTOINCREMENT`, `NOW() AT TIME ZONE 'UTC'
  + INTERVAL '3 hours'`→`datetime('now')`, `STRING_AGG`→`GROUP_CONCAT`,
  `to_char`→`strftime`, `::cast` убираются, `RETURNING` отрабатывает.
- Работа с БД: `get_db()` + `dict_cursor(cur)`; всегда `conn.close()`.
  `conn.execute()` сам делает commit; `cur.execute()` — нет.
- Звонки с телефона требуют HTTPS: `USE_HTTPS=1` + файлы
  `certs/fullchain.pem` и `certs/privkey.pem` (генерирует сам пользователь);
  порт `HTTPS_PORT` (по умолчанию 5443). `http://localhost:5000` работает всегда.
- Настройки из `config.env()` (переменная окружения → `.env` рядом с проектом → дефолт).
- Зависимости: `python -m pip install -r requirements.txt` (там Flask,
  Flask-SocketIO, Pillow, bcrypt, pywebpush, PyJWT, psycopg2-binary).

## Авторизация и безопасность (не сломать)

- Сессии — **JWT в HttpOnly-cookie** `sputnik_session` (HS256, код —
  `jwt_session.py`, подменяет `app.session_interface`). Весь код с
  `session[...]` работает как раньше, ничего переписывать не надо.
- Отзыв токена = удаление строки из `user_sessions` по `session_token`
  (`logout`, `/api/terminate_session`, `/api/terminate_all_sessions`
  реально разлогинивают). Проверка `sid` — в `open_session` на каждый запрос.
- Бан/удаление проверяются в `before_request` (`ban_check`): сессия
  сбрасывается, API отдаёт 403. Не обходи эту проверку.
- Анти-перебор по аккаунту (не по IP): 5 неудач → блок 5 минут для входа,
  2FA и паскода (`AUTH_FAILURES` в main.py, in-memory).
- Пароли входа, секреты 2FA и паскод — bcrypt с солью (+ миграция старых
  хэшей на лету). Не вводи новые секреты без хеширования.
- Cookie `Secure` включается только при `USE_HTTPS=1`; CSRF — заголовок
  `X-CSRF-Token` на все не-GET `/api` (`csrf_protect`).
- Файлы отдавай только через `_safe_file`/`_resolve_media_path` (защита
  от `../`); новые файловые ручки без них — дыра.

## Архитектура: где что лежит

- `main.py` (~6300 строк) — ВСЕ HTTP-роуты и Socket.IO события.
- `database.py` (~7000 строк) — вся работа с БД (init_db, create_*, get_*).
- `jwt_session.py` — JWT-хранилище сессий (см. выше).
- `templates/chat.html` — тонкий SPA-каркас (~630 строк). Весь функционал
  в CDN-модулях: `cdn/js/*.js` (порядок подключения важен, см. шаблон),
  стили — `cdn/css/*.css` (mobile.css подключается последним и перекрывает).
- Эталон дизайна модалок — TG-стиль: тёмная карточка `#0f0f0f`, radius 24,
  стрелка-назад + заголовок по центру, кнопки `#1c1c1e` с синим текстом
  (классы `tg-modal-wrapper/header/body`, `tg-action-btn`, `tg-btn-*`,
  `tg-input` — см. `cdn/css/modal-universal.css`). Новое лепи под него.
- Карта JS: `core.js` (`showModal/openModal/closeModal`, isMobile() =
  `innerWidth <= 768 || body.mobile`, переключение sidebar/chat-area),
  `chats.js` (список чатов, вкладки папок), `messages.js`
  (formatMessage/displayMessage), `context-menu.js` (showContextMenu — меню
  сообщения с реакциями), `message-features.js` (реакции/поиск/пересылка),
  `gestures.js` (мобильные жесты: свайп-ответ, свайп от края «назад»,
  долгое нажатие → контекстное меню), `community.js` (группы/каналы),
  `profiles.js`, `settings.js`, `stories.js`, `accounts.js` (несколько
  аккаунтов, коды входа), `music-extra.js`.
- ВАЖНО: активные `folders.js` и `call.js` лежат в `static/js/`,
  а не в `cdn/js/`.
- Звонки/WebRTC: `static/js/call.js` + `webrtc.py` + `call_manager.py`
  (+ `templates/call_interface.html`).
- `archive/` — мёртвые/дублирующие файлы (старые БД, webrtc_signaling.py и
  т.п.), НЕ редактировать.
- Весь UI-текст — на русском.

## Особенности, которые легко сломать

- Мобильная раскладка (≤768px через media-запросы): `.sidebar`/`.chat-area`
  слайдятся translateX с классами `chat-open`. При мобильных тестах в
  Playwright: сначала задай размер окна (view > 768), затем перезагрузи
  страницу и открой чат заново — после изменения размера без перезагрузки
  панель чата остаётся за экраном (x > innerWidth).
- У личных чатов / групп / каналов **общие id** — при работе с папками
  всегда используй пару `chat_type` + `chat_id` и передавай `chat_types`
  на бэкенд (`create_folder`/`update_folder_chats` принимают `chat_types`).
- Контекстное меню с реакциями: на ПК открывает правый клик
  (`oncontextmenu`), на телефоне — долгое нажатие (собственный таймер
  500мс в `gestures.js`). Если меню «не открывается» — проверь оба пути.

## Проверка изменений

- Минимальная проверка после правок: `python -m py_compile main.py
  database.py` и `node --check <файл>.js` для изменённого JS.
- Регрессия — скрипты `tools/_check_*.py` (18 штук: presence, privacy,
  security, jwt, pathtraversal, perms, maint, cors, ssrf, profile_media,
  join, trash, views, edits, ticks, secretkey, preview_ttl, push).
  Запуск: `python tools/_check_<имя>.py`. Файлы `_check_edits`,
  `_check_join`, `_check_perms`, `_check_privacy`, `_check_ticks`,
  `_check_trash` НЕ добавляют `sys.path` — их запускать только как
  `set PYTHONPATH=. && python tools\_check_X.py`. Остальные сами вставляют
  путь. Критерий — `ИТОГ: N OK, 0 FAIL` / `ИТОГ: N/N`.
- Проверки создают временных пользователей (`pres*`, `sectest*`,
  `jwttest*`, `sockdbg`) и обычно чистят за собой. Если остались —
  `python tools/_cleanup_test_artifacts.py` (не трогает реальных:
  sputnik/2, admin/4, ilxz_12/7, rr316/88).
- UI проверяется в Playwright (настроен в `opencode.json`, браузер msedge):
  тестового `knopa (user_id=1)` в БД НЕТ — для входа используй admin
  (user_id=4) или создавай пользователя скриптом. Один контекст браузера
  = один пользователь; симметричные/двусторонние и звонковые тесты
  ограничены. Стартовый viewport может быть узким (сработает мобильный
  CSS) — явно задавай размер через resize. HttpOnly-cookie (`sputnik_session`)
  из JS не поставить — только через `context.addCookies()`.

## Прод и деплой

- Сервер: `root@opencode.kiselgram.ru` (Ubuntu 22.04, nginx, systemd,
  Postgres в docker `kiselgram-db-1` на 5433). SSH-ключ —
  `~/.ssh/kiselgram_deploy` (ed25519, без пароля).
- Прод-`.env` собирается НА сервере (свежие SECRET_KEY/ADMIN/VAPID);
  локальные `.env`, `sputnik.db`, `certs/` на прод не копировать.
- Проект тяжёлый (~100 МБ, в основном `static/uploads`) — для заливки
  исключай `archive/`, `__pycache__`, `tools/_check_*`, локальные БД/бэкапы.

## Переносимость (флешка)

Проект может переноситься на флешке между компьютерами. Всё важное
(этот файл, CHANGELOG.txt, .env, БД sputnik.db) хранится ВНУТРИ проекта.
