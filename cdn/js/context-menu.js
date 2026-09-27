// ===== КОНТЕКСТНОЕ МЕНЮ С РЕАКЦИЯМИ =====
    // ===== КОНТЕКСТНОЕ МЕНЮ С РЕАКЦИЯМИ =====
function removeContextMenu(menu) {
    if (menu) menu.remove();
    const bd = document.getElementById('contextMenuBackdrop');
    if (bd) bd.remove();
}

function showContextMenu(e, id, content, el) {
    e.preventDefault();
    e.stopPropagation();

    // Если ID временный, не показываем полное меню
    if (typeof id === 'string' && id.startsWith('temp_')) {
        showToast('Сообщение ещё отправляется...');
        return;
    }

    currentContextMessage = { id, content, element: el };

    const existing = document.getElementById('combinedContextMenu');
    removeContextMenu(existing);

    const rect = el.getBoundingClientRect();
    const isOutgoing = el.classList.contains('outgoing');

    // Получаем данные о файле из элемента сообщения
    const filePath = el.querySelector('.message-media img, .message-media video, .message-file') ?
                     (el.querySelector('.message-media img')?.src?.replace(window.location.origin + '/', '') ||
                      el.querySelector('.message-media video')?.src?.replace(window.location.origin + '/', '') ||
                      el.querySelector('.message-file')?.getAttribute('onclick')?.match(/downloadFile\('([^']+)'/)?.[1]?.replace('/', '') ||
                      '') : '';

    const isAudio = el.querySelector('.message-file i.fa-file-audio') ||
                    el.querySelector('.message-file')?.textContent?.includes('.mp3') ||
                    el.querySelector('.message-file')?.textContent?.includes('.wav') ||
                    el.querySelector('.message-file')?.textContent?.includes('.ogg');

    const hasFile = el.querySelector('.message-media img, .message-media video, .message-file') !== null;
    const isImage = el.querySelector('.message-media img') !== null;
    const isTextOnly = !hasFile && content && content.length > 0;

    const combinedMenu = document.createElement('div');
    combinedMenu.id = 'combinedContextMenu';
    combinedMenu.style.position = 'fixed';
    combinedMenu.style.zIndex = '9999';
    combinedMenu.style.backgroundColor = 'var(--bg-primary)';
    combinedMenu.style.borderRadius = '12px';
    combinedMenu.style.boxShadow = 'var(--shadow-xl)';
    combinedMenu.style.border = '1px solid var(--border-color)';
    combinedMenu.style.width = '250px';
    combinedMenu.style.overflow = 'hidden';

    const reactionsSection = document.createElement('div');
    reactionsSection.style.display = 'flex';
    reactionsSection.style.justifyContent = 'space-around';
    reactionsSection.style.padding = '8px 6px';
    reactionsSection.style.gap = '2px';
    reactionsSection.style.backgroundColor = 'var(--bg-secondary)';

    QUICK_REACTIONS.forEach(r => {
        const btn = document.createElement('span');
        btn.textContent = r;
        btn.style.fontSize = '20px';
        btn.style.cursor = 'pointer';
        btn.style.padding = '4px 6px';
        btn.style.borderRadius = '8px';
        btn.style.transition = 'all 0.15s';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.minWidth = '28px';

        btn.onmouseover = () => {
            btn.style.backgroundColor = 'var(--primary-color)';
            btn.style.color = 'white';
            btn.style.transform = 'scale(1.1)';
        };
        btn.onmouseout = () => {
            btn.style.backgroundColor = 'transparent';
            btn.style.color = 'var(--text-primary)';
            btn.style.transform = 'scale(1)';
        };
        btn.onclick = (event) => {
            event.stopPropagation();
            addReaction(id, r);
            removeContextMenu(combinedMenu);
        };
        reactionsSection.appendChild(btn);
    });

    const moreBtn = document.createElement('span');
    moreBtn.innerHTML = '<i class="fas fa-plus"></i>';
    moreBtn.style.fontSize = '16px';
    moreBtn.style.cursor = 'pointer';
    moreBtn.style.padding = '4px 6px';
    moreBtn.style.borderRadius = '8px';
    moreBtn.style.transition = 'all 0.15s';
    moreBtn.style.display = 'flex';
    moreBtn.style.alignItems = 'center';
    moreBtn.style.justifyContent = 'center';
    moreBtn.style.minWidth = '28px';
    moreBtn.style.backgroundColor = 'var(--bg-tertiary)';

    moreBtn.onmouseover = () => {
        moreBtn.style.backgroundColor = 'var(--primary-color)';
        moreBtn.style.color = 'white';
        moreBtn.style.transform = 'scale(1.1)';
    };
    moreBtn.onmouseout = () => {
        moreBtn.style.backgroundColor = 'var(--bg-tertiary)';
        moreBtn.style.color = 'var(--text-primary)';
        moreBtn.style.transform = 'scale(1)';
    };
    moreBtn.onclick = (event) => {
        event.stopPropagation();
        showAllReactions(id, el);
        removeContextMenu(combinedMenu);
    };
    reactionsSection.appendChild(moreBtn);

    combinedMenu.appendChild(reactionsSection);

    const divider = document.createElement('div');
    divider.style.height = '1px';
    divider.style.backgroundColor = 'var(--border-color)';
    combinedMenu.appendChild(divider);

    const contextSection = document.createElement('div');
    contextSection.style.padding = '4px 0';

    const menuItems = [];

    // Если есть текстовое содержимое - показываем стандартные кнопки
    if (isTextOnly || (!hasFile && content)) {
        menuItems.push(
            { icon: 'fa-reply', text: 'Ответить', action: 'reply' },
            { icon: 'fa-copy', text: 'Копировать', action: 'copy' },
            { icon: 'fa-share', text: 'Переслать', action: 'forward' },
            { icon: 'fa-edit', text: 'Редактировать', action: 'edit' }
        );
    } else {
        // Для файлов добавляем Reply и Forward
        menuItems.push(
            { icon: 'fa-reply', text: 'Ответить', action: 'reply' },
            { icon: 'fa-share', text: 'Переслать', action: 'forward' }
        );
    }

    // Кнопка Скачать - показывается только для файлов (фото, видео, документы, аудио)
    if (hasFile) {
        menuItems.push({
            icon: 'fa-download',
            text: 'Скачать',
            action: 'download',
            special: true
        });
    }

    // Кнопка Добавить в профиль - только для аудио
    if (isAudio) {
        menuItems.push({
            icon: 'fa-music',
            text: 'Добавить в профиль',
            action: 'add_to_profile',
            special: true
        });
    }

    // Сохранить картинку в мои стикеры (только для фото)
    if (isImage && filePath && typeof saveStickerFromMessage === 'function') {
        menuItems.push({
            icon: 'fa-sticker',
            text: 'В мои стикеры',
            action: 'save_sticker',
            special: true
        });
    }

    // Закрепить/открепить
    menuItems.push({
        icon: 'fa-thumbtack',
        text: (currentPinnedMessage && String(currentPinnedMessage.id) === String(id)) ? 'Открепить' : 'Закрепить',
        action: 'pin'
    });

    // Кнопка Удалить - всегда в конце
    menuItems.push({
        icon: 'fa-trash-alt',
        text: 'Удалить',
        action: 'delete',
        danger: true
    });

    menuItems.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.style.padding = '8px 12px';
        menuItem.style.cursor = 'pointer';
        menuItem.style.display = 'flex';
        menuItem.style.alignItems = 'center';
        menuItem.style.gap = '10px';
        menuItem.style.color = item.danger ? 'var(--danger-color)' : 'var(--text-primary)';
        menuItem.style.transition = 'background 0.15s';
        menuItem.style.fontSize = '13px';
        menuItem.innerHTML = `<i class="fas ${item.icon}" style="width: 18px; font-size: 14px; color: ${item.danger ? 'var(--danger-color)' : (item.special ? '#34c759' : 'var(--primary-color)')};"></i><span>${item.text}</span>`;

        menuItem.onmouseover = () => { menuItem.style.backgroundColor = 'var(--bg-hover)'; };
        menuItem.onmouseout = () => { menuItem.style.backgroundColor = 'transparent'; };
        menuItem.onclick = (event) => {
            event.stopPropagation();
            contextAction(item.action);
            removeContextMenu(combinedMenu);
        };
        contextSection.appendChild(menuItem);
    });

    combinedMenu.appendChild(contextSection);

    // Позиционирование меню
    const mobile = (typeof isMobile === 'function') && isMobile();
    const menuWidth = 250;
    const menuHeight = 60 + (menuItems.length * 36) + (QUICK_REACTIONS.length > 0 ? 44 : 0);

    if (mobile) {
        // На мобильных — полноэкранный bottom-sheet с подложкой
        const bd = document.createElement('div');
        bd.id = 'contextMenuBackdrop';
        bd.style.cssText = 'position:fixed;inset:0;';
        bd.onclick = () => removeContextMenu(combinedMenu);
        document.body.appendChild(bd);
        combinedMenu.style.left = '0';
        combinedMenu.style.top = 'auto';
        combinedMenu.style.right = '0';
        combinedMenu.style.bottom = '0';
    } else {
        let left = rect.right + 10;
        let top = rect.top;

        if (left + menuWidth > window.innerWidth - 10) {
            left = rect.left - menuWidth - 10;
        }
        if (left < 10) left = 10;
        if (top + menuHeight > window.innerHeight - 10) {
            top = window.innerHeight - menuHeight - 10;
        }
        if (top < 10) top = 10;

        combinedMenu.style.left = left + 'px';
        combinedMenu.style.top = top + 'px';
    }

    document.body.appendChild(combinedMenu);

    requestAnimationFrame(() => {
        combinedMenu.style.opacity = '1';
    });

    const closeHandler = function(e) {
        if (!combinedMenu.contains(e.target)) {
            removeContextMenu(combinedMenu);
            document.removeEventListener('click', closeHandler);
        }
    };

    setTimeout(() => {
        document.addEventListener('click', closeHandler);
    }, 10);
}


    function showAllReactions(messageId, element) {
        const existing = document.getElementById('allReactionsMenu');
        if (existing) existing.remove();

        const rect = element.getBoundingClientRect();
        const isOutgoing = element.classList.contains('outgoing');

        const allMenu = document.createElement('div');
        allMenu.id = 'allReactionsMenu';
        allMenu.style.position = 'fixed';
        allMenu.style.display = 'grid';
        allMenu.style.gridTemplateColumns = 'repeat(5, 1fr)';
        allMenu.style.gap = '6px';
        allMenu.style.padding = '12px';
        allMenu.style.backgroundColor = 'var(--bg-primary)';
        allMenu.style.borderRadius = '12px';
        allMenu.style.boxShadow = 'var(--shadow-xl)';
        allMenu.style.zIndex = '10000';
        allMenu.style.border = '1px solid var(--border-color)';
        allMenu.style.width = '280px';

        AVAILABLE_REACTIONS.forEach(r => {
            const btn = document.createElement('span');
            btn.textContent = r;
            btn.style.fontSize = '24px';
            btn.style.cursor = 'pointer';
            btn.style.padding = '6px 8px';
            btn.style.borderRadius = '8px';
            btn.style.transition = 'all 0.15s';
            btn.style.textAlign = 'center';

            btn.onmouseover = () => {
                btn.style.backgroundColor = 'var(--bg-hover)';
                btn.style.transform = 'scale(1.15)';
            };
            btn.onmouseout = () => {
                btn.style.backgroundColor = 'transparent';
                btn.style.transform = 'scale(1)';
            };
            btn.onclick = (e) => {
                e.stopPropagation();
                addReaction(messageId, r);
                allMenu.remove();
            };
            allMenu.appendChild(btn);
        });

        const menuWidth = 280;
        const menuHeight = 200;

        let left, top;

        if (isOutgoing) {
            left = rect.left - menuWidth - 10;
            top = rect.top;
            if (left < 10) {
                left = rect.right + 10;
            }
        } else {
            left = rect.right + 10;
            top = rect.top;
            if (left + menuWidth > window.innerWidth - 10) {
                left = rect.left - menuWidth - 10;
            }
        }

        if (left < 10) left = 10;
        if (left + menuWidth > window.innerWidth - 10) {
            left = window.innerWidth - menuWidth - 10;
        }

        if (top + menuHeight > window.innerHeight - 10) {
            top = window.innerHeight - menuHeight - 10;
        }
        if (top < 10) top = 10;

        allMenu.style.left = left + 'px';
        allMenu.style.top = top + 'px';

        document.body.appendChild(allMenu);

        allMenu.style.opacity = '0';
        allMenu.style.transform = 'scale(0.95)';
        allMenu.style.transition = 'opacity 0.15s, transform 0.15s';

        requestAnimationFrame(() => {
            allMenu.style.opacity = '1';
            allMenu.style.transform = 'scale(1)';
        });

        const closeHandler = function(e) {
            if (!allMenu.contains(e.target)) {
                allMenu.style.opacity = '0';
                allMenu.style.transform = 'scale(0.95)';
                setTimeout(() => allMenu.remove(), 150);
                document.removeEventListener('click', closeHandler);
            }
        };

        setTimeout(() => {
            document.addEventListener('click', closeHandler);
        }, 10);
    }

    function contextAction(action) {
    if (action === 'reply') {
        currentReplyMessage = {
            id: currentContextMessage.id,
            content: currentContextMessage.content,
            element: currentContextMessage.element
        };

        const msgElement = currentContextMessage.element;
        const isOutgoing = msgElement.classList.contains('outgoing');
        const senderName = isOutgoing ? 'Вы' : (currentChat?.name || 'Пользователь');

        document.getElementById('replyPreviewName').textContent = `Ответ для ${senderName}`;
        document.getElementById('replyPreviewText').textContent = currentContextMessage.content?.substring(0, 50) || 'Медиафайл';
        document.getElementById('replyPreview').style.display = 'flex';
        document.getElementById('messageInput').focus();
    } else if (action === 'copy') {
        navigator.clipboard?.writeText(currentContextMessage.content || '');
        showToast('Скопировано!');
    } else if (action === 'forward') {
        openForwardModal();
    } else if (action === 'edit') {
        const newContent = prompt('Редактировать сообщение:', currentContextMessage.content);
        if (newContent && newContent !== currentContextMessage.content) {
            fetch('/api/edit_message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message_id: currentContextMessage.id, content: newContent })
            }).then(() => {
                const msgElement = currentContextMessage.element;
                const textDiv = msgElement.querySelector('.message-text');
                if (textDiv) textDiv.textContent = newContent;
            });
        }
    } else if (action === 'download') {
        // Скачивание файла
        downloadCurrentFile();
    } else if (action === 'add_to_profile') {
        // Добавляет аудио в профиль
        addAudioToProfile();
    } else if (action === 'save_sticker') {
        // Сохраняет картинку из сообщения в мои стикеры
        const el = currentContextMessage && currentContextMessage.element;
        const raw = (el && (el.querySelector('.message-media img')?.getAttribute('src') ||
                            el.querySelector('.message-media video')?.getAttribute('src'))) || '';
        const cleanPath = raw.replace(window.location.origin + '/', '').replace(/^\/+/, '');
        if (cleanPath) saveStickerFromMessage(cleanPath);
        else showToast('Не удалось определить картинку');
    } else if (action === 'pin') {
        pinCurrentMessage();
    } else if (action === 'delete') {
        if (confirm('Удалить сообщение?')) {
            fetch('/api/delete_message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message_id: currentContextMessage.id, delete_for_all: false })
            }).then(() => {
                currentContextMessage.element.remove();
            });
        }
    }
}


