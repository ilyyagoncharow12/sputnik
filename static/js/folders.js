// ===== СИСТЕМА ПАПОК ЧАТОВ =====

let foldersData = [];
let currentFolderId = null;
let selectedChatsForFolder = [];
let isFolderLoading = false;

// ===== ЗАГРУЗКА ПАПОК =====
function loadFolders() {
    if (isFolderLoading) return;
    isFolderLoading = true;

    fetch('/api/folders/get')
        .then(r => r.json())
        .then(data => {
            foldersData = data.folders || [];
            renderFoldersUI();

            const savedFolderId = localStorage.getItem('currentFolderId');

            if (savedFolderId && foldersData.some(f => f.id == savedFolderId)) {
                selectFolder(parseInt(savedFolderId));
            } else if (foldersData.length > 0) {
                const firstCustomFolder = foldersData.find(f => !f.is_default);
                if (firstCustomFolder) {
                    selectFolder(firstCustomFolder.id);
                } else {
                    const defaultFolder = foldersData.find(f => f.is_default);
                    if (defaultFolder) {
                        selectFolder(defaultFolder.id);
                    }
                }
            }
        })
        .catch(err => console.error('Error loading folders:', err))
        .finally(() => {
            isFolderLoading = false;
        });
}

// ===== ОТОБРАЖЕНИЕ ПАПОК В ИНТЕРФЕЙСЕ =====
function renderFoldersUI() {
    const tabsContainer = document.querySelector('.chat-tabs');
    if (!tabsContainer) return;

    // Очищаем контейнер полностью
    tabsContainer.innerHTML = '';

    // Добавляем только папки
    foldersData.forEach(folder => {
        const tab = document.createElement('button');
        tab.className = `chat-tab ${currentFolderId === folder.id ? 'active' : ''}`;
        tab.setAttribute('data-folder-id', folder.id);

        let iconClass = 'fa-folder';
        if (folder.is_default) {
            iconClass = 'fa-cloud';
        }

        tab.innerHTML = `
            <i class="fas ${iconClass}"></i>
            <span style="font-size: 12px; max-width: 60px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${folder.name}</span>
        `;

        tab.onclick = () => selectFolder(folder.id);
        tabsContainer.appendChild(tab);
    });
}

