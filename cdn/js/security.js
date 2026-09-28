/* =====================================================================
   SECURITY.JS — Спутник v0.58.0
   1) Блокировка приложения кодом (passcode) + экран замка + автоблокировка
   2) Двухэтапная проверка: облачный пароль поверх кода входа
   3) Импорт контактов из книги телефона (vCard / ручной ввод / Contacts API)
   ===================================================================== */

/* =====================================================================
   1. PASSCODE — ЭКРАН ЗАМКА
   ===================================================================== */
const lockState = {
    info: null,        // {enabled, autolock, hint}
    entered: '',
    needHint: false,
    attempts: 0,
    idleTimer: null,
    lastActivity: Date.now(),
};

const LOCK_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'del'];

function lockKeyIcon(k) {
    if (k === 'clear') return '<i class="fas fa-times"></i>';
    if (k === 'del') return '<i class="fas fa-angle-left"></i>';
    return k;
}

function renderLockDots(n, err) {
    const dots = document.getElementById('lockDots');
    if (!dots) return;
    const len = lockState.info?.passcode_length || 4;
    dots.innerHTML = Array.from({ length: Math.max(len, n) },
        (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
    if (err) {
        dots.classList.remove('err');
        void dots.offsetWidth;
        dots.classList.add('err');
    }
}

function showLockScreen() {
    if (document.getElementById('lockScreen')) return;
    lockState.entered = '';
    lockState.attempts = 0;

    const el = document.createElement('div');
    el.className = 'lock-screen';
    el.id = 'lockScreen';
    el.innerHTML = `
        <img class="lk-logo" src="/static/icons/premium.png" alt="Спутник"
             onerror="this.style.display='none';">
        <div class="lk-title">Спутник заблокирован</div>
        <div class="lk-sub" id="lockSub">Введите код</div>
        <div class="lock-dots" id="lockDots"></div>
        <div class="lock-keys" id="lockKeys">
            ${LOCK_KEYS.map(k => `<button class="lock-key ${k === 'clear' || k === 'del' ? 'fn' : ''}"
                 onclick="lockKey('${k}')">${lockKeyIcon(k)}</button>`).join('')}
        </div>
        <button class="lk-logout" onclick="lockLogout()">Выйти из аккаунта</button>`;
    document.body.appendChild(el);
    renderLockDots(0);
    bindLockIdle();
}

function closeLockScreen() {
    document.getElementById('lockScreen')?.remove();
    lockState.entered = '';
    document.body.style.overflow = '';
    if (lockState.idleTimer) clearInterval(lockState.idleTimer);
    lockState.lastActivity = Date.now();
}

function lockKey(k) {
    if (k === 'clear') { lockState.entered = ''; renderLockDots(0); return; }
    if (k === 'del') { lockState.entered = lockState.entered.slice(0, -1); renderLockDots(lockState.entered.length); return; }

    lockState.entered += k;
    renderLockDots(lockState.entered.length);
    lockState.lastActivity = Date.now();

    const len = lockState.info?.passcode_length || 4;
    if (lockState.entered.length >= len) {
        setTimeout(lockVerify, 120);
    }
}

function lockSub(text) {
    const s = document.getElementById('lockSub');
    if (s) s.textContent = text;
}

async function lockVerify() {
    const sub = document.getElementById('lockSub');
    const code = lockState.entered;
    try {
        const r = await fetch('/api/app_lock/verify', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passcode: code })
        });
        const d = await r.json();
        if (d.success) {
            closeLockScreen();
            if (typeof socket !== 'undefined' && socket.connected === false) socket.connect?.();
            return;
        }
    } catch (e) { /* сеть — пробуем ещё раз */ }

    lockState.attempts++;
    lockState.entered = '';
    renderLockDots(0, true);
    lockSub('Неверный код');

    if (lockState.attempts >= 3 && lockState.info?.hint) {
        lockState.attempts = 0;
        const hint = confirm(`Подсказка: ${lockState.info.hint}\n\nВвести подсказку сейчас?`);
        if (hint) {
            const v = prompt('Введите подсказку:');
            if (v && v.trim().toLowerCase() === String(lockState.info.hint).toLowerCase()) {
                showToast('Подсказка верна');
            }
        }
    }
}

