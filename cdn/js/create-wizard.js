// ===== МАСТЕР СОЗДАНИЯ ЧАТА (v0.60.4) =====
// Один мастер для группы и канала: Название → Участники → Настройки → Готово.
// Кнопки «Создать группу» / «Создать канал» в меню ведут сюда (openCreateWizard).

const CW = {
    kind: 'group',      // 'group' | 'channel'
    step: 1,
    totalSteps: 4,
    name: '',
    description: '',
    username: '',
    isPublic: true,
    members: [],        // [{id, display_name, username, avatar}]
    created: null
};

function cwState() {
    if (typeof window.__cw !== 'undefined' && window.__cw) return window.__cw;
    window.__cw = CW;
    return window.__cw;
}

function cwReset(kind) {
    window.__cw = Object.assign({}, CW, { kind: kind || 'group' });
    return window.__cw;
}

function openCreateWizard(kind) {
    const s = cwReset(kind);
    s.step = 1;
    renderCreateWizard();
}

function cwTitle() {
    return s_kind() === 'channel' ? 'Новый канал' : 'Новая группа';
}
function s_kind() { return cwState().kind; }

function cwStepsBar() {
    const s = cwState();
    const labels = ['Название', s.kind === 'channel' ? 'Подписчики' : 'Участники', 'Настройки', 'Готово'];
    return `<div class="cw-steps">` + labels.map((l, i) => {
        const n = i + 1;
        const cls = n < s.step ? 'done' : (n === s.step ? 'active' : '');
        return `<div class="cw-step ${cls}"><span class="cw-dot">${n < s.step ? '✓' : n}</span><span class="cw-step-label">${l}</span></div>`;
    }).join('<div class="cw-step-line"></div>') + `</div>`;
}

function cwBack() {
    const s = cwState();
    if (s.step === 1) { closeModal('tempModal'); return; }
    s.step -= 1;
    renderCreateWizard();
}

function cwNext() {
    const s = cwState();
    if (s.step === 1) {
        const nameEl = document.getElementById('cwName');
        const name = (nameEl ? nameEl.value : s.name).trim();
        if (!name) { showToast('Введите название'); return; }
        s.name = name;
        s.description = (document.getElementById('cwDesc') || {}).value || '';
    }
    if (s.step === 3) {
        // сохраняем настройки перед показом итогового экрана
        const un = document.getElementById('cwUsername');
        s.username = (un ? un.value : s.username).trim().replace(/^@/, '');
        const pub = document.getElementById('cwPublic');
        if (pub) s.isPublic = pub.checked;
    }
    if (s.step < s.totalSteps) {
        s.step += 1;
        renderCreateWizard();
        if (s.step === 2) cwLoadContacts();
    }
}

function cwRenderStep1() {
    const s = cwState();
    const isCh = s.kind === 'channel';
    return `
        <div class="profile-field">
            <label>${isCh ? 'Название канала' : 'Название группы'}</label>
            <input type="text" id="cwName" class="modal-input" maxlength="64"
                   placeholder="${isCh ? 'Мой канал' : 'Моя группа'}" value="${escapeHtml(s.name)}">
        </div>
        <div class="profile-field">
            <label>Описание ${isCh ? '' : '(необязательно)'}</label>
            <textarea id="cwDesc" class="modal-input" rows="2" maxlength="300"
                      placeholder="О чём этот чат?">${escapeHtml(s.description)}</textarea>
        </div>`;
}

function cwRenderStep2() {
    const isCh = cwState().kind === 'channel';
    return `
        <div class="profile-field">
            <label>${isCh ? 'Добавить подписчиков' : 'Добавить участников'}</label>
            <input type="text" id="cwSearch" class="modal-input" placeholder="Поиск по имени или @юзернейму"
                   oninput="cwSearchUsers(this.value)">
        </div>
        <div id="cwSearchResults" class="cw-results"></div>
        <div class="cw-chosen-head">
            <span id="cwChosenCount">0</span>
            <span id="cwChosenLabel">${isCh ? 'подписчиков' : 'участников'}</span>
            <button class="cw-clear" onclick="cwClearMembers()">Сбросить</button>
        </div>
        <div id="cwChosen" class="cw-chosen"></div>`;
}

