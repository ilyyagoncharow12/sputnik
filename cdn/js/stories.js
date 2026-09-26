    // ===== ПРЕДПРОСМОТР ФАЙЛОВ =====
    function getFileType(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        const imageFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'ico', 'svg'];
        const videoFormats = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'm4v'];
        const audioFormats = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];

        if (imageFormats.includes(ext)) return 'image';
        if (videoFormats.includes(ext)) return 'video';
        if (audioFormats.includes(ext)) return 'audio';
        return 'file';
    }

    function showFilePreview(files) {
        let html = '';
        let totalSize = 0;

        files.forEach((file, index) => {
            totalSize += file.size;
            const fileType = getFileType(file);

            if (fileType === 'image') {
                html += `
                    <div class="preview-item">
                        <img src="${URL.createObjectURL(file)}" style="max-width: 100%; max-height: 300px; border-radius: 12px;">
                        <div class="preview-info">
                            <span>📷 ${file.name}</span>
                            <span>${formatFileSize(file.size)}</span>
                        </div>
                    </div>
                `;
            } else if (fileType === 'video') {
                html += `
                    <div class="preview-item">
                        <video src="${URL.createObjectURL(file)}" controls style="max-width: 100%; max-height: 300px; border-radius: 12px;"></video>
                        <div class="preview-info">
                            <span>🎬 ${file.name}</span>
                            <span>${formatFileSize(file.size)}</span>
                        </div>
                    </div>
                `;
            } else if (fileType === 'audio') {
                html += `
                    <div class="preview-item">
                        <div style="padding: 20px; background: var(--bg-tertiary); border-radius: 12px;">
                            <i class="fas fa-music" style="font-size: 48px; color: var(--primary-color);"></i>
                            <audio src="${URL.createObjectURL(file)}" controls style="width: 100%; margin-top: 10px;"></audio>
                        </div>
                        <div class="preview-info">
                            <span>🎵 ${file.name}</span>
                            <span>${formatFileSize(file.size)}</span>
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="preview-item">
                        <div style="padding: 20px; background: var(--bg-tertiary); border-radius: 12px; text-align: center;">
                            <i class="fas fa-file" style="font-size: 48px; color: var(--text-muted);"></i>
                            <div style="margin-top: 10px;">
                                <strong>${file.name}</strong>
                                <div>${file.name.split('.').pop().toUpperCase()}</div>
                            </div>
                        </div>
                        <div class="preview-info">
                            <span>📄 ${file.name}</span>
                            <span>${formatFileSize(file.size)}</span>
                        </div>
                    </div>
                `;
            }
        });

        html += `
            <div class="preview-summary">
                <div>Всего файлов: ${files.length}</div>
                <div>Общий размер: ${formatFileSize(totalSize)}</div>
            </div>
            <div class="profile-field">
                <label>Подпись (необязательно)</label>
                <textarea id="previewCaption" class="modal-input" rows="2" placeholder="Добавьте подпись..."></textarea>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 12px;">
                <button class="modal-btn modal-btn-secondary" onclick="addMoreFiles()">
                    <i class="fas fa-plus"></i> Добавить еще
                </button>
            </div>
        `;

        document.getElementById('previewBody').innerHTML = html;
        document.getElementById('previewTitle').textContent = `Предпросмотр (${files.length} файл${files.length > 1 ? 'ов' : ''})`;
        openModal('filePreviewModal');
    }

    function addMoreFiles() {
        closeModal('filePreviewModal');
        document.getElementById('fileInput').click();
    }

    function sendFilesWithPreview() {
        const caption = document.getElementById('previewCaption')?.value || '';

        if (!currentChat) {
            alert('Выберите чат');
            return;
        }

        const fd = new FormData();

        if (currentChatType === 'personal') {
            fd.append('chat_id', currentChat.chat_id);
        } else if (currentChatType === 'group') {
            fd.append('group_id', currentChat.id);
        } else if (currentChatType === 'channel') {
            fd.append('channel_id', currentChat.id);
        }

        fd.append('content', caption);

        pendingFiles.forEach(file => {
            fd.append('files', file);
        });

        closeModal('filePreviewModal');
        document.getElementById('sendBtn').disabled = true;

        fetch('/api/send_message', { method: 'POST', body: fd })
            .then(r => r.json())
            .then(d => {
                if (d.success && d.messages) {
                    d.messages.forEach(msg => displayMessage(msg));
                    loadChatsList();
                }
                document.getElementById('sendBtn').disabled = false;
                pendingFiles = [];
            })
            .catch(() => {
                document.getElementById('sendBtn').disabled = false;
                alert('Ошибка при отправке');
            });
    }

    document.getElementById('fileInput').onchange = function(e) {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        pendingFiles = files;
        showFilePreview(files);
    };

    document.addEventListener('DOMContentLoaded', function() {
        if (typeof bindAttachInputs === 'function') bindAttachInputs();
    });

    // ===== ИСТОРИИ =====
    function loadStories() {
        fetch('/api/get_stories')
            .then(r => r.json())
            .then(s => {
                const c = document.getElementById('storiesContainer');
                const add = c.querySelector('.story-circle:first-child');
                c.innerHTML = '';
                c.appendChild(add);

                const usersMap = {};
                s.forEach(st => {
                    if (!usersMap[st.user_id]) {
                        usersMap[st.user_id] = [];
                    }
                    usersMap[st.user_id].push(st);
                });

                Object.entries(usersMap).forEach(([uid, sts]) => {
                    const st = sts[0];
                    const isMine = uid == currentUser.id;
                    const allSeen = sts.every(x => x.viewed);
                    const div = document.createElement('div');
                    div.className = 'story-circle';
                    div.onclick = () => openUserStories(uid);
                    div.innerHTML = `
                        <div class="story-avatar-wrapper ${isMine ? 'my-story' : ''} ${!isMine && allSeen ? 'seen' : ''}">
                            <div class="story-avatar">
                                ${st.avatar ? `<img src="/${st.avatar}">` : `<span>${st.username[0].toUpperCase()}</span>`}
                            </div>
                        </div>
                        <span class="story-username">${isMine ? 'Моя история' : st.username}</span>
                    `;
                    c.appendChild(div);
                });
            });
    }

    function openStoryUpload() {
        document.getElementById('storyFileInput').click();
    }

    document.getElementById('storyFileInput').onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const fd = new FormData();
        fd.append('file', file);
        fd.append('caption', '');
        fd.append('privacy', 'everyone');

        fetch('/api/upload_story', { method: 'POST', body: fd })
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    loadStories();
                    alert('История опубликована!');
                }
            });

        e.target.value = '';
    };

    document.getElementById('storyReplaceInput').onchange = function(e) {
        const file = e.target.files[0];
        if (!file || !currentReplaceStoryId) return;

        const fd = new FormData();
        fd.append('file', file);
        fd.append('caption', '');

        fetch(`/api/replace_story/${currentReplaceStoryId}`, { method: 'POST', body: fd })
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    if (typeof showToast === 'function') showToast('🔄 История заменена!');
                    closeStoryViewer();
                    loadStories();
                } else {
                    if (typeof showToast === 'function') showToast(d.error || 'Ошибка замены');
                }
            })
            .catch(err => {
                console.error('Error replacing story:', err);
                if (typeof showToast === 'function') showToast('Ошибка замены истории');
            });

        currentReplaceStoryId = null;
        e.target.value = '';
    };

    function openUserStories(uid) {
    fetch('/api/get_stories')
        .then(r => r.json())
        .then(s => {
            currentStories = s.filter(i => i.user_id == uid);
            currentStoryUserId = uid;
            currentStoryIndex = 0;

            if (currentStories.length) {
                showStoryModal();
            }
        });
}

    function showStoryModal() {
    const modal = document.getElementById('storyViewerModal');
    const story = currentStories[currentStoryIndex];

    if (!story) {
        console.error('No story found');
        return;
    }

    const isOwner = story.user_id == currentUser.id;

    // Отмечаем просмотр
    fetch('/api/story_view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_id: story.id })
    }).catch(err => console.error('Error marking view:', err));

    // Прогресс-бар
    const progressBar = document.getElementById('storyProgressBar');
    if (progressBar) {
        progressBar.innerHTML = currentStories.map((_, i) => `
            <div class="story-progress-segment">
                <div class="story-progress-fill" id="progress-${i}" style="width: 0%"></div>
            </div>
        `).join('');
    }

    // Аватар
    const avatarDiv = document.getElementById('storyUserAvatar');
    if (avatarDiv) {
        avatarDiv.innerHTML = story.avatar ?
            `<img src="/${story.avatar}" onerror="this.src='/static/avatar-swg/avatar1.jpg';">` :
            `<span>${(story.username || '?')[0].toUpperCase()}</span>`;
        avatarDiv.style.cursor = 'pointer';
        avatarDiv.onclick = (e) => {
            e.stopPropagation();
            openUserProfileModalFromStory(story.user_id);
        };
    }

    // Имя
    const userNameDiv = document.getElementById('storyUserName');
    if (userNameDiv) {
        userNameDiv.innerHTML = story.display_name || story.username || 'Пользователь';
        userNameDiv.style.cursor = 'pointer';
        userNameDiv.onclick = (e) => {
            e.stopPropagation();
            openUserProfileModalFromStory(story.user_id);
        };
    }

    // Время
    const timeDiv = document.getElementById('storyTime');
    if (timeDiv) {
        timeDiv.textContent = formatStoryTime(story.created_at);
    }

    // Подпись
    const captionDiv = document.getElementById('storyCaption');
    if (captionDiv) {
        captionDiv.textContent = story.caption || '';
    }

    // Медиа
    const mediaContainer = document.getElementById('storyMedia');
    if (mediaContainer) {
        mediaContainer.innerHTML = '';

        const videoFormats = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'm4v'];
        const ext = story.file_path ? story.file_path.split('.').pop().toLowerCase() : '';
        const isVideo = story.file_type === 'video' || videoFormats.includes(ext);

        if (isVideo) {
            const video = document.createElement('video');
            video.src = '/' + story.file_path;
            video.autoplay = true;
            video.loop = false;
            video.controls = false;
            video.style.maxWidth = '100%';
            video.style.maxHeight = '100%';
            video.style.objectFit = 'contain';
            video.onended = () => nextStory();
            video.onerror = () => nextStory();
            mediaContainer.appendChild(video);
        } else {
            const img = document.createElement('img');
            img.src = '/' + story.file_path;
            img.style.maxWidth = '100%';
            img.style.maxHeight = '100%';
            img.style.objectFit = 'contain';
            img.onerror = () => nextStory();
            mediaContainer.appendChild(img);
        }
    }

    // Кнопки действий
    const storyActions = document.getElementById('storyActions');
    if (storyActions) {
        if (isOwner) {
            storyActions.innerHTML = `
                <div class="story-owner-row">
                    <button class="story-action-btn owner-btn stats-btn" data-action="stats">
                        <i class="fas fa-eye"></i>
                        <span class="tip">Статистика</span>
                    </button>
                    <button class="story-action-btn owner-btn replace-btn" data-action="replace">
                        <i class="fas fa-sync-alt"></i>
                        <span class="tip">Заменить</span>
                    </button>
                    <button class="story-action-btn owner-btn share-btn" data-action="share">
                        <i class="fas fa-share-alt"></i>
                        <span class="tip">Поделиться</span>
                    </button>
                    <button class="story-action-btn owner-btn delete-btn" data-action="delete">
                        <i class="fas fa-trash"></i>
                        <span class="tip">Удалить</span>
                    </button>
                </div>
            `;
        } else {
            storyActions.innerHTML = `
                <button class="story-action-btn" data-action="like" id="storyLikeBtn">
                    <i class="fas fa-heart"></i>
                </button>
                <button class="story-action-btn" data-action="reply" id="storyReplyBtn">
                    <i class="fas fa-comment"></i>
                </button>
                <div class="story-reactions">
                    <span class="story-reaction" data-reaction="❤️">❤️</span>
                    <span class="story-reaction" data-reaction="🔥">🔥</span>
                    <span class="story-reaction" data-reaction="👎">👎</span>
                    <span class="story-reaction" data-reaction="👍">👍</span>
                </div>
            `;
        }
    }

    // Показываем модальное окно
    if (modal) {
        modal.classList.add('active');
        startStoryTimer();
    }

    }

    function startStoryTimer() {
        if (storyTimerInterval) clearInterval(storyTimerInterval);

        const story = currentStories[currentStoryIndex];
        const duration = story.file_type === 'video' ? 15000 : 5000;
        const startTime = Date.now();

        storyTimerInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min((elapsed / duration) * 100, 100);
            const progressFill = document.getElementById(`progress-${currentStoryIndex}`);
            if (progressFill) {
                progressFill.style.width = progress + '%';
            }

            if (progress >= 100) {
                clearInterval(storyTimerInterval);
                nextStory();
            }
        }, 50);
    }

    function nextStory() {
        if (currentStoryIndex < currentStories.length - 1) {
            currentStoryIndex++;
            showStoryModal();
        } else {
            closeStoryViewer();
        }
    }

    function previousStory() {
        if (currentStoryIndex > 0) {
            currentStoryIndex--;
            showStoryModal();
        }
    }

    function closeStoryViewer() {
        if (storyTimerInterval) {
            clearInterval(storyTimerInterval);
            storyTimerInterval = null;
        }
        document.getElementById('storyViewerModal').classList.remove('active');
        currentStories = [];
        currentStoryIndex = 0;
        currentStoryReplyId = null;
    }

    function suspendStoryViewer() {
        if (storyTimerInterval) {
            clearInterval(storyTimerInterval);
            storyTimerInterval = null;
        }
        document.getElementById('storyViewerModal').classList.remove('active');
    }

    function returnFromStoryStats() {
        const modal = document.getElementById('storyViewerModal');
        if (!modal) return;
        if (modal.classList.contains('active')) return;
        if (!currentStories || currentStories.length === 0) return;
        modal.classList.add('active');
        if (storyTimerInterval) clearInterval(storyTimerInterval);
        startStoryTimer();
    }

    function closeStoryStatsModal() {
        closeModal('tempModal');
        returnFromStoryStats();
    }

    function likeCurrentStory() {
    const story = currentStories[currentStoryIndex];
    const btn = document.getElementById('storyLikeBtn');

    if (btn) {
        btn.style.animation = 'heartBeat 0.3s ease';
        setTimeout(() => {
            if (btn) btn.style.animation = '';
        }, 300);
    }

    fetch('/api/story_like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_id: story.id })
    }).then(r => r.json()).then(d => {
        if (d.success) {
            console.log('Like added!');
        }
    }).catch(err => console.error('Like error:', err));
}

    function replyToCurrentStory() {
    const story = currentStories[currentStoryIndex];
    closeStoryViewer();
    openChat(story.user_id, 'personal');
}

    function reactToCurrentStory(reaction) {
    const story = currentStories[currentStoryIndex];
    const span = event.target;

    if (span) {
        span.style.animation = 'heartBeat 0.3s ease';
        setTimeout(() => {
            if (span) span.style.animation = '';
        }, 300);
    }

    fetch('/api/story_reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_id: story.id, reaction: reaction })
    }).then(r => r.json()).then(d => {
        if (d.success) {
            console.log('Reaction added:', reaction);
        }
    }).catch(err => console.error('Reaction error:', err));
}


