// ===== ДОБАВЛЕНИЕ РЕАКЦИИ =====
function addReaction(messageId, reaction) {
    fetch('/api/add_reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message_id: messageId,
            reaction: reaction
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            // Обновляем реакции на сообщении
            fetch(`/api/get_reactions/${messageId}`)
                .then(r => r.json())
                .then(d => {
                    const msgDiv = document.querySelector(`.message[data-message-id="${messageId}"]`);
                    if (msgDiv) {
                        updateMessageReactions(msgDiv, d.reactions);
                    }
                });
        }
    });
}


// ===== ПЕРЕСЫЛКА СООБЩЕНИЙ =====
function openForwardModal() {
    if (!currentContextMessage) return;

    let html = `
        <div style="padding: 20px; color: white;">
            <div style="font-size: 18px; font-weight: 600; margin-bottom: 16px; text-align: center;">Переслать сообщение</div>
            <div style="max-height: 350px; overflow-y: auto;">
    `;

    // Личные чаты (включая «Избранное»)
    if (chatsData && chatsData.length > 0) {
        const sortedChats = [...chatsData].sort((a, b) => {
            const aFav = a.name === 'Избранное' ? 0 : 1;
            const bFav = b.name === 'Избранное' ? 0 : 1;
            return aFav - bFav;
        });
        html += '<div style="font-size: 12px; color: #8e8e93; margin: 12px 0 8px; font-weight: 600;">ЧАТЫ</div>';
        sortedChats.forEach(chat => {
            if (chat.other_user_id) {
                html += `
                    <div style="display: flex; align-items: center; gap: 12px; padding: 10px; cursor: pointer; border-radius: 12px; transition: background 0.2s;"
                         onclick="forwardMessageTo(${currentContextMessage.id}, ${chat.other_user_id}, 'chat'); closeModal('tempModal');"
                         onmouseover="this.style.background='#1c1c1e'"
                         onmouseout="this.style.background='transparent'">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--primary-gradient); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 16px; overflow: hidden;">
                            ${chat.avatar ? `<img src="/${chat.avatar}" style="width:100%;height:100%;object-fit:cover;">` : (chat.name || '?')[0].toUpperCase()}
                        </div>
                        <div style="flex: 1;">
                            <div style="font-weight: 500; font-size: 14px;">${escapeHtml(chat.name)}</div>
                        </div>
                    </div>
                `;
            }
        });
    }

    // Группы
    if (groupsData && groupsData.length > 0) {
        html += '<div style="font-size: 12px; color: #8e8e93; margin: 12px 0 8px; font-weight: 600;">ГРУППЫ</div>';
        groupsData.forEach(group => {
            html += `
                <div style="display: flex; align-items: center; gap: 12px; padding: 10px; cursor: pointer; border-radius: 12px; transition: background 0.2s;"
                     onclick="forwardMessageTo(${currentContextMessage.id}, ${group.id}, 'group'); closeModal('tempModal');"
                     onmouseover="this.style.background='#1c1c1e'"
                     onmouseout="this.style.background='transparent'">
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #10b981, #059669); display: flex; align-items: center; justify-content: center; color: white; font-size: 18px;">👥</div>
                    <div style="flex: 1;">
                        <div style="font-weight: 500; font-size: 14px;">${escapeHtml(group.name)}</div>
                    </div>
                </div>
            `;
        });
    }

    // Каналы
    if (channelsData && channelsData.length > 0) {
        html += '<div style="font-size: 12px; color: #8e8e93; margin: 12px 0 8px; font-weight: 600;">КАНАЛЫ</div>';
        channelsData.forEach(channel => {
            html += `
                <div style="display: flex; align-items: center; gap: 12px; padding: 10px; cursor: pointer; border-radius: 12px; transition: background 0.2s;"
                     onclick="forwardMessageTo(${currentContextMessage.id}, ${channel.id}, 'channel'); closeModal('tempModal');"
                     onmouseover="this.style.background='#1c1c1e'"
                     onmouseout="this.style.background='transparent'">
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #f59e0b, #d97706); display: flex; align-items: center; justify-content: center; color: white; font-size: 18px;">📢</div>
                    <div style="flex: 1;">
                        <div style="font-weight: 500; font-size: 14px;">${escapeHtml(channel.name)}</div>
                    </div>
                </div>
            `;
        });
    }

    html += '</div></div>';
    showModal('Переслать', html);
}

