// ===== ПОИСК ЧАТОВ И ВСТУПЛЕНИЕ (v0.60.4) =====
// Публичные группы и каналы можно найти, посмотреть витрину и вступить
// (или подать заявку, если чат приватный).
// Роуты: GET /api/group/<id>/public, POST /api/group/<id>/join

function commToastSafe(txt) {
    if (typeof commToast === 'function') commToast(txt);
    else if (typeof showToast === 'function') showToast(txt);
}

function discPost(url, body) {
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
    }).then(r => r.json().catch(() => ({})));
}

// Список id тех, что уже открыты (для мгновенной реакции), но главный
// источник истины — флаги is_member/is_subscribed с сервера.
function discMyChats() {
    const gid = new Set((typeof groupsData !== 'undefined' && groupsData) ? groupsData.map(g => Number(g.id)) : []);
    const cid = new Set((typeof channelsData !== 'undefined' && channelsData) ? channelsData.map(c => Number(c.id)) : []);
    return { gid, cid };
}

// 1 участник / 2 участника / 5 участников
function discPlural(n, one, few, many) {
    n = Number(n) || 0;
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
}

function discCount(n, one, few, many) {
    return `${n} ${discPlural(n, one, few, many)}`;
}

function discAvatarHtml(avatar, name) {
    const nm = name || '?';
    if (avatar) {
        return `<div class="disc-ava"><img src="/${escapeHtml(avatar)}" onerror="this.parentElement.textContent='${escapeHtml(nm[0].toUpperCase())}'"></div>`;
    }
    const colors = ['#5e5ce6', '#0a84ff', '#30d158', '#ff9f0a', '#ff375f', '#64d2ff'];
    const c = colors[nm.charCodeAt(0) % colors.length];
    return `<div class="disc-ava" style="background:${c}">${escapeHtml(nm[0].toUpperCase())}</div>`;
}

function discJoinBtnHtml(kind, id, isMine, isPublic, pending, banned) {
    if (isMine) {
        return `<button class="disc-btn disc-btn-mine" onclick="discOpenChat(${id},'${kind}')">Открыть</button>`;
    }
    if (banned) {
        return `<button class="disc-btn disc-btn-pending" disabled>Забанен</button>`;
    }
    if (pending) {
        return `<button class="disc-btn disc-btn-pending" disabled>Заявка отправлена</button>`;
    }
    const label = kind === 'channel' ? 'Подписаться' : (isPublic ? 'Вступить' : 'Подать заявку');
    return `<button class="disc-btn disc-btn-join" onclick="discJoin(${id},'${kind}')">${label}</button>`;
}

function openDiscover() {
    closeBurgerMenu();
    showModal('Поиск чатов', `
        <div class="disc-wrap">
            <input type="text" id="discQuery" class="modal-input" placeholder="Группа, канал или @юзернейм"
                   oninput="discSearch(this.value)">
            <div id="discResults" class="disc-results"></div>
        </div>`);
    setTimeout(() => { const el = document.getElementById('discQuery'); if (el) el.focus(); }, 150);
}

