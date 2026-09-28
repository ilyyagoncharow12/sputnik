/* =====================================================================
   PREMIUM.JS — Спутник v0.58.0
   Вкладка «Sputnik Premium» в меню-бургере: статус, промокод,
   экспорт данных аккаунта в JSON, эмодзи-значок у ника.
   ===================================================================== */

let premiumState = null;

const PREMIUM_FEATURES = [
    { icon: 'fa-crown',  text: 'Значок Premium рядом с ником', key: 'badge' },
    { icon: 'fa-file-export', text: 'Экспорт всех данных аккаунта в JSON', key: 'export' },
    { icon: 'fa-star',   text: 'Свои эмодзи-значки в профиле', key: 'emoji' },
    { icon: 'fa-shield-halved', text: 'Дополнительная защита данных', key: 'shield' },
];

/* ======================= СТАТУС ======================= */
async function fetchPremium() {
    try {
        const r = await fetch('/api/premium');
        if (!r.ok) return null;
        premiumState = await r.json();
    } catch (e) { premiumState = null; }
    return premiumState;
}

function premiumActive() {
    if (!premiumState) return false;
    if (premiumState.active) return true;
    const until = premiumState.premium_until;
    if (!until) return false;
    return new Date(until) > new Date();
}

/* =================== ЗНАЧОК РЯДОМ С ИМЕНЕМ =================== */
/* Кэш: user_id -> эмодзи (для тех, у кого Premium активен). */
let premiumUsersMap = {};

function premiumEmojiFor(userId) {
    if (!userId) return null;
    const em = premiumUsersMap[userId];
    return em || null;
}

/* HTML самого значка (кликабельный). Имя кладе�� в data-атрибут,
   чтобы по клику показать карточку без дополнительного запроса. */
function premiumBadgeHTML(userId, name) {
    const em = premiumEmojiFor(userId);
    if (!em) return '';
    const label = premiumEsc(name || 'пользователь');
    return `<span class="premium-mark premium-mark-click" role="button" tabindex="0"`
         + ` data-prem-user="${userId}" data-prem-name="${label}"`
         + ` onclick="event.stopPropagation();showPremiumUserBadge(this)"`
         + ` title="Sputnik Premium">${em}</span>`;
}

/* Имя + значок одной строкой. name экранируется, значок — нет (эмодзи). */
function premiumNameHTML(name, userId) {
    return premiumEsc(name || '') + premiumBadgeHTML(userId, name);
}

/* Ставит «имя + значок» в элемент. Единственная точка входа для всех
   мест, где показывается имя пользователя: иначе textContent затирает
   ранее вставленный значок. */
function setNameWithPremium(el, name, userId) {
    if (!el) return;
    el.innerHTML = premiumNameHTML(name, userId);
}

