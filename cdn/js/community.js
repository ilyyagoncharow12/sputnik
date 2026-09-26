// ============================================================
// Сообщества по-телеграмовски: информация о группах и каналах
// ============================================================

function commEsc(s) {
    if (s === null || s === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
}

function commGrad(name) {
    const palettes = [
        ['#f093fb', '#f5576c'],
        ['#4facfe', '#00f2fe'],
        ['#43e97b', '#38f9d7'],
        ['#fa709a', '#fee140'],
        ['#30cfd0', '#330867'],
        ['#a8edea', '#fed6e3'],
        ['#ff9a9e', '#fecfef'],
        ['#5ee7df', '#b490ca'],
        ['#f6d365', '#fda085'],
        ['#667eea', '#764ba2']
    ];
    let h = 0;
    const str = String(name || '?');
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    const p = palettes[h % palettes.length];
    return `linear-gradient(135deg, ${p[0]} 0%, ${p[1]} 100%)`;
}

function commLetter(name) {
    const s = String(name || '?').trim();
    return s ? s[0].toUpperCase() : '?';
}

function commUserName(u) {
    if (!u) return 'Пользователь';
    return u.display_name || u.username || ('id ' + u.id);
}

function commToast(msg) {
    if (typeof showToast === 'function') showToast(msg);
}

function commCopy(btn, text) {
    function done() {
        const old = btn.textContent;
        btn.textContent = '✓ Скопировано';
        setTimeout(() => { btn.textContent = old; }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            done();
        });
    } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        done();
    }
}

function commShare(url, name) {
    if (navigator.share) {
        navigator.share({ title: name || 'Спутник', url: url }).catch(function () {});
    } else {
        commCopy(null, url);
        commToast('Ссылка скопирована');
    }
}

// Аватар сообщества: картинка, если есть, иначе градиент с буквой
function commAvatarHtml(avatar, name, cls) {
    if (avatar) {
        return `<div class="comm-avatar ${cls || ''} avatar-img"><img src="/${commEsc(avatar)}"
            onerror="this.onerror=null;this.closest('.comm-avatar').outerHTML='<div class=&quot;comm-avatar ${cls || ''}&quot; style=&quot;background:${commGrad(name)};&quot;>${commLetter(name)}</div>'"></div>`;
    }
    return `<div class="comm-avatar ${cls || ''}" style="background:${commGrad(name)};">${commLetter(name)}</div>`;
}

function commRoleLabel(role) {
    return role === 'owner' ? 'Владелец' : role === 'admin' ? 'Администратор' : 'Участник';
}

// ---------------- ГРУППЫ ----------------

function openGroupInfo(groupId) {
    fetch('/api/get_group/' + groupId).then(r => r.json()).then(data => {
        if (data.error) { commToast(data.error); return; }
        window._commGroup = data;
        commGroupTab(groupId, 'info');
    }).catch(() => commToast('Не удалось загрузить группу'));
}

function commGroupTab(groupId, tab) {
    const d = window._commGroup;
    if (!d || !d.group) return;
    let body = '';
    const g = d.group;
    const role = d.user_role;

    const canManage = role === 'owner' ||
        (role === 'admin' && d.permissions && !!d.permissions.can_ban_users);
    const canApprove = role === 'owner' ||
        (role === 'admin' && d.permissions && !!d.permissions.can_add_members);

    let tabs = `<div class="comm-tabs">
        <button class="comm-tab ${tab==='info'?'active':''}" onclick="commGroupTab(${groupId},'info')">Информация</button>
        <button class="comm-tab ${tab==='members'?'active':''}" onclick="commGroupTab(${groupId},'members')">Участники</button>`;
    if (canApprove) {
        const reqCount = (d.join_requests || []).length;
        tabs += `<button class="comm-tab ${tab==='requests'?'active':''}" onclick="commGroupTab(${groupId},'requests')">Заявки${reqCount ? ` <span class="comm-badge owner">${reqCount}</span>` : ''}</button>`;
    }
    if (canManage) {
        tabs += `<button class="comm-tab ${tab==='banned'?'active':''}" onclick="commGroupTab(${groupId},'banned')">Заблокированные</button>`;
    }
    if (role === 'owner') {
        tabs += `<button class="comm-tab ${tab==='perms'?'active':''}" onclick="commGroupTab(${groupId},'perms')">Права</button>`;
    }
    tabs += `</div>`;

    if (tab === 'members') body = commGroupMembersHtml(groupId, d);
    else if (tab === 'requests') body = commGroupRequestsHtml(groupId, d);
    else if (tab === 'banned') body = commGroupBannedHtml(groupId, d);
    else if (tab === 'perms') body = commGroupPermsStub(groupId);
    else body = commGroupInfoHtml(groupId, d);

    showModal('Группа · ' + commEsc(g.name), tabs + body);
}

