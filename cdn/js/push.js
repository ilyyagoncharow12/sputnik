// ===== WEB PUSH + СЧЁТЧИК В TITLE + ЗВУК УВЕДОМЛЕНИЙ (Спутник) =====
// Механика:
//   1) один раз регистрируем Service Worker (/sw.js, scope = /);
//   2) по кнопке в «Уведомлениях» просим разрешение и сохраняем подписку;
//   3) сервер шлёт push тем, кто офлайн — уведомление рисует Service Worker;
//   4) если вкладка на экране, SW не показывает уведомление, а присылает
//      сообщение вкладке: она тихо играет звук и обновляет счётчик в title;
//   5) клик по уведомлению открывает нужный чат (SW шлёт open-chat).

const PUSH_PREFS_KEY = 'sputnik_push_prefs_v1';

const PushPrefs = {
    // sound: звук при новом сообщении во вкладке (без файлов, WebAudio)
    // preview: показывать текст сообщения в уведомлении
    // inAppOnly: не слать системные уведомления, только звук (для настольных)
    get() {
        let p = {};
        try { p = JSON.parse(localStorage.getItem(PUSH_PREFS_KEY)) || {}; } catch (e) { p = {}; }
        return {
            sound: p.sound !== false,
            preview: p.preview !== false,
            inAppOnly: p.inAppOnly === true,
            enabled: p.enabled === true
        };
    },
    set(patch) {
        const next = Object.assign(PushPrefs.get(), patch || {});
        try { localStorage.setItem(PUSH_PREFS_KEY, JSON.stringify(next)); } catch (e) { }
        return next;
    }
};

const PushState = {
    supported: false,
    secure: false,
    swReady: false,
    subscription: null,
    server: { available: false, configured: false, enabled: false, public_key: '' },
    initDone: false
};

// ================= ИНИЦИАЛИЗАЦИЯ =================
function initPush() {
    if (PushState.initDone) return;
    PushState.initDone = true;

    PushState.supported = ('serviceWorker' in navigator) && ('PushManager' in window)
        && ('Notification' in window);
    PushState.secure = window.isSecureContext === true
        || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    // Канал обмена с Service Worker
    navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', onPushServiceMessage);
    document.addEventListener('visibilitychange', onPushVisibility);

    if (!PushState.supported) {
        console.info('[push] браузер не поддерживает Push API');
        return;
    }
    // Регистрируем SW всегда (нужен и для офлайн-оболочки), но подписку
    // создаём только по явному действию пользователя.
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then((reg) => {
            PushState.swReady = true;
            return refreshPushSubscription(reg);
        })
        .then(() => {
            // Передаём настройки, чтобы SW знал: показывать ли текст сообщения
            // и не показывать ли системные уведомления вовсе.
            sendToServiceWorker({ type: 'prefs', prefs: PushPrefs.get() });
        })
        .catch((e) => console.warn('[push] регистрация SW не удалась:', e));

    fetch('/api/push/state')
        .then((r) => r.json())
        .then((s) => { PushState.server = s || PushState.server; })
        .catch(() => { });
}

function onPushVisibility() {
    // Вернулись на вкладку — сбрасываем счётчик в title и бейдж приложения.
    if (!document.hidden) {
        setTimeout(() => {
            if (typeof updateUnreadBadges === 'function') updateUnreadBadges();
            sendToServiceWorker({ type: 'clear-badges' });
        }, 250);
    }
}