function premiumEsc(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(String(s));
    return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/* Ставит звёздочку после текста узлов с data-user-id (идемпотентно). */
function applyPremiumMarks(root) {
    root = root || document.body;
    if (!root.querySelector?.('[data-user-id]')) return;
    root.querySelectorAll('[data-user-id]').forEach(el => {
        if (el.dataset.premiumDone === '1') return;
        const em = premiumEmojiFor(el.dataset.userId);
        if (!em) return;
        el.dataset.premiumDone = '1';
        el.insertAdjacentHTML('beforeend',
            `<span class="premium-mark" title="Sputnik Premium">${em}</span>`);
    });
}

let premiumUsersPromise = null;

function loadPremiumUsers() {
    if (premiumUsersPromise) return premiumUsersPromise;
    premiumUsersPromise = (async () => {
        try {
            const r = await fetch('/api/premium/users');
            if (!r.ok) return;
            const d = await r.json();
            const m = {};
            (d.users || []).forEach(u => { if (u && u.id) m[u.id] = (u.emoji || '⭐️').slice(0, 4); });
            premiumUsersMap = m;
            applyPremiumMarks(document);
            // Список чатов мог отрисоваться раньше — перерисовываем,
            // чтобы значки появились и там.
            try { window.refreshChatsPremiumMarks?.(); } catch (e) { /* не критично */ }
        } catch (e) { /* не критично */ }
    })();
    return premiumUsersPromise;
}

/* Вставка разметки в модалку с гарантией, что кэш значков уже готов.
   Без этого профиль успевал отрисоваться ДО /api/premium/users, и у
   premium-юзера значок просто не появлялся (и не появился бы, пока
   модалка не переоткрылась). */
function premiumMount(html) {
    const go = () => {
        const body = document.getElementById('tempModalBody');
        if (body) body.innerHTML = html;
        openModal('tempModal');
    };
    if (typeof loadPremiumUsers === 'function') {
        loadPremiumUsers().then(go, go);
    } else {
        go();
    }
}

function premiumMarkHTML(user) {
    if (!user) return '';
    const until = user.premium_until ? new Date(user.premium_until) : null;
    const on = !!(user.premium_active || user.is_premium ||
        (until && !isNaN(until) && until > new Date()));
    if (!on) return '';
    const em = (user.premium_emoji || '⭐️').slice(0, 4);
    return `<span class="premium-mark" title="Sputnik Premium">${em}</span>`;
}

/* Бейдж в бургер-меню + флаг для текущего пользователя */
async function loadPremiumBadge() {
    const p = await fetchPremium();
    paintPremiumBadge(p);
    if (p && currentUser) {
        currentUser.premium_active = premiumActive();
        currentUser.premium_emoji = p.premium_emoji || '⭐️';
        currentUser.premium_until = p.premium_until || null;
    }
    return p;
}

function paintPremiumBadge(p) {
    const badge = document.getElementById('premiumBadge');
    const icon = document.querySelector('.burger-item-icon-premium');
    const on = p && (p.active || (p.premium_until && new Date(p.premium_until) > new Date()));
    if (badge) badge.style.display = on ? 'inline-block' : 'none';
    icon?.classList.toggle('preium-off', false);
    icon?.classList.toggle('premium-off', !on);
}

/* ======================= КЛИК ПО ЗНАЧКУ ======================= */
/* ЗначокPremium другого человека: показываем, что это за значок.
   Обработчик на самом span (inline onclick) + stopPropagation, иначе
   клик всплыл бы на открытие чата/профиля. */
function showPremiumUserBadge(el) {
    if (!el) return;
    const name = el.dataset.premName || 'Этот пользователь';
    const em = el.textContent.trim() || '⭐️';
    const me = premiumActive();

    showModal('Значок Premium', `
        <div class="premium-badge-card">
            <div class="pbc-top">
                <div class="pbc-mark">${em}</div>
                <div class="pbc-names">
                    <div class="pbc-name">${premiumEsc(name)}</div>
                    <div class="pbc-sub">У этого пользователя активен Sputnik Premium</div>
                </div>
            </div>
            <div class="pbc-note">
                <i class="fas fa-circle-info"></i>
                <span>Это личный значок, который <b>${premiumEsc(name)}</b> выбрал себе
                в Sputnik Premium. Он показывает, что у человека оплачен Premium,
                и ничего больше: номера, переписок и данных он не раскрывает.</span>
            </div>
            <div class="premium-features" style="margin-top:14px;">
                ${PREMIUM_FEATURES.map(f => `
                    <div class="premium-feature locked">
                        <i class="fas fa-lock"></i>
                        <span>${f.text}</span>
                    </div>`).join('')}
            </div>
            <button class="cb-primary" style="width:100%;margin-top:16px;" onclick="closeModal('tempModal');openPremium()">
                <i class="fas fa-crown"></i> ${me ? 'Мой Premium' : 'Подключить Premium'}
            </button>
        </div>
    `);
}

document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target?.closest?.('.premium-mark-click');
    if (!el) return;
    e.preventDefault();
    showPremiumUserBadge(el);
});