function cwRenderStep3() {
    const s = cwState();
    const isCh = s.kind === 'channel';
    return `
        <div class="profile-field">
            <label>Ссылка (необязательно) <span class="cw-hint">@...</span></label>
            <input type="text" id="cwUsername" class="modal-input" maxlength="32"
                   placeholder="@my${isCh ? 'channel' : 'group'}" value="${escapeHtml(s.username)}"
                   oninput="this.value=this.value.replace(/[^a-zA-Z0-9_@]/g,'')">
        </div>
        <div class="profile-field">
            <label class="cw-switch">
                <input type="checkbox" id="cwPublic" ${s.isPublic ? 'checked' : ''}
                       onchange="cwState().isPublic=this.checked">
                <span>${isCh ? 'Публичный канал' : 'Публичная группа'}<br>
                <span class="cw-hint">${isCh
                    ? 'Любой может найти и подписаться'
                    : 'Любой может найти и подать заявку на вступление'}</span></span>
            </label>
        </div>
        <div class="cw-note">
            <i class="fas fa-info-circle"></i>
            ${isCh
                ? 'В канале сообщения публикуют администраторы. Подписчики читают и реагируют.'
                : 'Участники пишут и отвечают друг другу. Права администраторов можно выдать позже.'}
        </div>`;
}

function cwRenderStep4() {
    const s = cwState();
    const isCh = s.kind === 'channel';
    return `
        <div class="cw-final">
            <div class="cw-final-avatar">${escapeHtml((s.name || '?')[0].toUpperCase())}</div>
            <div class="cw-final-name">${escapeHtml(s.name)}</div>
            <div class="cw-final-meta">
                ${isCh ? 'Канал' : 'Группа'} · ${s.isPublic ? (isCh ? 'публичный' : 'публичная') : 'приватный(ая)'}
                ${s.members.length ? ` · ${s.members.length} ${isCh ? 'подписчик(ов)' : 'участник(ов)'}` : ''}
                ${s.username ? ` · @${escapeHtml(s.username.replace('@', ''))}` : ''}
            </div>
            ${s.description ? `<div class="cw-final-desc">${escapeHtml(s.description)}</div>` : ''}
        </div>
        <div id="cwResult" class="cw-result"></div>`;
}

function renderCreateWizard() {
    const s = cwState();
    const body = s.step === 1 ? cwRenderStep1()
        : s.step === 2 ? cwRenderStep2()
        : s.step === 3 ? cwRenderStep3()
        : cwRenderStep4();

    let footer = '';
    if (s.step < s.totalSteps) {
        footer = `<div class="cw-footer">
            <button class="user-profile-btn user-profile-btn-secondary" onclick="cwBack()">${s.step === 1 ? 'Отмена' : 'Назад'}</button>
            <button class="user-profile-btn user-profile-btn-primary" onclick="cwNext()">${s.step === s.totalSteps - 1 ? 'Далее' : 'Продолжить'}</button>
        </div>`;
    } else {
        footer = `<div class="cw-footer">
            <button class="user-profile-btn user-profile-btn-secondary" onclick="cwBack()">Назад</button>
            <button class="user-profile-btn user-profile-btn-primary" id="cwCreateBtn" onclick="cwCreate()">
                <i class="fas fa-check"></i> Создать
            </button>
        </div>`;
    }

    showModal(cwTitle(), cwStepsBar() + `<div class="cw-body" id="cwBody">${body}</div>` + footer);
    if (s.step === 2) cwRenderChosen();
}

function cwRenderChosen() {
    const s = cwState();
    const box = document.getElementById('cwChosen');
    if (!box) return;
    document.getElementById('cwChosenCount').textContent = s.members.length;
    if (!s.members.length) {
        box.innerHTML = '<div class="cw-empty">Никого не выбрано — можно создать чат и добавить людей потом</div>';
        return;
    }
    box.innerHTML = s.members.map(m => `
        <div class="cw-chip" data-uid="${m.id}">
            ${m.avatar ? `<img src="/${escapeHtml(m.avatar)}">` : `<span>${escapeHtml((m.display_name || m.username || '?')[0].toUpperCase())}</span>`}
            <span class="cw-chip-name">${escapeHtml(m.display_name || m.username)}</span>
            <i class="fas fa-times" onclick="cwRemoveMember(${m.id})"></i>
        </div>`).join('');
}

function cwAddMember(u) {
    const s = cwState();
    if (s.members.some(m => m.id === u.id)) return;
    s.members.push({ id: u.id, display_name: u.display_name || u.username, username: u.username, avatar: u.avatar });
    cwRenderChosen();
}

