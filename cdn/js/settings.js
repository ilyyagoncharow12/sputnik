    // ===== УВЕДОМЛЕНИЯ =====
    let notificationsEnabled = false;
    let notificationsPermissionAsked = false;

    function openNotifications() {
        closeBurgerMenu();
        const status = (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';
        const state = notificationsEnabled ? 'включены' : 'выключены';
        let html = `
            <div class="user-profile-body">
                <div class="burger-item" onclick="toggleNotifications();closeModal('tempModal');">
                    <i class="fas fa-bell"></i><span>${notificationsEnabled ? 'Выключить уведомления' : 'Включить уведомления'}</span>
                </div>
                <div style="padding:12px 16px;font-size:12px;color:var(--text-secondary);">
                    Статус: ${((status === 'granted') ? 'разрешены браузером' : (status === 'denied') ? 'заблокированы браузером' : (status === 'unsupported') ? 'не поддерживаются' : 'не запрашивались')} · сейчас ${state}
                    <br><br>Уведомления показываются, когда вкладка неактивна: новое сообщение, входящий звонок.
                </div>
            </div>
        `;
        showModal('Уведомления', html);
    }

    function toggleNotifications() {
        if (typeof Notification === 'undefined') {
            showToast('Браузер не поддерживает уведомления');
            return;
        }
        if (notificationsEnabled) {
            notificationsEnabled = false;
            showToast('Уведомления выключены');
            return;
        }
        Notification.requestPermission().then(perm => {
            if (perm === 'granted') {
                notificationsEnabled = true;
                showToast('Уведомления включены');
                try {
                    new Notification('Спутник', { body: 'Уведомления включены' });
                } catch (e) {}
            } else {
                showToast('Браузер не дал разрешение на уведомления');
            }
        });
    }

    function notifyMessage(title, text, icon, chatScope, chatId) {
        if (!notificationsEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        if (!document.hidden) return;
        try {
            const n = new Notification(title, {
                body: text,
                icon: icon || '/static/img/logo.png',
                tag: 'chat-' + chatScope + '-' + chatId
            });
            n.onclick = () => {
                window.focus();
                n.close();
                if (chatScope === 'personal') openChat(chatId, 'personal');
                else if (chatScope === 'group') openGroupChat(chatId);
                else if (chatScope === 'channel') openChannel(chatId);
            };
        } catch (e) {}
    }

    // ===== НАСТРОЙКИ КОНФИДЕНЦИАЛЬНОСТИ =====
function openPrivacy() {
    closeBurgerMenu();
    modalReturnTo = 'openBurgerMenu';

    fetch('/api/get_privacy')
        .then(r => r.json())
        .then(settings => {
            let html = `
                <div class="tg-modal-wrapper">
                    <div class="tg-modal-header">
                        <button class="close-btn" onclick="closeModal('tempModal')">
                            <i class="fas fa-arrow-left"></i>
                        </button>
                        
                        <div class="title">Конфиденциальность</div>
                        <div style="width: 24px;"></div>
                    </div>
                    <div class="tg-modal-body">
                        <div class="tg-section-title">Сид-фраза (восстановление доступа)</div>


                        <div class="tg-section-title">Кто может видеть время захода</div>
                        <select id="privacyLastSeen" class="tg-input" style="margin-bottom: 20px;">
                            <option value="everyone" ${settings.last_seen === 'everyone' ? 'selected' : ''}>Все</option>
                            <option value="contacts" ${settings.last_seen === 'contacts' ? 'selected' : ''}>Контакты</option>
                            <option value="nobody" ${settings.last_seen === 'nobody' ? 'selected' : ''}>Никто</option>
                        </select>

                        <div class="tg-section-title">Кто может видеть фото профиля</div>
                        <select id="privacyPhoto" class="tg-input" style="margin-bottom: 20px;">
                            <option value="everyone" ${settings.profile_photo === 'everyone' ? 'selected' : ''}>Все</option>
                            <option value="contacts" ${settings.profile_photo === 'contacts' ? 'selected' : ''}>Контакты</option>
                            <option value="nobody" ${settings.profile_photo === 'nobody' ? 'selected' : ''}>Никто</option>
                        </select>

                        <div class="tg-section-title">Кто может звонить</div>
                        <select id="privacyCalls" class="tg-input" style="margin-bottom: 20px;">
                            <option value="everyone" ${settings.calls === 'everyone' ? 'selected' : ''}>Все</option>
                            <option value="contacts" ${settings.calls === 'contacts' ? 'selected' : ''}>Контакты</option>
                            <option value="nobody" ${settings.calls === 'nobody' ? 'selected' : ''}>Никто</option>
                        </select>

                        <div class="tg-section-title">Кто может писать</div>
                        <select id="privacyMessages" class="tg-input" style="margin-bottom: 20px;">
                            <option value="everyone" ${settings.messages === 'everyone' ? 'selected' : ''}>Все</option>
                            <option value="contacts" ${settings.messages === 'contacts' ? 'selected' : ''}>Контакты</option>
                        </select>

                        <div style="display: flex; gap: 10px; margin-top: 20px;">
                            <button class="tg-action-btn" onclick="savePrivacySettings()" style="flex: 1; background: #007aff; color: white;">
                                <i class="fas fa-save"></i> Сохранить
                            </button>
                            <button class="tg-action-btn" onclick="closeModal('tempModal')" style="flex: 1; background: #1c1c1e; color: #8e8e93;">
                                <i class="fas fa-times"></i> Отмена
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.getElementById('tempModalBody').innerHTML = html;
            openModal('tempModal');
        })
        .catch(err => {
            console.error('Error loading privacy settings:', err);
            alert('Ошибка загрузки настроек конфиденциальности');
        });
}

// ===== СИД-ФРАЗА =====
function savePrivacySettings() {
    const data = {
        last_seen: document.getElementById('privacyLastSeen').value,
        profile_photo: document.getElementById('privacyPhoto').value,
        calls: document.getElementById('privacyCalls').value,
        messages: document.getElementById('privacyMessages').value
    };

    console.log('Saving privacy settings:', data);

    fetch('/api/update_privacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(r => r.json())
    .then(res => {
        console.log('Response:', res);
        closeModal('tempModal');
        showToast('✅ Настройки конфиденциальности сохранены!');
    })
    .catch(err => {
        console.error('Error saving privacy settings:', err);
        showToast('❌ Ошибка при сохранении настроек');
    });
}

    function openAppearance() {
    closeBurgerMenu();
    modalReturnTo = 'openBurgerMenu';

    fetch('/api/get_settings')
        .then(r => r.json())
        .then(s => {
            // Получаем текущие настройки
            const myColor = s.my_message_color || '#667eea';
            const theirColor = s.their_message_color || '#f3f4f6';
            const radius = s.bubble_radius || 18;
            const fontSize = s.font_size || 14;
            const fontFamily = s.font_family || "'Unbounded', cursive";
            const wallpaper = s.wallpaper_image || '';

            // Создаем модалку с предпросмотром
            let html = `
                <div class="tg-modal-wrapper">
                    <div class="tg-modal-header">
                        <button class="close-btn" onclick="closeModal('tempModal')">
                            <i class="fas fa-arrow-left"></i>
                        </button>
                        
                        <div class="title">Оформление</div>
                        <div style="width: 24px;"></div>
                    </div>
                    <div class="tg-modal-body">
                        <!-- ПРЕДПРОСМОТР -->
                        <div class="appearance-preview" id="appearancePreview">
                            <div class="preview-msg theirs" style="background: ${theirColor}; color: ${theirColor === '#f3f4f6' ? '#1e293b' : 'white'}; border-radius: ${radius}px; font-size: ${fontSize}px; font-family: ${fontFamily};">
                                <span>Привет! Как дела?</span>
                                <span class="label">Собеседник</span>
                            </div>
                            <div class="preview-msg mine" style="background: ${myColor}; color: white; border-radius: ${radius}px; font-size: ${fontSize}px; font-family: ${fontFamily};">
                                <span>Всё отлично! 👍</span>
                                <span class="label">Вы</span>
                            </div>
                        </div>

                        <!-- НАСТРОЙКИ -->
                        <div class="tg-section-title">Цвет моих сообщений</div>
                        <input type="color" id="myMessageColor" value="${myColor}" onchange="updateAppearancePreview()" style="width: 60px; height: 60px; border-radius: 50%; border: 3px solid #2c2c2e; cursor: pointer; padding: 0;">

                        <div class="tg-section-title">Цвет чужих сообщений</div>
                        <input type="color" id="theirMessageColor" value="${theirColor}" onchange="updateAppearancePreview()" style="width: 60px; height: 60px; border-radius: 50%; border: 3px solid #2c2c2e; cursor: pointer; padding: 0;">

                        <div class="tg-section-title">Радиус пузырей: <span id="radiusValue">${radius}px</span></div>
                        <input type="range" id="bubbleRadius" min="0" max="30" value="${radius}" oninput="updateAppearancePreview()" style="width: 100%; accent-color: #007aff;">

                        <div class="tg-section-title">Размер шрифта: <span id="fontSizeValue">${fontSize}px</span></div>
                        <input type="range" id="fontSize" min="12" max="20" value="${fontSize}" oninput="updateAppearancePreview()" style="width: 100%; accent-color: #007aff;">

                        <div class="tg-section-title">Шрифт</div>
                        <select id="fontFamily" onchange="updateAppearancePreview()" style="width: 100%; padding: 12px; background: #1c1c1e; border: 1px solid #2c2c2e; border-radius: 12px; color: white; font-size: 15px; font-family: var(--font-family);">
                            <option value="'Unbounded', cursive" ${fontFamily.includes('Unbounded') ? 'selected' : ''}>Unbounded</option>
                            <option value="'Roboto', sans-serif" ${fontFamily.includes('Roboto') ? 'selected' : ''}>Roboto</option>
                            <option value="'Inter', sans-serif" ${fontFamily.includes('Inter') ? 'selected' : ''}>Inter</option>
                            <option value="'Arial', sans-serif" ${fontFamily.includes('Arial') ? 'selected' : ''}>Arial</option>
                            <option value="'Helvetica Neue', sans-serif" ${fontFamily.includes('Helvetica Neue') ? 'selected' : ''}>Helvetica Neue</option>
                        </select>

                        <div class="tg-section-title">Обои</div>
                        <button class="tg-action-btn" onclick="document.getElementById('wallpaperInput').click()">
                            <i class="fas fa-image"></i> Загрузить обои
                        </button>
                        <input type="file" id="wallpaperInput" accept="image/*" style="display: none;" onchange="uploadWallpaper(this)">

                        ${wallpaper ? `
                            <button class="tg-action-btn danger" onclick="resetWallpaper()">
                                <i class="fas fa-undo"></i> Убрать обои
                            </button>
                        ` : ''}

                        <div style="display: flex; gap: 10px; margin-top: 20px;">
                            <button class="tg-action-btn" onclick="saveAppearanceSettings()" style="flex: 1; background: #007aff; color: white;">
                                <i class="fas fa-save"></i> Сохранить
                            </button>
                            <button class="tg-reset-btn" onclick="resetAllAppearance()" style="flex: 1;">
                                <i class="fas fa-undo"></i> Сбросить всё
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.getElementById('tempModalBody').innerHTML = html;
            openModal('tempModal');

            // Сохраняем настройки в глобальных переменных для предпросмотра
            window._tempSettings = {
                myColor: myColor,
                theirColor: theirColor,
                radius: radius,
                fontSize: fontSize,
                fontFamily: fontFamily
            };
        })
        .catch(err => {
            console.error('Error loading settings:', err);
            alert('Ошибка загрузки настроек');
        });
}

// ===== ФУНКЦИЯ ОБНОВЛЕНИЯ ПРЕДПРОСМОТРА =====
function updateAppearancePreview() {
    const myColor = document.getElementById('myMessageColor').value;
    const theirColor = document.getElementById('theirMessageColor').value;
    const radius = document.getElementById('bubbleRadius').value;
    const fontSize = document.getElementById('fontSize').value;
    const fontFamily = document.getElementById('fontFamily').value;

    // Обновляем текст
    document.getElementById('radiusValue').textContent = radius + 'px';
    document.getElementById('fontSizeValue').textContent = fontSize + 'px';

    // Находим элементы предпросмотра
    const theirMsg = document.querySelector('.appearance-preview .preview-msg.theirs');
    const myMsg = document.querySelector('.appearance-preview .preview-msg.mine');

    if (theirMsg && myMsg) {
        theirMsg.style.background = theirColor;
        theirMsg.style.color = theirColor === '#f3f4f6' ? '#1e293b' : 'white';
        theirMsg.style.borderRadius = radius + 'px';
        theirMsg.style.fontSize = fontSize + 'px';
        theirMsg.style.fontFamily = fontFamily;

        myMsg.style.background = myColor;
        myMsg.style.color = 'white';
        myMsg.style.borderRadius = radius + 'px';
        myMsg.style.fontSize = fontSize + 'px';
        myMsg.style.fontFamily = fontFamily;
    }

    // Сохраняем временно
    window._tempSettings = { myColor, theirColor, radius, fontSize, fontFamily };
}

// ===== СОХРАНЕНИЕ НАСТРОЕК =====
function saveAppearanceSettings() {
    const myColor = document.getElementById('myMessageColor').value;
    const theirColor = document.getElementById('theirMessageColor').value;
    const radius = parseInt(document.getElementById('bubbleRadius').value);
    const fontSize = parseInt(document.getElementById('fontSize').value);
    const fontFamily = document.getElementById('fontFamily').value;

    // Сохраняем цвета
    fetch('/api/update_message_colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ my_message_color: myColor, their_message_color: theirColor })
    });

    // Сохраняем радиус
    fetch('/api/update_bubble_radius', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bubble_radius: radius })
    });

    // Сохраняем размер шрифта
    fetch('/api/update_font_size', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ font_size: fontSize })
    });

    // Сохраняем шрифт
    fetch('/api/update_font_family', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ font_family: fontFamily })
    });

    // Применяем изменения
    document.documentElement.style.setProperty('--primary-color', myColor);
    document.documentElement.style.setProperty('--bubble-radius', radius + 'px');
    document.body.style.fontSize = fontSize + 'px';
    document.body.style.fontFamily = fontFamily;

    // Обновляем стиль сообщений в чате
    document.querySelectorAll('.message.outgoing .message-bubble').forEach(el => {
        el.style.background = myColor;
        el.style.color = 'white';
    });

    document.querySelectorAll('.message.incoming .message-bubble').forEach(el => {
        el.style.background = theirColor;
        el.style.color = theirColor === '#f3f4f6' ? '#1e293b' : 'white';
    });

    closeModal('tempModal');
    showToast('✅ Настройки оформления сохранены!');
}