function storyCoverCardHTML(story, title, sub) {
    const isVideo = story.file_type === 'video';
    return `
        <div class="story-msg-card" onclick="openSharedStory(${story.id})">
            <div class="story-card-cover">
                ${isVideo
                    ? `<i class="fas fa-film"></i>`
                    : (story.file_path ? `<img src="/${story.file_path}" loading="lazy">` : `<i class="fas fa-image"></i>`)}
            </div>
            <div class="story-card-info">
                <div class="story-card-title"><i class="fas fa-fire"></i> ${escapeHtml(title || 'История')}</div>
                <div class="story-card-sub">${escapeHtml(sub || '')}</div>
            </div>
            <i class="fas fa-play story-card-play"></i>
        </div>
    `;
}

function storyCardFromContent(content) {
    const m = content && content.match(/@@STORY:(\d+):([^:]+):([^@]+)@@/);
    if (!m) return null;
    return { id: +m[1], file_type: m[2], file_path: m[3], offset: m[0].length };
}

function openSharedStory(storyId) {
    fetch(`/api/get_story_info/${storyId}`)
        .then(r => r.json())
        .then(d => {
            if (!d || !d.story) {
                if (typeof showToast === 'function') showToast('История больше не доступна 😢');
                return;
            }
            currentStories = [d.story];
            currentStoryUserId = d.story.user_id;
            currentStoryIndex = 0;
            showStoryModal();
        })
        .catch(err => {
            console.error('Error opening shared story:', err);
            if (typeof showToast === 'function') showToast('Не удалось открыть историю');
        });
}