function cwRemoveMember(id) {
    const s = cwState();
    s.members = s.members.filter(m => m.id !== id);
    cwRenderChosen();
}

function cwClearMembers() {
    cwState().members = [];
    cwRenderChosen();
}

async function cwLoadContacts() {
    const box = document.getElementById('cwChosen');
    if (!box) return;
    try {
        const r = await fetch('/api/get_contacts');
        if (!r.ok) return;
        const users = await r.json();
        // предлагаем контакты, которых ещё не выбрали
        cwState().suggested = (users || []).filter(u => !cwState().members.some(m => m.id === u.id));
    } catch (e) { /* тихо */ }
    cwRenderChosen();
}

let cwSearchTimer = null;
function cwSearchUsers(q) {
    clearTimeout(cwSearchTimer);
    const box = document.getElementById('cwSearchResults');
    if (!box) return;
    q = (q || '').trim();
    if (q.length < 2) { box.innerHTML = ''; return; }
    cwSearchTimer = setTimeout(async () => {
        try {
            const r = await fetch('/api/search_users?q=' + encodeURIComponent(q));
            const users = await r.json();
            if (!users || !users.length) {
                box.innerHTML = '<div class="cw-empty">Никого не найдено</div>';
                return;
            }
            box.innerHTML = users.map(u => {
                const added = cwState().members.some(m => m.id === u.id);
                return `<div class="cw-res-item" onclick="cwPickUser(${u.id})">
                    ${u.avatar ? `<img src="/${escapeHtml(u.avatar)}">` : `<span class="cw-res-ava">${escapeHtml((u.display_name || u.username || '?')[0].toUpperCase())}</span>`}
                    <div class="cw-res-main">
                        <div class="cw-res-name">${escapeHtml(u.display_name || u.username)}</div>
                        <div class="cw-res-sub">@${escapeHtml(u.username || '')}</div>
                    </div>
                    <i class="fas ${added ? 'fa-check' : 'fa-plus'}"></i>
                </div>`;
            }).join('');
            cwState().lastResults = users;
        } catch (e) { box.innerHTML = ''; }
    }, 250);
}

function cwPickUser(id) {
    const u = (cwState().lastResults || []).find(x => x.id === id);
    if (!u) return;
    const s = cwState();
    if (s.members.some(m => m.id === id)) {
        cwRemoveMember(id);
    } else {
        cwAddMember(u);
    }
    cwSearchUsers(document.getElementById('cwSearch').value);
}

async function cwCreate() {
    const s = cwState();
    const btn = document.getElementById('cwCreateBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = 'Создаём…'; }
    const isCh = s.kind === 'channel';
    const url = isCh ? '/api/create_channel' : '/api/create_group';
    try {
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: s.name,
                description: s.description,
                is_public: s.isPublic,
                username: (document.getElementById('cwUsername') || {}).value || s.username || null
            })
        });
        const d = await r.json();
        if (!d.success) {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Создать'; }
            showToast(d.error || 'Не удалось создать');
            return;
        }
        const newId = isCh ? d.channel_id : d.group_id;
        s.created = { kind: s.kind, id: newId };

        // Добавляем выбранных участников
        let addedCount = 0;
        for (const m of s.members) {
            try {
                const ar = await fetch(isCh ? `/api/add_channel_subscriber/${newId}` : `/api/add_group_member/${newId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: m.id })
                });
                if (ar.ok) {
                    const ad = await ar.json().catch(() => ({}));
                    if (ad.success) addedCount++;
                }
            } catch (e) { /* пропускаем */ }
        }

        const box = document.getElementById('cwResult');
        if (box) {
            box.innerHTML = `<div class="cw-done">
                <i class="fas fa-check-circle"></i>
                <div>${isCh ? 'Канал' : 'Группа'} создан${addedCount ? `, добавлено: ${addedCount}` : ''}</div>
            </div>`;
        }
        if (btn) btn.style.display = 'none';
        if (typeof loadChatsList === 'function') loadChatsList();
        if (typeof loadGroupsList === 'function') loadGroupsList();
        if (typeof loadChannelsList === 'function') loadChannelsList();

        setTimeout(() => {
            closeModal('tempModal');
            if (typeof openChat === 'function') openChat(newId, s.kind);
        }, 1100);
    } catch (e) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Создать'; }
        showToast('Ошибка создания чата');
    }
}