function lockLogout() {
    if (!confirm('Выйти из аккаунта?')) return;
    document.getElementById('lockScreen')?.remove();
    fetch('/api/logout', { method: 'POST' }).finally(() => { location.href = '/login'; });
}

/* Автоблокировка по простою */
function bindLockIdle() {
    if (lockState.idleTimer) clearInterval(lockState.idleTimer);
    ['click', 'keydown', 'touchstart', 'mousemove'].forEach(ev =>
        document.addEventListener(ev, () => { lockState.lastActivity = Date.now(); }, { passive: true }));
    lockState.idleTimer = setInterval(() => {
        const mins = lockState.info?.autolock || 0;
        if (!mins || !lockState.info?.enabled) return;
        if (Date.now() - lockState.lastActivity > mins * 60000) showLockScreen();
    }, 15000);
}

let _appLockInit = false;
async function initAppLock() {
    if (_appLockInit) return;
    _appLockInit = true;
    try {
        const r = await fetch('/api/app_lock/status');
        if (!r.ok) return;
        lockState.info = await r.json();
    } catch (e) { return; }
    if (!lockState.info?.enabled) return;

    // Длительность определяем на глаз: 4 цифры = 4 символа
    lockState.info.passcode_length = Math.max(4, Math.min(8, lockState.info.passcode_length || 4));
    showLockScreen();
}

/* ======================= НАСТРОЙКА PASSCODE ======================= */
function openPasscodeSettings() {
    showModal('Код приложения', `
        <div style="display:flex;flex-direction:column;gap:12px;">
            <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;">
                Код запрашивается при запуске приложения и после бездействия.
                Он не связан с кодом входа и хранится только на сервере.
            </div>
            <div>
                <div class="tg-section-title">Новый код (4–8 цифр)</div>
                <input id="plCode" type="password" inputmode="numeric" class="tg-input"
                       placeholder="••••" maxlength="8" style="letter-spacing:6px;font-size:20px;text-align:center;">
            </div>
            <div>
                <div class="tg-section-title">Повторите код</div>
                <input id="plCode2" type="password" inputmode="numeric" class="tg-input"
                       placeholder="••••" maxlength="8" style="letter-spacing:6px;font-size:20px;text-align:center;">
            </div>
            <div>
                <div class="tg-section-title">Подсказка (необязательно)</div>
                <input id="plHint" type="text" class="tg-input" placeholder="Например: дата рождения" maxlength="80">
            </div>
            <div>
                <div class="tg-section-title">Автоблокировка</div>
                <select id="plAuto" class="tg-input">
                    <option value="0">Сразу при запуске</option>
                    <option value="1">После 1 минуты простоя</option>
                    <option value="5">После 5 минут</option>
                    <option value="15">После 15 минут</option>
                    <option value="60">После 1 часа</option>
                </select>
            </div>
            <div style="display:flex;gap:10px;">
                <button class="tg-action-btn" style="flex:1;background:#007aff;color:#fff;" onclick="savePasscode()">
                    <i class="fas fa-check"></i> Включить
                </button>
                <button class="tg-action-btn" style="flex:1;background:rgba(255,59,48,.2);color:#ff6b61;" onclick="disablePasscode()">
                    <i class="fas fa-lock-open"></i> Отключить
                </button>
            </div>
        </div>
    `);
}