function openStoryReplyModal(story) {
    suspendStoryViewer();

    const isVideo = story.file_type === 'video';
    const cover = isVideo
        ? `<i class="fas fa-film"></i>`
        : (story.file_path ? `<img src="/${story.file_path}">` : `<i class="fas fa-image"></i>`);

    document.getElementById('tempModalBody').innerHTML = `
        <div class="story-reply-wrap">
            <div class="story-reply-header">
                <button onclick="closeModal('tempModal'); returnFromStoryStats()" class="story-stats-back-btn">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <div class="story-reply-cover">${cover}</div>
                <div style="flex:1; min-width:0;">
                    <div class="story-reply-title">Ответ на историю</div>
                    <div class="story-reply-sub">${escapeHtml(story.display_name || story.username || '')}</div>
                </div>
            </div>
            <textarea id="storyReplyInput" class="story-reply-textarea" placeholder="Напишите ответ автору..."></textarea>
            <button id="storyReplySendBtn" class="story-reply-btn" onclick="sendStoryReply(${story.id})">Отправить</button>
        </div>
    `;
    openModal('tempModal');

    const input = document.getElementById('storyReplyInput');
    if (input) {
        input.focus();
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendStoryReply(story.id);
            }
        });
    }
}

function sendStoryReply(storyId) {
    const input = document.getElementById('storyReplyInput');
    const btn = document.getElementById('storyReplySendBtn');
    if (!input || !btn) return;

    const text = input.value.trim();
    if (!text) return;

    btn.disabled = true;
    btn.textContent = 'Отправка...';

    fetch('/api/story_reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_id: storyId, reply_text: text })
    })
    .then(r => r.json())
    .then(d => {
        btn.disabled = false;
        if (d.success) {
            closeModal('tempModal');
            closeStoryViewer();
            openChat(d.chat_id ? currentStoryUserId : null, 'personal');

            if (d.message && typeof displayMessage === 'function') {
                displayMessage(d.message);
            }
            if (typeof showToast === 'function') showToast('📩 Ответ отправлен!');
        } else {
            btn.textContent = 'Отправить';
            if (typeof showToast === 'function') showToast(d.error || 'Ошибка отправки');
        }
    })
    .catch(err => {
        console.error('Error sending story reply:', err);
        btn.disabled = false;
        btn.textContent = 'Отправить';
        if (typeof showToast === 'function') showToast('Ошибка отправки ответа');
    });
}