function forwardMessageTo(messageId, targetId, targetType) {
    const data = { message_id: messageId };

    if (targetType === 'chat') {
        data.to_chat_id = targetId;
    } else if (targetType === 'group') {
        data.to_group_id = targetId;
    } else if (targetType === 'channel') {
        data.to_channel_id = targetId;
    }

    fetch('/api/forward_message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(r => r.json())
    .then(result => {
        if (result.success) {
            showToast('✅ Сообщение переслано!');
            loadChatsList();
        } else {
            alert('Ошибка при пересылке сообщения');
        }
    })
    .catch(err => {
        console.error('Forward error:', err);
        alert('Ошибка при пересылке');
    });
}

// ===== ПРОСМОТРЩИК МЕДИА (фото/видео) =====
let mediaItems = [];
let mediaIndex = 0;

function collectMediaItems() {
    const items = [];
    document.querySelectorAll('#messagesArea .message').forEach(msg => {
        const img = msg.querySelector('.message-media img');
        const video = msg.querySelector('.message-media video');
        if (img) {
            items.push({ src: img.getAttribute('src'), type: 'image', messageId: msg.dataset.messageId });
        } else if (video) {
            items.push({ src: video.getAttribute('src'), type: 'video', messageId: msg.dataset.messageId });
        }
    });
    return items;
}

function openImageViewer(src, name, messageId) {
    mediaItems = collectMediaItems();
    let idx = mediaItems.findIndex(i => i.src === src);
    if (idx < 0) {
        // Если медиа ещё не в списке (например, сразу после отправки) — добавим
        const isVideo = document.querySelector(`video[src="${src}"]`);
        mediaItems.push({ src: src, type: isVideo ? 'video' : 'image', messageId: messageId });
        idx = mediaItems.length - 1;
    }
    mediaIndex = idx;
    renderMediaViewer();
    const viewer = document.getElementById('mediaViewer');
    if (viewer) viewer.style.display = 'flex';
}

function renderMediaViewer() {
    const item = mediaItems[mediaIndex];
    if (!item) return;
    const box = document.getElementById('mediaViewerContent');
    if (item.type === 'video') {
        box.innerHTML = `<video src="${item.src}" controls autoplay style="max-width: 94vw; max-height: 82vh; border-radius: 12px;"></video>`;
    } else {
        box.innerHTML = `<img src="${item.src}" style="max-width: 94vw; max-height: 82vh; border-radius: 12px; object-fit: contain;">`;
    }
    const prev = document.getElementById('mediaViewerPrev');
    const next = document.getElementById('mediaViewerNext');
    if (prev) prev.style.visibility = mediaIndex > 0 ? 'visible' : 'hidden';
    if (next) next.style.visibility = mediaIndex < mediaItems.length - 1 ? 'visible' : 'hidden';
}

function mediaViewerNav(dir) {
    if (!mediaItems.length) return;
    mediaIndex += dir;
    if (mediaIndex < 0) mediaIndex = mediaItems.length - 1;
    if (mediaIndex >= mediaItems.length) mediaIndex = 0;
    renderMediaViewer();
}

function mediaViewerForward() {
    const item = mediaItems[mediaIndex];
    if (!item) return;
    const id = parseInt(item.messageId, 10);
    if (!id) { showToast('Не удалось переслать'); return; }
    currentContextMessage = { id: id };
    closeMediaViewer();
    openForwardModal();
}

function mediaViewerDownload() {
    const item = mediaItems[mediaIndex];
    if (!item) return;
    const a = document.createElement('a');
    a.href = item.src;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function closeMediaViewer() {
    const viewer = document.getElementById('mediaViewer');
    if (viewer) {
        viewer.style.display = 'none';
        document.getElementById('mediaViewerContent').innerHTML = '';
    }
}

document.addEventListener('keydown', (e) => {
    const viewer = document.getElementById('mediaViewer');
    if (!viewer || viewer.style.display !== 'flex') return;
    if (e.key === 'Escape') {
        closeMediaViewer();
    } else if (e.key === 'ArrowLeft') {
        mediaViewerNav(-1);
    } else if (e.key === 'ArrowRight') {
        mediaViewerNav(1);
    }
});


    function escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ===== ИНИЦИАЛИЗАЦИЯ =====
    document.addEventListener('DOMContentLoaded', () => {
        loadChatsList();
        loadStories();
        initSocket();
        setupMessageInput();
        loadUserAvatar();
        loadSettings();
        loadTheme();

        // Живое обновление каждую секунду (лёгкое, без перерисовки)
        setInterval(liveTick, 1000);

        // Каждые 10 сек — списки групп/каналов (SPA-режим)
        setInterval(() => {
            if (currentTab === 'groups') loadGroupsList();
            else if (currentTab === 'channels') loadChannelsList();
        }, 10000);

        setInterval(() => {
            fetch('/api/update_last_seen', { method: 'POST' });
        }, 60000);
    });

    function loadTheme() {
        const savedTheme = localStorage.getItem('nexgram_theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark');
            const icon = document.getElementById('nightModeIcon');
            const text = document.getElementById('nightModeText');
            const toggle = document.getElementById('nightModeToggle');
            if (icon) icon.className = 'fas fa-sun';
            if (text) text.textContent = 'Дневная тема';
            if (toggle) toggle.checked = true;
        }
    }

    function initSocket() {
    socket.on('connect', () => {
        console.log('Connected to server');
    });

    // ===== АВТООБНОВЛЕНИЕ (SPA-режим) =====
    // Лёгкий тикер каждую секунду + синхронизация каждые 2 сек (см. liveTick).
    // Здесь также следим за потерей соединения: если socket "молчит" 15 сек
    // (например, сервер перезапущен) — страница перезагружается сама.

    socket.on('connect', () => {
        liveTicker.sockDeadSince = 0;
    });

    socket.on('disconnect', () => {
        if (!liveTicker.sockDeadSince) liveTicker.sockDeadSince = Date.now();
    });

    setInterval(() => {
        if (liveTicker.sockDeadSince && Date.now() - liveTicker.sockDeadSince > 15000) {
            const el = document.activeElement;
            // Не перезагружаем, если пользователь печатает
            if (!(el && (el.id === 'messageInput' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'))) {
                location.reload();
            }
        }
    }, 1000);

    socket.on('new_message', (data) => {
        if (currentChat && data.message) {
            const isCurrentChat =
                (currentChatType === 'personal' && data.message.chat_id == currentChat.chat_id) ||
                (currentChatType === 'group' && data.message.group_id == currentChat.id) ||
                (currentChatType === 'channel' && data.message.channel_id == currentChat.id);

            if (isCurrentChat) {
                // Проверяем, не отображали ли мы уже это сообщение
                const existingMsg = document.querySelector(`.message[data-message-id="${data.message.id}"]`);
                if (!existingMsg) {
                    displayMessage(data.message);
                }
            } else if (data.message && data.message.sender_id !== currentUser.id) {
                const isMine = data.message.sender_id === currentUser.id;
                if (!isMine) {
                    const scope = data.message.chat_id ? 'personal' : (data.message.group_id ? 'group' : 'channel');
                    const scopeId = data.message.chat_id || data.message.group_id || data.message.channel_id;
                    let title = 'Спутник';
                    if (data.message.display_name) title = data.message.display_name;
                    else if (data.message.sender_username) title = '@' + data.message.sender_username;
                    else if (!data.message.chat_id) title = data.message.group_name || data.message.channel_name || 'Группа';
                    const text = data.message.file_type ? '📎 [файл]' : (data.message.content || '').substring(0, 80);
                    notifyMessage(title, text, data.message.avatar_url || data.message.avatar || null, scope, scopeId);
                }
            }
        }
        loadChatsList();
    });

        socket.on('message_edited', (data) => {
            const msgDiv = document.querySelector(`.message[data-message-id="${data.message_id}"]`);
            if (msgDiv) {
                const textDiv = msgDiv.querySelector('.message-text');
                if (textDiv) textDiv.textContent = data.new_content;
            }
        });

        socket.on('message_deleted', (data) => {
            const msgDiv = document.querySelector(`.message[data-message-id="${data.message_id}"]`);
            if (msgDiv) msgDiv.remove();
            if (currentPinnedMessage && String(currentPinnedMessage.id) === String(data.message_id)) {
                showPinnedForCurrentChat();
            }
        });

        socket.on('reaction_update', (data) => {
            const msgDiv = document.querySelector(`.message[data-message-id="${data.message_id}"]`);
            if (msgDiv) {
                updateMessageReactions(msgDiv, data.reactions);
            }
        });

        socket.on('user_typing', (data) => {
            if (currentChat && currentChatType === 'personal' && data.user_id == currentChat.other_user_id) {
                const status = document.getElementById('chatUserStatus');
                status.textContent = 'печатает...';
                status.classList.add('typing');
                setTimeout(() => {
                    status.textContent = formatLastSeen(currentChat.last_seen);
                    status.classList.remove('typing');
                }, 2000);
            }
        });

        socket.on('new_story', () => {
            loadStories();
        });

        socket.on('story_deleted', () => {
            loadStories();
        });

        socket.on('user_blocked', (data) => {
            if (data.blocked_id == currentUser.id) {
                alert('Вас заблокировал пользователь');
                if (currentChat && currentChat.other_user_id == data.blocker_id) {
                    currentChat = null;
                    document.getElementById('messagesArea').innerHTML = '<div class="empty-state"><i class="fas fa-ban"></i><h3>Вас заблокировали</h3></div>';
                    document.getElementById('messageInputArea').style.display = 'none';
                }
            }
        });

        socket.on('incoming_call', (data) => {
            showIncomingCallModal(data);
        });

        socket.on('new_call', (data) => {
            notifyMessage('Входящий звонок', `${data.caller_name || 'Пользователь'} · ${data.call_type === 'video' ? 'видеозвонок' : 'звонок'}`, null, 'call', data.room_id || data.call_id);
        });

        socket.on('message_pinned', (data) => {
            if (currentChat && data.scope_id) {
                const c = getCurrentChatScope();
                if (c && c.scope === data.scope && String(c.scopeId) === String(data.scope_id)) {
                    showPinnedForCurrentChat();
                }
            }
        });

        socket.on('poll_update', (data) => {
            if (data && data.poll_id) {
                refreshPollBlock(data.poll_id);
            }
        });

        socket.on('messages_read', (data) => {
            if (!data.message_ids) return;
            data.message_ids.forEach(id => {
                const meta = document.querySelector(`.message[data-message-id="${id}"] .message-meta i`);
                if (meta) {
                    meta.className = 'fas fa-check-double';
                    meta.style.color = '#53d769';
                }
            });
            if (data.chat_id && currentChat && currentChatType === 'personal' && currentChat.chat_id == data.chat_id) {
                refreshMessages();
            }
        });

        socket.on('group_deleted', (data) => {
            if (currentChat && currentChatType === 'group' && currentChat.id == data.group_id) {
                currentChat = null;
                document.getElementById('messagesArea').innerHTML = '<div class="empty-state"><i class="fas fa-users-slash"></i><h3>Группа удалена</h3></div>';
                document.getElementById('messageInputArea').style.display = 'none';
            }
            loadGroupsList();
        });

        socket.on('channel_deleted', (data) => {
            if (currentChat && currentChatType === 'channel' && currentChat.id == data.channel_id) {
                currentChat = null;
                document.getElementById('messagesArea').innerHTML = '<div class="empty-state"><i class="fas fa-bullhorn"></i><h3>Канал удалён</h3></div>';
                document.getElementById('messageInputArea').style.display = 'none';
            }
            loadChannelsList();
        });
    }

    function refreshMessages() {
        if (!currentChat) return Promise.resolve();

        let url;
        if (currentChatType === 'group') url = `/api/get_group/${currentChat.id}`;
        else if (currentChatType === 'channel') url = `/api/get_channel/${currentChat.id}`;
        else url = `/api/get_chat/${currentChat.other_user_id || currentChat.id}`;

        return fetch(url)
            .then(r => r.json())
            .then(d => {
                if (d.messages) {
                    const messages = document.querySelectorAll('.message[data-message-id]');
                    let lastId = 0;
                    if (messages.length > 0) {
                        lastId = parseInt(messages[messages.length - 1].dataset.messageId) || 0;
                    }

                    const newMessages = d.messages.filter(m => m.id > lastId);
                    newMessages.forEach(m => displayMessage(m));

                    if (currentChatType === 'personal' && d.other_user) {
                        document.getElementById('chatUserStatus').textContent = formatLastSeen(d.other_user.last_seen);
                    }
                }
            })
            .catch(() => {});
    }

    function loadUserAvatar() {
        fetch('/api/get_my_user')
            .then(r => r.json())
            .then(u => {
                const av = document.getElementById('burgerAvatar');
                if (u.avatar) {
                    av.innerHTML = `<img src="/${u.avatar}" style="width: 100%; height: 100%; object-fit: cover;">`;
                } else {
                    av.innerHTML = `<span style="font-size: 24px; font-weight: 600; color: white;">${(u.display_name || u.username)[0].toUpperCase()}</span>`;
                }
                document.getElementById('burgerUserName').textContent = u.display_name || u.username;
            });
    }

    function loadSettings() {
        fetch('/api/get_settings')
            .then(r => r.json())
            .then(s => {
                if (s.theme === 'dark') {
                    document.body.classList.add('dark');
                }
                if (s.font_size) {
                    document.body.style.fontSize = s.font_size + 'px';
                }
                if (s.bubble_radius) {
                    document.documentElement.style.setProperty('--bubble-radius', s.bubble_radius + 'px');
                }
                if (s.my_message_color) {
                    document.documentElement.style.setProperty('--primary-color', s.my_message_color);
                }
                if (s.wallpaper_image) {
                    document.getElementById('messagesArea').style.backgroundImage = `url('/${s.wallpaper_image}')`;
                }
            });
    }