// ===== ВЫБОР ПАПКИ =====
function selectFolder(folderId) {
    currentFolderId = folderId;
    localStorage.setItem('currentFolderId', folderId);
    renderFoldersUI();

    const folder = foldersData.find(f => f.id === folderId);
    const isDefaultFolder = folder && folder.is_default;

    sessionStorage.setItem('inFolder', 'true');

    if (isDefaultFolder) {
        // Для папки "Все чаты" загружаем ВСЕ чаты
        fetch('/api/get_chats_list')
            .then(r => r.json())
            .then(chats => {
                const formattedChats = chats.map(chat => ({
                    chat_id: chat.chat_id || chat.id || chat.group_id || chat.channel_id,
                    chat_type: chat.chat_type || 'personal',
                    chat_name: chat.name || 'Чат',
                    chat_avatar: chat.avatar || '',
                    last_message: chat.last_message || '',
                    last_message_time: chat.last_message_time || '',
                    other_user_id: chat.other_user_id || chat.id,
                    unread_count: chat.unread_count || 0,
                    is_pinned: chat.is_pinned || false
                }));
                renderChatsListForFolder(formattedChats);
            })
            .catch(err => console.error('Error loading all chats:', err));
    } else {
        // Для пользовательских папок загружаем ТОЛЬКО чаты из папки
        fetch(`/api/folders/get/${folderId}`)
            .then(r => r.json())
            .then(data => {
                if (data.chats && data.chats.length > 0) {
                    renderChatsListForFolder(data.chats);
                } else {
                    const container = document.getElementById('chatsList');
                    container.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-folder-open"></i>
                            <p>В папке "${folder.name}" нет чатов</p>
                            <button class="modal-btn modal-btn-primary" onclick="openFolderEditModal(${folderId})" style="margin-top: 12px;">
                                <i class="fas fa-plus"></i> Добавить чаты
                            </button>
                        </div>
                    `;
                }
            })
            .catch(err => console.error('Error loading folder chats:', err));
    }
}

// ===== ОТОБРАЖЕНИЕ ЧАТОВ В ПАПКЕ =====
function renderChatsListForFolder(chats) {
    const container = document.getElementById('chatsList');
    if (!container) return;

    const folder = foldersData.find(f => f.id === currentFolderId);
    const isDefaultFolder = folder && folder.is_default;

    container.innerHTML = '';

    if (!chats || !chats.length) {
        if (isDefaultFolder) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comment-dots"></i>
                    <p>У вас пока нет чатов</p>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-folder-open"></i>
                    <p>В папке "${folder ? folder.name : ''}" нет чатов</p>
                    <button class="modal-btn modal-btn-primary" onclick="openFolderEditModal(${currentFolderId})" style="margin-top: 12px;">
                        <i class="fas fa-plus"></i> Добавить чаты
                    </button>
                </div>
            `;
        }
        return;
    }

    const isActive = (chat) => {
        if (typeof currentChat === 'undefined' || !currentChat) return false;

        if (chat.chat_type === 'personal') {
            return currentChat.other_user_id == chat.other_user_id;
        } else if (chat.chat_type === 'group') {
            return currentChat.id == chat.chat_id;
        } else if (chat.chat_type === 'channel') {
            return currentChat.id == chat.chat_id;
        }
        return false;
    };

    container.innerHTML = chats.map(chat => {
        let chatType = chat.chat_type || 'personal';
        let chatId = chat.chat_id || chat.id;
        let name = chat.chat_name || chat.name || 'Чат';
        let avatar = chat.chat_avatar || chat.avatar || '';
        let lastMessage = chat.last_message || '';
        let lastMessageTime = chat.last_message_time || '';
        let unreadCount = chat.unread_count || 0;
        let isPinned = chat.is_pinned || false;
        let otherUserId = chat.other_user_id || null;

        let avatarClass = '';
        let avatarContent = '';

        if (chatType === 'group') {
            avatarClass = 'group';
            avatarContent = avatar ?
                `<img src="/${avatar}" style="width: 100%; height: 100%; object-fit: cover;">` :
                `<span>👥</span>`;
        } else if (chatType === 'channel') {
            avatarClass = 'channel';
            avatarContent = avatar ?
                `<img src="/${avatar}" style="width: 100%; height: 100%; object-fit: cover;">` :
                `<span>📢</span>`;
        } else {
            avatarContent = avatar ?
                `<img src="/${avatar}" style="width: 100%; height: 100%; object-fit: cover;">` :
                `<span>${(name || '?')[0].toUpperCase()}</span>`;
        }

        const active = isActive(chat);

        let openParams = '';

        if (chatType === 'personal') {
            let targetId = otherUserId || chatId;
            if (targetId === currentUser.id) {
                targetId = currentUser.id;
            }
            openParams = `${targetId}, 'personal'`;
        } else if (chatType === 'group') {
            openParams = `${chatId}, 'group'`;
        } else if (chatType === 'channel') {
            openParams = `${chatId}, 'channel'`;
        }

        return `
            <div class="chat-item ${isPinned ? 'pinned' : ''} ${active ? 'active' : ''}"
                 onclick="openChatFromFolder(${openParams})"
                 style="height: 68px; min-height: 68px; display: flex; align-items: center; padding: 12px 16px; gap: 12px; box-sizing: border-box; cursor: pointer;">
                <div class="chat-avatar ${avatarClass}"
                     style="width: 52px; height: 52px; min-width: 52px; min-height: 52px; border-radius: 50%; flex-shrink: 0; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                    ${avatarContent}
                </div>
                <div class="chat-info" style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;">
                    <div class="chat-header-row" style="display: flex; justify-content: space-between; align-items: center;">
                        <span class="chat-name" style="font-weight: 600; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">${escapeHtml(name)}</span>
                        <span class="chat-time" style="font-size: 11px; flex-shrink: 0; margin-left: 8px;">${formatChatTime(lastMessageTime)}</span>
                    </div>
                    <div class="chat-preview" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        <span class="chat-message" style="font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;">
                            ${lastMessage || 'Нет сообщений'}
                        </span>
                        ${unreadCount > 0 ? `<span class="chat-badge">${unreadCount}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ===== ОТКРЫТИЕ ЧАТА ИЗ ПАПКИ =====
function openChatFromFolder(id, type) {
    console.log('📁 Открытие чата из папки:', { id, type });

    const currentFolder = currentFolderId;

    if (type === 'personal') {
        openChat(id, 'personal');
    } else if (type === 'group') {
        openChat(id, 'group');
    } else if (type === 'channel') {
        openChat(id, 'channel');
    }

    setTimeout(() => {
        if (currentFolderId !== currentFolder) {
            selectFolder(currentFolder);
        } else {
            refreshFolderChats();
        }
    }, 1000);
}

// ===== ОБНОВЛЕНИЕ ЧАТОВ В ПАПКЕ =====
function refreshFolderChats() {
    if (currentFolderId) {
        const folder = foldersData.find(f => f.id === currentFolderId);
        if (folder && !folder.is_default) {
            fetch(`/api/folders/get/${currentFolderId}`)
                .then(r => r.json())
                .then(data => {
                    if (data.chats && data.chats.length > 0) {
                        renderChatsListForFolder(data.chats);
                    }
                })
                .catch(err => console.error('Error refreshing folder chats:', err));
        }
    }
}

// ===== ОТКРЫТИЕ МЕНЕДЖЕРА ПАПОК =====
function openFolderManager() {
    closeBurgerMenu();

    fetch('/api/folders/get')
        .then(r => r.json())
        .then(data => {
            const folders = data.folders || [];
            const hasReachedLimit = folders.filter(f => !f.is_default).length >= 3;

            let html = `
                <div style="background: #0f0f0f; border-radius: 24px; overflow: hidden; color: white; max-width: 500px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #2c2c2e;">
                        <div style="font-size: 18px; font-weight: 600;">Папки с чатами</div>
                        <button onclick="closeModal('tempModal')" style="background: none; border: none; color: #8e8e93; font-size: 20px; cursor: pointer;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div style="padding: 20px;">
            `;

            html += `
                <button onclick="openCreateFolderModal()" style="width: 100%; padding: 14px; background: #1c1c1e; border: none; border-radius: 14px; color: #007aff; font-size: 15px; font-weight: 500; cursor: pointer; transition: 0.2s; margin-bottom: 16px; font-family: var(--font-family);"
                        onmouseover="this.style.background='#2c2c2e'" onmouseout="this.style.background='#1c1c1e'">
                    <i class="fas fa-folder-plus"></i> Создать папку
                    ${hasReachedLimit ? ' (лимит 3 папки)' : ''}
                </button>
            `;

            if (hasReachedLimit) {
                html += `
                    <div style="background: #2c2c2e; border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; border-left: 3px solid #ff9500;">
                        <div style="font-size: 13px; color: #ff9500;">
                            <i class="fas fa-exclamation-triangle"></i> Ваш лимит на добавление папок исчерпан.
                            Удалите какую-нибудь папку, чтобы создать другую.
                        </div>
                    </div>
                `;
            }

            html += `<div style="max-height: 400px; overflow-y: auto;">`;

            folders.forEach((folder) => {
                const isDefault = folder.is_default;
                const folderId = folder.id;

                html += `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #1c1c1e; border-radius: 12px; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 12px; flex: 1; cursor: pointer;" onclick="selectFolderFromManager(${folderId})">
                            <div style="width: 40px; height: 40px; border-radius: 50%; background: ${isDefault ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'var(--primary-gradient)'}; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">
                                <i class="fas ${isDefault ? 'fa-cloud' : 'fa-folder'}"></i>
                            </div>
                            <div style="flex: 1;">
                                <div style="font-weight: 500; font-size: 14px;">${escapeHtml(folder.name)}</div>
                                <div style="font-size: 11px; color: #8e8e93;">${folder.chats ? folder.chats.length : 0} чатов</div>
                            </div>
                        </div>

                        <div style="display: flex; gap: 6px;">
                            ${!isDefault ? `
                                <button onclick="openFolderEditModal(${folderId})" style="background: none; border: none; color: #8e8e93; cursor: pointer; padding: 4px 8px; transition: 0.2s;" onmouseover="this.style.color='#007aff'" onmouseout="this.style.color='#8e8e93'">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button onclick="deleteFolder(${folderId})" style="background: none; border: none; color: #8e8e93; cursor: pointer; padding: 4px 8px; transition: 0.2s;" onmouseover="this.style.color='#ff3b30'" onmouseout="this.style.color='#8e8e93'">
                                    <i class="fas fa-trash"></i>
                                </button>
                            ` : `
                                <div style="color: #8e8e93; font-size: 11px; padding: 4px 8px;">Нельзя изменить</div>
                            `}
                        </div>
                    </div>
                `;
            });

            html += `
                        </div>
                    </div>
                </div>
            `;


            // ===== ЗАГРУЗКА ПРИ СТАРТЕ =====
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(loadFolders, 500);
});

            document.getElementById('tempModalBody').innerHTML = html;
            openModal('tempModal');
        })
        .catch(err => console.error('Error opening folder manager:', err));
}

// ===== ОТКРЫТИЕ МОДАЛКИ СОЗДАНИЯ ПАПКИ =====
function openCreateFolderModal() {
    // Проверяем лимит
    fetch('/api/folders/get')
        .then(r => r.json())
        .then(data => {
            const userFolders = data.folders || [];
            const customFolders = userFolders.filter(f => !f.is_default);

            if (customFolders.length >= 3) {
                showToast('❌ Лимит на добавление папок исчерпан (максимум 3). Удалите какую-нибудь папку.');
                return;
            }

            // Загружаем доступные чаты
            fetch('/api/folders/accessible_chats')
                .then(r => r.json())
                .then(data => {
                    const allChats = data.chats || [];
                    selectedChatsForFolder = [];

                    let html = `
                        <div style="background: #0f0f0f; border-radius: 24px; overflow: hidden; color: white; max-width: 500px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #2c2c2e;">
                                <div style="font-size: 18px; font-weight: 600;">Новая папка</div>
                                <button onclick="closeModal('tempModal')" style="background: none; border: none; color: #8e8e93; font-size: 20px; cursor: pointer;">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                            <div style="padding: 20px;">
                                <div style="margin-bottom: 16px;">
                                    <label style="display: block; font-size: 13px; color: #8e8e93; margin-bottom: 6px;">Название папки</label>
                                    <input type="text" id="newFolderName" style="width: 100%; padding: 12px; background: #1c1c1e; border: 1px solid #2c2c2e; border-radius: 12px; color: white; font-size: 15px; font-family: var(--font-family);" placeholder="Введите название папки...">
                                </div>

                                <div style="margin-bottom: 16px;">
                                    <div style="font-size: 13px; color: #8e8e93; margin-bottom: 8px;">Выбранные чаты: <span id="selectedCount">0</span></div>
                                    <div style="max-height: 300px; overflow-y: auto; border: 1px solid #2c2c2e; border-radius: 12px;">
                    `;

                    // Группируем по типу
                    const personal = allChats.filter(c => c.chat_type === 'personal' && c.name !== 'Избранное');
                    const groups = allChats.filter(c => c.chat_type === 'group');
                    const channels = allChats.filter(c => c.chat_type === 'channel');

                    if (personal.length > 0) {
                        html += `<div style="padding: 8px 12px; font-size: 11px; color: #8e8e93; font-weight: 600; border-bottom: 1px solid #2c2c2e;">ЧАТЫ</div>`;
                        personal.forEach(chat => {
                            html += `
                                <div style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-bottom: 1px solid #2c2c2e; cursor: pointer;"
                                     onclick="toggleChatSelection(${chat.chat_id}, '${chat.chat_type}', '${escapeHtml(chat.name)}', '${chat.avatar || ''}')"
                                     onmouseover="this.style.background='#1c1c1e'" onmouseout="this.style.background='transparent'">
                                    <div style="width: 24px; height: 24px; border: 2px solid #2c2c2e; border-radius: 6px; display: flex; align-items: center; justify-content: center;" id="check-${chat.chat_id}">
                                        <i class="fas fa-check" style="display: none; color: #007aff; font-size: 14px;"></i>
                                    </div>
                                    <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--primary-gradient); display: flex; align-items: center; justify-content: center; color: white; font-size: 14px; overflow: hidden;">
                                        ${chat.avatar ? `<img src="/${chat.avatar}" style="width: 100%; height: 100%; object-fit: cover;">` : `<span>${(chat.name || '?')[0].toUpperCase()}</span>`}
                                    </div>
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-weight: 500; font-size: 14px;">${escapeHtml(chat.name)}</div>
                                        <div style="font-size: 11px; color: #8e8e93;">${chat.type_label || 'Чат'}</div>
                                    </div>
                                </div>
                            `;
                        });
                    }

                    if (groups.length > 0) {
                        html += `<div style="padding: 8px 12px; font-size: 11px; color: #8e8e93; font-weight: 600; border-bottom: 1px solid #2c2c2e;">ГРУППЫ</div>`;
                        groups.forEach(chat => {
                            html += `
                                <div style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-bottom: 1px solid #2c2c2e; cursor: pointer;"
                                     onclick="toggleChatSelection(${chat.chat_id}, '${chat.chat_type}', '${escapeHtml(chat.name)}', '${chat.avatar || ''}')"
                                     onmouseover="this.style.background='#1c1c1e'" onmouseout="this.style.background='transparent'">
                                    <div style="width: 24px; height: 24px; border: 2px solid #2c2c2e; border-radius: 6px; display: flex; align-items: center; justify-content: center;" id="check-${chat.chat_id}">
                                        <i class="fas fa-check" style="display: none; color: #007aff; font-size: 14px;"></i>
                                    </div>
                                    <div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #10b981, #059669); display: flex; align-items: center; justify-content: center; color: white; font-size: 14px; overflow: hidden;">
                                        ${chat.avatar ? `<img src="/${chat.avatar}" style="width: 100%; height: 100%; object-fit: cover;">` : `<span>👥</span>`}
                                    </div>
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-weight: 500; font-size: 14px;">${escapeHtml(chat.name)}</div>
                                        <div style="font-size: 11px; color: #8e8e93;">Группа</div>
                                    </div>
                                </div>
                            `;
                        });
                    }

                    if (channels.length > 0) {
                        html += `<div style="padding: 8px 12px; font-size: 11px; color: #8e8e93; font-weight: 600; border-bottom: 1px solid #2c2c2e;">КАНАЛЫ</div>`;
                        channels.forEach(chat => {
                            html += `
                                <div style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-bottom: 1px solid #2c2c2e; cursor: pointer;"
                                     onclick="toggleChatSelection(${chat.chat_id}, '${chat.chat_type}', '${escapeHtml(chat.name)}', '${chat.avatar || ''}')"
                                     onmouseover="this.style.background='#1c1c1e'" onmouseout="this.style.background='transparent'">
                                    <div style="width: 24px; height: 24px; border: 2px solid #2c2c2e; border-radius: 6px; display: flex; align-items: center; justify-content: center;" id="check-${chat.chat_id}">
                                        <i class="fas fa-check" style="display: none; color: #007aff; font-size: 14px;"></i>
                                    </div>
                                    <div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #f59e0b, #d97706); display: flex; align-items: center; justify-content: center; color: white; font-size: 14px; overflow: hidden;">
                                        ${chat.avatar ? `<img src="/${chat.avatar}" style="width: 100%; height: 100%; object-fit: cover;">` : `<span>📢</span>`}
                                    </div>
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-weight: 500; font-size: 14px;">${escapeHtml(chat.name)}</div>
                                        <div style="font-size: 11px; color: #8e8e93;">Канал</div>
                                    </div>
                                </div>
                            `;
                        });
                    }

                    html += `
                                    </div>
                                </div>

                                <div style="display: flex; gap: 8px; margin-top: 16px;">
                                    <button onclick="closeModal('tempModal')" style="flex: 1; padding: 12px; background: #1c1c1e; border: none; border-radius: 14px; color: #8e8e93; font-size: 15px; font-weight: 500; cursor: pointer; font-family: var(--font-family);">
                                        Отмена
                                    </button>
                                    <button onclick="saveFolder()" style="flex: 1; padding: 12px; background: #007aff; border: none; border-radius: 14px; color: white; font-size: 15px; font-weight: 500; cursor: pointer; font-family: var(--font-family);">
                                        Создать папку
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;

                    document.getElementById('tempModalBody').innerHTML = html;
                    openModal('tempModal');
                })
                .catch(err => console.error('Error loading accessible chats:', err));
        })
        .catch(err => console.error('Error checking folder limit:', err));
}

// ===== ПЕРЕКЛЮЧЕНИЕ ВЫБОРА ЧАТА =====
function toggleChatSelection(chatId, chatType, chatName, chatAvatar) {
    const checkBox = document.getElementById(`check-${chatId}`);
    const checkIcon = checkBox.querySelector('.fa-check');

    // Проверяем, выбран ли уже чат
    const index = selectedChatsForFolder.findIndex(c => c.chat_id === chatId);

    if (index !== -1) {
        // Удаляем из выбранных
        selectedChatsForFolder.splice(index, 1);
        checkBox.style.borderColor = '#2c2c2e';
        checkIcon.style.display = 'none';
    } else {
        // Добавляем в выбранные - ВАЖНО: сохраняем chat_type
        selectedChatsForFolder.push({
            chat_id: chatId,
            chat_type: chatType,  // ВАЖНО: передаем тип чата
            chat_name: chatName,
            chat_avatar: chatAvatar || ''
        });
        checkBox.style.borderColor = '#007aff';
        checkIcon.style.display = 'block';
    }

    // Обновляем счетчик
    const counter = document.getElementById('selectedCount');
    if (counter) {
        counter.textContent = selectedChatsForFolder.length;
    }
}

// ===== СОХРАНЕНИЕ ПАПКИ =====
function saveFolder() {
    const name = document.getElementById('newFolderName').value.trim();
    if (!name) {
        showToast('❌ Введите название папки');
        return;
    }

    if (selectedChatsForFolder.length === 0) {
        showToast('❌ Выберите хотя бы один чат');
        return;
    }

    // Формируем список ID чатов
    const chatIds = selectedChatsForFolder.map(c => c.chat_id);

    console.log('📁 Creating folder:', { name, chatIds });

    fetch('/api/folders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: name,
            chat_ids: chatIds
        })
    })
    .then(r => r.json())
    .then(data => {
        console.log('📁 Response:', data);
        if (data.success) {
            closeModal('tempModal');
            // Сбрасываем выбранные чаты
            selectedChatsForFolder = [];
            // Перезагружаем папки
            loadFolders();
            showToast('✅ Папка создана!');
        } else if (data.error === 'limit_reached') {
            showToast('❌ Лимит на добавление папок исчерпан (максимум 3). Удалите какую-нибудь папку.');
        } else if (data.error === 'folder_exists') {
            showToast('❌ Папка с таким названием уже существует');
        } else {
            showToast('❌ Ошибка при создании папки: ' + (data.error || 'неизвестная ошибка'));
        }
    })
    .catch(err => {
        console.error('❌ Error saving folder:', err);
        showToast('❌ Ошибка при создании папки');
    });
}

// ===== РЕДАКТИРОВАНИЕ ПАПКИ =====
function openFolderEditModal(folderId) {
    // Получаем данные папки
    fetch('/api/folders/get')
        .then(r => r.json())
        .then(data => {
            const folder = data.folders.find(f => f.id === folderId);
            if (!folder) return;

            // Загружаем доступные чаты
            fetch('/api/folders/accessible_chats')
                .then(r => r.json())
                .then(data => {
                    const allChats = data.chats || [];
                    const existingChatIds = (folder.chats || []).map(c => c.chat_id);
                    selectedChatsForFolder = (folder.chats || []).map(c => ({
                        chat_id: c.chat_id,
                        chat_type: c.chat_type,
                        chat_name: c.chat_name,
                        chat_avatar: c.chat_avatar || ''
                    }));

                    let html = `
                        <div style="background: #0f0f0f; border-radius: 24px; overflow: hidden; color: white; max-width: 500px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #2c2c2e;">
                                <div style="font-size: 18px; font-weight: 600;">Редактировать папку</div>
                                <button onclick="closeModal('tempModal')" style="background: none; border: none; color: #8e8e93; font-size: 20px; cursor: pointer;">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                            <div style="padding: 20px;">
                                <div style="margin-bottom: 16px;">
                                    <label style="display: block; font-size: 13px; color: #8e8e93; margin-bottom: 6px;">Название папки</label>
                                    <input type="text" id="editFolderName" style="width: 100%; padding: 12px; background: #1c1c1e; border: 1px solid #2c2c2e; border-radius: 12px; color: white; font-size: 15px; font-family: var(--font-family);" value="${escapeHtml(folder.name)}">
                                </div>

                                <div style="margin-bottom: 16px;">
                                    <div style="font-size: 13px; color: #8e8e93; margin-bottom: 8px;">Выбранные чаты: <span id="editSelectedCount">${selectedChatsForFolder.length}</span></div>
                                    <div style="max-height: 300px; overflow-y: auto; border: 1px solid #2c2c2e; border-radius: 12px;">
                    `;

                    // Группируем по типу
                    const personal = allChats.filter(c => c.chat_type === 'personal' && c.name !== 'Избранное');
                    const groups = allChats.filter(c => c.chat_type === 'group');
                    const channels = allChats.filter(c => c.chat_type === 'channel');

                    const renderChat = (chat) => {
                        const isSelected = existingChatIds.includes(chat.chat_id);
                        return `
                            <div style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-bottom: 1px solid #2c2c2e; cursor: pointer;"
                                 onclick="toggleEditChatSelection(${chat.chat_id}, '${chat.chat_type}', '${escapeHtml(chat.name)}', '${chat.avatar || ''}')"
                                 onmouseover="this.style.background='#1c1c1e'" onmouseout="this.style.background='transparent'">
                                <div style="width: 24px; height: 24px; border: 2px solid ${isSelected ? '#007aff' : '#2c2c2e'}; border-radius: 6px; display: flex; align-items: center; justify-content: center;" id="edit-check-${chat.chat_id}">
                                    <i class="fas fa-check" style="display: ${isSelected ? 'block' : 'none'}; color: #007aff; font-size: 14px;"></i>
                                </div>
                                <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--primary-gradient); display: flex; align-items: center; justify-content: center; color: white; font-size: 14px; overflow: hidden;">
                                    ${chat.avatar ? `<img src="/${chat.avatar}" style="width: 100%; height: 100%; object-fit: cover;">` : `<span>${(chat.name || '?')[0].toUpperCase()}</span>`}
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-weight: 500; font-size: 14px;">${escapeHtml(chat.name)}</div>
                                    <div style="font-size: 11px; color: #8e8e93;">${chat.type_label || 'Чат'}</div>
                                </div>
                            </div>
                        `;
                    };

                    if (personal.length > 0) {
                        html += `<div style="padding: 8px 12px; font-size: 11px; color: #8e8e93; font-weight: 600; border-bottom: 1px solid #2c2c2e;">ЧАТЫ</div>`;
                        personal.forEach(chat => html += renderChat(chat));
                    }

                    if (groups.length > 0) {
                        html += `<div style="padding: 8px 12px; font-size: 11px; color: #8e8e93; font-weight: 600; border-bottom: 1px solid #2c2c2e;">ГРУППЫ</div>`;
                        groups.forEach(chat => html += renderChat(chat));
                    }

                    if (channels.length > 0) {
                        html += `<div style="padding: 8px 12px; font-size: 11px; color: #8e8e93; font-weight: 600; border-bottom: 1px solid #2c2c2e;">КАНАЛЫ</div>`;
                        channels.forEach(chat => html += renderChat(chat));
                    }

                    html += `
                                    </div>
                                </div>

                                <div style="display: flex; gap: 8px; margin-top: 16px;">
                                    <button onclick="closeModal('tempModal')" style="flex: 1; padding: 12px; background: #1c1c1e; border: none; border-radius: 14px; color: #8e8e93; font-size: 15px; font-weight: 500; cursor: pointer; font-family: var(--font-family);">
                                        Отмена
                                    </button>
                                    <button onclick="updateFolder(${folderId})" style="flex: 1; padding: 12px; background: #007aff; border: none; border-radius: 14px; color: white; font-size: 15px; font-weight: 500; cursor: pointer; font-family: var(--font-family);">
                                        Сохранить
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;

                    document.getElementById('tempModalBody').innerHTML = html;
                    openModal('tempModal');
                })
                .catch(err => console.error('Error loading accessible chats:', err));
        })
        .catch(err => console.error('Error loading folder data:', err));
}

// ===== ПЕРЕКЛЮЧЕНИЕ ВЫБОРА ЧАТА ПРИ РЕДАКТИРОВАНИИ =====
function toggleEditChatSelection(chatId, chatType, chatName, chatAvatar) {
    const checkBox = document.getElementById(`edit-check-${chatId}`);
    const checkIcon = checkBox.querySelector('.fa-check');

    const index = selectedChatsForFolder.findIndex(c => c.chat_id === chatId);

    if (index !== -1) {
        selectedChatsForFolder.splice(index, 1);
        checkBox.style.borderColor = '#2c2c2e';
        checkIcon.style.display = 'none';
    } else {
        selectedChatsForFolder.push({
            chat_id: chatId,
            chat_type: chatType,
            chat_name: chatName,
            chat_avatar: chatAvatar || ''
        });
        checkBox.style.borderColor = '#007aff';
        checkIcon.style.display = 'block';
    }

    document.getElementById('editSelectedCount').textContent = selectedChatsForFolder.length;
}

// ===== ОБНОВЛЕНИЕ ПАПКИ =====
function updateFolder(folderId) {
    const name = document.getElementById('editFolderName').value.trim();
    if (!name) {
        showToast('❌ Введите название папки');
        return;
    }

    // Создаем копию выбранных чатов
    const chatIds = selectedChatsForFolder.map(c => c.chat_id);
    const chatTypes = selectedChatsForFolder.map(c => c.chat_type);

    // Показываем индикатор загрузки
    const saveBtn = document.querySelector('button[onclick*="updateFolder"]');
    if (saveBtn) {
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сохранение...';
        saveBtn.disabled = true;
    }

    fetch('/api/folders/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            folder_id: folderId,
            name: name,
            chat_ids: chatIds
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            closeModal('tempModal');
            loadFolders();
            showToast('✅ Папка обновлена!');
        } else {
            showToast('❌ Ошибка при обновлении папки: ' + (data.error || 'неизвестная ошибка'));
        }
    })
    .catch(err => {
        console.error('Error updating folder:', err);
        showToast('❌ Ошибка при обновлении папки');
    })
    .finally(() => {
        if (saveBtn) {
            saveBtn.innerHTML = 'Сохранить';
            saveBtn.disabled = false;
        }
    });
}