// ===== СКАЧИВАНИЕ ФАЙЛА =====
function downloadCurrentFile() {
    const msgElement = currentContextMessage.element;

    // Ищем путь к файлу
    let filePath = '';
    let fileName = 'file';

    // Проверяем изображение
    const img = msgElement.querySelector('.message-media img');
    if (img) {
        filePath = img.src.replace(window.location.origin + '/', '');
        fileName = filePath.split('/').pop() || 'image.jpg';
    }

    // Проверяем видео
    const video = msgElement.querySelector('.message-media video');
    if (video) {
        filePath = video.src.replace(window.location.origin + '/', '');
        fileName = filePath.split('/').pop() || 'video.mp4';
    }

    // Проверяем файл
    const fileDiv = msgElement.querySelector('.message-file');
    if (fileDiv) {
        const onclickAttr = fileDiv.getAttribute('onclick');
        if (onclickAttr) {
            const match = onclickAttr.match(/downloadFile\('([^']+)',\s*'([^']*)'\)/);
            if (match) {
                filePath = match[1].replace(/^\//, '');
                fileName = match[2] || filePath.split('/').pop() || 'file';
            }
        }
    }

    if (!filePath) {
        showToast('Не удалось найти файл для скачивания');
        return;
    }

    // Создаем ссылку для скачивания
    const downloadUrl = '/api/download_file/' + filePath.replace(/\//g, '--');

    // Создаем временную ссылку и кликаем по ней
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('📥 Скачивание началось!');
}

// ===== ДОБАВЛЕНИЕ АУДИО В ПРОФИЛЬ =====
function addAudioToProfile() {
    const msgElement = currentContextMessage.element;

    // Ищем информацию об аудиофайле
    let filePath = '';
    let fileName = '';

    const fileDiv = msgElement.querySelector('.message-file');
    if (fileDiv) {
        const onclickAttr = fileDiv.getAttribute('onclick');
        if (onclickAttr) {
            const match = onclickAttr.match(/downloadFile\('([^']+)',\s*'([^']*)'\)/);
            if (match) {
                filePath = match[1].replace(/^\//, '');
                fileName = match[2] || filePath.split('/').pop() || 'audio.mp3';
            }
        }
    }

    if (!filePath) {
        showToast('Не удалось найти аудиофайл');
        return;
    }

    // Извлекаем название и исполнителя из имени файла
    let title = fileName.replace(/\.[^/.]+$/, ''); // Убираем расширение
    let artist = 'Неизвестен';

    // Пробуем разделить по дефису (как "Artist - Title")
    if (title.includes(' - ')) {
        const parts = title.split(' - ');
        artist = parts[0].trim();
        title = parts[1].trim();
    } else if (title.includes('-')) {
        const parts = title.split('-');
        artist = parts[0].trim();
        title = parts[1].trim();
    }

    // Показываем диалог подтверждения
    if (confirm(`Добавить песню "${title}" от "${artist}" в ваш профиль?`)) {
        // Копируем файл в плейлист
        fetch('/api/playlist/add_from_message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_path: filePath,
                title: title,
                artist: artist,
                file_name: fileName
            })
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                showToast('🎵 Песня добавлена в профиль!');
            } else {
                // Если API не существует, пробуем через FormData
                addAudioViaFormData(filePath, title, artist, fileName);
            }
        })
        .catch(() => {
            // Пробуем альтернативный метод
            addAudioViaFormData(filePath, title, artist, fileName);
        });
    }
}

