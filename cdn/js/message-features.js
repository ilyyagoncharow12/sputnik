    // ===== ЗАКРЕПЛЁННЫЕ СООБЩЕНИЯ =====
    let currentPinnedMessage = null;

    function getCurrentChatScope() {
        if (!currentChat) return null;
        if (currentChatType === 'personal') return { scope: 'personal', scopeId: currentChat.chat_id };
        if (currentChatType === 'group') return { scope: 'group', scopeId: currentChat.id };
        if (currentChatType === 'channel') return { scope: 'channel', scopeId: currentChat.id };
        return null;
    }

    function showPinnedForCurrentChat() {
        const c = getCurrentChatScope();
        const banner = document.getElementById('pinnedBanner');
        if (!c) { if (banner) banner.style.display = 'none'; currentPinnedMessage = null; return; }
        fetch(`/api/pinned_message/${c.scope}/${c.scopeId}`)
            .then(r => r.json())
            .then(d => {
                if (d.pinned_message) {
                    currentPinnedMessage = d.pinned_message;
                    renderPinnedBanner(d.pinned_message);
                } else {
                    currentPinnedMessage = null;
                    const b = document.getElementById('pinnedBanner');
                    if (b) b.style.display = 'none';
                }
            })
            .catch(() => { currentPinnedMessage = null; });
    }

    function renderPinnedBanner(msg) {
        const banner = document.getElementById('pinnedBanner');
        if (!banner) return;
        const text = (msg.content || '').replace(/\n/g, ' ').substring(0, 60) ||
            (msg.file_type ? (msg.file_name || 'Медиафайл') : '');
        banner.innerHTML = `<i class="fas fa-thumbtack"></i>` +
            `<span class="pinned-text"><b>Закреплённое:</b> ${escapeHtml(text)}</span>` +
            `<button onclick="unpinFromBanner(event)" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:14px;"><i class="fas fa-times"></i></button>`;
        banner.style.display = 'flex';
        banner.onclick = (e) => {
            if (e.target.closest('button')) return;
            scrollToMessage(msg.id);
        };
    }

    function unpinFromBanner(e) {
        e.stopPropagation();
        const c = getCurrentChatScope();
        if (!c) return;
        fetch('/api/unpin_message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scope: c.scope, scope_id: c.scopeId })
        }).then(r => r.json()).then(d => {
            if (d.success) {
                currentPinnedMessage = null;
                const banner = document.getElementById('pinnedBanner');
                if (banner) banner.style.display = 'none';
                showToast('Сообщение откреплено');
            }
        });
    }

    function scrollToMessage(messageId) {
        const el = document.querySelector(`.message[data-message-id="${messageId}"]`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            showToast('Сообщение ещё не загружено');
        }
    }

    function pinCurrentMessage() {
        const msg = currentContextMessage;
        const c = getCurrentChatScope();
        if (!msg || !c) return;
        const wasPinned = currentPinnedMessage && String(currentPinnedMessage.id) === String(msg.id);
        const url = wasPinned ? '/api/unpin_message' : '/api/pin_message';
        const body = wasPinned
            ? { scope: c.scope, scope_id: c.scopeId }
            : { scope: c.scope, scope_id: c.scopeId, message_id: msg.id };
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(r => r.json()).then(d => {
            if (d.success) {
                showToast(wasPinned ? 'Сообщение откреплено' : 'Сообщение закреплено');
                showPinnedForCurrentChat();
            } else if (d.error) {
                showToast(d.error);
            }
        });
    }

    // ===== САМОУНИЧТОЖАЮЩИЕСЯ СООБЩЕНИЯ =====
    let selfBurnSeconds = null; // самоуничтожение временно отключено

    function closeBurnMenu() {
        const menu = document.getElementById('burnMenu');
        if (menu) menu.remove();
        document.removeEventListener('click', closeBurnMenu);
    }

    function toggleBurnMenu(event) {
        event.stopPropagation();
        const existing = document.getElementById('burnMenu');
        if (existing) { existing.remove(); return; }
        const btn = document.getElementById('burnBtn');
        const rect = btn.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.id = 'burnMenu';
        menu.style.cssText = 'position:fixed;z-index:9999;background:#fff;border:1px solid var(--border-color);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.2);padding:6px;font-family:inherit;';
        menu.style.top = (rect.top - 200) + 'px';
        menu.style.right = (window.innerWidth - rect.left) + 'px';
        const options = [
            { label: '5 секунд', value: 5 },
            { label: '30 секунд', value: 30 },
            { label: '1 минута', value: 60 },
            { label: '1 час', value: 3600 },
            { label: '24 часа', value: 86400 },
            { label: 'Выкл', value: null }
        ];
        options.forEach(o => {
            const item = document.createElement('div');
            item.style.cssText = 'padding:8px 14px;cursor:pointer;border-radius:8px;font-size:13px;color:var(--text-primary);';
            item.onmouseover = () => { item.style.background = 'var(--bg-hover)'; };
            item.onmouseout = () => { item.style.background = 'transparent'; };
            item.textContent = (selfBurnSeconds === o.value ? '✓ ' : '') + o.label;
            item.onclick = () => {
                selfBurnSeconds = o.value;
                updateBurnButton();
                closeBurnMenu();
                showToast(selfBurnSeconds ? `Следующие сообщения исчезнут через ${o.label.toLowerCase()}` : 'Таймер выключен');
            };
            menu.appendChild(item);
        });
        document.body.appendChild(menu);
        setTimeout(() => document.addEventListener('click', closeBurnMenu), 50);
    }

    function updateBurnButton() {
        const btn = document.getElementById('burnBtn');
        if (!btn) return;
        if (selfBurnSeconds) {
            btn.style.background = '#ff453a';
            btn.style.color = '#fff';
        } else {
            btn.style.background = '';
            btn.style.color = '';
        }
    }

    // ===== МЕНЮ СКРЕПКИ =====
    function toggleAttachMenu(event) {
        event.stopPropagation();
        const menu = document.getElementById('attachMenu');
        if (!menu) return;
        if (menu.style.display === 'block') {
            closeAttachMenu();
            return;
        }
        const btn = document.getElementById('attachBtn');
        const rect = btn.getBoundingClientRect();
        menu.style.display = 'block';
        const menuRect = menu.getBoundingClientRect();
        let top = rect.bottom + 8;
        if (top + menuRect.height > window.innerHeight) top = rect.top - menuRect.height - 8;
        menu.style.top = top + 'px';
        menu.style.left = rect.left + 'px';
        document.addEventListener('click', closeAttachMenuOnce);
    }

    function closeAttachMenuOnce(e) {
        const menu = document.getElementById('attachMenu');
        if (!menu) return;
        if (!menu.contains(e.target) && e.target.id !== 'attachBtn' && !e.target.closest('#attachBtn')) {
            menu.style.display = 'none';
            document.removeEventListener('click', closeAttachMenuOnce);
        }
    }

    function pickMediaFiles() {
        closeAttachMenu();
        document.getElementById('mediaFileInput').click();
    }

    function pickAnyFile() {
        closeAttachMenu();
        document.getElementById('docsFileInput').click();
    }

    function closeAttachMenu() {
        const menu = document.getElementById('attachMenu');
        if (menu) menu.style.display = 'none';
        document.removeEventListener('click', closeAttachMenuOnce);
    }

    function bindAttachInputs() {
        const media = document.getElementById('mediaFileInput');
        const docs = document.getElementById('docsFileInput');
        if (media) media.onchange = (e) => handlePickedFiles(e.target.files);
        if (docs) docs.onchange = (e) => handlePickedFiles(e.target.files);
    }

    function handlePickedFiles(files) {
        if (!files || files.length === 0) return;
        pendingFiles = Array.from(files);
        showFilePreview(pendingFiles);
        document.getElementById('mediaFileInput').value = '';
        document.getElementById('docsFileInput').value = '';
    }

    // ===== ПРЕВЬЮ ССЫЛОК =====
    function extractUrls(text) {
        const re = /https?:\/\/[^\s<>"'()\[\]]+/g;
        const matches = (text || '').match(re) || [];
        return [...new Set(matches.map(u => u.replace(/[.,;:!?]+$/, '')))];
    }

    function injectLinkPreview(container, url) {
        if (container.querySelector('.link-preview')) return;
        fetch(`/api/link_preview?url=${encodeURIComponent(url)}`)
            .then(r => r.json())
            .then(d => {
                const p = d.preview;
                if (!p || (!p.title && !p.image_url && !p.description)) return;
                if (container.querySelector('.link-preview')) return;
                const div = document.createElement('div');
                div.className = 'link-preview';
                let inner = '';
                if (p.image_url) inner += `<img src="${escapeAttr(p.image_url)}" onerror="this.remove()">`;
                inner += `<div class="link-preview-info">` +
                    (p.title ? `<div class="link-preview-title">${escapeHtml(p.title)}</div>` : '') +
                    (p.description ? `<div class="link-preview-desc">${escapeHtml(p.description)}</div>` : '') +
                    (p.site_name ? `<div class="link-preview-site">${escapeHtml(p.site_name)}</div>` : `<div class="link-preview-site">${escapeHtml(url.split('/')[2])}</div>`) +
                    `</div>`;
                div.innerHTML = inner;
                div.onclick = () => window.open(url, '_blank');
                container.appendChild(div);
            })
            .catch(() => {});
    }

    function loadLinkPreviews(container) {
        const textEls = container.querySelectorAll('.message-text');
        textEls.forEach(tx => {
            const urls = extractUrls(tx.textContent);
            urls.forEach(url => injectLinkPreview(tx, url));
        });
    }

    function escapeAttr(value) {
        return String(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ===== ГОЛОСОВЫЕ СООБЩЕНИЯ =====
    let mediaRecorder = null;
    let mediaChunks = [];
    let micStream = null;
    let recordingStartTime = null;

    function toggleVoiceRecording(e) {
        e.stopPropagation();
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            stopVoiceRecording();
        } else {
            startVoiceRecording();
        }
    }

    async function startVoiceRecording() {
        if (!currentChat) return;
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            showToast('Нет доступа к микрофону');
            return;
        }
        micStream = stream;
        mediaChunks = [];
        const mime = MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
        mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        mediaRecorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) mediaChunks.push(ev.data);
        };
        mediaRecorder.start();
        recordingStartTime = Date.now();
        updateMicUI(true);
        showToast('Идёт запись — нажмите ещё раз, чтобы отправить');
    }

    function stopVoiceRecording() {
        if (!mediaRecorder) return;
        mediaRecorder.stop();
        const duration = Math.max(1, Math.round((Date.now() - recordingStartTime) / 1000));
        updateMicUI(false);
        mediaRecorder.onstop = () => {
            if (micStream) {
                micStream.getTracks().forEach(t => t.stop());
                micStream = null;
            }
            const blob = new Blob(mediaChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
            if (blob.size > 0) {
                sendVoiceBlob(blob, duration);
            }
            mediaRecorder = null;
        };
    }

    function updateMicUI(recording) {
        const btn = document.getElementById('micBtn');
        if (!btn) return;
        if (recording) {
            btn.style.background = '#ff453a';
            btn.style.color = '#fff';
            const icon = btn.querySelector('i');
            if (icon) icon.className = 'fas fa-stop';
        } else {
            btn.style.background = '';
            btn.style.color = '';
            const icon = btn.querySelector('i');
            if (icon) icon.className = 'fas fa-microphone';
        }
    }

    function sendVoiceBlob(blob, duration) {
        if (!currentChat) return;
        const fd = new FormData();
        if (currentChatType === 'personal') {
            if (!currentChat.chat_id) { showToast('Нет id чата'); return; }
            fd.append('chat_id', currentChat.chat_id);
        } else if (currentChatType === 'group') {
            fd.append('group_id', currentChat.id);
        } else if (currentChatType === 'channel') {
            fd.append('channel_id', currentChat.id);
        }
        const ext = (blob.type === 'audio/mp4') ? 'm4a' : 'ogg';
        fd.append('files', blob, `voice_${Date.now()}.${ext}`);
        fd.append('content', '');
        fd.append('voice_duration', duration);
        fetch('/api/send_message', { method: 'POST', body: fd })
            .then(r => r.json())
            .then(d => {
                if (d.success && d.messages) {
                    d.messages.forEach(msg => displayMessage(msg));
                    loadChatsList();
                } else if (d.error) {
                    showToast(d.error);
                }
            })
            .catch(() => showToast('Не удалось отправить голосовое сообщение'));
    }

    // ===== ОПРОСЫ =====
    function openPollCreator() {
        if (!currentChat) { showToast('Сначала откройте чат'); return; }
        showModal('Новый опрос', `
            <div style="display:flex;flex-direction:column;gap:12px;">
                <input id="pollQuestion" placeholder="Вопрос" style="background:#2c2c2e;border:none;border-radius:12px;padding:12px;color:#fff;outline:none;font-size:14px;">
                <div id="pollOptionsList" style="display:flex;flex-direction:column;gap:8px;">
                </div>
                <button onclick="addPollOption()" style="background:none;border:1px dashed #3a3a3c;border-radius:12px;padding:10px;color:#0a84ff;cursor:pointer;">+ Добавить вариант</button>
                <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);">
                    <input type="checkbox" id="pollAnonymous" style="accent-color:#0a84ff;"> Анонимный опрос
                </label>
                <button onclick="createPollFromModal()" style="background:#0a84ff;border:none;border-radius:12px;padding:12px;color:#fff;font-weight:600;cursor:pointer;">Создать опрос</button>
            </div>
        `);
        addPollOption();
        addPollOption();
    }

    function addPollOption() {
        const list = document.getElementById('pollOptionsList');
        if (!list) return;
        if (list.querySelectorAll('.poll-opt').length >= 6) { showToast('Максимум 6 вариантов'); return; }
        const inp = document.createElement('input');
        inp.className = 'poll-opt';
        inp.placeholder = `Вариант ${list.querySelectorAll('.poll-opt').length + 1}`;
        inp.style.cssText = 'background:#2c2c2e;border:none;border-radius:12px;padding:12px;color:#fff;outline:none;font-size:14px;';
        list.appendChild(inp);
    }

    function createPollFromModal() {
        const question = document.getElementById('pollQuestion') ? document.getElementById('pollQuestion').value.trim() : '';
        const inputs = Array.from(document.querySelectorAll('#pollOptionsList .poll-opt'))
            .map(i => i.value.trim()).filter(Boolean);
        const isAnonymous = (document.getElementById('pollAnonymous') || {}).checked || false;
        if (!question || inputs.length < 2) {
            showToast('Заполните вопрос и минимум 2 варианта');
            return;
        }
        const payload = { question: question, options: inputs.slice(0, 6), is_anonymous: isAnonymous };
        if (currentChatType === 'personal') {
            if (!currentChat.chat_id) { showToast('Нет id чата'); return; }
            payload.chat_id = currentChat.chat_id;
        } else if (currentChatType === 'group') {
            payload.group_id = currentChat.id;
        } else if (currentChatType === 'channel') {
            payload.channel_id = currentChat.id;
        }
        fetch('/api/create_poll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(r => r.json())
        .then(d => {
            closeModalWithRoute();
            if (d.success && d.message) {
                displayMessage(d.message);
                loadChatsList();
            } else {
                showToast(d.error || 'Не удалось создать опрос');
            }
        })
        .catch(() => showToast('Не удалось создать опрос'));
    }

    function pluralVotes(n) {
        const n10 = n % 10, n100 = n % 100;
        if (n10 === 1 && n100 !== 11) return 'голос';
        if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return 'голоса';
        return 'голосов';
    }

    function renderPollHTML(poll) {
        const total = poll.total || 0;
        const closed = poll.is_closed;
        const myVote = poll.my_vote;
        const showResults = closed || myVote !== null;
        const options = (poll.options || []).map((opt, i) => {
            const count = (poll.counts && poll.counts[i]) || 0;
            const pct = total > 0 ? Math.round(count / total * 100) : 0;
            let bar;
            if (showResults) {
                bar = `<div style="position:relative;background:#3a3a3c;border-radius:8px;overflow:hidden;margin-top:6px;font-size:13px;">
                    <div style="position:absolute;top:0;left:0;bottom:0;width:${pct}%;background:#0a84ff;opacity:0.75;"></div>
                    <div style="position:relative;padding:9px 10px;display:flex;justify-content:space-between;align-items:center;color:#fff;">
                        <span>${escapeHtml(opt)}</span><span>${count} · ${pct}%</span>
                    </div>
                </div>`;
            } else {
                bar = `<div onclick="voteForPoll(${poll.id}, ${i})" style="background:none;border:1px solid #3a3a3c;border-radius:8px;padding:10px;margin-top:6px;font-size:13px;text-align:center;color:#0a84ff;cursor:pointer;">${escapeHtml(opt)}</div>`;
            }
            if (!closed && myVote === i) {
                bar += `<div style="font-size:11px;color:#30d158;margin-top:4px;"><i class="fas fa-check"></i> Ваш выбор</div>`;
            }
            return bar;
        }).join('');

        return `<div class="poll-box" data-poll-id="${poll.id}">
            <div style="font-size:14px;font-weight:600;margin-bottom:2px;">${escapeHtml(poll.question)}</div>
            <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">${poll.is_anonymous ? 'Анонимный опрос' : 'Открытый опрос'} · ${total} ${pluralVotes(total)}</div>
            ${options}
            ${closed ? '<div style="font-size:11px;color:var(--text-secondary);margin-top:8px;">Опрос завершён</div>' : ''}
            ${!closed && myVote !== null ? '<div onclick="closePollNow(' + poll.id + ')" style="font-size:11px;color:#ff9f0a;margin-top:6px;cursor:pointer;">Завершить опрос</div>' : ''}
        </div>`;
    }

    function voteForPoll(pollId, index) {
        fetch('/api/vote_poll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ poll_id: pollId, option_index: index })
        })
        .then(r => r.json())
        .then(d => {
            if (d.success) {
                refreshPollBlock(pollId);
            } else {
                showToast(d.error || 'Не удалось проголосовать');
            }
        })
        .catch(() => showToast('Не удалось проголосовать'));
    }

    function closePollNow(pollId) {
        fetch('/api/close_poll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ poll_id: pollId })
        })
        .then(r => r.json())
        .then(d => { if (d.success) refreshPollBlock(pollId); })
        .catch(() => {});
    }

    function refreshPollBlock(pollId) {
        fetch(`/api/poll/${pollId}`)
            .then(r => r.json())
            .then(d => {
                if (!d.poll) return;
                const small = document.createElement('div');
                small.innerHTML = renderPollHTML(d.poll);
                const fresh = small.firstElementChild;
                document.querySelectorAll(`[data-poll-id="${pollId}"]`).forEach(box => {
                    if (box !== fresh) box.replaceWith(fresh.cloneNode(true));
                });
            })
            .catch(() => {});
    }

    function sendMessage() {
        const input = document.getElementById('messageInput');
        const content = input.value.trim();
        const fileInput = document.getElementById('fileInput');
        const hasFile = fileInput.files.length > 0;

        if (!content && !hasFile) return;
        if (!currentChat) return;

        const fd = new FormData();

        if (currentChatType === 'personal') {
            if (currentChat.chat_id) {
                fd.append('chat_id', currentChat.chat_id);
            } else {
                console.error('No chat_id available');
                return;
            }
        } else if (currentChatType === 'group') {
            fd.append('group_id', currentChat.id);
        } else if (currentChatType === 'channel') {
            fd.append('channel_id', currentChat.id);
        }

        fd.append('content', content || '');

        const replyToId = currentReplyMessage ? currentReplyMessage.id : null;

        if (replyToId) {
            fd.append('reply_to_id', replyToId);
        }

        if (selfBurnSeconds) {
            fd.append('expire_after', selfBurnSeconds);
        }

        // Показываем сообщение мгновенно (оптимистичная отправка)
        if (content && !hasFile) {
            displayMessage({
                id: null,
                is_temp: true,
                sender_id: currentUser.id,
                content: content,
                created_at: new Date().toISOString(),
                is_read: false
            });
        }

        if (hasFile) {
            for (let i = 0; i < fileInput.files.length; i++) {
                fd.append('files', fileInput.files[i]);
            }
            fileInput.value = '';
        }

        input.value = '';
        input.style.height = 'auto';
        cancelReply();

        document.getElementById('sendBtn').disabled = true;

        fetch('/api/send_message', { method: 'POST', body: fd })
            .then(r => {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(d => {
                document.getElementById('sendBtn').disabled = false;
                // Убираем временное сообщение
                document.querySelectorAll('.message.temp-message').forEach(el => el.remove());
                if (d.success && d.messages && d.messages.length) {
                    d.messages.forEach(msg => displayMessage(msg));
                    loadChatsList();
                } else if (d.success) {
                    // Страховка: если сервер не вернул сообщение — перечитаем чат
                    refreshMessages();
                    loadChatsList();
                } else {
                    showToast(d.error || 'Не удалось отправить');
                    refreshMessages();
                }
            })
            .catch((err) => {
                document.getElementById('sendBtn').disabled = false;
                document.querySelectorAll('.message.temp-message').forEach(el => el.remove());
                showToast('Ошибка при отправке');
            });
    }

    function setupMessageInput() {
        const inp = document.getElementById('messageInput');

        inp.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
            document.getElementById('sendBtn').disabled = !this.value.trim();

            if (currentChat && currentChatType === 'personal') {
                if (typingTimeout) clearTimeout(typingTimeout);
                socket.emit('typing', { room: `chat_${currentChat.chat_id}` });
                typingTimeout = setTimeout(() => {}, 1000);
            }
        });

        inp.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!document.getElementById('sendBtn').disabled) {
                    sendMessage();
                }
            }
        });
    }

    function cancelReply() {
        currentReplyMessage = null;
        document.getElementById('replyPreview').style.display = 'none';
        document.getElementById('replyPreviewName').textContent = '';
        document.getElementById('replyPreviewText').textContent = '';
    }

    function subscribeChannel(inviteLink) {
        fetch('/api/subscribe/channel/' + inviteLink)
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    loadChannelsList();
                    openChat(d.channel_id, 'channel');
                    document.getElementById('searchResults').classList.remove('active');
                    alert('Вы подписались на канал!');
                } else {
                    alert('Ошибка при подписке: ' + (d.error || 'неизвестная ошибка'));
                }
            })
            .catch(err => {
                console.error('Subscribe error:', err);
                alert('Ошибка соединения с сервером');
            });
    }

    function joinGroup(inviteLink) {
        fetch(`/api/join_group/${inviteLink}`)
            .then(r => r.json())
            .then(d => {
                if (d.pending_request) {
                    closeModal('tempModal');
                    document.getElementById('searchResults').classList.remove('active');
                    alert(d.error || 'Заявка отправлена. Владелец группы рассмотрит её.');
                    return;
                }
                if (d.success) {
                    loadGroupsList();
                    openChat(d.group_id, 'group');
                    closeModal('tempModal');
                    document.getElementById('searchResults').classList.remove('active');
                } else {
                    alert(d.error || 'Не удалось присоединиться к группе');
                }
            })
            .catch(err => {
                console.error('Join error:', err);
                alert('Ошибка соединения с сервером');
            });
    }

    // ===== ПОИСК =====
    function searchAll() {
        const q = document.getElementById('globalSearch').value.trim();
        const r = document.getElementById('searchResults');

        if (q.length < 2) {
            r.classList.remove('active');
            return;
        }

        fetch(`/api/search_all?q=${encodeURIComponent(q)}`)
            .then(res => res.json())
            .then(d => {
                let h = '';

                if (d.users && d.users.length) {
                    h += '<div class="recent-header">Пользователи</div>';
                    d.users.forEach(u => {
                        h += `
                            <div class="search-result-item" onclick="openChat(${u.id}, 'personal'); document.getElementById('searchResults').classList.remove('active');">
                                <div class="search-result-avatar">
                                    ${u.is_banned ? `<span>❄</span>` : (u.avatar ? `<img src="/${u.avatar}">` : `<span>${(u.username || '?')[0].toUpperCase()}</span>`)}
                                </div>
                                <div class="search-result-info">
                                    <div class="search-result-name">${escapeHtml(u.is_banned ? 'Удалённый аккаунт' : (u.display_name || u.username))}${u.is_banned ? '<span class="snow-emoji">❄</span>' : ''}</div>
                                    <div class="search-result-type">@${escapeHtml(u.username)} | ${u.phone}</div>
                                </div>
                            </div>
                        `;
                    });
                }

                if (d.groups && d.groups.length) {
                    h += '<div class="recent-header">Группы</div>';
                    d.groups.forEach(g => {
                        h += `
                            <div class="search-result-item" onclick="joinGroup('${g.invite_link}')">
                                <div class="search-result-avatar group">
                                    <span>👥</span>
                                </div>
                                <div class="search-result-info">
                                    <div class="search-result-name">${escapeHtml(g.name)}${g.username ? ` <span class="search-result-username">@${escapeHtml(g.username)}</span>` : ''}</div>
                                    <div class="search-result-type">${g.member_count || 0} участников</div>
                                </div>
                            </div>
                        `;
                    });
                }

                if (d.channels && d.channels.length) {
                    h += '<div class="recent-header">Каналы</div>';
                    d.channels.forEach(c => {
                        if (c.is_subscribed) {
                            h += `
                                <div class="search-result-item" onclick="openChat(${c.id}, 'channel'); document.getElementById('searchResults').classList.remove('active');">
                                    <div class="search-result-avatar channel">
                                        <span>📢</span>
                                    </div>
                                    <div class="search-result-info">
                                        <div class="search-result-name">${escapeHtml(c.name)}${c.username ? ` <span class="search-result-username">@${escapeHtml(c.username)}</span>` : ''}</div>
                                        <div class="search-result-type">${c.subscriber_count || 0} подписчиков</div>
                                    </div>
                                </div>
                            `;
                        } else {
                            h += `
                                <div class="search-result-item">
                                    <div class="search-result-avatar channel">
                                        <span>📢</span>
                                    </div>
                                    <div class="search-result-info">
                                        <div class="search-result-name">${escapeHtml(c.name)}${c.username ? ` <span class="search-result-username">@${escapeHtml(c.username)}</span>` : ''}</div>
                                        <div class="search-result-type">${c.subscriber_count || 0} подписчиков</div>
                                    </div>
                                    <button class="modal-btn modal-btn-primary" style="padding: 6px 12px; font-size: 12px;" onclick="event.stopPropagation(); subscribeChannel('${c.invite_link}')">
                                        Подписаться
                                    </button>
                                </div>
                            `;
                        }
                    });
                }

                r.innerHTML = h || '<div class="search-result-item">Ничего не найдено</div>';
                r.classList.add('active');
            })
            .catch(err => {
                console.error('Search error:', err);
                r.innerHTML = '<div class="search-result-item">Ошибка поиска</div>';
                r.classList.add('active');
            });
    }

    function showRecentSearches() {
        fetch('/api/recent_searches')
            .then(r => r.json())
            .then(s => {
                if (s && s.length) {
                    let h = '<div class="recent-header">Недавние поиски</div>';
                    s.forEach(i => {
                        h += `
                            <div class="search-result-item" onclick="document.getElementById('globalSearch').value='${i.search_query}';searchAll();">
                                <div class="search-result-avatar">
                                    <i class="fas fa-search"></i>
                                </div>
                                <div class="search-result-info">
                                    <div class="search-result-name">${escapeHtml(i.search_query)}</div>
                                </div>
                            </div>
                        `;
                    });
                    document.getElementById('searchResults').innerHTML = h;
                    document.getElementById('searchResults').classList.add('active');
                }
            });
    }

    function openNewChatModal() {
        let h = `
            <input type="text" id="newChatSearch" class="modal-input" placeholder="Поиск по номеру или имени..." oninput="searchForNewChat()">
            <div id="newChatResults"></div>
        `;
        showModal('Новый чат', h);
        document.getElementById('newChatSearch').focus();
    }

    function searchForNewChat() {
        const q = document.getElementById('newChatSearch').value.trim();
        if (q.length < 2) {
            document.getElementById('newChatResults').innerHTML = '';
            return;
        }

        fetch(`/api/search_users?q=${encodeURIComponent(q)}`)
            .then(r => r.json())
            .then(u => {
                document.getElementById('newChatResults').innerHTML = u.map(i => `
                    <div class="search-result-item" onclick="openChat(${i.id}, 'personal'); closeModal('tempModal');">
                        <div class="search-result-avatar">
                            ${i.is_banned ? `<span>❄</span>` : (i.avatar ? `<img src="/${i.avatar}">` : `<span>${(i.username || '?')[0].toUpperCase()}</span>`)}
                        </div>
                        <div class="search-result-info">
                            <div class="search-result-name">${escapeHtml(i.is_banned ? 'Удалённый аккаунт' : (i.display_name || i.username))}${i.is_banned ? '<span class="snow-emoji">❄</span>' : ''}</div>
                            <div class="search-result-type">@${escapeHtml(i.username)} | ${i.phone}</div>
                        </div>
                    </div>
                `).join('');
            });
    }