function deleteCurrentStory(story) {
    if (!story) return;
    if (!confirm('Удалить эту историю?')) return;

    fetch('/api/delete_story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_id: story.id })
    })
    .then(r => r.json())
    .then(d => {
        if (d.success) {
            closeStoryViewer();
            loadStories();
            if (typeof showToast === 'function') showToast('🗑️ История удалена');
        } else {
            if (typeof showToast === 'function') showToast(d.error || 'Ошибка удаления');
        }
    })
    .catch(err => {
        console.error('Error deleting story:', err);
        if (typeof showToast === 'function') showToast('Ошибка удаления истории');
    });
}

function replaceCurrentStory(story) {
    const input = document.getElementById('storyReplaceInput');
    if (!input) return;
    currentReplaceStoryId = story.id;
    suspendStoryViewer();
    input.value = '';
    input.click();
}

function openShareStoryModal(story) {
    suspendStoryViewer();

    const groups = typeof groupsData !== 'undefined' ? groupsData : [];
    const channels = typeof channelsData !== 'undefined' ? channelsData : [];
    const chats = typeof chatsData !== 'undefined' ? chatsData : [];

    let listHtml = '';
    listHtml += '<div style="font-size:12px; color:#8e8e93; margin: 12px 0 8px; font-weight:600;">ЧАТЫ</div>';
    if (chats.length === 0 && groups.length === 0 && channels.length === 0) {
        listHtml += '<div style="padding:16px; text-align:center; color:#8e8e93; font-size:13px;">Нет доступных получателей</div>';
    }

    chats.forEach(chat => {
        if (chat.other_user_id) {
            listHtml += `
                <div style="display:flex; align-items:center; gap:12px; padding:10px; cursor:pointer; border-radius:12px;"
                     onclick="shareStoryTo(${story.id}, ${chat.other_user_id}, 'chat')"
                     onmouseover="this.style.background='#1c1c1e'" onmouseout="this.style.background='transparent'">
                    <div style="width:40px;height:40px;border-radius:50%;background:var(--primary-gradient);display:flex;align-items:center;justify-content:center;color:white;font-weight:600;font-size:16px;overflow:hidden;">
                        ${chat.avatar ? `<img src="/${chat.avatar}" style="width:100%;height:100%;object-fit:cover;">` : (chat.name || '?')[0].toUpperCase()}
                    </div>
                    <div style="flex:1;font-size:14px;font-weight:500;">${escapeHtml(chat.name)}</div>
                </div>`;
        }
    });

    if (groups.length > 0) {
        listHtml += '<div style="font-size:12px; color:#8e8e93; margin:12px 0 8px; font-weight:600;">ГРУППЫ</div>';
        groups.forEach(g => {
            listHtml += `
                <div style="display:flex; align-items:center; gap:12px; padding:10px; cursor:pointer; border-radius:12px;"
                     onclick="shareStoryTo(${story.id}, ${g.id}, 'group')"
                     onmouseover="this.style.background='#1c1c1e'" onmouseout="this.style.background='transparent'">
                    <div style="width:40px;height:40px;border-radius:50%;background:var(--primary-gradient);display:flex;align-items:center;justify-content:center;color:white;font-weight:600;">
                        ${(g.name || '?')[0].toUpperCase()}
                    </div>
                    <div style="flex:1;font-size:14px;font-weight:500;">${escapeHtml(g.name)}</div>
                </div>`;
        });
    }

    if (channels.length > 0) {
        listHtml += '<div style="font-size:12px; color:#8e8e93; margin:12px 0 8px; font-weight:600;">КАНАЛЫ</div>';
        channels.forEach(ch => {
            listHtml += `
                <div style="display:flex; align-items:center; gap:12px; padding:10px; cursor:pointer; border-radius:12px;"
                     onclick="shareStoryTo(${story.id}, ${ch.id}, 'channel')"
                     onmouseover="this.style.background='#1c1c1e'" onmouseout="this.style.background='transparent'">
                    <div style="width:40px;height:40px;border-radius:50%;background:var(--primary-gradient);display:flex;align-items:center;justify-content:center;color:white;font-weight:600;">
                        ${(ch.name || '?')[0].toUpperCase()}
                    </div>
                    <div style="flex:1;font-size:14px;font-weight:500;">${escapeHtml(ch.name)}</div>
                </div>`;
        });
    }

    document.getElementById('tempModalBody').innerHTML = `
        <div class="story-reply-wrap">
            <div class="story-reply-header">
                <button onclick="closeModal('tempModal'); returnFromStoryStats()" class="story-stats-back-btn">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <div class="story-reply-cover">
                    ${story.file_type === 'video' ? '<i class="fas fa-film"></i>' : (story.file_path ? `<img src="/${story.file_path}">` : '<i class="fas fa-image"></i>')}
                </div>
                <div style="flex:1; min-width:0;">
                    <div class="story-reply-title">Поделиться историей</div>
                    <div class="story-reply-sub">Выберите получателя</div>
                </div>
            </div>
            ${listHtml}
        </div>
    `;
    openModal('tempModal');
}

