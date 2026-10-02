// ===== КОРЗИНА УДАЛЁННЫХ (v0.60.3) =====
// Сообщения, удалённые «у всех» или скрытые «у меня», можно вернуть одной кнопкой.
// Роуты: GET /api/trash, POST /api/restore_message, POST /api/trash/clear

function trashChatRef() {
    if (!currentChat) return null;
    return { chat_id: currentChat.id, chat_type: currentChatType || 'personal' };
}

function trashRefFromEl(el) {
    if (!el) return null;
    return { chat_id: el.getAttribute('data-chat-id'), chat_type: el.getAttribute('data-chat-type') || 'personal' };
}

function trashItemIcon(it) {
    if (it.file_type === 'photo' || it.file_type === 'image') return 'fa-image';
    if (it.file_type === 'video') return 'fa-video';
    if (it.file_type === 'voice' || it.file_type === 'audio') return 'fa-microphone';
    if (it.file_type === 'sticker') return 'fa-smile';
    if (it.file_type === 'document' || it.file_type === 'file') return 'fa-file';
    return 'fa-comment-dots';
}

function trashItemText(it) {
    if (it.content && it.content.trim()) return it.content;
    if (it.file_name) return it.file_name;
    return '(без текста)';
}

function trashTimeText(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function openChatTrash() {
    const ref = trashChatRef();
    if (!ref) { showToast('Сначала откройте чат'); return; }
    showModal('Корзина', '<div id="trashBody" class="trash-body"><div class="trash-empty">Загрузка…</div></div>'
        + '<div id="trashFooter" style="display:none;padding:10px 14px;border-top:1px solid var(--border-color);">'
        + '<button class="btn-danger-full" onclick="clearChatTrash()"><i class="fas fa-trash"></i> Очистить корзину</button></div>');
    loadChatTrash(ref);
}

async function loadChatTrash(ref) {
    const box = document.getElementById('trashBody');
    if (!box) return;
    box.innerHTML = '<div class="trash-empty">Загрузка…</div>';
    try {
        const qs = `chat_id=${encodeURIComponent(ref.chat_id)}&chat_type=${encodeURIComponent(ref.chat_type)}&limit=100`;
        const r = await fetch('/api/trash?' + qs);
        const d = await r.json();
        if (r.status === 401) { box.innerHTML = '<div class="trash-empty">Нужно войти в аккаунт</div>'; return; }
        const items = d.items || [];
        if (!items.length) {
            box.innerHTML = '<div class="trash-empty"><i class="fas fa-trash-restore"></i><br>Корзина пуста</div>';
            const f = document.getElementById('trashFooter');
            if (f) f.style.display = 'none';
            return;
        }
        box.innerHTML = items.map(it => `
            <div class="trash-item" data-trash-id="${it.id}"
                 data-chat-id="${it.chat_id || ''}"
                 data-chat-type="${it.chat_id ? 'personal' : (it.group_id ? 'group' : 'channel')}">
                <i class="fas ${trashItemIcon(it)} trash-item-icon"></i>
                <div class="trash-item-main">
                    <div class="trash-item-text">${escapeHtml(trashItemText(it))}</div>
                    <div class="trash-item-meta">
                        <span>${escapeHtml(it.display_name || it.username || 'Удалено')}</span>
                        <span>· ${trashTimeText(it.deleted_at || it.created_at)}</span>
                        <span class="trash-tag">${it.deleted_for_all ? 'удалено у всех' : 'удалено у меня'}</span>
                    </div>
                </div>
                <button class="trash-restore" onclick="restoreFromTrash(${it.id}, this)">
                    <i class="fas fa-rotate-left"></i> Вернуть
                </button>
            </div>`).join('');
        const f = document.getElementById('trashFooter');
        if (f) f.style.display = '';
    } catch (e) {
        box.innerHTML = '<div class="trash-empty">Не удалось загрузить корзину</div>';
    }
}

async function trashPost(url, body) {
    const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    try { return await r.json(); } catch (e) { return { success: false, error: 'Сервер недоступен' }; }
}

async function restoreFromTrash(messageId, btn) {
    if (btn) btn.disabled = true;
    const row = btn ? btn.closest('.trash-item') : null;
    const ref = trashRefFromEl(row) || trashChatRef();
    try {
        const r = await trashPost('/api/restore_message', {
            message_id: messageId,
            chat_id: ref ? ref.chat_id : null,
            chat_type: ref ? ref.chat_type : 'personal'
        });
        if (r && r.success) {
            if (row) row.remove();
            if (typeof showToast === 'function') showToast('Сообщение восстановлено');
            // перечитать открытый чат, чтобы сообщение вернулось на место
            if (ref && currentChat && String(currentChat.id) === String(ref.chat_id)
                && (currentChatType || 'personal') === ref.chat_type) {
                if (typeof openChat === 'function') openChat(currentChat.id, currentChatType);
            }
            const box = document.getElementById('trashBody');
            if (box && !box.querySelector('.trash-item')) {
                box.innerHTML = '<div class="trash-empty"><i class="fas fa-trash-restore"></i><br>Корзина пуста</div>';
                const f = document.getElementById('trashFooter');
                if (f) f.style.display = 'none';
            }
        } else {
            if (btn) btn.disabled = false;
            showToast((r && r.error) ? r.error : 'Не удалось восстановить');
        }
    } catch (e) {
        if (btn) btn.disabled = false;
        showToast('Ошибка восстановления');
    }
}

async function clearChatTrash() {
    const ref = trashChatRef();
    if (!ref) { showToast('Сначала откройте чат'); return; }
    if (!confirm('Очистить корзину? Сообщения будут удалены навсегда, восстановить их нельзя.')) return;
    try {
        const r = await trashPost('/api/trash/clear', { chat_id: ref.chat_id, chat_type: ref.chat_type });
        if (r && r.success) {
            showToast('Корзина очищена');
            loadChatTrash(ref);
        } else {
            showToast((r && r.error) ? r.error : 'Не удалось очистить корзину');
        }
    } catch (e) {
        showToast('Ошибка очистки корзины');
    }
}

// Обработчики Socket.IO
if (typeof socket !== 'undefined' && socket && socket.on) {
    socket.on('message_restored', (d) => {
        if (d && d.message_id) {
            const el = document.querySelector(`[data-message-id="${d.message_id}"]`);
            if (el) {
                el.classList.remove('msg-deleted');
                if (typeof loadMessages === 'function') loadMessages();
            }
        }
        const box = document.getElementById('trashBody');
        if (box) {
            const row = box.querySelector(`.trash-item[data-trash-id="${d.message_id}"]`);
            if (row) row.remove();
        }
    });
    socket.on('trash_cleared', () => {
        const ref = trashChatRef();
        if (ref) loadChatTrash(ref);
    });
}