// ===== УДАЛЕНИЕ ПАПКИ =====
function deleteFolder(folderId) {
    if (!confirm('Вы уверены, что хотите удалить эту папку?')) return;

    fetch('/api/folders/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: folderId })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            closeModal('tempModal');
            loadFolders();
            showToast('🗑️ Папка удалена');
        } else {
            showToast('❌ Нельзя удалить папку "Все чаты"');
        }
    })
    .catch(err => {
        console.error('Error deleting folder:', err);
        showToast('❌ Ошибка при удалении папки');
    });
}

// ===== ВЫБОР ПАПКИ ИЗ МЕНЕДЖЕРА =====
function selectFolderFromManager(folderId) {
    closeModal('tempModal');
    selectFolder(folderId);
}

// ===== ЗАГРУЗКА ПРИ СТАРТЕ =====
document.addEventListener('DOMContentLoaded', function() {
    // Загружаем папки после загрузки чатов
    setTimeout(loadFolders, 500);
});

// ===== ФУНКЦИЯ: ОБНОВЛЕНИЕ ЧАТОВ В ПАПКЕ ПОСЛЕ ОТКРЫТИЯ ЧАТА =====
function refreshFolderChats() {
    if (currentFolderId) {
        const folder = foldersData.find(f => f.id === currentFolderId);
        if (folder && !folder.is_default) {
            // Обновляем список чатов в папке
            fetch(`/api/folders/get/${currentFolderId}`)
                .then(r => r.json())
                .then(data => {
                    if (data.chats && data.chats.length > 0) {
                        renderChatsListForFolder(data.chats);
                    }
                })
                .catch(err => console.error('Error refreshing folder chats:', err));
        }
    }
}



// ===== ПРИНУДИТЕЛЬНОЕ СОХРАНЕНИЕ ТЕКУЩЕЙ ПАПКИ =====
function forceKeepFolder() {
    if (currentFolderId) {
        sessionStorage.setItem('currentFolderId', currentFolderId);
        localStorage.setItem('currentFolderId', currentFolderId);
    }
}



function switchTab(tab) {
    currentTab = tab;
    currentFolderId = null; // Сбрасываем выбранную папку при переключении на обычные табы
    localStorage.removeItem('currentFolderId');
    renderFoldersUI();

    if (tab === 'groups') loadGroupsList();
    else if (tab === 'channels') loadChannelsList();
    else loadChatsList();
}