// ===== АКТИВНЫЕ СЕССИИ =====
function openSessions() {
    closeBurgerMenu();

    fetch('/api/get_sessions')
        .then(r => r.json())
        .then(sessions => {
            if (!sessions.length) {
                showModal('Активные сессии', '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:14px;">Нет активных сессий</div>');
                return;
            }

            let html = '<div style="padding:0;">';

            sessions.forEach((s, i) => {
                const device = s.device || 'Неизвестное устройство';
                const ip = s.ip || '—';
                const location = s.location || '—';
                const created = s.created_at || '';
                const lastActive = s.last_active || '';
                const isCurrent = s.is_current;

                html += `
                    <div style="display:flex;align-items:flex-start;gap:14px;padding:16px 0;${i > 0 ? 'border-top:1px solid var(--border-color);' : ''}">
                        <div style="width:40px;height:40px;border-radius:10px;background:${isCurrent ? 'var(--primary-gradient, linear-gradient(135deg,#667eea,#764ba2))' : 'var(--bg-hover, #2c2c2e)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;color:${isCurrent ? 'white' : 'var(--text-secondary)'};">
                            <i class="fas ${isCurrent ? 'fa-check-circle' : 'fa-laptop'}"></i>
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                                <span style="font-weight:600;font-size:15px;color:var(--text-primary);">${device}</span>
                                ${isCurrent ? '<span style="font-size:11px;background:var(--primary-gradient, linear-gradient(135deg,#667eea,#764ba2));color:white;padding:2px 8px;border-radius:6px;font-weight:600;">Текущая</span>' : ''}
                            </div>
                            <div style="font-size:13px;color:var(--text-muted);line-height:1.6;">
                                <div>IP: ${ip}${location ? ' · ' + location : ''}</div>
                                <div>Создана: ${created}</div>
                                ${lastActive ? '<div>Активна: ' + lastActive + '</div>' : ''}
                            </div>
                        </div>
                        ${!isCurrent ? `
                            <button onclick="terminateSession('${s.session_token}')" style="background:none;border:none;color:var(--danger-color,#ff3b30);font-size:18px;cursor:pointer;padding:8px;flex-shrink:0;" title="Завершить сессию">
                                <i class="fas fa-times-circle"></i>
                            </button>
                        ` : ''}
                    </div>
                `;
            });

            if (sessions.length > 1) {
                html += `
                    <div style="border-top:1px solid var(--border-color);padding-top:16px;margin-top:4px;">
                        <button onclick="terminateAllSessions()" style="width:100%;padding:12px;background:rgba(255,59,48,0.1);border:1px solid rgba(255,59,48,0.3);border-radius:12px;color:var(--danger-color,#ff3b30);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">
                            <i class="fas fa-sign-out-alt"></i> Завершить все другие сессии
                        </button>
                    </div>
                `;
            }

            html += '</div>';
            showModal('Активные сессии', html);
        })
        .catch(() => {
            showModal('Активные сессии', '<div style="text-align:center;padding:20px;color:var(--text-muted);">Ошибка загрузки сессий</div>');
        });
}