let discTimer = null;
function discSearch(q) {
    clearTimeout(discTimer);
    const box = document.getElementById('discResults');
    if (!box) return;
    q = (q || '').trim();
    if (q.length < 2) {
        box.innerHTML = '<div class="disc-empty">Введите хотя бы 2 символа</div>';
        return;
    }
    discTimer = setTimeout(async () => {
        box.innerHTML = '<div class="disc-empty">Ищем…</div>';
        try {
            const r = await fetch('/api/search_all?q=' + encodeURIComponent(q));
            const d = await r.json();
            const mine = discMyChats();
            const rows = [];

            (d.groups || []).forEach(g => {
                const id = g.id;
                rows.push({
                    kind: 'group', id,
                    name: g.name || 'Группа',
                    sub: g.description || (g.username ? '@' + g.username : ''),
                    avatar: g.avatar,
                    meta: discCount(g.member_count || 0, 'участник', 'участника', 'участников'),
                    isMine: g.is_member !== undefined ? !!Number(g.is_member) : mine.gid.has(Number(id)),
                    isPublic: !!g.is_public,
                    pending: false
                });
            });

            (d.channels || []).forEach(c => {
                const id = c.id;
                rows.push({
                    kind: 'channel', id,
                    name: c.name || 'Канал',
                    sub: c.description || (c.username ? '@' + c.username : ''),
                    avatar: c.avatar,
                    meta: discCount(c.subscriber_count || 0, 'подписчик', 'подписчика', 'подписчиков'),
                    isMine: c.is_subscribed !== undefined ? !!Number(c.is_subscribed) : mine.cid.has(Number(id)),
                    isPublic: !!c.is_public,
                    pending: false
                });
            });

            (d.users || []).forEach(u => {
                rows.push({
                    kind: 'user', id: u.id,
                    name: u.display_name || u.username,
                    sub: '@' + (u.username || ''),
                    avatar: u.avatar,
                    meta: '',
                    isMine: false, isPublic: true, pending: false
                });
            });

            if (!rows.length) {
                box.innerHTML = '<div class="disc-empty">Ничего не найдено</div>';
                return;
            }

            // Для чатов без is_member уточняем статус заявки на вступление,
            // чтобы кнопка не предлагала «вступить» повторно.
            const gRows = rows.filter(r => r.kind === 'group' && !r.isMine);
            await Promise.all(gRows.map(async r => {
                try {
                    const resp = await fetch(`/api/group/${r.id}/public`);
                    const d = await resp.json();
                    if (d && !d.error && d.is_member) r.isMine = true;
                    if (d && d.request_status === 'pending') r.pending = true;
                    if (d && d.banned) { r.banned = true; r.isMine = false; }
                } catch (e) { /* не блокируем выдачу */ }
            }));

            box.innerHTML = rows.map(r => {
                if (r.kind === 'user') {
                    return `<div class="disc-row" onclick="openUserProfileModal(${r.id})">
                        ${discAvatarHtml(r.avatar, r.name)}
                        <div class="disc-row-main">
                            <div class="disc-row-name">${escapeHtml(r.name)}</div>
                            <div class="disc-row-sub">${escapeHtml(r.sub)}</div>
                        </div>
                        <i class="fas fa-chevron-right disc-chev"></i>
                    </div>`;
                }
                const view = r.kind === 'channel'
                    ? `discViewChannel(${r.id})`
                    : `discViewGroup(${r.id})`;
                return `<div class="disc-row">
                    <div onclick="${view}" style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;cursor:pointer;">
                        ${discAvatarHtml(r.avatar, r.name)}
                        <div class="disc-row-main">
                            <div class="disc-row-name">${escapeHtml(r.name)}</div>
                            <div class="disc-row-sub">${escapeHtml(r.sub || r.meta)}</div>
                        </div>
                    </div>
                    ${discJoinBtnHtml(r.kind, r.id, r.isMine, r.isPublic, r.pending, r.banned)}
                </div>`;
            }).join('');
        } catch (e) {
            box.innerHTML = '<div class="disc-empty">Ошибка поиска</div>';
        }
    }, 280);
}

async function discJoin(id, kind) {
    if (kind === 'channel') {
        // каналы: публичные — сразу подписка, приватные — по инвайт-ссылке
        const r = await discPost(`/api/subscribe/channel/id/${id}`, {});
        if (r && r.success) {
            commToastSafe('Вы подписались');
            if (typeof loadChannelsList === 'function') loadChannelsList();
            discSearch((document.getElementById('discQuery') || {}).value || '');
        } else {
            commToastSafe((r && r.error) || 'Не удалось подписаться');
        }
        return;
    }

    const r = await discPost(`/api/group/${id}/join`, {});
    if (r && r.success) {
        commToastSafe(r.status === 'pending' ? 'Заявка отправлена' : 'Вы в группе');
        if (typeof loadGroupsList === 'function') loadGroupsList();
        discSearch((document.getElementById('discQuery') || {}).value || '');
    } else {
        commToastSafe((r && r.error) || 'Не удалось вступить');
    }
}

function discOpenChat(id, kind) {
    closeModal('tempModal');
    if (typeof openChat === 'function') openChat(id, kind);
}

// ---------- Витрина группы для не-участника ----------

async function discViewGroup(groupId) {
    let d;
    try {
        const r = await fetch(`/api/group/${groupId}/public`);
        d = await r.json();
    } catch (e) {
        commToastSafe('Не удалось загрузить группу');
        return;
    }
    if (d.error) { commToastSafe(d.error); return; }
    window._discGroup = d;
    discRenderGroup();
}