function sendToServiceWorker(msg) {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready
        .then((reg) => {
            if (reg.active) reg.active.postMessage(msg);
            else if (navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage(msg);
        })
        .catch(() => { });
}

function onPushServiceMessage(event) {
    const data = event.data || {};
    if (data.type === 'open-chat') {
        const id = parseInt(data.scopeId);
        const type = data.scope || 'personal';
        if (id && typeof openChat === 'function') openChat(id, type);
        return;
    }
    if (data.type === 'push-in-app') {
        // Вкладка активна: уведомление не показываем, только звук + счётчик.
        if (PushPrefs.get().sound) playPushSound();
        if (typeof loadChatsList === 'function') setTimeout(loadChatsList, 300);
        else if (typeof updateUnreadBadges === 'function') setTimeout(updateUnreadBadges, 300);
        return;
    }
    if (data.type === 'title-changed') {
        if (typeof updateUnreadBadges === 'function') updateUnreadBadges();
    }
}

// ================= ЗВУК (без файлов, WebAudio) =================
let _pushAudioCtx = null;
function playPushSound() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!_pushAudioCtx) _pushAudioCtx = new Ctx();
        const ctx = _pushAudioCtx;
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;
        // Короткая «двойка» как в мессенджерах: 880 Гц -> 1174 Гц
        [[880, 0], [1174, 0.09]].forEach(([freq, delay]) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + delay);
            gain.gain.setValueAtTime(0.0001, now + delay);
            gain.gain.exponentialRampToValueAtTime(0.14, now + delay + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.13);
            osc.connect(gain).connect(ctx.destination);
            osc.start(now + delay);
            osc.stop(now + delay + 0.15);
        });
    } catch (e) { /* звук не критичен */ }
}

// ================= ПОДПИСКА =================
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
}

async function refreshPushSubscription(reg) {
    try {
        PushState.subscription = await reg.pushManager.getSubscription();
    } catch (e) {
        PushState.subscription = null;
    }
    return PushState.subscription;
}

function pushReady() {
    if (!PushState.supported) return Promise.reject(new Error('Браузер не поддерживает Push API'));
    if (!PushState.secure) return Promise.reject(new Error('Нужен HTTPS (или localhost)'));
    return navigator.serviceWorker.ready;
}

async function pushSubscribe() {
    const reg = await pushReady();
    if (!PushState.server.public_key) {
        await fetch('/api/push/state').then((r) => r.json())
            .then((s) => { PushState.server = s || PushState.server; });
    }
    if (!PushState.server.public_key) throw new Error('Сервер не настроен (нет VAPID-ключа)');

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
        sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(PushState.server.public_key)
        });
    }
    PushState.subscription = sub;
    const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() })
    });
    if (!res.ok) throw new Error('Сервер не принял подписку');
    PushPrefs.set({ enabled: true });
    return sub;
}

async function pushUnsubscribe() {
    try {
        const reg = navigator.serviceWorker && await navigator.serviceWorker.ready;
        if (reg) {
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                await fetch('/api/push/unsubscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: sub.endpoint })
                });
                await sub.unsubscribe();
            }
        }
    } catch (e) { /* всё равно считаем выключенным */ }
    PushState.subscription = null;
    PushPrefs.set({ enabled: false });
}