function terminateSession(token) {
    if (!confirm('Завершить эту сессию?')) return;
    fetch('/api/terminate_session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: token })
    })
    .then(r => r.json())
    .then(d => {
        if (d.success) { openSessions(); showToast('✅ Сессия завершена'); }
        else showToast('❌ Ошибка');
    });
}

function terminateAllSessions() {
    if (!confirm('Завершить все другие сессии?')) return;
    fetch('/api/terminate_all_sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(r => r.json())
    .then(d => {
        if (d.success) { openSessions(); showToast('✅ Все сессии завершены'); }
        else showToast('❌ Ошибка');
    });
}

// ===== ЗАГРУЗКА ОБОЕВ =====
function uploadWallpaper(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const fd = new FormData();
        fd.append('wallpaper', file);

        fetch('/api/update_wallpaper', {
            method: 'POST',
            body: fd
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                document.getElementById('messagesArea').style.backgroundImage = `url('/${data.wallpaper_image}')`;
                closeModal('tempModal');
                showToast('✅ Обои обновлены!');
                // Переоткрываем меню оформления
                setTimeout(openAppearance, 500);
            } else {
                showToast('❌ Ошибка при загрузке обоев');
            }
        })
        .catch(() => showToast('❌ Ошибка соединения'));
    }
}