function discRenderGroup() {
    const d = window._discGroup;
    if (!d || !d.group) return;
    const g = d.group;
    const isMember = !!d.is_member;
    const pending = d.request_status === 'pending';

    let membersHtml = '';
    if (d.can_view && d.members && d.members.length) {
        membersHtml = `<div class="disc-sec-title">Участники · ${d.member_count || d.members.length}</div>
            <div class="disc-members">` + d.members.slice(0, 12).map(m => `
                <div class="disc-member">
                    ${discAvatarHtml(m.avatar, m.display_name || m.username)}
                    <div class="disc-row-main">
                        <div class="disc-row-name">${escapeHtml(m.display_name || m.username)}</div>
                        <div class="disc-row-sub">${m.role === 'owner' ? 'Владелец' : (m.role === 'admin' ? 'Админ' : '@' + escapeHtml(m.username || ''))}</div>
                    </div>
                </div>`).join('') + `</div>`;
    }

    let action;
    if (isMember) {
        action = `<button class="disc-btn disc-btn-mine" style="width:100%;justify-content:center;padding:12px;"
                      onclick="discOpenChat(${g.id},'group')">Открыть чат</button>`;
    } else if (d.banned) {
        action = `<div class="disc-banned"><i class="fas fa-ban"></i> Вам запрещён вход в эту группу</div>`;
    } else if (!d.can_view) {
        action = `<div class="disc-private-note"><i class="fas fa-lock"></i> Это приватная группа. Подайте заявку, чтобы владельцы её рассмотрели.</div>`;
        if (pending) {
            action += `<button class="disc-btn disc-btn-pending" style="width:100%;justify-content:center;padding:12px;" disabled>Заявка отправлена</button>`;
        } else {
            action += `<button class="disc-btn disc-btn-join" style="width:100%;justify-content:center;padding:12px;"
                          onclick="discJoin(${g.id},'group')">Подать заявку</button>`;
        }
    } else if (pending) {
        action = `<button class="disc-btn disc-btn-pending" style="width:100%;justify-content:center;padding:12px;" disabled>Заявка отправлена</button>`;
    } else {
        action = `<button class="disc-btn disc-btn-join" style="width:100%;justify-content:center;padding:12px;"
                      onclick="discJoin(${g.id},'group')">Вступить</button>`;
    }

    showModal(g.name, `
        <div class="disc-wrap">
            <div class="disc-hero">
                ${discAvatarHtml(g.avatar, g.name)}
                <div class="disc-hero-name">${escapeHtml(g.name)}</div>
                <div class="disc-hero-meta">
                    ${discCount(d.member_count || 0, 'участник', 'участника', 'участников')}
                    ${g.username ? ` · @${escapeHtml(g.username)}` : ''}
                    ${g.is_public ? ' · публичная' : ' · приватная'}
                </div>
                ${g.description ? `<div class="disc-hero-desc">${escapeHtml(g.description)}</div>` : ''}
            </div>
            ${membersHtml}
            <div style="margin-top:14px;">${action}</div>
        </div>`);
}

async function discViewChannel(channelId) {
    // публичная витрина канала: подписка или вход по инвайту
    let d;
    try {
        const r = await fetch(`/api/channel/${channelId}/public`);
        d = await r.json();
    } catch (e) {
        commToastSafe('Не удалось загрузить канал');
        return;
    }
    if (d.error) { commToastSafe(d.error); return; }
    const c = d.channel;
    const isSub = !!d.is_subscribed;

    showModal(c.name, `
        <div class="disc-wrap">
            <div class="disc-hero">
                ${discAvatarHtml(c.avatar, c.name)}
                <div class="disc-hero-name">${escapeHtml(c.name)}</div>
                <div class="disc-hero-meta">
                    ${discCount(d.subscriber_count || 0, 'подписчик', 'подписчика', 'подписчиков')}
                    ${c.username ? ` · @${escapeHtml(c.username)}` : ''}
                    ${c.is_public ? ' · публичный' : ' · приватный'}
                </div>
                ${c.description ? `<div class="disc-hero-desc">${escapeHtml(c.description)}</div>` : ''}
            </div>
            <div style="margin-top:14px;">
                ${isSub
                    ? `<button class="disc-btn disc-btn-mine" style="width:100%;justify-content:center;padding:12px;"
                                 onclick="discOpenChat(${channelId},'channel')">Открыть канал</button>`
                    : (c.is_public
                        ? `<button class="disc-btn disc-btn-join" style="width:100%;justify-content:center;padding:12px;"
                                     onclick="discJoin(${channelId},'channel')">Подписаться</button>`
                        : `<div class="disc-private-note"><i class="fas fa-lock"></i> Это приватный канал. Подписаться можно только по приглашению.</div>`)}
            </div>
        </div>`);
}