function addAudioViaFormData(filePath, title, artist, fileName) {
    // Создаем FormData с информацией о файле
    const formData = new FormData();
    formData.append('file_path', filePath);
    formData.append('title', title);
    formData.append('artist', artist);

    // Отправляем на сервер
    fetch('/api/playlist/add_from_message', {
        method: 'POST',
        body: formData
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            showToast('🎵 Песня добавлена в профиль!');
        } else {
            showToast('Не удалось добавить песню. Попробуйте через плейлист.');
        }
    })
    .catch(err => {
        console.error('Error adding audio:', err);
        showToast('Ошибка при добавлении песни');
    });
}




    function  removeUnsubscribeButton() {
        const btn = document.getElementById('unsubscribeChannelBtn');
        if (btn) btn.remove();
    }

    function unsubscribeFromCurrentChannel() {
        if (!currentChat || currentChatType !== 'channel') return;

        if (confirm('Отписаться от канала?')) {
            fetch(`/api/unsubscribe_channel/${currentChat.id}`, { method: 'POST' })
                .then(r => r.json())
                .then(d => {
                    if (d.success) {
                        removeUnsubscribeButton();
                        currentChat = null;
                        document.getElementById('messageInputArea').style.display = 'none';
                        document.getElementById('messagesArea').innerHTML = '<div class="empty-state"><i class="fas fa-bullhorn"></i><h3>Вы отписались от канала</h3></div>';
                        document.getElementById('chatUserName').textContent = 'Выберите чат';
                        document.getElementById('chatUserAvatar').innerHTML = '<span>?</span>';
                        document.getElementById('chatUserStatus').textContent = '';
                        loadChannelsList();
                        renderChatsList();
                    }
                });
        }
    }

    function displayMessages(msgs) {
    const c = document.getElementById('messagesArea');

    if (!msgs || !msgs.length) {
        c.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-comment-dots"></i>
                <p>Нет сообщений</p>
            </div>
        `;
        return;
    }

    let html = '';
    let lastDate = null;

    msgs.forEach(m => {
        const d = new Date(m.created_at).toDateString();
        if (d !== lastDate) {
            lastDate = d;
            const dateText = d === new Date().toDateString() ? 'Сегодня' :
                            d === new Date(Date.now() - 86400000).toDateString() ? 'Вчера' :
                            new Date(m.created_at).toLocaleDateString([], { day: 'numeric', month: 'long' });
            html += `<div class="message-date-divider"><span>${dateText}</span></div>`;
        }
        html += formatMessage(m);
    });

    c.innerHTML = html;
    c.classList.remove('msg-list-in');
    void c.offsetWidth;
    c.classList.add('msg-list-in');
    c.scrollTop = c.scrollHeight;

    // Загружаем реакции
    msgs.forEach(m => {
        if (m.id) {
            fetch(`/api/get_reactions/${m.id}`)
                .then(r => r.json())
                .then(d => {
                    const msgDiv = document.querySelector(`.message[data-message-id="${m.id}"]`);
                    if (msgDiv) {
                        updateMessageReactions(msgDiv, d.reactions);
                    }
                });
        }
    });
}

    function formatMessage(m) {
    const out = m.sender_id == currentUser.id;
    let content = '';

    if (m.forwarded_from_user_id || m.forwarded_from_username) {
        const fname = m.forwarded_is_banned ? 'Удалённый аккаунт' : (m.forwarded_from_display_name || m.forwarded_from_username || 'Пользователь');
        const favatar = m.forwarded_avatar
            ? `<img src="/${m.forwarded_avatar}" onerror="this.style.display='none';">`
            : `<span>${escapeHtml(String(fname)[0].toUpperCase())}</span>`;
        const fclick = m.forwarded_from_user_id
            ? `onclick="openUserProfileModal(${m.forwarded_from_user_id})"`
            : '';
        content += `<div class="forward-indicator" ${fclick}><div class="forward-avatar">${favatar}</div><div class="forward-info"><i class="fas fa-share"></i> Переслано от <strong>${escapeHtml(fname)}</strong></div></div>`;
    }

    if (m.reply_content || m.reply_to_id) {
        const replyName = m.reply_display_name || m.reply_username || 'Пользователь';
        const replyText = m.reply_content || 'Сообщение';
        content += `<div class="reply-indicator" onclick="scrollToMessage(${m.reply_to_id})"><strong>${escapeHtml(replyName)}</strong><br>${escapeHtml(replyText.substring(0, 50))}${replyText.length > 50 ? '...' : ''}</div>`;
    }

    if (m.file_path && m.file_type !== 'contact') {
        const ext = m.file_name ? m.file_name.split('.').pop().toLowerCase() : '';
        const imageFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'ico', 'svg'];
        const videoFormats = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'm4v'];
        const audioFormats = ['mp3', 'wav', 'ogg', 'opus', 'm4a', 'flac', 'aac', 'weba'];

        let actualFileType = m.file_type;
        if (!actualFileType || actualFileType === 'document') {
            if (imageFormats.includes(ext)) actualFileType = 'photo';
            else if (videoFormats.includes(ext)) actualFileType = 'video';
            else if (audioFormats.includes(ext)) actualFileType = 'audio';
        }

        if (actualFileType === 'photo' || imageFormats.includes(ext)) {
            content += `<div class="message-media" onclick="openImageViewer('/${m.file_path}', '${escapeHtml(m.file_name || '')}', ${m.id || 'null'})"><img src="/${m.file_path}" alt="photo" loading="lazy"></div>`;
        } else if (actualFileType === 'video' || videoFormats.includes(ext)) {
            content += `<div class="message-media" onclick="openImageViewer('/${m.file_path}', '${escapeHtml(m.file_name || '')}', ${m.id || 'null'})"><video src="/${m.file_path}" controls preload="metadata"></video></div>`;
        } else if (actualFileType === 'audio' || audioFormats.includes(ext)) {
            content += `<div class="message-media"><audio src="/${m.file_path}" controls preload="metadata"></audio></div>`;
        } else {
            let icon = 'fa-file';
            if (ext === 'pdf') icon = 'fa-file-pdf';
            else if (ext === 'doc' || ext === 'docx') icon = 'fa-file-word';
            else if (ext === 'xls' || ext === 'xlsx') icon = 'fa-file-excel';
            else if (ext === 'zip' || ext === 'rar') icon = 'fa-file-archive';
            else if (ext === 'txt') icon = 'fa-file-alt';

            content += `<div class="message-file" onclick="downloadFile('/${m.file_path}', '${escapeHtml(m.file_name || 'Файл')}')"><i class="fas ${icon}"></i><div class="message-file-info"><div class="message-file-name">${escapeHtml(m.file_name || 'Файл')}</div>${m.file_size ? `<div class="message-file-size">${formatFileSize(m.file_size)}</div>` : ''}</div><i class="fas fa-download"></i></div>`;
        }
    }

    if (m.content) {
        const sc = storyCardFromContent(m.content);
        if (sc) {
            content += storyCoverCardHTML(sc, 'История', 'Смотреть и ответить');
            const rest = m.content.slice(sc.offset).replace(/^\s*(\r?\n)+/, '').trim();
            if (rest) content += `<div class="message-text">${escapeHtml(rest)}</div>`;
        } else {
            content += `<div class="message-text">${escapeHtml(m.content)}</div>`;
        }
    }

    if (m.poll) content += renderPollHTML(m.poll);

    const editedBadge = m.edited_at ? '<span style="font-size:9px; margin-right:4px;">изм.</span>' : '';

    // Экранируем контент для безопасного использования в onclick
    const escapedContent = (m.content || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

    return `
        <div class="message ${out ? 'outgoing' : 'incoming'}" data-message-id="${m.id || 'temp'}" oncontextmenu="showContextMenu(event, ${m.id || 'temp'}, '${escapedContent}', this)">
            <div class="message-bubble">
                ${content}
                <div class="message-reactions"></div>
                <div class="message-meta">
                    ${editedBadge}
                    <span>${new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    ${out ? (m.is_read ? '<i class="fas fa-check-double" style="font-size:8px;color:#53d769;"></i>' : '<i class="fas fa-check" style="font-size:8px;"></i>') : ''}
                </div>
            </div>
        </div>
    `;
}

    function displayMessage(m) {
    // Проверяем, не существует ли уже такое сообщение
    if (m.id && !m.is_temp) {
        const existingMsg = document.querySelector(`.message[data-message-id="${m.id}"]`);
        if (existingMsg) return;
    }

    const c = document.getElementById('messagesArea');
    if (c.querySelector('.empty-state')) c.innerHTML = '';

    const messageHtml = formatMessage(m);
    c.insertAdjacentHTML('beforeend', messageHtml);

    // Анимация появления нового сообщения (один раз)
    const newMsg = c.lastElementChild;
    if (newMsg && newMsg.classList.contains('message')) {
        newMsg.classList.add('msg-new');
        newMsg.addEventListener('animationend', () => newMsg.classList.remove('msg-new'), { once: true });
    }

    // Превью ссылок в сообщении
    loadLinkPreviews(c.lastElementChild);

    // Для временных сообщений добавляем класс
    if (m.is_temp) {
        const tempElement = c.lastElementChild;
        if (tempElement) {
            tempElement.classList.add('temp-message');
            tempElement.style.opacity = '0.7';
        }
    }

    c.scrollTop = c.scrollHeight;
}

    function scrollToMessage(messageId) {
        const msgDiv = document.querySelector(`.message[data-message-id="${messageId}"]`);
        if (msgDiv) {
            msgDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
            msgDiv.style.backgroundColor = 'rgba(102, 126, 234, 0.2)';
            setTimeout(() => msgDiv.style.backgroundColor = '', 2000);
        }
    }

    function updateMessageReactions(msgDiv, reactions) {
        let reactionsContainer = msgDiv.querySelector('.message-reactions');
        if (!reactionsContainer) {
            reactionsContainer = document.createElement('div');
            reactionsContainer.className = 'message-reactions';
            msgDiv.querySelector('.message-bubble').appendChild(reactionsContainer);
        }

        if (!reactions || !reactions.length) {
            reactionsContainer.innerHTML = '';
            return;
        }

        reactionsContainer.innerHTML = reactions.map(r =>
            `<span class="reaction-badge" onclick="addReaction(${msgDiv.dataset.messageId}, '${r.reaction}')">
                ${r.reaction} ${r.count}
            </span>`
        ).join('');
    }

    function showBlockedBanner(show) {
        let banner = document.getElementById('blockedBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'blockedBanner';
            banner.style.cssText = 'display:none;align-items:center;justify-content:center;gap:8px;padding:10px 16px;background:rgba(255,59,48,0.12);color:#ff6b61;font-size:13px;text-align:center;';
            const inputArea = document.getElementById('messageInputArea');
            if (inputArea) inputArea.parentNode.insertBefore(banner, inputArea);
        }
        banner.style.display = show ? 'flex' : 'none';
        if (show) banner.innerHTML = '<i class="fas fa-ban"></i> Этот пользователь заблокировал вас — сообщения доставляться не будут, аватарка и статус скрыты.';
    }

