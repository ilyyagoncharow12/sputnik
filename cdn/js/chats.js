    // ===== Р§РђРўР« =====
    function loadChatsList() {
        return fetch('/api/get_chats_list')
            .then(r => r.json())
            .then(c => {
                chatsData = c.filter(chat => chat.name && chat.name !== 'undefined');
                updateUnreadBadges();
                if (currentTab === 'chats') {
                    // Если активна папка — обновляем её содержимое, а не главный список
                    if (typeof currentFolderId !== 'undefined' && currentFolderId && typeof renderFoldersUI !== 'undefined') {
                        const folderDef = typeof foldersData !== 'undefined' ? foldersData.find(f => f.id === currentFolderId) : null;
                        if (folderDef && folderDef.is_default && typeof renderDefaultFolder === 'function') {
                            renderDefaultFolder(chatsData);
                        } else if (typeof refreshFolderChats === 'function') {
                            refreshFolderChats();
                        }
                    } else {
                        renderChatsList();
                    }
                }
            });
    }

    // ===== РЎР§РЃРўР§РРљ РќР•РџР РћР§РРўРђРќРќР«РҐ =====
    function updateUnreadBadges() {
        const all = [chatsData, groupsData, channelsData];
        const total = all.reduce((s, arr) => s + (arr || []).reduce((a, c) => a + (parseInt(c.unread_count, 10) || 0), 0), 0);
        const badge = document.getElementById('unreadTotalBadge');
        if (badge) {
            if (total > 0) {
                badge.textContent = total > 99 ? '99+' : total;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
        document.title = total > 0 ? `(${total}) Спутник` : 'Спутник';
    }

    // ===== Р—РђРљР Р•РџР›Р•РќРР• Р§РђРўРђ =====
    function togglePin(el, chatId) {
        if (!chatId) return;
        const item = el.closest('.chat-item');
        const wasPinned = item ? item.classList.contains('pinned') : false;

        // анимация кнопки (живо на любом этапе ответа)
        el.classList.remove('pin-pressed');
        void el.offsetWidth;
        el.classList.add('pin-pressed');
        setTimeout(() => el.classList.remove('pin-pressed'), 450);

        el.classList.toggle('pin-active', !wasPinned);
        const icon = el.querySelector('i');
        if (icon) icon.style.color = !wasPinned ? '#10b981' : 'var(--text-muted)';

        const endpoint = wasPinned ? '/api/unpin_chat' : '/api/pin_chat';
        fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId }),
            credentials: 'same-origin'
        })
        .then(r => r.json())
        .then(res => {
            if (!res || !res.success) {
                // откат визуала при ошибке
                el.classList.toggle('pin-active', wasPinned);
                if (icon) icon.style.color = wasPinned ? '#10b981' : 'var(--text-muted)';
                return;
            }
            // пересортировка: закреплённые поднимаются наверх
            loadChatsList().then(() => {
                const moved = document.querySelector(`#chatsList .chat-item[data-chat-id="${chatId}"]`);
                if (!moved) return;
                moved.classList.remove('just-pinned', 'just-unpinned');
                void moved.offsetWidth;
                moved.classList.add(wasPinned ? 'just-unpinned' : 'just-pinned');
            });
        })
        .catch(() => {
            el.classList.toggle('pin-active', wasPinned);
            if (icon) icon.style.color = wasPinned ? '#10b981' : 'var(--text-muted)';
        });
    }

    function loadGroupsList() {
        fetch('/api/get_groups')
            .then(r => r.json())
            .then(g => {
                groupsData = g.map(group => ({
                    ...group,
                    id: group.id || group.group_id,
                    chat_type: 'group',
                    name: group.name || 'Группа'
                }));
                updateUnreadBadges();
                if (currentTab === 'groups') renderChatsList();
            })
            .catch(err => console.error('Error loading groups:', err));
    }

    function loadChannelsList() {
        fetch('/api/get_channels')
            .then(r => r.json())
            .then(c => {
                channelsData = c.map(channel => ({
                    ...channel,
                    id: channel.id || channel.channel_id,
                    chat_type: 'channel',
                    name: channel.name || 'Канал'
                }));
                updateUnreadBadges();
                if (currentTab === 'channels') renderChatsList();
            })
            .catch(err => console.error('Error loading channels:', err));
    }

    function renderChatsList() {
        const container = document.getElementById('chatsList');
        let data = [];

        if (currentTab === 'groups') data = groupsData;
        else if (currentTab === 'channels') data = channelsData;
        else data = chatsData;

        if (!data || !data.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comment"></i>
                    <p>Нет чатов</p>
                </div>
            `;
            return;
        }

        container.innerHTML = data.map(c => {
            let chatId, openId, chatType;

            if (c.chat_type) {
                chatType = c.chat_type;
            } else if (currentTab === 'groups') {
                chatType = 'group';
            } else if (currentTab === 'channels') {
                chatType = 'channel';
            } else {
                chatType = 'personal';
            }

            if (chatType === 'personal') {
                chatId = c.chat_id || c.id;
                openId = c.other_user_id || c.id;
            } else if (chatType === 'group') {
                chatId = c.id || c.group_id;
                openId = chatId;
            } else if (chatType === 'channel') {
                chatId = c.id || c.channel_id;
                openId = chatId;
            } else {
                chatId = c.id;
                openId = c.id;
            }

            if (!openId || isNaN(openId)) {
                console.error('Invalid ID for chat:', c);
                return '';
            }

            const avatarClass = chatType === 'group' ? 'group' : (chatType === 'channel' ? 'channel' : '');
            const isActive = currentChat && currentChatType === chatType &&
                            ((chatType === 'personal' && currentChat.other_user_id == openId) ||
                             (chatType !== 'personal' && currentChat.id == openId));

            return `
                <div class="chat-item ${c.is_pinned ? 'pinned' : ''} ${isActive ? 'active' : ''}"
                     data-chat-id="${openId}"
                     data-chat-type="${chatType}"
                     onclick="openChat(${openId}, '${chatType}')">
                    ${chatType === 'personal' ? `<div class="pin-button" onclick="event.stopPropagation();togglePin(this, ${chatId})">
                        <i class="fas fa-thumbtack" style="color: ${c.is_pinned ? '#10b981' : 'var(--text-muted)'};"></i>
                    </div>` : ''}
                    <div class="chat-avatar ${avatarClass}">
                        ${c.has_blocked_me ? `<i class="fas fa-user-slash" style="color:#8e8e93;"></i>` : (c.is_banned ? `<span>❄</span>` : (c.avatar ? `<img src="/${c.avatar}">` : `<span>${(c.name || '?')[0].toUpperCase()}</span>`))}
                    </div>
                    <div class="chat-info">
                        <div class="chat-header-row">
                            <span class="chat-name">${escapeHtml(c.is_banned ? 'Удалённый аккаунт' : (c.name || 'Чат'))}${c.is_banned ? '<span class="snow-emoji">❄</span>' : ''}</span>
                            <span class="chat-time">${formatChatTime(c.last_message_time)}</span>
                        </div>
                        <div class="chat-preview">
                            <span class="chat-message">
                                ${c.last_file_type ? `<i class="fas fa-${c.last_file_type === 'photo' ? 'image' : c.last_file_type === 'video' ? 'video' : 'file'}"></i> ${c.last_file_type}` : (c.last_message || 'Нет сообщений')}
                            </span>
                            ${c.unread_count > 0 ? `<span class="chat-badge">${c.unread_count}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function _chatsSignature(arr) {
        return (arr || []).map(c =>
            `${c.id}|${c.chat_id ? 'c' + c.chat_id : ''}|${c.last_message || ''}|${c.last_message_time || ''}|${c.unread_count || 0}|${c.is_pinned ? 1 : 0}`
        ).join('~');
    }

    // ===== Р–РР’РћР™ РўРРљР•Р  (РѕР±РЅРѕРІР»РµРЅРёРµ РєР°Р¶РґСѓСЋ СЃРµРєСѓРЅРґСѓ, SPA-СЂРµР¶РёРј) =====
    function liveTick() {
        const now = Date.now();

        // 1) Часы в списке чатов — обновляем прямо в ячейках, без перерисовки
        const listEl = document.getElementById('chatsList');
        if (listEl) {
            listEl.querySelectorAll('.chat-item').forEach(item => {
                const type = item.dataset.chatType || 'personal';
                const id = item.dataset.chatId;
                const arr = type === 'group' ? groupsData : (type === 'channel' ? channelsData : chatsData);
                const c = (arr || []).find(x => String(x.other_user_id || x.id || x.chat_id || '') === String(id));
                if (c) {
                    const timeEl = item.querySelector('.chat-time');
                    if (timeEl) timeEl.textContent = formatChatTime(c.last_message_time);
                }
            });
        }

        // 2) Статус собеседника в шапке открытого чата — каждую секунду
        if (currentChat && currentChatType === 'personal') {
            const statusEl = document.getElementById('chatUserStatus');
            if (statusEl && !statusEl.classList.contains('typing')) {
                const me = (chatsData || []).find(x => String(x.other_user_id) === String(currentChat.other_user_id));
                if (me && me.last_seen) statusEl.textContent = formatLastSeen(me.last_seen);
            }
        }

        // 3) Лёгкая синхронизация каждые 2 сек (не чаще одного запроса одновременно)
        if (!liveTicker.busy && now - liveTicker.lastListSync > 2000) {
            liveTicker.lastListSync = now;
            liveTicker.busy = true;
            fetch('/api/get_chats_list')
                .then(r => r.json())
                .then(c => {
                    const list = (Array.isArray(c) ? c : []).filter(x => x.name && x.name !== 'undefined');
                    const sig = _chatsSignature(list);
                    if (sig !== liveTicker.sig) {
                        liveTicker.sig = sig;
                        chatsData = list;
                        updateUnreadBadges();
                        if (currentTab === 'chats') {
                            // В папке перерисовываем её содержимое, главный список не трогаем
                            if (typeof currentFolderId !== 'undefined' && currentFolderId && typeof renderFoldersUI !== 'undefined') {
                                const folderDef = typeof foldersData !== 'undefined' ? foldersData.find(f => f.id === currentFolderId) : null;
                                if (folderDef && folderDef.is_default && typeof renderDefaultFolder === 'function') {
                                    renderDefaultFolder(list);
                                } else if (typeof refreshFolderChats === 'function' && !(folderDef && folderDef.is_default)) {
                                    refreshFolderChats();
                                }
                            } else {
                                renderChatsList();
                            }
                        }
                    } else {
                        chatsData = list;
                    }
                })
                .catch(() => {})
                .finally(() => { liveTicker.busy = false; });
        }

        // 4) Сообщения открытого чата — каждые 2 сек (без перерисовки, скролл не прыгает)
        if (currentChat && !liveTicker.busy && !document.getElementById('combinedContextMenu') && now - liveTicker.lastMsgSync > 2000) {
            liveTicker.lastMsgSync = now;
            liveTicker.busy = true;
            refreshMessages().finally(() => { liveTicker.busy = false; });
        }

        // 5) РСЃС‚РѕСЂРёРё вЂ” РѕР±РЅРѕРІР»СЏРµРј СЂР°Р· РІ 30 СЃРµРє, РµСЃР»Рё РїСЂРѕСЃРјРѕС‚СЂ РёСЃС‚РѕСЂРёР№ РЅРµ РѕС‚РєСЂС‹С‚
        if (now - liveTicker.lastStories > 30000) {
            const storyOpen = document.getElementById('storyViewer') && document.getElementById('storyViewer').style.display !== 'none';
            const modalOpen = document.getElementById('tempModal') && document.getElementById('tempModal').classList.contains('active');
            if (!storyOpen) {
                liveTicker.lastStories = now;
                if (currentTab === 'chats' && !modalOpen) loadStories();
            }
        }
    }

    function switchTab(tab) {
        currentTab = tab;

        // Если стоит выбор папки — выходим из неё
        if (typeof currentFolderId !== 'undefined' && currentFolderId !== null) {
            currentFolderId = null;
            try { localStorage.removeItem('currentFolderId'); } catch (e) {}
            sessionStorage.removeItem('inFolder');
        }

        if (typeof renderFoldersUI === 'function') {
            // renderFoldersUI пересобирает вкладки с актуальными active
            renderFoldersUI();
        } else {
            document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
            if (event && event.target && event.target.closest('.chat-tab')) {
                event.target.closest('.chat-tab').classList.add('active');
            }
        }

        if (tab === 'groups') loadGroupsList();
        else if (tab === 'channels') loadChannelsList();
        else loadChatsList();
    }

    function openChat(id, type) {
    const numericId = parseInt(id);

    if (type === 'personal') {
        fetch(`/api/is_user_blocked/${numericId}`)
            .then(r => r.json())
            .then(data => {
                if (data.is_blocked) {
                    alert('Вы заблокировали этого пользователя. Разблокируйте его чтобы продолжить общение.');
                    return;
                }
                continueOpenChat(numericId, type);
            })
            .catch(() => continueOpenChat(numericId, type));
    } else {
        continueOpenChat(numericId, type);
    }
}

function continueOpenChat(id, type) {
    currentChat = { id: parseInt(id), type: type };
    currentChatType = type;
    currentPinnedMessage = null;
    const pinnedBannerEl = document.getElementById('pinnedBanner');
    if (pinnedBannerEl) pinnedBannerEl.style.display = 'none';

    let url = type === 'group' ? `/api/get_group/${id}` :
             (type === 'channel' ? `/api/get_channel/${id}` : `/api/get_chat/${id}`);

    fetch(url)
        .then(r => r.json())
        .then(d => {
            if (type === 'personal' && d.other_user) {
                currentChat.chat_id = d.chat_id;
                currentChat.other_user_id = d.other_user.id;
                const frozenO = !!d.other_user.is_banned;

                // ===== ВАЖНО: Сначала проверяем кастомное имя контакта =====
                fetch(`/api/check_contact/${d.other_user.id}`)
                    .then(r => r.json())
                    .then(contactInfo => {
                        // Если аккаунт заморожен — имя всегда «Удалённый аккаунт»
                        const displayName = frozenO ? 'Удалённый аккаунт' : (contactInfo.contact_name ||
                                           d.other_user.display_name ||
                                           d.other_user.username);

                        currentChat.name = displayName;
                        document.getElementById('chatUserName').innerHTML = escapeHtml(displayName) + (frozenO ? '<span class="snow-emoji">❄</span>' : '');
                    })
                    .catch(() => {
                        // Если ошибка — используем оригинальное
                        currentChat.name = frozenO ? 'Удалённый аккаунт' : (d.other_user.display_name || d.other_user.username);
                        document.getElementById('chatUserName').innerHTML = escapeHtml(currentChat.name) + (frozenO ? '<span class="snow-emoji">❄</span>' : '');
                    });

                document.getElementById('chatUserAvatar').innerHTML = frozenO ?
                    '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#2c2c2e;border-radius:50%;"><span style="color:#8e8e93;font-size:20px;">❄</span></div>' :
                    (d.other_user.has_blocked_me ?
                    '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#2c2c2e;border-radius:50%;"><i class="fas fa-user-slash" style="color:#8e8e93;font-size:20px;"></i></div>' :
                    (d.other_user.avatar ?
                        `<img src="/${d.other_user.avatar}">` :
                        `<span>${(currentChat.name || '?')[0].toUpperCase()}</span>`));
                document.getElementById('chatUserStatus').textContent = frozenO ? 'была давно' : formatLastSeen(d.other_user.last_seen);
                document.getElementById('audioCallBtn').style.display = d.other_user.has_blocked_me ? 'none' : 'block';
                document.getElementById('videoCallBtn').style.display = d.other_user.has_blocked_me ? 'none' : 'block';
                document.getElementById('groupVideoCallBtn').style.display = 'none';
                document.getElementById('messageInputArea').style.display = 'flex';
                document.getElementById('messageInput').disabled = false;
                document.getElementById('messageInput').placeholder = d.other_user.has_blocked_me ? 'Вы заблокированы — сообщение не доставится' : 'Сообщение...';
                showBlockedBanner(d.other_user.has_blocked_me);
                removeUnsubscribeButton();
            } else if (type === 'group' && d.group) {
                currentChat.name = d.group.name;
                currentChat.user_role = d.user_role;
                document.getElementById('chatUserName').textContent = d.group.name;
                document.getElementById('chatUserAvatar').innerHTML = d.group.avatar ?
                    `<img src="/${d.group.avatar}">` : '<span>👥</span>';
                document.getElementById('chatUserStatus').textContent = `${d.group.member_count || 0} участников`;
                document.getElementById('audioCallBtn').style.display = 'none';
                document.getElementById('videoCallBtn').style.display = 'none';
                document.getElementById('groupVideoCallBtn').style.display = 'block';
                document.getElementById('messageInputArea').style.display = 'flex';
                document.getElementById('messageInput').disabled = false;
                document.getElementById('messageInput').placeholder = 'Сообщение...';
                removeUnsubscribeButton();
            } else if (type === 'channel' && d.channel) {
                currentChat.name = d.channel.name;
                currentChat.owner_id = d.channel.owner_id;
                currentChat.can_post = d.can_post;

                document.getElementById('chatUserName').textContent = d.channel.name;
                document.getElementById('chatUserAvatar').innerHTML = d.channel.avatar ?
                    `<img src="/${d.channel.avatar}">` : '<span>📢</span>';
                document.getElementById('chatUserStatus').textContent = `${d.channel.subscriber_count || 0} подписчиков`;
                document.getElementById('audioCallBtn').style.display = 'none';
                document.getElementById('videoCallBtn').style.display = 'none';
                document.getElementById('groupVideoCallBtn').style.display = 'none';

                if (d.can_post) {
                    document.getElementById('messageInputArea').style.display = 'flex';
                    document.getElementById('messageInput').disabled = false;
                    document.getElementById('messageInput').placeholder = 'Сообщение...';
                    removeUnsubscribeButton();
                } else {
                    document.getElementById('messageInputArea').style.display = 'none';
                    addUnsubscribeButton();
                }
            }

            displayMessages(d.messages || []);
            showPinnedForCurrentChat();
            if (d.messages && d.messages.length > 0) {
                document.getElementById('messageInput').focus();
            }

            if (type === 'personal') socket.emit('join_chat', { chat_id: d.chat_id });
            else if (type === 'group') socket.emit('join_group', { group_id: id });
            else if (type === 'channel') socket.emit('join_channel', { channel_id: id });
        });

    if (isMobile()) {
        document.getElementById('sidebar').classList.add('chat-open');
        document.getElementById('chatArea').classList.add('chat-open');
    }
    renderChatsList();
}

    function addUnsubscribeButton() {
        const chatActions = document.querySelector('.chat-actions');
        let btn = document.getElementById('unsubscribeChannelBtn');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'unsubscribeChannelBtn';
            btn.onclick = unsubscribeFromCurrentChannel;
            btn.innerHTML = '<i class="fas fa-bell-slash"></i>';
            btn.title = 'Отписаться от канала';
            btn.style.color = 'var(--danger-color)';
            chatActions.appendChild(btn);
        }
    }