function commGroupInfoHtml(groupId, d) {
    const g = d.group;
    const role = d.user_role;
    const inviteUrl = location.origin + '/join/' + g.invite_link;
    const memberCount = (d.members || []).length;
    const canEditInfo = role === 'owner' ||
        (role === 'admin' && d.permissions && !!d.permissions.can_change_info);
    const slowOptions = [[0, 'Выкл'], [10, '10 сек'], [30, '30 сек'], [60, '1 мин'], [300, '5 мин'], [900, '15 мин'], [3600, '1 час'], [86400, '24 часа']];

    let html = `
        <div style="text-align:center; padding-top:2px;">
            <div style="display:flex; align-items:center; justify-content:center; gap:14px; flex-wrap:wrap;">
                ${commAvatarHtml(g.avatar, g.name)}
                <div style="text-align:left;">
                    <div style="font-size:17px; font-weight:700; color:#fff;">${commEsc(g.name)}</div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">
                        <span class="comm-badge ${role}">${commRoleLabel(role)}</span>
                    </div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
                        ${memberCount} участников • ${g.is_public ? 'Публичная' : 'Приватная'}
                        ${d.slow_mode_seconds ? ` • <span class="comm-badge admin">медленный режим</span>` : ''}
                    </div>
                </div>
            </div>
        </div>`;

    if (g.description) {
        html += `<div style="font-size:13px; color:#d1d5db; text-align:center; margin-top:10px; max-height:72px; overflow-y:auto;">${commEsc(g.description)}</div>`;
    }

    if (g.username) {
        html += `<div style="font-size:13px; color:var(--text-muted); text-align:center; margin-top:6px;">Юзернейм: @${commEsc(g.username)}</div>`;
    }

    // Мьют уведомлений группы (как в Telegram)
    html += `
        <label class="comm-label">Уведомления</label>
        <div class="comm-row">
            <div class="comm-row-name">
                <div class="comm-row-title">${d.muted_notifications ? 'Уведомления выключены' : 'Уведомления включены'}</div>
                <div class="comm-row-sub">${d.muted_notifications ? 'Без звука и всплывающих уведомлений' : 'Звук при новых сообщениях'}</div>
            </div>
            <button class="comm-btn ${d.muted_notifications ? 'primary' : ''}"
                onclick="commToggleGroupMute(${groupId}, ${d.muted_notifications ? 0 : -1})">
                <i class="fas ${d.muted_notifications ? 'fa-bell' : 'fa-bell-slash'}"></i> ${d.muted_notifications ? 'Включить' : 'Выключить'}
            </button>
        </div>`;

    if (canEditInfo) {
        html += `
            <label class="comm-label">Юзернейм @...</label>
            <input id="cgUsername" class="comm-field" placeholder="mygroup" value="${commEsc(g.username || '')}" maxlength="32" oninput="this.value=this.value.replace(/[^a-z0-9_]/g,'')">
            <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">3–32 символа: латиница, цифры, _. По этому юзернейму вас найдут в поиске. Оставьте пустым, чтобы убрать.</div>
            <label class="comm-label">Название</label>
            <input id="cgName" class="comm-field" value="${commEsc(g.name)}">
            <label class="comm-label">Описание</label>
            <textarea id="cgDesc" class="comm-field" rows="3">${commEsc(g.description || '')}</textarea>
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:12px;">
                <span style="font-size:14px; color:#e5e7eb;">Публичная группа (видна в поиске)</span>
                <label class="comm-switch">
                    <input type="checkbox" id="cgPublic" ${g.is_public ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:12px;">
                <span style="font-size:14px; color:#e5e7eb;">Медленный режим</span>
                <select id="cgSlow" class="comm-field" style="width:130px; margin:0; padding:10px;">
                    ${slowOptions.map(o => `<option value="${o[0]}" ${(d.slow_mode_seconds || 0) === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}
                </select>
            </div>
            <div class="comm-actionbar" style="margin-top:10px;">
                <button class="comm-btn primary" onclick="commSaveGroupInfo(${groupId})"><i class="fas fa-save"></i> Сохранить</button>
            </div>
            <label class="comm-label">Фото группы</label>
            <label class="comm-btn" style="cursor:pointer; display:inline-block;">
                <i class="fas fa-camera"></i> Загрузить фото
                <input type="file" accept="image/*" style="display:none;" onchange="commUploadGroupAvatar(${groupId}, this)">
            </label>`;
    }

    html += `
        <label class="comm-label">Ссылка-приглашение</label>
        <div class="comm-invite-box">
            <input class="comm-field" readonly value="${commEsc(inviteUrl)}" onfocus="this.select()">
            <button class="comm-btn" onclick="commCopy(this, '${inviteUrl}')"><i class="fas fa-copy"></i></button>
            <button class="comm-btn" onclick="commShare('${inviteUrl}', '${commEsc(g.name)}')"><i class="fas fa-share-alt"></i></button>
        </div>`;

    html += '<div class="comm-actionbar">';
    if (role === 'owner') {
        html += `<button class="comm-btn danger" onclick="commDeleteGroup(${groupId})"><i class="fas fa-trash"></i> Удалить группу</button>`;
    } else if (role) {
        html += `<button class="comm-btn danger" onclick="commLeaveGroup(${groupId})"><i class="fas fa-sign-out-alt"></i> Покинуть группу</button>`;
    }
    html += `</div>`;
    return html;
}

function commGroupMembersHtml(groupId, d) {
    const role = d.user_role;
    const canManage = role === 'owner' ||
        (role === 'admin' && d.permissions && !!d.permissions.can_ban_users);
    const canAdd = role === 'owner' ||
        (role === 'admin' && d.permissions && !!d.permissions.can_add_members);

    let html = '';
    if (canManage) {
        html += `
            <input id="commUserSearch" class="comm-field" placeholder="Найти участника..." oninput="commFilterMembers(${groupId}, this.value)">
            <div style="height:6px;"></div>`;
    } else if (canAdd) {
        html += `
            <input id="commUserSearch" class="comm-field" placeholder="Найти пользователя..." oninput="commSearchUsers('member', ${groupId})">
            <div id="commUserResults"></div>
            <div style="height:6px;"></div>`;
    }

    if (canAdd) {
        html += `<div class="comm-actionbar"><button class="comm-btn" onclick="commAddMemberUi(${groupId})"><i class="fas fa-user-plus"></i> Добавить участника</button></div>`;
    }

    html += '<div id="commMembersList" style="max-height:340px; overflow-y:auto;">';
    html += commMembersListItems(groupId, d, '');
    html += '</div>';
    return html;
}

function commMembersListItems(groupId, d, query) {
    const role = d.user_role;
    const canManage = role === 'owner' ||
        (role === 'admin' && d.permissions && !!d.permissions.can_ban_users);
    const me = typeof MyId !== 'undefined' ? MyId : (window.MyId || null);
    const q = (query || '').trim().toLowerCase();

    let html = '';
    d.members.forEach(m => {
        const nameU = commUserName(m);
        if (q && !nameU.toLowerCase().includes(q) && !String(m.username || '').toLowerCase().includes(q)) return;
        const isMuted = (d.mutes || []).some(mm => mm.user_id === m.id);
        const safeName = commEsc(nameU).replace(/'/g, "\\'");
        html += `<div class="comm-row">
            ${commAvatarHtml(m.avatar, nameU, 'small')}
            <div class="comm-row-name">
                <div class="comm-row-title">${commEsc(nameU)}${m.id === me ? ' <span style="color:var(--text-muted);font-weight:400;">(вы)</span>' : ''}</div>
                <div class="comm-row-sub">@${commEsc(m.username || '—')} <span class="comm-badge ${m.role}">${commRoleLabel(m.role)}</span>${isMuted ? ' <span class="comm-badge admin">мьют</span>' : ''}</div>
            </div>
            <div class="comm-row-actions">`;
        if (m.role !== 'owner' && m.id !== me) {
            if (role === 'owner') {
                if (m.role === 'admin') {
                    html += `<button class="comm-btn" onclick="commSetRole(${groupId}, ${m.id}, 'member')" title="Снять права админа">Снять права</button>`;
                } else {
                    html += `<button class="comm-btn" onclick="commSetRole(${groupId}, ${m.id}, 'admin')" title="Назначить админом">В админы</button>`;
                }
            }
            if (canManage) {
                html += `<button class="comm-btn" onclick="commMuteMenu(${groupId}, ${m.id}, '${safeName}')" title="Ограничить написание"><i class="fas fa-bell-slash"></i> Мьют</button>`;
                if (isMuted) {
                    html += `<button class="comm-btn" onclick="commUnmuteUser(${groupId}, ${m.id})" title="Снять мьют">Размьютить</button>`;
                }
                html += `<button class="comm-btn danger" onclick="commBanMember(${groupId}, ${m.id}, '${safeName}')" title="Заблокировать"><i class="fas fa-ban"></i> Бан</button>`;
                if (m.role !== 'admin') {
                    html += `<button class="comm-btn danger" onclick="commKickMember(${groupId}, ${m.id})" title="Исключить"><i class="fas fa-user-minus"></i> Исключить</button>`;
                }
            }
        }
        html += `</div></div>`;
    });
    return html || '<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:16px 0;">Никто не найден</div>';
}

function commFilterMembers(groupId, query) {
    const el = document.getElementById('commMembersList');
    if (!el || !window._commGroup) return;
    el.innerHTML = commMembersListItems(groupId, window._commGroup, query);
}

function commAddMemberUi(groupId) {
    const d = window._commGroup || {};
    const g = d.group || {};
    const html = `
        <input id="commUserSearch" class="comm-field" placeholder="Найти пользователя..." oninput="commSearchUsers('member', ${groupId})">
        <div id="commUserResults"></div>
        <div style="height:8px;"></div>
        <div class="comm-actionbar">
            <button class="comm-btn" onclick="commCopy(this, '${location.origin + '/join/' + g.invite_link}')"><i class="fas fa-link"></i> Скопировать ссылку-приглашение</button>
        </div>`;
    showModal('Добавить участника', html);
}

function commGroupPermsStub(groupId) {
    commLoadGroupPerms(groupId);
    return `<div style="text-align:center; color:var(--text-muted); padding:24px 0;"><i class="fas fa-cog fa-spin"></i></div>`;
}

function commLoadGroupPerms(groupId) {
    fetch('/api/get_group_all_permissions/' + groupId).then(r => r.json()).then(data => {
        if (data.permissions) commGroupPermsShow(groupId, data.permissions);
        else commToast('Права недоступны');
    }).catch(() => commToast('Ошибка загрузки прав'));
}

function commGroupPermsShow(groupId, rows) {
    const tabs = `<div class="comm-tabs">
        <button class="comm-tab" onclick="commGroupTab(${groupId},'info')">Информация</button>
        <button class="comm-tab" onclick="commGroupTab(${groupId},'members')">Участники</button>
        <button class="comm-tab active">Права</button>
    </div>`;
    showModal('Группа · Права', tabs + commRenderPerms(groupId, rows));
}

function commRenderPerms(groupId, rows) {
    const names = [
        ['can_send_messages', 'Отправка сообщений'],
        ['can_send_media', 'Отправка медиа'],
        ['can_add_members', 'Добавление участников'],
        ['can_pin_messages', 'Закрепление сообщений'],
        ['can_change_info', 'Изменение информации'],
        ['can_delete_messages', 'Удаление чужих сообщений'],
        ['can_ban_users', 'Исключение участников']
    ];
    const roleLabels = { admin: 'Админы', member: 'Участники' };
    let html = `<table class="comm-perm-matrix"><colgroup><col style="width:40%">`;
    names.forEach(() => html += '<col>');
    html += '</colgroup><tr><th></th>';
    names.forEach(k => html += `<th>${k[1]}</th>`);
    html += '</tr>';

    rows.forEach(r => {
        if (r.role === 'owner') return;
        html += `<tr><td><b>${roleLabels[r.role] || r.role}</b></td>`;
        names.forEach(k => {
            const on = !!r[k[0]];
            html += `<td><label class="comm-switch">
                <input type="checkbox" ${on ? 'checked' : ''}
                    onchange="commTogglePerm(${groupId}, '${r.role}', '${k[0]}', this.checked)">
                <span class="slider"></span></label></td>`;
        });
        html += '</tr>';
    });
    html += '</table>';
    return html;
}

// ---------------- ДЕЙСТВИЯ С ГРУППОЙ ----------------

function commSaveGroupInfo(groupId) {
    const name = (document.getElementById('cgName') || {}).value;
    const desc = (document.getElementById('cgDesc') || {}).value;
    const isPublic = (document.getElementById('cgPublic') || {}).checked;
    const slow = parseInt((document.getElementById('cgSlow') || {}).value, 10) || 0;
    const username = (document.getElementById('cgUsername') || {}).value;
    if (!name || !name.trim()) { commToast('Название не может быть пустым'); return; }
    fetch('/api/update_group/' + groupId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: desc || '', is_public: !!isPublic, slow_mode_seconds: slow, username: (username || '').trim() || null })
    }).then(r => r.json()).then(d => {
        if (d.success) { commToast('Сохранено'); openGroupInfo(groupId); }
        else commToast(d.error || 'Ошибка');
    }).catch(() => commToast('Ошибка сети'));
}

function commToggleGroupMute(groupId, seconds) {
    const url = seconds === 0 ? '/api/chat/unmute' : '/api/chat/mute';
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_type: 'group', chat_id: groupId, seconds: seconds })
    }).then(r => r.json()).then(d => {
        if (d.success) { commToast(seconds === 0 ? 'Уведомления включены' : 'Уведомления выключены'); openGroupInfo(groupId); }
        else commToast(d.error || 'Ошибка');
    });
}

function commUploadGroupAvatar(groupId, input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('photo', file);
    fetch('/api/upload_chat_avatar/group/' + groupId, { method: 'POST', body: fd })
        .then(r => r.json()).then(d => {
            input.value = '';
            if (d.success) { commToast('Фото обновлено'); openGroupInfo(groupId); }
            else commToast(d.error || 'Ошибка');
        }).catch(() => commToast('Ошибка загрузки'));
}

function commTogglePerm(groupId, role, perm, checked) {
    fetch('/api/update_group_permissions/' + groupId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: role, permissions: { [perm]: checked ? 1 : 0 } })
    }).then(r => r.json()).then(d => {
        if (!d.success && d.error) commToast(d.error);
    });
}

function commSearchUsers(kind, groupId) {
    const q = (document.getElementById('commUserSearch') || {}).value || '';
    const box = document.getElementById('commUserResults');
    if (!box) return;
    if (q.trim().length < 2) { box.innerHTML = ''; return; }
    fetch('/api/search_users?q=' + encodeURIComponent(q)).then(r => r.json()).then(users => {
        box.innerHTML = users.map(u => `
            <div class="comm-search-result" onclick="${kind === 'member' ? `commAddMember(${groupId}, ${u.id})` : `commAddAdmin(${groupId}, ${u.id})`}">
                ${commAvatarHtml(u.avatar, commUserName(u), 'small')}
                <div class="comm-row-name">
                    <div class="comm-row-title">${commEsc(commUserName(u))}</div>
                    <div class="comm-row-sub">@${commEsc(u.username || '—')}</div>
                </div>
            </div>`).join('') || '<div style="color:var(--text-muted); padding:8px; font-size:13px;">Никого не нашли</div>';
    }).catch(() => {});
}

function commAddMember(groupId, userId) {
    fetch('/api/add_group_member/' + groupId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
    }).then(r => r.json()).then(d => {
        if (d.success) { commToast('Участник добавлен'); openGroupInfo(groupId); }
        else commToast(d.error || 'Ошибка');
    });
}

function commSetRole(groupId, userId, role) {
    fetch('/api/update_group_member_role/' + groupId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, role: role })
    }).then(r => r.json()).then(d => {
        if (d.success) { commToast('Готово'); openGroupInfo(groupId); }
        else commToast(d.error || 'Ошибка');
    });
}

function commKickMember(groupId, userId) {
    if (!confirm('Исключить участника из группы?')) return;
    fetch('/api/remove_group_member/' + groupId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
    }).then(r => r.json()).then(d => {
        if (d.success) { commToast('Исключён'); openGroupInfo(groupId); }
        else commToast(d.error || 'Ошибка');
    });
}

// ---------------- ЗАЯВКИ НА ВСТУПЛЕНИЕ ----------------

function commGroupRequestsHtml(groupId, d) {
    const reqs = d.join_requests || [];
    if (reqs.length === 0) return '<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:20px 0;">Заявок нет</div>';
    let html = '<div style="max-height:360px; overflow-y:auto;">';
    reqs.forEach(r => {
        html += `<div class="comm-row">
            ${commAvatarHtml(r.avatar, r.display_name || r.username, 'small')}
            <div class="comm-row-name">
                <div class="comm-row-title">${commEsc(r.display_name || r.username)}</div>
                <div class="comm-row-sub">@${commEsc(r.username || '—')}</div>
            </div>
            <div class="comm-row-actions">
                <button class="comm-btn primary" onclick="commApproveRequest(${groupId}, ${r.id})"><i class="fas fa-check"></i> Принять</button>
                <button class="comm-btn danger" onclick="commRejectRequest(${groupId}, ${r.id})"><i class="fas fa-times"></i></button>
            </div>
        </div>`;
    });
    html += '</div>';
    return html;
}

function commApproveRequest(groupId, requestId) {
    fetch('/api/group/approve_join/' + groupId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId })
    }).then(r => r.json()).then(d => {
        if (d.success) { commToast('Заявка одобрена'); openGroupInfo(groupId); }
        else commToast(d.error || 'Ошибка');
    });
}

function commRejectRequest(groupId, requestId) {
    fetch('/api/group/reject_join/' + groupId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId })
    }).then(r => r.json()).then(d => {
        if (d.success) { commToast('Заявка отклонена'); openGroupInfo(groupId); }
        else commToast(d.error || 'Ошибка');
    });
}

// ---------------- БЛОКИРОВКИ ----------------

function commGroupBannedHtml(groupId, d) {
    const banned = d.banned || [];
    if (banned.length === 0) return '<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:20px 0;">Заблокированных нет</div>';
    let html = '<div style="max-height:360px; overflow-y:auto;">';
    banned.forEach(b => {
        html += `<div class="comm-row">
            ${commAvatarHtml(b.avatar, b.display_name || b.username, 'small')}
            <div class="comm-row-name">
                <div class="comm-row-title">${commEsc(b.display_name || b.username)}</div>
                <div class="comm-row-sub">@${commEsc(b.username || '—')}${b.reason ? ' <span style="color:var(--text-muted);">— ' + commEsc(b.reason) + '</span>' : ''}</div>
            </div>
            <div class="comm-row-actions">
                <button class="comm-btn" onclick="commUnbanMember(${groupId}, ${b.user_id})"><i class="fas fa-user-check"></i> Разбанить</button>
            </div>
        </div>`;
    });
    html += '</div>';
    return html;
}

function commBanMember(groupId, userId, name) {
    const reason = prompt('Заблокировать «' + name + '» в группе?\n(причина необязательна):', '');
    if (reason === null) return;
    fetch('/api/group/ban/' + groupId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, reason: reason || null })
    }).then(r => r.json()).then(d => {
        if (d.success) { commToast('Пользователь заблокирован'); openGroupInfo(groupId); }
        else commToast(d.error || 'Ошибка');
    });
}

function commUnbanMember(groupId, userId) {
    fetch('/api/group/unban/' + groupId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
    }).then(r => r.json()).then(d => {
        if (d.success) { commToast('Разбанен'); openGroupInfo(groupId); }
        else commToast(d.error || 'Ошибка');
    });
}

// ---------------- МЬЮТ УЧАСТНИКА ----------------

function commMuteMenu(groupId, userId, name) {
    const presets = [[60, '1 минута'], [300, '5 минут'], [3600, '1 час'], [86400, '24 часа'], [null, 'Навсегда']];
    let html = `<div style="text-align:center; padding:4px 0 14px; color:#e5e7eb;"><b>Мьют · ${commEsc(name)}</b><div style="font-size:12px; color:var(--text-muted); margin-top:3px;">Запрет писать в группу</div></div>`;
    html += presets.map(p => `
        <button class="comm-btn" style="width:100%; margin-bottom:8px;"
            onclick="commDoMute(${groupId}, ${userId}, ${p[0] === null ? 'null' : p[0]})">${p[1]}</button>`).join('');
    showModal('Ограничить на время', html);
}

function commDoMute(groupId, userId, seconds) {
    fetch('/api/group/mute/' + groupId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, seconds: seconds })
    }).then(r => r.json()).then(d => {
        if (d.success) { commToast('Пользователь в муте'); openGroupInfo(groupId); }
        else commToast(d.error || 'Ошибка');
    });
}

function commUnmuteUser(groupId, userId) {
    fetch('/api/group/unmute/' + groupId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
    }).then(r => r.json()).then(d => {
        if (d.success) { commToast('Мьют снят'); openGroupInfo(groupId); }
        else commToast(d.error || 'Ошибка');
    });
}

function commLeaveGroup(groupId) {
    if (!confirm('Покинуть группу?')) return;
    fetch('/api/leave_group/' + groupId, { method: 'POST' })
        .then(r => r.json()).then(d => {
            if (d.success) location.reload();
            else commToast(d.error || 'Ошибка');
        });
}

function commDeleteGroup(groupId) {
    if (!confirm('Удалить группу навсегда?')) return;
    fetch('/api/delete_group/' + groupId, { method: 'POST' })
        .then(r => r.json()).then(d => {
            if (d.success) location.reload();
            else commToast(d.error || 'Ошибка');
        });
}

// ---------------- КАНАЛЫ ----------------

function openChannelInfo(channelId) {
    fetch('/api/get_channel/' + channelId).then(r => r.json()).then(data => {
        if (data.error) { commToast(data.error); return; }
        window._commChannel = data;
        commChannelTab(channelId, 'info');
    }).catch(() => commToast('Не удалось загрузить канал'));
}

function commChannelTab(channelId, tab) {
    const d = window._commChannel;
    if (!d || !d.channel) return;
    const c = d.channel;
    const isOwner = d.is_owner;
    let tabs = `<div class="comm-tabs">
        <button class="comm-tab ${tab==='info'?'active':''}" onclick="commChannelTab(${channelId},'info')">Информация</button>
        <button class="comm-tab ${tab==='subs'?'active':''}" onclick="commChannelTab(${channelId},'subs')">Подписчики</button>
        ${isOwner ? `<button class="comm-tab ${tab==='admins'?'active':''}" onclick="commChannelTab(${channelId},'admins')">Админы</button>` : ''}
    </div>`;

    let body;
    if (tab === 'admins') body = commChannelAdminsStub(channelId, d);
    else if (tab === 'subs') body = commChannelSubsHtml(channelId, d);
    else body = commChannelInfoHtml(channelId, d);

    showModal('Канал · ' + commEsc(c.name), tabs + body);
}

function commChannelInfoHtml(channelId, d) {
    const c = d.channel;
    const isOwner = d.is_owner;
    const inviteUrl = location.origin + '/c/' + c.invite_link;
    const subsCount = (d.subscribers || []).length;
    let html = `
        <div style="text-align:center; padding-top:2px;">
            <div style="display:flex; align-items:center; justify-content:center; gap:14px; flex-wrap:wrap;">
                ${commAvatarHtml(c.avatar, c.name)}
                <div style="text-align:left;">
                    <div style="font-size:17px; font-weight:700; color:#fff;">${commEsc(c.name)}</div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">
                        ${isOwner ? '<span class="comm-badge owner">Владелец</span><span style="padding:0 6px;">·</span>' : ''}
                        <span>${subsCount} подписчиков</span>
                    </div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
                        ${c.is_public ? 'Публичный' : 'Приватный'}<span style="padding:0 6px;">•</span>${subsCount} подписчиков
                    </div>
                </div>
            </div>
        </div>`;

    if (c.description) {
        html += `<div style="font-size:13px; color:#d1d5db; text-align:center; margin-top:10px; max-height:72px; overflow-y:auto;">${commEsc(c.description)}</div>`;
    }

    if (c.username) {
        html += `<div style="font-size:13px; color:var(--text-muted); text-align:center; margin-top:6px;">Юзернейм: @${commEsc(c.username)}</div>`;
    }

    // Мьют уведомлений канала
    html += `
        <label class="comm-label">Уведомления</label>
        <div class="comm-row">
            <div class="comm-row-name">
                <div class="comm-row-title">${d.muted_notifications ? 'Уведомления выключены' : 'Уведомления включены'}</div>
                <div class="comm-row-sub">${d.muted_notifications ? 'Без уведомлений о новых постах' : 'Звук при новых постах'}</div>
            </div>
            <button class="comm-btn ${d.muted_notifications ? 'primary' : ''}"
                onclick="commToggleChannelMute(${channelId}, ${d.muted_notifications ? 0 : -1})">
                <i class="fas ${d.muted_notifications ? 'fa-bell' : 'fa-bell-slash'}"></i> ${d.muted_notifications ? 'Включить' : 'Выключить'}
            </button>
        </div>`;

    if (isOwner) {
        html += `
            <label class="comm-label">Юзернейм @...</label>
            <input id="ccUsername" class="comm-field" placeholder="mychannel" value="${commEsc(c.username || '')}" maxlength="32" oninput="this.value=this.value.replace(/[^a-z0-9_]/g,'')">
            <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">3–32 символа: латиница, цифры, _. По этому юзернейму вас найдут в поиске. Оставьте пустым, чтобы убрать.</div>
            <label class="comm-label">Название</label>
            <input id="ccName" class="comm-field" value="${commEsc(c.name)}">
            <label class="comm-label">Описание</label>
            <textarea id="ccDesc" class="comm-field" rows="3">${commEsc(c.description || '')}</textarea>
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:12px;">
                <span style="font-size:14px; color:#e5e7eb;">Публичный канал (виден в поиске)</span>
                <label class="comm-switch">
                    <input type="checkbox" id="ccPublic" ${c.is_public ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:12px;">
                <span style="font-size:14px; color:#e5e7eb;">Показывать, кто автор поста</span>
                <label class="comm-switch">
                    <input type="checkbox" id="ccSign" ${c.show_sender ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
            <div class="comm-actionbar" style="margin-top:10px;">
                <button class="comm-btn primary" onclick="commSaveChannelInfo(${channelId})"><i class="fas fa-save"></i> Сохранить</button>
            </div>
            <label class="comm-label">Фото канала</label>
            <label class="comm-btn" style="cursor:pointer; display:inline-block;">
                <i class="fas fa-camera"></i> Загрузить фото
                <input type="file" accept="image/*" style="display:none;" onchange="commUploadChannelAvatar(${channelId}, this)">
            </label>`;
    }

    html += `
        <label class="comm-label">Ссылка-приглашение</label>
        <div class="comm-invite-box">
            <input class="comm-field" readonly value="${commEsc(inviteUrl)}" onfocus="this.select()">
            <button class="comm-btn" onclick="commCopy(this, '${inviteUrl}')"><i class="fas fa-copy"></i></button>
            <button class="comm-btn" onclick="commShare('${inviteUrl}', '${commEsc(c.name)}')"><i class="fas fa-share-alt"></i></button>
        </div>
        <div class="comm-actionbar">`;
    if (isOwner) {
        html += `<button class="comm-btn danger" onclick="commDeleteChannel(${channelId})"><i class="fas fa-trash"></i> Удалить канал</button>`;
    } else {
        html += `<button class="comm-btn danger" onclick="commLeaveChannel(${channelId})"><i class="fas fa-bell-slash"></i> Отписаться</button>`;
    }
    html += `</div>`;
    return html;
}

function commChannelSubsHtml(channelId, d) {
    const isOwner = d.is_owner;
    let html = '';
    if (isOwner) {
        html += `
            <input id="commUserSearch" class="comm-field" placeholder="Найти пользователя..."
                oninput="commSearchUsers('subscriber', ${channelId})">
            <div id="commUserResults"></div>
            <div style="height:8px;"></div>`;
    }
    html += '<div style="max-height:340px; overflow-y:auto;">';
    (d.subscribers || []).forEach(u => {
        html += `<div class="comm-row">
            <div class="comm-avatar small" style="background:${commGrad(u.display_name || u.username)};">${commLetter(u.display_name || u.username)}</div>
            <div class="comm-row-name">
                <div class="comm-row-title">${commEsc(commUserName(u))}</div>
                <div class="comm-row-sub">@${commEsc(u.username || '—')}</div>
            </div>
        </div>`;
    });
    html += '</div>';

    if (isOwner && (d.subscribers || []).length === 0) {
        html = '<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:16px 0;">Пока нет подписчиков</div>' + html;
    }
    return html;
}

function commChannelAdminsStub(channelId, d) {
    let html = '';
    if (d.is_owner) {
        html += `
            <input id="commUserSearch" class="comm-field" placeholder="Найти админа..."
                oninput="commSearchUsers('admin', ${channelId})">
            <div id="commUserResults"></div>
            <div style="height:10px;"></div>`;
    }
    html += '<div style="max-height:340px; overflow-y:auto;">';
    (d.channel_admins || []).forEach(a => {
        html += `<div class="comm-row">
            <div class="comm-avatar small" style="background:${commGrad(a.display_name || a.username)};">${commLetter(a.display_name || a.username)}</div>
            <div class="comm-row-name">
                <div class="comm-row-title">${commEsc(commUserName(a))}</div>
                <div class="comm-row-sub" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:4px;">
                    <label style="font-size:12px; display:flex; align-items:center; gap:3px;"><input type="checkbox" ${a.can_post ? 'checked' : ''} onchange="commAdminPerm(${channelId}, ${a.user_id}, 'can_post', this.checked)"> посты</label>
                    <label style="font-size:12px; display:flex; align-items:center; gap:3px;"><input type="checkbox" ${a.can_edit ? 'checked' : ''} onchange="commAdminPerm(${channelId}, ${a.user_id}, 'can_edit', this.checked)"> правка</label>
                    <label style="font-size:12px; display:flex; align-items:center; gap:3px;"><input type="checkbox" ${a.can_delete ? 'checked' : ''} onchange="commAdminPerm(${channelId}, ${a.user_id}, 'can_delete', this.checked)"> удаление</label>
                    <label style="font-size:12px; display:flex; align-items:center; gap:3px;"><input type="checkbox" ${a.can_add_admins ? 'checked' : ''} onchange="commAdminPerm(${channelId}, ${a.user_id}, 'can_add_admins', this.checked)"> админы</label>
                </div>
            </div>
            <button class="comm-btn danger" onclick="commRemoveAdmin(${channelId}, ${a.user_id})"><i class="fas fa-user-slash"></i></button>
        </div>`;
    });
    html += '</div>';
    return html;
}

function commSaveChannelInfo(channelId) {
    const name = (document.getElementById('ccName') || {}).value;
    const desc = (document.getElementById('ccDesc') || {}).value;
    const isPublic = (document.getElementById('ccPublic') || {}).checked;
    const showSender = (document.getElementById('ccSign') || {}).checked;
    const username = (document.getElementById('ccUsername') || {}).value;
    if (!name || !name.trim()) { commToast('Название не может быть пустым'); return; }
    fetch('/api/update_channel/' + channelId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: desc || '', is_public: !!isPublic, show_sender: !!showSender, username: (username || '').trim() || null })
    }).then(r => r.json()).then(d => {
        if (d.success) { commToast('Сохранено'); openChannelInfo(channelId); }
        else commToast(d.error || 'Ошибка');
    });
}

function commToggleChannelMute(channelId, seconds) {
    const url = seconds === 0 ? '/api/chat/unmute' : '/api/chat/mute';
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_type: 'channel', chat_id: channelId, seconds: seconds })
    }).then(r => r.json()).then(d => {
        if (d.success) { commToast(seconds === 0 ? 'Уведомления включены' : 'Уведомления выключены'); openChannelInfo(channelId); }
        else commToast(d.error || 'Ошибка');
    });
}

function commUploadChannelAvatar(channelId, input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('photo', file);
    fetch('/api/upload_chat_avatar/channel/' + channelId, { method: 'POST', body: fd })
        .then(r => r.json()).then(d => {
            input.value = '';
            if (d.success) { commToast('Фото обновлено'); openChannelInfo(channelId); }
            else commToast(d.error || 'Ошибка');
        }).catch(() => commToast('Ошибка загрузки'));
}

function commAdminPerm(channelId, userId, perm, checked) {
    const d = window._commChannel;
    const perms = { can_post: 0, can_edit: 0, can_delete: 0, can_add_admins: 0 };
    (d.channel_admins || []).forEach(a => {
        if (a.user_id === userId) {
            perms.can_post = a.can_post ? 1 : 0;
            perms.can_edit = a.can_edit ? 1 : 0;
            perms.can_delete = a.can_delete ? 1 : 0;
            perms.can_add_admins = a.can_add_admins ? 1 : 0;
        }
    });
    perms[perm] = checked ? 1 : 0;
    fetch('/api/add_channel_admin/' + channelId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, permissions: perms })
    }).then(r => r.json()).then(d2 => {
        if (!d2.success && d2.error) commToast(d2.error);
        else openChannelInfo(channelId);
    });
}

function commAddAdmin(channelId, userId) {
    const perms = { can_post: 1, can_edit: 0, can_delete: 0, can_add_admins: 0 };
    fetch('/api/add_channel_admin/' + channelId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, permissions: perms })
    }).then(r => r.json()).then(d => {
        if (d.success) { commToast('Админ добавлен'); openChannelInfo(channelId); }
        else commToast(d.error || 'Ошибка');
    });
}

function commAddSubscriber(channelId, userId) {
    fetch('/api/add_channel_subscriber/' + channelId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
    }).then(r => r.json()).then(d => {
        if (d.success) { commToast('Подписчик добавлен'); openChannelInfo(channelId); }
        else commToast(d.error || 'Ошибка');
    });
}

function commRemoveAdmin(channelId, userId) {
    fetch('/api/remove_channel_admin/' + channelId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
    }).then(r => r.json()).then(d => {
        if (d.success) { commToast('Админ снят'); openChannelInfo(channelId); }
        else commToast(d.error || 'Ошибка');
    });
}

function commLeaveChannel(channelId) {
    if (!confirm('Отписаться от канала?')) return;
    fetch('/api/unsubscribe_channel/' + channelId, { method: 'POST' })
        .then(r => r.json()).then(d => {
            if (d.success) location.reload();
            else commToast(d.error || 'Ошибка');
        });
}

function commDeleteChannel(channelId) {
    if (!confirm('Удалить канал навсегда?')) return;
    fetch('/api/delete_channel/' + channelId, { method: 'POST' })
        .then(r => r.json()).then(d => {
            if (d.success) location.reload();
            else commToast(d.error || 'Ошибка');
        });
}

// Автооткрытие чата по ?open=group|channel&id=N после приглашений
(function () {
    const params = new URLSearchParams(window.location.search);
    const open = params.get('open');
    const id = parseInt(params.get('id'), 10);
    if ((open === 'group' || open === 'channel') && id) {
        setTimeout(function () {
            try {
                if (typeof openChat === 'function') openChat(id, open);
            } catch (e) { console.warn('auto-open failed', e); }
        }, 900);
    }
})();

// Слушатели телеграмовских событий: заявки, упоминания, бан/мьют
(function () {
    if (typeof window.socket === 'undefined' && typeof socket === 'undefined') return;

    if (typeof socket === 'function') return;

    if (typeof socket !== 'object' || typeof socket.on !== 'function') return;

    try {
        socket.on('group_join_request', function (d) {
            if (typeof showToast === 'function') {
                var name = d.user_name || 'Пользователь';
                var el = document.querySelector('#toast');
                showToast('Новая заявка в группу: ' + name + ' (в профиле группы → Заявки)');
            }
        });

        socket.on('group_join_approved', function (d) {
            if (typeof showToast === 'function') showToast('Вас приняли в группу!');
            if (typeof loadGroupsList === 'function') loadGroupsList();
        });

        socket.on('mention', function (d) {
            if (typeof showToast === 'function') {
                showToast('@' + d.from_name + ' упомянул вас в группе');
            }
        });

        socket.on('group_member_banned', function (d) {
            if (typeof showToast === 'function') showToast('Вас заблокировали в группе');
        });
    } catch (e) {
        console.warn('community socket listeners error', e);
    }
})();