async function pushSendTest() {
    const res = await fetch('/api/push/test', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Тест не отправился');
    return data;
}

// ================= МОДАЛКА НАСТРОЕК =================
function pushStatusInfo() {
    const perm = (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';
    const prefs = PushPrefs.get();
    const sub = !!PushState.subscription;
    let stateKey, stateText, stateHint;
    if (!PushState.supported) {
        stateKey = 'bad';
        stateText = 'Браузер не поддерживает';
        stateHint = 'Push работает в Chrome, Edge, Firefox и Safari 16+. В приватном режиме некоторых браузеров он выключен.';
    } else if (!PushState.secure) {
        stateKey = 'bad';
        stateText = 'Нужен HTTPS';
        stateHint = 'Без HTTPS браузер не даёт включить уведомления. Включи USE_HTTPS=1 в .env и заходи по https://.';
    } else if (perm === 'denied') {
        stateKey = 'bad';
        stateText = 'Запрещено в браузере';
        stateHint = 'Разреши уведомления в настройках сайта (замок слева в адресной строке → Уведомления), потом нажми «Включить».';
    } else if (sub) {
        stateKey = 'ok';
        stateText = 'Уведомления включены';
        stateHint = 'Сообщения приходят, даже когда вкладка закрыта. На этом устройстве: ' +
            (prefs.sound ? 'со звуком' : 'без звука') + '.';
    } else if (perm === 'granted') {
        stateKey = 'mid';
        stateText = 'Готовы включить';
        stateHint = 'Нажми «Включить уведомления» — браузер спросит разрешение один раз.';
    } else {
        stateKey = 'mid';
        stateText = 'Выключены';
        stateHint = 'Уведомлений не будет, пока вкладка открыта и в фокусе.';
    }
    return { perm, prefs, sub, stateKey, stateText, stateHint };
}

function openPushSettings() {
    closeBurgerMenu();
    const info = pushStatusInfo();
    const dot = { ok: '#34c759', mid: '#ff9f0a', bad: '#ff453a' }[info.stateKey];
    const canToggle = PushState.supported && PushState.secure && info.perm !== 'denied';

    let html = `
    <div class="push-settings">
        <div class="push-hero push-hero--${info.stateKey}">
            <div class="push-hero-dot" style="background:${dot}"></div>
            <div class="push-hero-text">
                <div class="push-hero-title">${info.stateText}</div>
                <div class="push-hero-hint">${info.stateHint}</div>
            </div>
        </div>

        <button class="push-main-btn ${info.sub ? 'push-main-btn--off' : ''}"
                onclick="togglePush()"
                ${canToggle ? '' : 'disabled'}>
            <i class="fas ${info.sub ? 'fa-bell-slash' : 'fa-bell'}"></i>
            <span>${info.sub ? 'Выключить уведомления' : 'Включить уведомления'}</span>
        </button>
        <div class="push-error" id="pushError" style="display:none"></div>

        <div class="push-section">
            <div class="push-section-title">Параметры</div>

            <label class="push-row">
                <div class="push-row-text">
                    <div class="push-row-title">Звук в активной вкладке</div>
                    <div class="push-row-hint">Короткий сигнал, когда вкладка открыта, но чат свёрнут</div>
                </div>
                <input type="checkbox" class="push-switch" id="prefSound"
                       ${info.prefs.sound ? 'checked' : ''}
                       onchange="setPushPref('sound', this.checked)">
            </label>

            <label class="push-row">
                <div class="push-row-text">
                    <div class="push-row-title">Показывать текст сообщения</div>
                    <div class="push-row-hint">Иначе в уведомлении будет только «Новое сообщение»</div>
                </div>
                <input type="checkbox" class="push-switch" id="prefPreview"
                       ${info.prefs.preview ? 'checked' : ''}
                       onchange="setPushPref('preview', this.checked)">
            </label>

            <label class="push-row">
                <div class="push-row-text">
                    <div class="push-row-title">Только на этом устройстве</div>
                    <div class="push-row-hint">Без системных уведомлений — только звук и счётчик</div>
                </div>
                <input type="checkbox" class="push-switch" id="prefInApp"
                       ${info.prefs.inAppOnly ? 'checked' : ''}
                       onchange="setPushPref('inAppOnly', this.checked)">
            </label>
        </div>

        <button class="push-test-btn" onclick="testPush()"
                ${info.sub ? '' : 'disabled'}>
            <i class="fas fa-paper-plane"></i> Прислать тестовое уведомление
        </button>

        <div class="push-foot">
            Счётчик непрочитанных в заголовке вкладки и звук работают всегда,
            независимо от системных уведомлений.
        </div>
    </div>`;
    showModal('Уведомления', html);
}

function pushShowError(text) {
    const el = document.getElementById('pushError');
    if (el) {
        el.textContent = text || '';
        el.style.display = text ? 'block' : 'none';
    }
    if (text) showToast(text);
}

async function togglePush() {
    pushShowError('');
    try {
        const info = pushStatusInfo();
        if (info.sub) {
            await pushUnsubscribe();
            showToast('Уведомления выключены');
        } else {
            const perm = await Notification.requestPermission();
            if (perm !== 'granted') {
                pushShowError('Браузер не дал разрешение');
                return;
            }
            await pushSubscribe();
            showToast('Уведомления включены');
        }
        openPushSettings();
    } catch (e) {
        pushShowError(e && e.message ? e.message : 'Не получилось');
    }
}

function setPushPref(key, value) {
    PushPrefs.set({ [key]: value });
    sendToServiceWorker({ type: 'prefs', prefs: PushPrefs.get() });
}

async function testPush() {
    pushShowError('');
    try {
        await pushSendTest();
        showToast('Тест отправлен — проверь уведомления');
    } catch (e) {
        pushShowError(e && e.message ? e.message : 'Тест не отправился');
    }
}

// ================= СТАРТ =================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPush);
} else {
    initPush();
}