function shareStoryTo(storyId, targetId, targetType) {
    const payload = { story_id: storyId, to_chat_id: null, to_group_id: null, to_channel_id: null };
    if (targetType === 'chat') payload.to_chat_id = targetId;
    else if (targetType === 'group') payload.to_group_id = targetId;
    else payload.to_channel_id = targetId;

    closeModal('tempModal');
    returnFromStoryStats();

    fetch('/api/share_story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(d => {
        if (d.success) {
            if (typeof showToast === 'function') showToast('📤 История поделена!');
            if (typeof loadChatsList === 'function') loadChatsList();
        } else {
            if (typeof showToast === 'function') showToast(d.error || 'Ошибка');
        }
    })
    .catch(err => {
        console.error('Error sharing story:', err);
        if (typeof showToast === 'function') showToast('Ошибка отправки');
    });
}
    function showStoryStats() {
    const story = currentStories[currentStoryIndex];

    console.log('Loading stats for story:', story.id);

    fetch(`/api/get_story_stats/${story.id}`)
        .then(r => r.json())
        .then(stats => {
            console.log('Stats received:', stats);

            if (!stats || stats.error) {
                alert('Не удалось загрузить статистику');
                return;
            }

            let html = `
                <div class="story-stats-body">
                    <div class="story-stats-header">
                        <button onclick="closeStoryStatsModal()" class="story-stats-back-btn">
                            <i class="fas fa-arrow-left"></i>
                        </button>
                        <div class="story-stats-title">Статистика истории</div>
                        <div class="story-stats-spacer"></div>
                    </div>

                    <div class="story-stats-cards">
                        <div class="story-stats-card">
                            <div class="num" style="color: #007aff;">${stats.total_views || 0}</div>
                            <div class="lbl">👁️ Просмотры</div>
                        </div>
                        <div class="story-stats-card">
                            <div class="num" style="color: #ff4757;">${stats.total_likes || 0}</div>
                            <div class="lbl">❤️ Лайки</div>
                        </div>
                        <div class="story-stats-card">
                            <div class="num" style="color: #ff9500;">${stats.total_reactions || 0}</div>
                            <div class="lbl">😍 Реакции</div>
                        </div>
                        <div class="story-stats-card">
                            <div class="num" style="color: #34c759;">${stats.total_replies || 0}</div>
                            <div class="lbl">💬 Ответы</div>
                        </div>
                    </div>
            `;

            // Просмотры
            html += `<div class="story-stats-section">
                <div class="story-stats-section-title" style="color: #007aff;">
                    <i class="fas fa-eye"></i> Просмотры (${stats.total_views || 0})
                </div>`;

            if (!stats.viewers || stats.viewers.length === 0) {
                html += '<div class="story-stats-empty">Нет просмотров</div>';
            } else {
                stats.viewers.forEach(v => {
                    html += `
                        <div class="story-stats-user" onclick="closeModal('tempModal'); openUserProfileModal(${v.id})">
                            <div class="avatar">
                                ${v.avatar ? `<img src="/${v.avatar}">` : (v.display_name || v.username || '?')[0].toUpperCase()}
                            </div>
                            <div style="flex:1; min-width:0;">
                                <div class="uname">${escapeHtml(v.display_name || v.username)}</div>
                                <div class="meta">👁️ ${formatStoryTime(v.viewed_at)}</div>
                            </div>
                        </div>
                    `;
                });
            }
            html += '</div>';

            // Лайки
            if (stats.likes && stats.likes.length > 0) {
                html += `<div class="story-stats-section">
                    <div class="story-stats-section-title" style="color: #ff4757;">
                        <i class="fas fa-heart"></i> Лайки (${stats.total_likes})
                    </div>`;
                stats.likes.forEach(l => {
                    html += `
                        <div class="story-stats-user" onclick="closeModal('tempModal'); openUserProfileModal(${l.id})">
                            <div class="avatar">
                                ${l.avatar ? `<img src="/${l.avatar}">` : (l.display_name || l.username || '?')[0].toUpperCase()}
                            </div>
                            <div style="flex:1; min-width:0;">
                                <div class="uname">${escapeHtml(l.display_name || l.username)}</div>
                                <div class="meta" style="color:#ff4757;">❤️ Лайк</div>
                            </div>
                        </div>
                    `;
                });
                html += '</div>';
            }

            // Реакции
            if (stats.reactions && stats.reactions.length > 0) {
                html += `<div class="story-stats-section">
                    <div class="story-stats-section-title" style="color: #ff9500;">
                        <i class="fas fa-smile"></i> Реакции (${stats.total_reactions})
                    </div>`;
                stats.reactions.forEach(r => {
                    html += `
                        <div class="story-stats-user" onclick="closeModal('tempModal'); openUserProfileModal(${r.id})">
                            <div class="avatar">
                                ${r.avatar ? `<img src="/${r.avatar}">` : (r.display_name || r.username || '?')[0].toUpperCase()}
                            </div>
                            <div style="flex:1; min-width:0;">
                                <div class="uname">${escapeHtml(r.display_name || r.username)}</div>
                                <div class="meta" style="color:#ff9500;">${r.reaction} • ${formatStoryTime(r.created_at)}</div>
                            </div>
                        </div>
                    `;
                });
                html += '</div>';
            }

            // Ответы
            if (stats.replies && stats.replies.length > 0) {
                html += `<div class="story-stats-section">
                    <div class="story-stats-section-title" style="color: #34c759;">
                        <i class="fas fa-comment"></i> Ответы (${stats.total_replies})
                    </div>`;
                stats.replies.forEach(r => {
                    html += `
                        <div class="story-stats-user" onclick="closeModal('tempModal'); openChat(${r.id}, 'personal')">
                            <div class="avatar">
                                ${r.avatar ? `<img src="/${r.avatar}">` : (r.display_name || r.username || '?')[0].toUpperCase()}
                            </div>
                            <div style="flex:1; min-width:0;">
                                <div class="uname">${escapeHtml(r.display_name || r.username)}</div>
                                <div class="meta">💬 ${escapeHtml(r.reply_text || '')}</div>
                            </div>
                        </div>
                    `;
                });
                html += '</div>';
            }

            html += '</div>';

            document.getElementById('tempModalBody').innerHTML = html;
            openModal('tempModal');
            suspendStoryViewer();

            // Клик по фону — вернуться к истории
            document.getElementById('tempModal').addEventListener('click', function handler(e) {
                if (e.target === document.getElementById('tempModal')) {
                    this.removeEventListener('click', handler);
                    closeStoryStatsModal();
                }
            });

            // Клик по пользователю из списка — история останется приостановленной,
            // а вернуться к ней можно обычным закрытием профиля (маршрут)
            document.querySelectorAll('.story-stats-user').forEach(el => {
                el.addEventListener('click', () => {
                    document.getElementById('tempModal').removeEventListener('click', handler);
                });
            });
        })
        .catch(err => {
            console.error('Error loading story stats:', err);
            alert('Ошибка загрузки статистики: ' + err.message);
        });
}


// ===== ДЕЛЕГИРОВАНИЕ СОБЫТИЙ ДЛЯ ИСТОРИЙ =====
document.addEventListener('click', function(e) {
    // Статистика истории
    if (e.target.closest('.stats-btn') || e.target.closest('[onclick*="showStoryStats"]')) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof showStoryStats === 'function') {
            showStoryStats();
        }
    }

    // Лайк истории
    if (e.target.closest('#storyLikeBtn') || e.target.closest('[onclick*="likeCurrentStory"]')) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof likeCurrentStory === 'function') {
            likeCurrentStory();
        }
    }

    // Ответ на историю
    if (e.target.closest('#storyReplyBtn') || e.target.closest('[onclick*="replyToCurrentStory"]')) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof replyToCurrentStory === 'function') {
            replyToCurrentStory();
        }
    }

    // Реакции на историю
    const reactionBtn = e.target.closest('.story-reaction');
    if (reactionBtn) {
        e.preventDefault();
        e.stopPropagation();
        const reaction = reactionBtn.textContent.trim();
        if (reaction && typeof reactToCurrentStory === 'function') {
            reactToCurrentStory(reaction);
        }
    }
});