// ===== СБРОС ОБОЕВ =====
function resetWallpaper() {
    fetch('/api/update_wallpaper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallpaper: '' })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            document.getElementById('messagesArea').style.backgroundImage = 'none';
            closeModal('tempModal');
            showToast('✅ Обои убраны');
            setTimeout(openAppearance, 500);
        }
    });
}

// ===== СБРОС ВСЕХ НАСТРОЕК =====
function resetAllAppearance() {
    if (!confirm('Сбросить все настройки оформления до стандартных?')) return;

    const defaults = {
        my_message_color: '#667eea',
        their_message_color: '#f3f4f6',
        bubble_radius: 18,
        font_size: 14,
        font_family: "'Unbounded', cursive",
        wallpaper: ''
    };

    // Сброс цвета сообщений
    fetch('/api/update_message_colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ my_message_color: defaults.my_message_color, their_message_color: defaults.their_message_color })
    });

    // Сброс радиуса
    fetch('/api/update_bubble_radius', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bubble_radius: defaults.bubble_radius })
    });

    // Сброс размера шрифта
    fetch('/api/update_font_size', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ font_size: defaults.font_size })
    });

    // Сброс шрифта
    fetch('/api/update_font_family', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ font_family: defaults.font_family })
    });

    // Сброс обоев
    fetch('/api/update_wallpaper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallpaper: '' })
    });

    // Применяем
    document.documentElement.style.setProperty('--primary-color', defaults.my_message_color);
    document.documentElement.style.setProperty('--bubble-radius', defaults.bubble_radius + 'px');
    document.body.style.fontSize = defaults.font_size + 'px';
    document.body.style.fontFamily = defaults.font_family;
    document.getElementById('messagesArea').style.backgroundImage = 'none';

    closeModal('tempModal');
    showToast('🔄 Все настройки сброшены!');
    setTimeout(openAppearance, 500);
}

    function terminateSession(token) {
        fetch('/api/terminate_session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_token: token })
        }).then(() => { closeModal('tempModal'); openSessions(); });
    }

    function terminateAllSessions() {
        if (confirm('Завершить все сессии кроме текущей?')) {
            fetch('/api/terminate_all_sessions', { method: 'POST' }).then(() => { closeModal('tempModal'); alert('Все сессии завершены'); });
        }
    }

    function deleteAccount() {
        if (confirm('Вы уверены? Это действие нельзя отменить!')) {
            const confirmation = prompt('Введите ваш номер телефона или username для подтверждения:');
            if (confirmation) {
                fetch('/api/delete_account', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ confirmation: confirmation })
                }).then(r => r.json()).then(d => {
                    if (d.success) window.location.href = '/logout';
                    else alert('Неверное подтверждение');
                });
            }
        }
    }

    // ===== ЧАТ ИНФО =====
    function openChatInfo() {
        if (!currentChat) return;
        if (currentChatType === 'personal') {
            const otherUserId = currentChat.other_user_id || currentChat.id;
            openUserProfileModal(otherUserId);
        } else if (currentChatType === 'group') {
            if (typeof openGroupInfo === 'function') openGroupInfo(currentChat.id);
            else showModal('Информация о группе', '<div class="user-profile-body"><p>Информация о группе</p></div>');
        } else if (currentChatType === 'channel') {
            if (typeof openChannelInfo === 'function') openChannelInfo(currentChat.id);
            else showModal('Информация о канале', '<div class="user-profile-body"><p>Информация о канале</p></div>');
        }
    }

    function showChatMenu() {
        if (!currentChat) return;
        let html = `
            <div class="user-profile-body">
                <div class="burger-item" onclick="openChatInfo(); closeModal('tempModal');"><i class="fas fa-info-circle"></i> Информация</div>
                ${currentChatType === 'group' ? `<div class="burger-item" onclick="openGroupInfo(${currentChat.id}); closeModal('tempModal');"><i class="fas fa-users"></i> Участники</div>` : ''}
                ${currentChatType === 'channel' ? `<div class="burger-item" onclick="openChannelInfo(${currentChat.id}); closeModal('tempModal');"><i class="fas fa-user-shield"></i> Администраторы</div>` : ''}
                <div class="burger-item" onclick="clearChatWithUser(); closeModal('tempModal');"><i class="fas fa-eraser"></i> Очистить чат</div>
                ${currentChatType === 'channel' ? `<div class="burger-item" onclick="unsubscribeFromCurrentChannel(); closeModal('tempModal');"><i class="fas fa-bell-slash"></i> Отписаться</div>` : ''}
                <div class="burger-divider"></div>
                <div class="burger-item danger" onclick="closeChat(); closeModal('tempModal');"><i class="fas fa-times"></i> Закрыть</div>
            </div>
        `;
        showModal('Меню', html);
    }

    function closeChat() {
        currentChat = null;
        currentChatType = null;
        currentPinnedMessage = null;
        const pinnedBannerEl = document.getElementById('pinnedBanner');
        if (pinnedBannerEl) pinnedBannerEl.style.display = 'none';
        if (typeof showBlockedBanner === 'function') showBlockedBanner(false);
        document.getElementById('messageInputArea').style.display = 'none';
        document.getElementById('messagesArea').innerHTML = '<div class="empty-state"><i class="fas fa-comment-dots"></i><h3>Выберите чат</h3></div>';
        document.getElementById('chatUserName').textContent = 'Выберите чат';
        document.getElementById('chatUserAvatar').innerHTML = '<span>?</span>';
    }

    function showChatSearchModal(chatId) {
        if (!chatId) return;
        let html = `
            <div class="profile-field">
                <label>Поиск по сообщениям</label>
                <div style="display: flex; gap: 8px; margin-bottom: 16px;">
                    <input type="text" id="chatSearchInput" class="modal-input" style="flex:1;" placeholder="Введите слово для поиска..." oninput="searchInChatWithNavigation()">
                    <div style="display: flex; gap: 4px;">
                        <button class="modal-btn modal-btn-secondary" onclick="navigateSearch(-1)" style="padding: 12px 16px;">↑</button>
                        <button class="modal-btn modal-btn-secondary" onclick="navigateSearch(1)" style="padding: 12px 16px;">↓</button>
                    </div>
                </div>
                <div id="searchCounter" style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;"></div>
            </div>
            <div id="chatSearchResults" class="search-results-inline"></div>
        `;
        showModal('Поиск в чате', html);
        window.currentSearchChatId = chatId;
        document.getElementById('chatSearchInput')?.focus();
    }

    async function searchInChatWithNavigation() {
        const query = document.getElementById('chatSearchInput')?.value.trim();
        const resultsDiv = document.getElementById('chatSearchResults');
        const counterDiv = document.getElementById('searchCounter');

        if (!query || query.length < 2) {
            if (resultsDiv) resultsDiv.innerHTML = '';
            if (counterDiv) counterDiv.innerHTML = '';
            searchResultsList = [];
            currentSearchIndex = -1;
            return;
        }

        const response = await fetch('/api/search_in_chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: window.currentSearchChatId, query: query })
        });
        const data = await response.json();

        if (data.messages && data.messages.length) {
            searchResultsList = data.messages;
            currentSearchIndex = 0;

            if (counterDiv) counterDiv.innerHTML = `Найдено: ${searchResultsList.length} сообщений`;

            let html = '';
            data.messages.forEach((msg, idx) => {
                let content = msg.content || '';
                const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
                content = content.replace(regex, '<span class="search-highlight">$1</span>');

                html += `
                    <div class="search-result-message" data-search-index="${idx}" onclick="scrollToMessageAndClose(${msg.id})">
                        <div class="search-result-message-text">${content || '[Медиафайл]'}</div>
                        <div class="search-result-message-meta">${msg.is_mine ? 'Вы' : escapeHtml(msg.display_name || msg.username)} • ${new Date(msg.created_at).toLocaleString()}</div>
                    </div>
                `;
            });
            resultsDiv.innerHTML = html;
            highlightCurrentSearchResult();
        } else {
            resultsDiv.innerHTML = '<div class="search-result-message">Ничего не найдено</div>';
            if (counterDiv) counterDiv.innerHTML = 'Найдено: 0';
            searchResultsList = [];
            currentSearchIndex = -1;
        }
    }

    function navigateSearch(direction) {
        if (searchResultsList.length === 0) return;

        currentSearchIndex += direction;
        if (currentSearchIndex < 0) currentSearchIndex = searchResultsList.length - 1;
        if (currentSearchIndex >= searchResultsList.length) currentSearchIndex = 0;

        highlightCurrentSearchResult();

        const resultElement = document.querySelector(`.search-result-message[data-search-index="${currentSearchIndex}"]`);
        if (resultElement) resultElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const counterDiv = document.getElementById('searchCounter');
        if (counterDiv) counterDiv.innerHTML = `Найдено: ${searchResultsList.length} • Результат ${currentSearchIndex + 1} из ${searchResultsList.length}`;
    }

    function highlightCurrentSearchResult() {
        document.querySelectorAll('.search-result-message').forEach(el => {
            el.style.background = 'transparent';
            el.style.borderLeft = 'none';
        });

        const currentEl = document.querySelector(`.search-result-message[data-search-index="${currentSearchIndex}"]`);
        if (currentEl) {
            currentEl.style.background = 'rgba(102, 126, 234, 0.2)';
            currentEl.style.borderLeft = `3px solid var(--primary-color)`;
        }
    }

    function scrollToMessageAndClose(messageId) {
        scrollToMessage(messageId);
        closeModal('tempModal');
    }

    // ===== ТЕМНАЯ ТЕМА =====
    function toggleNightMode() {
        const isDark = document.body.classList.toggle('dark');
        const icon = document.getElementById('nightModeIcon');
        const text = document.getElementById('nightModeText');
        const toggle = document.getElementById('nightModeToggle');

        if (isDark) {
            icon.className = 'fas fa-sun';
            text.textContent = 'Дневная тема';
            if (toggle) toggle.checked = true;
        } else {
            icon.className = 'fas fa-moon';
            text.textContent = 'Ночная тема';
            if (toggle) toggle.checked = false;
        }

        localStorage.setItem('Sputnik_theme', isDark ? 'dark' : 'light');
        fetch('/api/update_theme', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme: isDark ? 'dark' : 'light' })
        });
    }

    // ===== ЗАКРЫТИЕ ПОИСКА =====
    document.addEventListener('click', function(e) {
        const searchResults = document.getElementById('searchResults');
        const searchInput = document.getElementById('globalSearch');
        if (searchResults && searchInput && !searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.remove('active');
        }
    });

