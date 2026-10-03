// ===== ОНЛАЙН-СТАТУС (v0.62.2) =====
// Зелёная точка «в сети» + время захода (с учётом privacy_last_seen).
// Сервер сам решает, кому показывать: is_online приходит уже с учётом
// приватности, а событие presence_update приходит по Socket.IO.
(function () {
    'use strict';

    const onlineIds = new Set();

    function listOf() {
        try {
            return (typeof chatsData !== 'undefined' && chatsData) || [];
        } catch (e) {
            return [];
        }
    }

    function chatFor(userId) {
        return listOf().find(c => String(c.other_user_id || c.id) === String(userId)) || null;
    }

    // Онлайн по данным сервера ИЛИ по последнему событию presence_update
    function onlineFor(userId) {
        if (!userId || userId === (window.CURRENT_USER && window.CURRENT_USER.id)) return false;
        const chat = chatFor(userId);
        if (chat) return !!(chat.is_online || onlineIds.has(String(userId)));
        return onlineIds.has(String(userId));
    }

    function canShowStatus(userId) {
        const chat = chatFor(userId);
        // last_seen === null значит, что собеседник скрыл время захода
        if (!chat) return true;
        return chat.is_online || chat.last_seen !== null;
    }

    function applyDot(container, visible) {
        if (!container) return;
        let dot = container.querySelector('.online-dot');
        if (visible && !dot) {
            dot = document.createElement('span');
            dot.className = 'online-dot';
            container.appendChild(dot);
        }
        if (dot) dot.classList.toggle('hidden', !visible);
    }

    function updateListDots() {
        const list = document.getElementById('chatsList');
        if (!list) return;
        list.querySelectorAll('.chat-item').forEach(item => {
            if (item.dataset.chatType !== 'personal') return;
            const avatar = item.querySelector('.chat-avatar');
            if (!avatar) return;
            applyDot(avatar, onlineFor(item.dataset.chatId));
        });
    }

    function updateHeader() {
        let uid = null;
        try {
            if (typeof currentChat === 'undefined' || !currentChat || currentChatType !== 'personal') return;
            uid = currentChat.other_user_id || currentChat.id || null;
        } catch (e) {
            return;
        }
        if (!uid) return;
        const online = onlineFor(uid) && canShowStatus(uid);
        applyDot(document.getElementById('chatUserAvatar'), online);

        const statusEl = document.getElementById('chatUserStatus');
        if (!statusEl || statusEl.classList.contains('typing')) return;
        if (online) {
            statusEl.textContent = 'в сети';
            return;
        }
        const chat = chatFor(uid);
        if (chat && chat.last_seen === null) {
            statusEl.textContent = 'был(а) давно';
            return;
        }
        const ls = chat ? chat.last_seen : (typeof currentChat !== 'undefined' ? currentChat.last_seen : null);
        statusEl.textContent = formatLastSeen(ls);
    }

    window.isUserOnline = onlineFor;
    window.updatePresenceUI = function () {
        updateListDots();
        updateHeader();
    };

    function seedFromChats() {
        listOf().forEach(c => {
            if (c.chat_type !== 'personal' || !c.other_user_id) return;
            if (c.is_online) onlineIds.add(String(c.other_user_id));
            else if (c.last_seen === null) onlineIds.delete(String(c.other_user_id));
        });
        updatePresenceUI();
    }

    document.addEventListener('DOMContentLoaded', () => {
        seedFromChats();

        // После каждой загрузки списка чатов — сверить точки и статус в шапке
        if (typeof window.loadChatsList === 'function') {
            const orig = window.loadChatsList;
            window.loadChatsList = function () {
                return orig().then(res => {
                    seedFromChats();
                    return res;
                });
            };
        }

        try {
            if (typeof socket !== 'undefined' && socket && socket.on) {
                socket.on('presence_update', data => {
                    if (!data || !data.user_id) return;
                    const id = String(data.user_id);
                    if (data.online) onlineIds.add(id);
                    else onlineIds.delete(id);
                    const chat = chatFor(data.user_id);
                    if (chat) chat.is_online = !!data.online;
                    updatePresenceUI();
                });
            }
        } catch (e) {
            console.warn('[presence] socket unavailable', e);
        }
    });
})();