async function savePasscode() {
    const a = document.getElementById('plCode')?.value || '';
    const b = document.getElementById('plCode2')?.value || '';
    if (a.length < 4) return showToast('Код минимум 4 цифры');
    if (a !== b) return showToast('Коды не совпадают');
    try {
        const r = await fetch('/api/app_lock/set', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                passcode: a,
                hint: document.getElementById('plHint')?.value || null,
                autolock: +(document.getElementById('plAuto')?.value || 0),
            })
        });
        const d = await r.json();
        if (d.success) {
            showToast('Код приложения включён');
            closeModal('tempModal');
            lockState.info = { enabled: true, autolock: d.autolock, hint: d.hint, passcode_length: a.length };
        } else showToast(d.error || 'Ошибка');
    } catch (e) { showToast('Ошибка сети'); }
}

async function disablePasscode() {
    const v = prompt('Введите текущий код приложения для отключения:');
    if (!v) return;
    try {
        const r = await fetch('/api/app_lock/off', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passcode: v })
        });
        const d = await r.json();
        if (d.success) {
            showToast('Код приложения отключён');
            closeModal('tempModal');
            lockState.info = { enabled: false };
        } else showToast(d.error || 'Неверный код');
    } catch (e) { showToast('Ошибка сети'); }
}

/* =====================================================================
   2. ДВУХЭТАПНАЯ ПРОВЕРКА (облачный пароль)
   ===================================================================== */
function openTwoFASettings() {
    showModal('Двухэтапная проверка', `
        <div id="twofaBox" style="text-align:center;padding:10px 0;">
            <div class="emoji-empty">Загрузка…</div>
        </div>
    `);
    loadTwoFA();
}

async function loadTwoFA() {
    const box = document.getElementById('twofaBox');
    if (!box) return;
    let d = {};
    try {
        const r = await fetch('/api/2fa/status');
        d = await r.json();
    } catch (e) {}

    if (!d.enabled) {
        box.innerHTML = `
            <div style="text-align:left;font-size:13px;color:var(--text-secondary);line-height:1.5;margin-bottom:14px;">
                Облачный пароль — это второй этап входа поверх кода из SMS.
                Даже если кто-то получит ваш код, без пароля он не войдёт.
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <input id="faPw" type="password" class="tg-input" placeholder="Облачный пароль" autocomplete="new-password">
                <input id="faPw2" type="password" class="tg-input" placeholder="Повторите пароль" autocomplete="new-password">
                <input id="faHint" type="text" class="tg-input" placeholder="Подсказка (необязательно)" maxlength="80">
                <input id="faEmail" type="email" class="tg-input" placeholder="Email для восстановления" autocomplete="email">
                <button class="tg-action-btn" style="background:#007aff;color:#fff;" onclick="saveTwoFA()">
                    <i class="fas fa-shield-halved"></i> Включить
                </button>
            </div>`;
        return;
    }

    box.innerHTML = `
        <div style="text-align:left;">
            <div class="premium-status-card" style="margin-top:0;">
                <div class="ps-emoji">🛡️</div>
                <div class="ps-main">
                    <div class="ps-title">Включена</div>
                    <div class="ps-sub">${d.hint ? 'Подсказка: ' + escapeHtml(d.hint) : ''}</div>
                    ${d.recovery_email ? `<div class="ps-sub">Восстановление: ${escapeHtml(d.recovery_email)}</div>` : ''}
                </div>
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:12px;line-height:1.5;">
                Забыли пароль? На странице входа есть «Забыли облачный пароль» —
                понадобится код входа и email, указанный выше.
            </div>
            <div style="display:flex;gap:10px;margin-top:16px;">
                <button class="tg-action-btn" style="flex:1;background:rgba(255,59,48,.2);color:#ff6b61;" onclick="disableTwoFA()">
                    <i class="fas fa-power-off"></i> Отключить
                </button>
            </div>
        </div>`;
}

async function saveTwoFA() {
    const a = document.getElementById('faPw')?.value || '';
    const b = document.getElementById('faPw2')?.value || '';
    if (a.length < 4) return showToast('Пароль минимум 4 символа');
    if (a !== b) return showToast('Пароли не совпадают');
    try {
        const r = await fetch('/api/2fa/setup', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                password: a,
                hint: document.getElementById('faHint')?.value || null,
                recovery_email: document.getElementById('faEmail')?.value || null,
            })
        });
        const d = await r.json();
        if (d.success) { showToast('Двухэтапная проверка включена'); loadTwoFA(); }
        else showToast(d.error || 'Ошибка');
    } catch (e) { showToast('Ошибка сети'); }
}