/* ======================= ОКНО PREMIUM ======================= */
async function openPremium() {
    closeBurgerMenu?.();
    const p = await fetchPremium();
    paintPremiumBadge(p);

    const on = premiumActive();
    const until = p?.premium_until ? new Date(p.premium_until) : null;

    const hero = `
        <div class="premium-hero">
            <img class="premium-logo" src="/static/icons/premium.png" alt="Sputnik Premium"
                 onerror="this.style.display='none';">
            <h3>Sputnik Premium</h3>
            <p>${on && until ? `Активен до ${until.toLocaleDateString('ru-RU')}` : 'Особые возможности для вашего аккаунта'}</p>
        </div>`;

    const status = on ? `
        <div class="premium-status-card">
            <div class="ps-emoji">${p.premium_emoji || '⭐️'}</div>
            <div class="ps-main">
                <div class="ps-title">Premium активен</div>
                <div class="ps-sub">${until ? `До ${until.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}</div>
            </div>
            <button class="cb-iconbtn" onclick="premiumChangeEmoji()" title="Сменить значок"><i class="fas fa-pen"></i></button>
        </div>` : `
        <div class="premium-status-card" style="background:var(--bg-tertiary);border-color:var(--border-color);">
            <div class="ps-emoji">🔒</div>
            <div class="ps-main">
                <div class="ps-title">Premium не активен</div>
                <div class="ps-sub">Введите промокод ниже</div>
            </div>
        </div>`;

    const features = `
        <div class="premium-features">
            ${PREMIUM_FEATURES.map(f => `
                <div class="premium-feature ${on ? '' : 'locked'}">
                    <i class="fas ${on ? 'fa-check' : 'fa-lock'}"></i>
                    <span>${f.text}</span>
                </div>`).join('')}
        </div>`;

    const promo = `
        <div class="promo-input-row">
            <input type="text" id="promoCode" placeholder="ПРОМОКОД" maxlength="40" autocapitalize="characters">
            <button class="cb-primary" style="flex:0 0 auto;padding:0 18px;" onclick="premiumActivate()">
                Активировать
            </button>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:8px;text-align:center;">
            Промокоды выдаёт администратор в панели управления
        </div>`;

    const exportBlock = on ? `
        <div style="margin-top:16px;">
            <button class="sticker-tool primary" style="width:100%;" onclick="premiumExport()">
                <i class="fas fa-file-export"></i> Скачать все данные (JSON)
            </button>
            <div style="font-size:11px;color:var(--text-muted);margin-top:6px;text-align:center;">
                Сообщения, чаты, группы, каналы, контакты, избранное и стикеры
            </div>
        </div>` : '';

    showModal('Sputnik Premium', `
        ${hero}
        ${status}
        ${features}
        ${exportBlock}
        ${promo}
    `);
}

/* ======================= ДЕЙСТВИЯ ======================= */
async function premiumActivate() {
    const inp = document.getElementById('promoCode');
    const code = (inp?.value || '').trim();
    if (!code) { showToast('Введите промокод'); return; }

    try {
        const r = await fetch('/api/premium/activate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        const d = await r.json();
        if (!d.success) { showToast(d.error || 'Промокод не активирован'); return; }
        showToast('Premium активирован!');
        closeModal('tempModal');
        await loadPremiumBadge();
        openPremium();
    } catch (e) { showToast('Ошибка активации'); }
}

async function premiumChangeEmoji() {
    const p = await fetchPremium();
    if (!premiumActive()) { showToast('Только для Premium'); return; }
    const list = (window.EMOJI_FREQUENT || ['⭐️', '👑', '💎', '🚀', '🔥', '🪐', '⚡', '🎯', '🌟', '🛡️']);
    const grid = list.slice(0, 120).map(c => `<button class="emoji-cell" data-emoji="${c}">${c}</button>`).join('');
    showModal('Значок Premium', `
        <div class="emoji-picker-inline" id="premEmojiGrid" style="max-height:320px;">${grid}</div>
    `);
    setTimeout(() => {
        document.getElementById('premEmojiGrid')?.addEventListener('click', async e => {
            const b = e.target.closest('.emoji-cell');
            if (!b) return;
            const r = await fetch('/api/premium/emoji', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emoji: b.dataset.emoji })
            });
            const d = await r.json();
            if (d.success) {
                showToast('Значок обновлён');
                closeModal('tempModal');
                if (currentUser) { currentUser.premium_emoji = b.dataset.emoji; }
                loadPremiumBadge();
                openPremium();
            } else showToast(d.error || 'Ошибка');
        });
    }, 50);
}

async function premiumExport() {
    if (!premiumActive()) { showToast('Только для Premium'); return; }
    if (!confirm('Скачать файл со всеми данными аккаунта?')) return;
    try {
        const r = await fetch('/api/premium/export', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pretty: true })
        });
        if (r.status === 403) { showToast('Экспорт доступен только с Premium'); return; }
        if (r.status === 401) { showToast('Сессия истекла — войдите заново'); return; }
        if (r.status === 429) {
            let d = {};
            try { d = await r.json(); } catch (e) { /* пусто */ }
            const secs = d.retry_after || parseInt(r.headers.get('Retry-After')) || 0;
            showToast(secs
                ? `Слишком много запросов. Повторите через ${secs} сек.`
                : 'Слишком много запросов. Подождите минуту.');
            return;
        }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const blob = await r.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'sputnik_data.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        showToast('Файл скачан');
    } catch (e) { showToast('Ошибка экспорта'); }
}
