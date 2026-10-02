/* Спутник — Service Worker (Web Push)
 *
 * Задачи:
 *   push            — показать системное уведомление, когда вкладка закрыта
 *   notificationclick — открыть нужный чат в уже открытой вкладке (или новой)
 *   message         — обмен с вкладкой: счётчик в title, звук, очистка бейджа
 *
 * Важная логика: если нашлось ОТКРЫТОЕ и ВИДИМОЕ окно, уведомление не
 * показываем — вместо этого шлём вкладке сообщение, чтобы она тихо посчитала
 * непрочитанные и playsound. Так пользователь не получает дубль.
 */
'use strict';

const VERSION = 'v2';

/* ---------- установка / активация ---------- */
self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    // Подчищаем кеши старых версий на всякий случай.
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k.indexOf('sputnik-') === 0).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

/* ---------- кеширование ----------
 * Кеш файлов намеренно НЕ делаем: клиент подгружает /cdn/js/*.js и
 * /cdn/css/*.css, и после правки разработчика старый закешированный
 * код цеплялся бы к пользователю (устаревший интерфейс, «баги»).
 * Service Worker работает только на уведомлениях.
 */

/* ---------- утилиты ---------- */
/* Настройки приходят из вкладки при загрузке страницы. */
let prefs = { preview: true, inAppOnly: false, sound: true };

async function updateBadge(count) {
    if (self.navigator && self.navigator.setAppBadge) {
        try { await self.navigator.setAppBadge(Number(count) || 0); } catch (e) { }
    }
}

function iconOf(payload) {
    return (payload && payload.icon) || '/static/favicon/web-app-manifest-192x192.png';
}

function badgeOf(payload) {
    return (payload && payload.badge) || '/static/favicon/web-app-manifest-192x192.png';
}

function titleOf(payload) {
    if (!payload) return 'Спутник';
    if (payload.title) return payload.title;
    return 'Новое сообщение';
}

function bodyOf(payload) {
    if (!payload) return '';
    if (typeof payload.body === 'string') return payload.body;
    if (payload.preview) return payload.preview;
    return '';
}

/* Ищем открытое И видимое окно приложения (не скрытую вкладку) */
async function findVisibleClient() {
    const list = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
    });
    return list.find((c) => c.visibilityState === 'visible') || null;
}

async function anyClient() {
    const list = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
    });
    return list[0] || null;
}

/* ---------- PUSH ---------- */
self.addEventListener('push', (event) => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch (e) {
        payload = { title: 'Спутник', body: event.data ? event.data.text() : '' };
    }

    event.waitUntil((async () => {
        // Вкладка на экране — отдаём уведомление вкладке (звук + счётчик).
        const visible = await findVisibleClient();
        if (visible) {
            visible.postMessage({ type: 'push-in-app', payload: payload });
            return;
        }
        if (payload.silent) return;
        // Пользователь выбрал «без системных уведомлений» — только бейдж.
        if (prefs.inAppOnly) {
            await updateBadge(payload.count);
            return;
        }
        const body = prefs.preview === false ? 'Новое сообщение' : bodyOf(payload);

        const tag = 'sputnik-' + (payload.kind || 'msg') + '-'
            + (payload.scope || '') + '-' + (payload.scopeId || 0);

        await self.registration.showNotification(titleOf(payload), {
            body: body,
            icon: iconOf(payload),
            badge: badgeOf(payload),
            tag: tag,
            renotify: true,
            requireInteraction: !!payload.requireInteraction,
            vibrate: payload.vibrate || [90, 40, 90],
            timestamp: Date.now(),
            data: {
                scope: payload.scope || '',
                scopeId: payload.scopeId || 0,
                kind: payload.kind || 'msg',
                url: payload.url || '/chat'
            },
            actions: payload.kind === 'call' ? [
                { action: 'answer', title: 'Ответить' },
                { action: 'dismiss', title: 'Отклонить' }
            ] : []
        });
    })());
});

/* ---------- клик по уведомлению ---------- */
self.addEventListener('notificationclick', (event) => {
    const data = (event.notification && event.notification.data) || {};
    const action = event.action || '';
    event.notification.close();

    if (action === 'dismiss') {
        event.waitUntil(Promise.resolve());
        return;
    }

    event.waitUntil((async () => {
        // 1) Ответ на звонок — шлём вкладке команду.
        if (action === 'answer') {
            const c = await anyClient();
            if (c) {
                c.postMessage({ type: 'answer-call', callId: data.callId });
                c.focus();
            } else {
                self.clients.openWindow(data.url || '/chat');
            }
            return;
        }

        // 2) Открыть нужный чат в уже открытой вкладке.
        const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of all) {
            try {
                await client.focus();
                client.postMessage({
                    type: 'open-chat',
                    scope: data.scope,
                    scopeId: data.scopeId
                });
                return;
            } catch (e) { /* окно могло закрыться — пробуем следующее */ }
        }
        // 3) Окна нет — открываем новое.
        const url = new URL(data.url || '/chat', self.location.origin);
        if (data.scope && data.scopeId) {
            const param = data.scope === 'personal' ? 'chat' : data.scope;
            url.searchParams.set('open', param);
            url.searchParams.set('id', String(data.scopeId));
        }
        self.clients.openWindow(url.href);
    })());
});

/* ---------- сообщения от вкладки ---------- */
self.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type === 'skip-waiting') {
        self.skipWaiting();
        return;
    }
    if (data.type === 'prefs' && data.prefs) {
        prefs = Object.assign(prefs, data.prefs || {});
        return;
    }
    if (data.type === 'clear-badges') {
        event.waitUntil((async () => {
            if (self.navigator && self.navigator.setAppBadge) {
                try { await self.navigator.clearAppBadge(); } catch (e) { }
            }
            const list = await self.clients.matchAll({ type: 'window' });
            list.forEach((c) => {
                try { c.postMessage({ type: 'title-changed' }); } catch (e) { }
            });
        })());
        return;
    }
    if (data.type === 'set-badge') {
        event.waitUntil(updateBadge(data.count));
    }
});

/* ---------- клик по иконке приложения ---------- */
self.addEventListener('appinstalled', () => {
    console.log('[sputnik-sw] приложение установлено');
});