async function disableTwoFA() {
    const v = prompt('Введите облачный пароль для отключения:');
    if (!v) return;
    try {
        const r = await fetch('/api/2fa/disable', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: v })
        });
        const d = await r.json();
        if (d.success) { showToast('Двухэтапная проверка отключена'); loadTwoFA(); }
        else showToast(d.error || 'Неверный пароль');
    } catch (e) { showToast('Ошибка сети'); }
}

/* =====================================================================
   3. ИМПОРТ КОНТАКТОВ
   ===================================================================== */
function openContactImport() {
    const fileInput = document.getElementById('contactVCardInput');
    if (fileInput) {
        fileInput.onchange = e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) parseVCardFile(f);
        };
    }

    const hasContactsApi = !!(navigator.contacts && navigator.contacts.query);

    showModal('Импорт контактов', `
        <div style="display:flex;flex-direction:column;gap:10px;">
            <div class="import-step">
                <div class="is-num">1</div>
                <div class="is-main">
                    <b>Файл .vcf</b>
                    <span>Экспортируйте контакты из «Контакты» телефона в файл vCard</span>
                </div>
                <button class="sticker-tool" style="flex:0 0 auto;" onclick="document.getElementById('contactVCardInput').click()">
                    <i class="fas fa-file-arrow-up"></i> Выбрать
                </button>
            </div>

            ${hasContactsApi ? `
            <div class="import-step">
                <div class="is-num">2</div>
                <div class="is-main">
                    <b>Из книги телефона</b>
                    <span>Браузер даст доступ к контактам напрямую</span>
                </div>
                <button class="sticker-tool" style="flex:0 0 auto;" onclick="importFromContactsApi()">
                    <i class="fas fa-address-book"></i> Открыть
                </button>
            </div>` : `
            <div class="import-step" style="opacity:.6;">
                <div class="is-num">2</div>
                <div class="is-main">
                    <b>Из книги телефона</b>
                    <span>Доступно только в браузерах с поддержкой Contact Picker</span>
                </div>
            </div>`}

            <div class="import-step">
                <div class="is-num">${hasContactsApi ? 3 : 2}</div>
                <div class="is-main">
                    <b>Вставить вручную</b>
                    <span>Имя и номер в свободной форме</span>
                </div>
                <button class="sticker-tool" style="flex:0 0 auto;" onclick="openManualContactImport()">
                    <i class="fas fa-keyboard"></i> Ввести
                </button>
            </div>

            <div id="importResult"></div>
        </div>
    `);
}

function parseVCardFile(file) {
    const fr = new FileReader();
    fr.onload = () => {
        const contacts = parseVCard(String(fr.result || ''));
        if (!contacts.length) return showToast('В файле не нашлось номеров');
        showToast(`Найдено контактов: ${contacts.length}`);
        sendContactImport(contacts);
    };
    fr.onerror = () => showToast('Не удалось прочитать файл');
    fr.readAsText(file);
}

/* Разбор vCard (строки могут быть свёрнуты — \n с пробелом) */
function parseVCard(text) {
    const out = [];
    const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
    const cards = unfolded.split('BEGIN:VCARD').slice(1);

    cards.forEach(card => {
        let name = '';
        const tels = [];
        card.split('\n').forEach(line => {
            const idx = line.indexOf(':');
            if (idx < 0) return;
            const prop = line.slice(0, idx).split(';')[0].trim().toUpperCase();
            const val = line.slice(idx + 1).trim();
            if (prop === 'FN' && !name) name = val;
            if (prop === 'N' && !name) {
                name = val.split(';').filter(Boolean).reverse().join(' ');
            }
            if (prop === 'TEL') {
                const p = val.replace(/[^\d+]/g, '');
                if (p.replace(/\D/g, '').length >= 5) tels.push(p);
            }
        });
        if (tels.length) out.push({ name: name || 'Контакт', phones: [...new Set(tels)] });
    });
    return out;
}

async function importFromContactsApi() {
    try {
        const list = await navigator.contacts.query({});
        const contacts = [];
        list.forEach(c => {
            const name = (c.name || []).map(p => [p.given, p.family].filter(Boolean).join(' '))
                .join(', ') || 'Контакт';
            const phones = (c.phoneNumbers || [])
                .map(p => p.number || p)
                .map(n => String(n).replace(/[^\d+]/g, ''))
                .filter(n => n.replace(/\D/g, '').length >= 5);
            if (phones.length) contacts.push({ name, phones: [...new Set(phones)] });
        });
        if (!contacts.length) return showToast('Контакты не найдены');
        showToast(`Найдено контактов: ${contacts.length}`);
        sendContactImport(contacts);
    } catch (e) {
        showToast('Браузер не дал доступ к контактам');
    }
}

function openManualContactImport() {
    showModal('Ввод контактов', `
        <div style="display:flex;flex-direction:column;gap:10px;">
            <div style="font-size:12px;color:var(--text-secondary);">
                По одной строке: <b>Имя +7 999 123-45-67</b>
            </div>
            <textarea id="manualContacts" class="tg-input" rows="10"
                      placeholder="Иван +7 999 123-45-67&#10;Мария +7 916 555-11-22"></textarea>
            <button class="tg-action-btn" style="background:#007aff;color:#fff;" onclick="sendManualContactImport()">
                <i class="fas fa-address-book"></i> Найти и добавить
            </button>
        </div>
    `);
}

function sendManualContactImport() {
    const raw = document.getElementById('manualContacts')?.value || '';
    const contacts = [];
    raw.split('\n').forEach(line => {
        const t = line.trim();
        if (!t) return;
        const m = t.match(/^(.*?)[\s,;]+(\+?[\d\s()\-]{7,})$/);
        if (!m) return;
        const phones = m[2].replace(/[^\d+]/g, '');
        if (phones.replace(/\D/g, '').length < 5) return;
        contacts.push({ name: m[1].trim() || 'Контакт', phones: [phones] });
    });
    if (!contacts.length) return showToast('Не нашлось ни одного номера');
    closeModal('tempModal');
    sendContactImport(contacts);
}

async function sendContactImport(contacts) {
    const box = document.getElementById('importResult') || (() => {
        showModal('Импорт контактов', '<div class="cb-list" id="importResult"></div>');
        return document.getElementById('importResult');
    })();

    box.innerHTML = '<div class="emoji-empty">Ищем совпадения…</div>';
    try {
        const r = await fetch('/api/contacts/import', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contacts })
        });
        const d = await r.json();
        if (!d.success) {
            box.innerHTML = `<div class="emoji-empty" style="color:#ff6b61;">${escapeHtml(d.error || 'Ошибка')}</div>`;
            return;
        }
        box.innerHTML = `
            <div class="import-result">
                <div class="ir-num">${d.imported}</div>
                <div>
                    <b>Добавлено контактов</b>
                    <div style="font-size:12px;color:var(--text-secondary);">
                        Проверено ${d.scanned}, не найдено ${d.not_found}
                    </div>
                </div>
            </div>`;
        if (typeof loadContactsList === 'function') loadContactsList();
        showToast(`Добавлено: ${d.imported}`);
    } catch (e) {
        box.innerHTML = '<div class="emoji-empty" style="color:#ff6b61;">Ошибка сети</div>';
    }
}

/* =====================================================================
   ИНТЕГРАЦИЯ: блоки в «Конфиденциальности» и «Контактах»
   ===================================================================== */
function injectSecurityRows(attempt) {
    attempt = attempt || 0;
    const body = document.getElementById('tempModalBody');
    if (!body) { if (attempt < 40) setTimeout(() => injectSecurityRows(attempt + 1), 100); return; }

    // В «Контактах» — кнопка импорта
    if (body.querySelector('.tg-contacts-list') && !body.querySelector('#importContactsBtn')) {
        const list = body.querySelector('.tg-contacts-list');
        const btn = document.createElement('button');
        btn.id = 'importContactsBtn';
        btn.className = 'tg-action-btn';
        btn.style.cssText = 'margin:12px 16px;background:#007aff;color:#fff;width:calc(100% - 32px);';
        btn.innerHTML = '<i class="fas fa-address-book"></i> Импортировать контакты';
        btn.onclick = () => { modalReturnTo = 'openContacts'; openContactImport(); };
        list.appendChild(btn);
        return;
    }

    // В «Конфиденциальности» — код приложения и 2FA
    if (body.querySelector('#privacyMessages') && !body.querySelector('#secRows')) {
        const rows = document.createElement('div');
        rows.id = 'secRows';
        rows.innerHTML = `
            <div class="tg-section-title">Безопасность</div>

            <div class="tg-setting-row" onclick="openPasscodeSettings()"
                 style="display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;
                        border-bottom:1px solid rgba(128,128,128,.15);">
                <div style="width:34px;height:34px;border-radius:50%;background:rgba(48,209,88,.18);
                            display:flex;align-items:center;justify-content:center;color:#30d158;">
                    <i class="fas fa-lock"></i>
                </div>
                <div style="flex:1;">
                    <div style="font-size:15px;">Код приложения</div>
                    <div style="font-size:12px;color:#8e8e93;" id="passcodeStatus">Блокировка экрана кодом</div>
                </div>
                <i class="fas fa-chevron-right" style="color:#8e8e93;font-size:12px;"></i>
            </div>

            <div class="tg-setting-row" onclick="openTwoFASettings()"
                 style="display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;
                        border-bottom:1px solid rgba(128,128,128,.15);">
                <div style="width:34px;height:34px;border-radius:50%;background:rgba(255,159,10,.18);
                            display:flex;align-items:center;justify-content:center;color:#ff9f0a;">
                    <i class="fas fa-shield-halved"></i>
                </div>
                <div style="flex:1;">
                    <div style="font-size:15px;">Двухэтапная проверка</div>
                    <div style="font-size:12px;color:#8e8e93;" id="twofaStatus">Облачный пароль поверх кода входа</div>
                </div>
                <i class="fas fa-chevron-right" style="color:#8e8e93;font-size:12px;"></i>
            </div>`;

        const actions = body.querySelector('.tg-action-btn')?.parentElement;
        if (actions) actions.before(rows); else body.appendChild(rows);
        refreshSecurityStatus();
    }
}

async function refreshSecurityStatus() {
    try {
        const [l, f] = await Promise.all([
            fetch('/api/app_lock/status').then(r => r.json()).catch(() => ({})),
            fetch('/api/2fa/status').then(r => r.json()).catch(() => ({})),
        ]);
        const ps = document.getElementById('passcodeStatus');
        const ts = document.getElementById('twofaStatus');
        if (ps) ps.textContent = l.enabled
            ? (l.autolock ? `Включена · авто через ${l.autolock} мин` : 'Включена')
            : 'Выключена';
        if (ts) ts.textContent = f.enabled ? 'Включена' : 'Выключена';
    } catch (e) {}
}

document.addEventListener('DOMContentLoaded', () => {
    // Перехватываем открытие «Конфиденциальности» и «Контактов»
    ['openPrivacy', 'openContacts'].forEach(name => {
        const orig = window[name];
        if (typeof orig !== 'function' || orig.__sec) return;
        const v2 = function () {
            const r = orig.apply(this, arguments);
            injectSecurityRows();
            return r;
        };
        v2.__sec = true;
        window[name] = v2;
    });

    initAppLock();
});
