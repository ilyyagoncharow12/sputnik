    // ===== УВЕДОМЛЕНИЯ =====
    let notificationsEnabled = false;
    let notificationsPermissionAsked = false;

    function openNotifications() {
        if (typeof openPushSettings === 'function') { openPushSettings(); return; }
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
                if (typeof openChat === 'function') openChat(chatId, chatScope || 'personal');
            };
        } catch (e) {}
    }

    // ===== НАСТРОЙКИ КОНФИДЕНЦИАЛЬНОСТИ =====
function openPrivacy() {
    closeBurgerMenu();
    fetch('/api/get_privacy')
        .then(r => r.json())
        .then(settings => {
            let html = `
                <div class="tg-modal-wrapper">
                    <div class="tg-modal-header">
                        <button class="close-btn" onclick="navBack()">
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

                        <div class="tg-section-title">Пользовательское соглашение</div>
                        <div class="tg-setting-row" onclick="openRevokeAgreement()"
                             style="display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;
                                    border-bottom:1px solid rgba(128,128,128,.15);">
                            <div style="width:34px;height:34px;border-radius:50%;background:rgba(255,184,0,.18);
                                        display:flex;align-items:center;justify-content:center;color:#ffb800;">
                                <i class="fas fa-file-circle-xmark"></i>
                            </div>
                            <div style="flex:1;">
                                <div style="font-size:15px;">Отозвать соглашение</div>
                                <div style="font-size:12px;color:var(--modal-fg-muted);">
                                    Общение будет заблокировано, аккаунт останется доступным
                                </div>
                            </div>
                            <i class="fas fa-chevron-right" style="color:var(--modal-fg-muted);font-size:12px;"></i>
                        </div>

                        <div style="display: flex; gap: 10px; margin-top: 20px;">
                            <button class="tg-action-btn" onclick="savePrivacySettings()" style="flex: 1; background: var(--modal-accent); color: var(--modal-fg);">
                                <i class="fas fa-save"></i> Сохранить
                            </button>
                            <button class="tg-action-btn" onclick="navBack()" style="flex: 1; background: var(--modal-btn-bg); color: var(--modal-fg-muted);">
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
        fetch('/api/get_settings')
            .then(r => r.json())
            .then(s => {
                const myColor = s.my_message_color || '#eeffde';
                const theirColor = s.their_message_color || '#ffffff';
                const radius = s.bubble_radius || 12;
                const fontSize = s.font_size || 14;
                const fontFamily = s.font_family || "'Unbounded', cursive";
                const wallpaper = s.wallpaper_image || '';
                const theme = s.theme || 'light';

                let html = `
                    <div class="tg-modal-wrapper">
                        <div class="tg-modal-header">
                            <button class="close-btn" onclick="navBack()">
                                <i class="fas fa-arrow-left"></i>
                            </button>
                            <div class="title">Оформление</div>
                            <div style="width: 24px;"></div>
                        </div>
                        <div class="tg-modal-body">
                            <!-- ПРЕДПРОСМОТР (как в Telegram) -->
                            <div class="appearance-preview">
                                <div class="preview-row">
                                    <div class="preview-msg theirs" style="background: ${theirColor}; color: ${theirColor === '#f3f4f6' || theirColor === '#ffffff' ? '#1e293b' : 'white'}; border-radius: ${radius}px; font-size: ${fontSize}px; font-family: ${fontFamily};">
                                        <span>Привет! Как дела?</span>
                                        <span class="label">Собеседник</span>
                                    </div>
                                </div>
                                <div class="preview-row preview-row-mine">
                                    <div class="preview-msg mine" style="background: ${myColor}; color: white; border-radius: ${radius}px; font-size: ${fontSize}px; font-family: ${fontFamily};">
                                        <span>Всё отлично! 👍</span>
                                        <span class="label">Вы</span>
                                    </div>
                                </div>
                            </div>

                            <!-- НАСТРОЙКИ -->
                            <div class="tg-section-title">Цвета сообщений</div>
                            <div class="color-row">
                                <div class="color-pair">
                                    <div class="color-item">
                                        <div class="color-label">Ваши</div>
                                        <input type="color" id="myMessageColor" value="${myColor}" onchange="updateAppearancePreview()">
                                    </div>
                                    <div class="color-item">
                                        <div class="color-label">Собеседника</div>
                                        <input type="color" id="theirMessageColor" value="${theirColor}" onchange="updateAppearancePreview()">
                                    </div>
                                </div>
                            </div>

                            <div class="tg-section-title">Радиус пузырей</div>
                            <div class="slider-row">
                                <span id="radiusValue">${radius}px</span>
                                <input type="range" id="bubbleRadius" min="0" max="30" value="${radius}" oninput="updateAppearancePreview()">
                            </div>

                            <div class="tg-section-title">Размер шрифта</div>
                            <div class="slider-row">
                                <span id="fontSizeValue">${fontSize}px</span>
                                <input type="range" id="fontSize" min="12" max="24" value="${fontSize}" oninput="updateAppearancePreview()">
                            </div>

                            <div class="tg-section-title">Шрифт</div>
                            <select id="fontFamily" onchange="updateAppearancePreview()" class="tg-select">
                                <option value="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" ${fontFamily.startsWith('-apple-system') ? 'selected' : ''}>Системный (как в Telegram)</option>
                                <option value="'Unbounded', cursive" ${fontFamily.includes('Unbounded') ? 'selected' : ''}>Unbounded</option>
                                <option value="'Roboto', sans-serif" ${fontFamily.includes('Roboto') ? 'selected' : ''}>Roboto</option>
                                <option value="'Inter', sans-serif" ${fontFamily.includes('Inter') ? 'selected' : ''}>Inter</option>
                                <option value="'Arial', sans-serif" ${fontFamily.includes('Arial') ? 'selected' : ''}>Arial</option>
                                <option value="'Helvetica Neue', sans-serif" ${fontFamily.includes('Helvetica Neue') ? 'selected' : ''}>Helvetica Neue</option>
                                <option value="'Times New Roman', serif" ${fontFamily.includes('Times') ? 'selected' : ''}>Times New Roman</option>
                                <option value="'Courier New', monospace" ${fontFamily.includes('Courier') ? 'selected' : ''}>Courier New</option>
                                <option value="'Georgia', serif" ${fontFamily.includes('Georgia') ? 'selected' : ''}>Georgia</option>
                                <option value="'Verdana', sans-serif" ${fontFamily.includes('Verdana') ? 'selected' : ''}>Verdana</option>
                            </select>

                            <div class="tg-section-title">Тема</div>
                            <div class="theme-row">
                                <label class="theme-option ${theme === 'light' ? 'active' : ''}">
                                    <input type="radio" name="appearanceTheme" value="light" onchange="setAppearanceTheme('light')" ${theme === 'light' ? 'checked' : ''}>
                                    <span class="theme-name">Светлая</span>
                                    <span class="theme-dot"></span>
                                </label>
                                <label class="theme-option ${theme === 'dark' ? 'active' : ''}">
                                    <input type="radio" name="appearanceTheme" value="dark" onchange="setAppearanceTheme('dark')" ${theme === 'dark' ? 'checked' : ''}>
                                    <span class="theme-name">Тёмная</span>
                                    <span class="theme-dot"></span>
                                </label>
                            </div>

                            <div class="tg-section-title">Обои</div>
                            <div class="wallpaper-row">
                                <button class="tg-action-btn" onclick="document.getElementById('wallpaperInput').click()">
                                    <i class="fas fa-image"></i> Выбрать обои
                                </button>
                                <input type="file" id="wallpaperInput" accept="image/*" style="display: none;" onchange="uploadWallpaper(this)">
                                ${wallpaper ? `
                                <button class="tg-action-btn danger" onclick="resetWallpaper()">
                                    <i class="fas fa-undo"></i> Убрать
                                </button>
                                ` : ''}
                            </div>

                            <div style="display: flex; gap: 10px; margin-top: 20px;">
                                <button class="tg-action-btn" onclick="saveAppearanceSettings()" style="flex: 1; background: var(--modal-accent); color: var(--modal-fg);">
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

    function setAppearanceTheme(theme) {
        document.body.classList.toggle('dark', theme === 'dark');
        localStorage.setItem('Sputnik_theme', theme);
        fetch('/api/update_theme', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme: theme })
        });
        // Применяем пузыри под новую тему
        sputnikApplyBubbleColor(window.__myBubbleColor || '');
        updateAppearancePreview();
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
        // Цвет текста для пузыря собеседника: на светлом фоне — тёмный, на тёмном — белый
        const theirTextColor = theirColor === '#f3f4f6' || theirColor === '#ffffff' ? '#1e293b' : 'white';
        theirMsg.style.background = theirColor;
        theirMsg.style.color = theirTextColor;
        theirMsg.style.borderRadius = radius + 'px';
        theirMsg.style.fontSize = fontSize + 'px';
        theirMsg.style.fontFamily = fontFamily;

        // Цвет текста для своего пузыря: всегда белый (как в TG)
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

    // Сохраняем тему
    const theme = document.body.classList.contains('dark') ? 'dark' : 'light';
    fetch('/api/update_theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: theme })
    });

    // Применяем изменения
    sputnikApplyBubbleColor(myColor);
    document.documentElement.style.setProperty('--bubble-radius', radius + 'px');
    document.body.style.fontSize = fontSize + 'px';
    document.body.style.fontFamily = fontFamily;

    // Обновляем стиль сообщений в чате (убираем инлайн — рулят CSS-переменные)
    document.querySelectorAll('.message.outgoing .message-bubble').forEach(el => {
        el.style.background = '';
        el.style.color = '';
    });

    document.querySelectorAll('.message.incoming .message-bubble').forEach(el => {
        el.style.background = '';
        el.style.color = '';
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
                                ${isCurrent ? '<span style="font-size:11px;background:var(--primary-gradient, linear-gradient(135deg,#667eea,#764ba2));color:var(--modal-fg);padding:2px 8px;border-radius:6px;font-weight:600;">Текущая</span>' : ''}
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
        if (!/^image\//.test(file.type)) {
            showToast('❌ Выберите изображение для обоев');
            input.value = '';
            return;
        }
        openWallpaperCrop(file);
    }
    // Сбрасываем value, чтобы повторный выбор того же файла снова открывал редактор
    input.value = '';
}

// ===== ОБОИ: МОДАЛЬНОЕ ОКНО ВЫБОРА/ОБРЕЗКИ (как в Telegram) =====
const WALLPAPER_CROP_MAX_ZOOM = 4;

let wallpaperCropState = {
    file: null,
    url: null,
    aspect: '16:9',
    zoom: 1,          // 1 = вписано по короткой стороне (cover), до 4
    offsetX: 0.5,     // положение изображения в рамке: 0..1 (0.5 — центр)
    offsetY: 0.5,
    img: null,
    pointers: new Map(),
    panStart: null,
    pinchStart: null,
    cleanup: null,
};

function wallpaperCropResetState() {
    wallpaperCropState = {
        file: null, url: null, aspect: '16:9', zoom: 1,
        offsetX: 0.5, offsetY: 0.5, img: null,
        pointers: new Map(), panStart: null, pinchStart: null, cleanup: null
    };
}

function openWallpaperCrop(file) {
    // Если окно уже открыто — закрываем предыдущее
    if (document.getElementById('wallpaperCropOverlay')) wallpaperCropCancel();

    const state = wallpaperCropState;
    state.file = file;
    state.url = URL.createObjectURL(file);
    // На телефоне логичнее вертикальные обои, на ПК — горизонтальные
    state.aspect = window.innerHeight > window.innerWidth ? '9:16' : '16:9';
    state.zoom = 1;
    state.offsetX = 0.5;
    state.offsetY = 0.5;
    state.img = null;
    state.pointers = new Map();
    state.panStart = null;
    state.pinchStart = null;

    const overlay = document.createElement('div');
    overlay.className = 'wallpaper-crop-overlay';
    overlay.id = 'wallpaperCropOverlay';

    overlay.innerHTML = `
        <div class="wallpaper-crop-topbar">
            <button class="wallpaper-crop-btn" onclick="wallpaperCropCancel()"><i class="fas fa-xmark"></i></button>
            <div style="flex:1;"></div>
            <button class="wallpaper-crop-btn primary" onclick="wallpaperCropApply()"><i class="fas fa-check"></i></button>
        </div>
        <div class="wallpaper-crop-body">
            <div class="wallpaper-crop-bg-blur" id="wallpaperCropBgBlur"></div>
            <div class="wallpaper-crop-frame" id="wallpaperCropFrame">
                <div class="wallpaper-crop-aspect" id="wallpaperCropAspect"></div>
                <img class="wallpaper-crop-frame-image" id="wallpaperCropImage" src="${state.url}" alt="" draggable="false">
            </div>
        </div>
        <div class="wallpaper-crop-bottom">
            <div class="wallpaper-crop-aspect-row">
                <button class="wallpaper-crop-aspect-chip ${state.aspect === '16:9' ? 'active' : ''}" data-aspect="16:9" onclick="wallpaperCropSetAspect('16:9')">16:9</button>
                <button class="wallpaper-crop-aspect-chip ${state.aspect === '9:16' ? 'active' : ''}" data-aspect="9:16" onclick="wallpaperCropSetAspect('9:16')">9:16</button>
            </div>
            <div class="wallpaper-crop-zoom">
                <i class="fas fa-magnifying-glass-minus"></i>
                <input type="range" id="wallpaperCropZoom" min="1" max="${WALLPAPER_CROP_MAX_ZOOM}" step="0.01" value="1"
                       oninput="wallpaperCropZoomInput(this.value)">
                <i class="fas fa-magnifying-glass-plus"></i>
            </div>
            <div class="wallpaper-crop-actions">
                <button class="wallpaper-crop-btn" onclick="wallpaperCropCancel()">Отмена</button>
                <button class="wallpaper-crop-btn primary" onclick="wallpaperCropApply()">Использовать</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.classList.add('active');

    const bgBlur = document.getElementById('wallpaperCropBgBlur');
    if (bgBlur) bgBlur.style.backgroundImage = `url('${state.url}')`;

    const img = document.getElementById('wallpaperCropImage');
    const frame = document.getElementById('wallpaperCropFrame');
    state.img = img;

    // Размер рамки считаем от реально доступного места (без искажения пропорций)
    wallpaperCropSizeFrame();

    if (img.complete && img.naturalWidth) wallpaperCropUpdate();
    else img.onload = () => wallpaperCropUpdate();

    // ----- Перетаскивание и пинч-зум через pointer events (ПК + тач) -----
    const pointers = state.pointers;

    const framePoint = (e) => {
        const rect = frame.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onPointerDown = (e) => {
        if (e.target.closest && e.target.closest('button')) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        try { frame.setPointerCapture(e.pointerId); } catch (_) {}
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pointers.size === 1) {
            state.panStart = {
                pointerX: e.clientX,
                pointerY: e.clientY,
                offsetX: state.offsetX,
                offsetY: state.offsetY,
                lay: wallpaperCropLayout()
            };
            state.pinchStart = null;
            frame.classList.add('dragging');
        } else if (pointers.size === 2) {
            const pts = Array.from(pointers.values());
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
            const rect = frame.getBoundingClientRect();
            state.pinchStart = {
                dist,
                zoom: state.zoom,
                midX: (pts[0].x + pts[1].x) / 2 - rect.left,
                midY: (pts[0].y + pts[1].y) / 2 - rect.top
            };
            state.panStart = null;
        }
        e.preventDefault();
    };

    const onPointerMove = (e) => {
        if (!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pointers.size >= 2 && state.pinchStart) {
            const pts = Array.from(pointers.values());
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
            const rect = frame.getBoundingClientRect();
            const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
            const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
            wallpaperCropSetZoom(state.pinchStart.zoom * (dist / state.pinchStart.dist), midX, midY);
            e.preventDefault();
            return;
        }

        if (pointers.size === 1 && state.panStart) {
            const ps = state.panStart;
            const lay = ps.lay || wallpaperCropLayout();
            if (!lay) return;
            const spanX = lay.frameW - lay.finalW;
            const spanY = lay.frameH - lay.finalH;
            const dx = e.clientX - ps.pointerX;
            const dy = e.clientY - ps.pointerY;
            if (spanX < -0.5) {
                state.offsetX = Math.max(0, Math.min(1, ps.offsetX + dx / spanX));
            }
            if (spanY < -0.5) {
                state.offsetY = Math.max(0, Math.min(1, ps.offsetY + dy / spanY));
            }
            wallpaperCropUpdate();
            e.preventDefault();
        }
    };

    const onPointerUp = (e) => {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) state.pinchStart = null;
        if (pointers.size === 1) {
            // после пинча остался один палец — продолжаем как перетаскивание
            const rest = Array.from(pointers.values())[0];
            state.panStart = {
                pointerX: rest.x,
                pointerY: rest.y,
                offsetX: state.offsetX,
                offsetY: state.offsetY,
                lay: wallpaperCropLayout()
            };
        }
        if (pointers.size === 0) {
            state.panStart = null;
            frame.classList.remove('dragging');
        }
    };

    const onWheel = (e) => {
        e.preventDefault();
        const p = framePoint(e);
        const factor = Math.exp(-e.deltaY * 0.0015);
        wallpaperCropSetZoom(state.zoom * factor, p.x, p.y);
    };

    frame.addEventListener('pointerdown', onPointerDown);
    frame.addEventListener('pointermove', onPointerMove);
    frame.addEventListener('pointerup', onPointerUp);
    frame.addEventListener('pointercancel', onPointerUp);
    frame.addEventListener('wheel', onWheel, { passive: false });

    // При повороте экрана/изменении окна рамка и картинка пересчитываются
    const onResize = () => {
        wallpaperCropSizeFrame();
        wallpaperCropUpdate();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    state.cleanup = () => {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('orientationchange', onResize);
    };
}

// Геометрия: cover-масштаб + зум. Возвращает размеры/позицию картинки в рамке.
function wallpaperCropLayout() {
    const frame = document.getElementById('wallpaperCropFrame');
    const img = document.getElementById('wallpaperCropImage');
    if (!frame || !img) return null;

    const frameW = frame.clientWidth;
    const frameH = frame.clientHeight;
    const imgW = img.naturalWidth || img.width || 0;
    const imgH = img.naturalHeight || img.height || 0;
    if (!frameW || !frameH || !imgW || !imgH) return null;

    // Правильный cover: картинка полностью закрывает рамку
    const baseScale = Math.max(frameW / imgW, frameH / imgH);
    const scale = baseScale * wallpaperCropState.zoom;
    const finalW = imgW * scale;
    const finalH = imgH * scale;

    // offsetX/offsetY: 0..1 — где стоит картинка (0.5 = центр)
    const left = (frameW - finalW) * wallpaperCropState.offsetX;
    const top = (frameH - finalH) * wallpaperCropState.offsetY;

    return { img, frameW, frameH, imgW, imgH, baseScale, scale, finalW, finalH, left, top };
}

// Подгоняем рамку под свободное место, сохраняя выбранное соотношение сторон
function wallpaperCropSizeFrame() {
    const overlay = document.getElementById('wallpaperCropOverlay');
    const frame = document.getElementById('wallpaperCropFrame');
    const body = overlay && overlay.querySelector('.wallpaper-crop-body');
    if (!frame || !body) return;

    const availW = Math.max(120, body.clientWidth - 16);
    const availH = Math.max(120, body.clientHeight - 16);
    const ar = wallpaperCropState.aspect === '9:16' ? 9 / 16 : 16 / 9;

    let w = Math.min(availW, availH * ar, 900);
    let h = w / ar;
    if (h > availH) {
        h = availH;
        w = h * ar;
    }

    frame.style.width = Math.round(w) + 'px';
    frame.style.height = Math.round(h) + 'px';
}

function wallpaperCropUpdate() {
    const lay = wallpaperCropLayout();
    if (!lay) return;
    const img = document.getElementById('wallpaperCropImage');
    if (!img) return;

    img.style.width = lay.finalW + 'px';
    img.style.height = lay.finalH + 'px';
    img.style.left = lay.left + 'px';
    img.style.top = lay.top + 'px';
    img.style.position = 'absolute';
    img.style.cursor = 'grab';

    const bgBlur = document.getElementById('wallpaperCropBgBlur');
    if (bgBlur) bgBlur.style.backgroundImage = `url('${wallpaperCropState.url}')`;

    const slider = document.getElementById('wallpaperCropZoom');
    if (slider && Math.abs(parseFloat(slider.value) - wallpaperCropState.zoom) > 0.001) {
        slider.value = wallpaperCropState.zoom;
    }
}

function wallpaperCropSetAspect(aspect) {
    if (aspect !== '16:9' && aspect !== '9:16') return;
    wallpaperCropState.aspect = aspect;
    wallpaperCropState.zoom = 1;
    wallpaperCropState.offsetX = 0.5;
    wallpaperCropState.offsetY = 0.5;
    document.querySelectorAll('.wallpaper-crop-aspect-chip').forEach(b => {
        b.classList.toggle('active', b.dataset.aspect === aspect);
    });
    wallpaperCropSizeFrame();
    wallpaperCropUpdate();
}

function wallpaperCropCancel() {
    const overlay = document.getElementById('wallpaperCropOverlay');
    const state = wallpaperCropState;
    if (state.cleanup) {
        try { state.cleanup(); } catch (_) {}
    }
    if (overlay) overlay.remove();
    if (state.url) URL.revokeObjectURL(state.url);
    wallpaperCropResetState();
}

function wallpaperCropZoomInput(value) {
    const z = parseFloat(value);
    wallpaperCropSetZoom(isNaN(z) ? 1 : z);
}

// Установка зума с сохранением точки под «якорем» (курсор/центр пинча)
function wallpaperCropSetZoom(newZoom, anchorX, anchorY) {
    const state = wallpaperCropState;
    const lay = wallpaperCropLayout();
    if (!lay) {
        state.zoom = Math.max(1, Math.min(WALLPAPER_CROP_MAX_ZOOM, newZoom));
        return;
    }

    newZoom = Math.max(1, Math.min(WALLPAPER_CROP_MAX_ZOOM, newZoom));
    if (anchorX == null) anchorX = lay.frameW / 2;
    if (anchorY == null) anchorY = lay.frameH / 2;

    // Точка изображения (в пикселях исходника) под якорем
    const imgX = (anchorX - lay.left) / lay.scale;
    const imgY = (anchorY - lay.top) / lay.scale;

    state.zoom = newZoom;
    const scale = lay.baseScale * newZoom;
    const finalW = lay.imgW * scale;
    const finalH = lay.imgH * scale;
    const left = anchorX - imgX * scale;
    const top = anchorY - imgY * scale;

    const spanX = lay.frameW - finalW;
    const spanY = lay.frameH - finalH;
    state.offsetX = spanX < -0.5 ? Math.max(0, Math.min(1, left / spanX)) : 0.5;
    state.offsetY = spanY < -0.5 ? Math.max(0, Math.min(1, top / spanY)) : 0.5;

    wallpaperCropUpdate();
}

async function wallpaperCropApply() {
    const overlay = document.getElementById('wallpaperCropOverlay');
    if (!overlay) return;

    const lay = wallpaperCropLayout();
    if (!lay) {
        showToast('❌ Изображение ещё не загрузилось');
        return;
    }

    const is16x9 = wallpaperCropState.aspect === '16:9';
    const outW = is16x9 ? 1600 : 900;
    // Высота — строго по видимой области рамки, чтобы не было растяжения
    const outH = Math.round(outW * lay.frameH / lay.frameW);

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Видимая область рамки — в пикселях исходного изображения
    const srcX = Math.max(0, -lay.left / lay.scale);
    const srcY = Math.max(0, -lay.top / lay.scale);
    const srcW = Math.min(lay.imgW - srcX, lay.frameW / lay.scale);
    const srcH = Math.min(lay.imgH - srcY, lay.frameH / lay.scale);

    ctx.drawImage(lay.img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);

    canvas.toBlob(async (blob) => {
        if (!blob) {
            showToast('❌ Ошибка обработки изображения');
            wallpaperCropCancel();
            return;
        }

        const baseName = (wallpaperCropState.file.name || 'wallpaper').replace(/\.[^.]+$/, '') || 'wallpaper';
        const file = new File([blob], baseName + '.jpg', { type: 'image/jpeg' });
        wallpaperCropCancel();

        const fd = new FormData();
        fd.append('wallpaper', file);

        try {
            const r = await fetch('/api/update_wallpaper', { method: 'POST', body: fd });
            const data = await r.json();
            if (data.success) {
                const area = document.getElementById('messagesArea');
                if (area) {
                    area.style.backgroundImage = `url('/${data.wallpaper_image}')`;
                    area.style.backgroundSize = 'cover';
                    area.style.backgroundPosition = 'center';
                }
                closeModal('tempModal');
                showToast('✅ Обои обновлены!');
                setTimeout(openAppearance, 500);
            } else {
                showToast('❌ Ошибка при загрузке обоев');
            }
        } catch (e) {
            showToast('❌ Ошибка соединения');
        }
    }, 'image/jpeg', 0.92);
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
        my_message_color: '#eeffde',
        their_message_color: '#ffffff',
        bubble_radius: 12,
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
    sputnikApplyBubbleColor(defaults.my_message_color);
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

    // ===== ОТЗЫВ ПОЛЬЗОВАТЕЛЬСКОГО СОГЛАШЕНИЯ =====
    function openRevokeAgreement() {
        closeBurgerMenu();
        const html = `
            <div class="tg-modal-wrapper">
                <div class="tg-modal-header">
                    <button class="close-btn" onclick="navBack()"><i class="fas fa-arrow-left"></i></button>
                    <div class="title">Отзыв соглашения</div>
                    <div style="width: 24px;"></div>
                </div>
                <div class="tg-modal-body">
                    <div class="tg-section-title">ВНИМАНИЕ</div>
                    <div style="background:rgba(255,184,0,0.12);border:1px solid rgba(255,184,0,0.35);border-radius:14px;padding:14px 16px;margin-bottom:18px;color:#ffd66b;font-size:13px;line-height:1.55;">
                        Если отозвать пользовательское соглашение, <b>из аккаунта вас не выкинет</b>, но общение
                        будет полностью закрыто: нельзя <b>писать и получать сообщения, звонить, отвечать на звонки</b>,
                        отправлять файлы, стикеры и реакции. На всех действиях появится замок с напоминанием
                        принять соглашение.
                    </div>
                    <p style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin-bottom:20px;">
                        Вернуть доступ можно прямо из замка — кнопкой «Принять соглашение». Администратор также
                        может восстановить его из панели управления. Продолжая, вы подтверждаете, что понимаете:
                        мессенджером можно будет пользоваться только после повторного принятия.
                    </p>
                    <div style="display:flex;gap:10px;">
                        <button id="revokeAgreementBtn" class="tg-action-btn danger" style="flex:1;" onclick="confirmRevokeAgreement()">
                            <i class="fas fa-file-circle-xmark"></i> Отозвать соглашение
                        </button>
                        <button class="tg-action-btn" style="flex:1;background:var(--modal-btn-bg);color:var(--modal-fg-muted);" onclick="navBack()">
                            <i class="fas fa-times"></i> Отмена
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('tempModalBody').innerHTML = html;
        openModal('tempModal');
    }

    function confirmRevokeAgreement() {
        const btn = document.getElementById('revokeAgreementBtn');
        if (btn) btn.disabled = true;
        fetch('/api/revoke_agreement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
        })
        .then(r => r.json())
        .then(d => {
            if (d.success) {
                closeModal('tempModal');
                if (typeof showAgreementLock === 'function') {
                    showAgreementLock(d.message);
                } else if (typeof setAgreementLocked === 'function') {
                    setAgreementLocked(true, { showOverlay: true, message: d.message });
                }
                showToast('🔒 Соглашение отозвано — общение заблокировано');
                return;
            }
            showToast(d.error || 'Не удалось отозвать соглашение');
            if (btn) btn.disabled = false;
        })
        .catch(() => {
            showToast('Ошибка соединения с сервером');
            if (btn) btn.disabled = false;
        });
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
            const chatName = (currentChat && currentChat.name) || '';
            const isFavorite = chatName.indexOf('Избранное') !== -1;
            // Избранное — как канал в Telegram: информационная страница, не профиль пользователя
            if (isFavorite) {
                openFavoriteInfo();
                return;
            }
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

    // ===== ИНФО ИЗБРАННОГО (как канал в Telegram) =====
    function openFavoriteInfo() {
        closeBurgerMenu();
        fetch('/api/get_settings')
            .then(r => r.json())
            .then(settings => {
                const wallpaper = settings.wallpaper_image || '';
                const myColor = settings.my_message_color || '#eeffde';
                const theirColor = settings.their_message_color || '#ffffff';
                const radius = settings.bubble_radius || 12;

                let bannerStyle = '';
                if (settings.banner_image) {
                    bannerStyle = `background-image: url('/${settings.banner_image}'); background-size: cover; background-position: center;`;
                } else if (settings.banner_color) {
                    bannerStyle = `background: ${settings.banner_color};`;
                } else {
                    bannerStyle = `background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);`;
                }

                let html = '<div class="other-profile">';
                html += '<div class="modal-content" style="background: var(--modal-bg); border-radius: 24px; overflow-y: auto; color: var(--modal-fg); max-width: 560px;">';
                html += `<div class="banner" id="profileBanner" style="${bannerStyle}">`;
                html += '<div class="overlay"></div>';
                html += '<div class="top-bar">';
                html += '<button class="back-btn" onclick="closeModal(\'tempModal\')"><i class="fas fa-arrow-left"></i></button>';
                html += '</div>';
                html += '</div>';

                html += '<div class="avatar-wrap"><div class="avatar-placeholder">★</div></div>';
                html += '<div class="name-wrap">';
                html += '<div class="display-name">Избранное</div>';
                html += '<div class="username">Ваш личный сейф</div>';
                html += '</div>';

                // Описание
                html += '<div class="info-section" style="padding: 16px 20px; border-bottom: 1px solid var(--border-color);">';
                html += '<div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">Сообщения, фото, видео, файлы и ссылки, которые вы сохранили.</div>';
                html += '<div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted);">МЕДИА</div>';
                html += '</div>';

                // Ссылка на медиа-галерею
                html += '<div class="media-row-link" data-name="Избранное" onclick="openUserMediaFromFavorite()" style="display: flex; align-items: center; padding: 14px 20px; cursor: pointer; border-bottom: 1px solid var(--border-color);">';
                html += '<i class="fas fa-photo-film" style="width: 30px; color: var(--text-secondary);"></i>';
                html += '<div style="flex: 1;">';
                html += '<div style="font-size: 15px; color: var(--text-primary); font-weight: 600;">Медиа</div>';
                html += '<div style="font-size: 13px; color: var(--text-muted);">Фото, видео, файлы и ссылки из Избранного</div>';
                html += '</div>';
                html += '<span class="value">смотреть <i class="fas fa-chevron-right"></i></span>';
                html += '</div>';

                // Подпись
                html += '<div class="info-section" style="padding: 16px 20px; border-bottom: 1px solid var(--border-color);">';
                html += '<div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted);">ОБ ИЗБРАННОМ</div>';
                html += '<div style="font-size: 14px; color: var(--text-primary); line-height: 1.5;">Сообщения, которые вы переслали в «Избранное», остаются здесь навсегда. Только вы видите этот чат.</div>';
                html += '</div>';

                // Кнопки действий
                html += '<div style="padding: 16px 20px; display: flex; gap: 8px;">';
                html += '<button class="tg-action-btn" style="flex: 1;" onclick="closeModal(\'tempModal\'); openChatTrash();"><i class="fas fa-trash-restore"></i> Очистить Избранное</button>';
                html += '<button class="tg-action-btn danger" style="flex: 1;" onclick="closeModal(\'tempModal\');"><i class="fas fa-times"></i> Закрыть</button>';
                html += '</div>';

                html += '</div>';
                html += '</div>';

                showModal('Избранное', html);
            })
            .catch(err => {
                console.error('Error loading favorite info:', err);
                showModal('Избранное', '<div style="padding: 20px; text-align: center;">Не удалось загрузить информацию</div>');
            });
    }

    // ===== МЕДИА ИЗБРАННОГО =====
    function openUserMediaFromFavorite() {
        closeModal('tempModal');
        if (typeof openUserMedia === 'function' && window.CURRENT_USER) {
            openUserMedia(window.CURRENT_USER.id, 'Избранное');
        }
    }

    // ===== ТЕМНАЯ ТЕМА =====
    function toggleNightMode() {
        const isDark = document.body.classList.toggle('dark');
        sputnikApplyBubbleColor(window.__myBubbleColor || '');
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

    // ===== ОБСЛУЖИВАНИЕ БД (раздел 4A) =====
    function dbMaintBytes(n) {
        n = Number(n) || 0;
        if (n < 1024) return n + ' Б';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' КБ';
        return (n / 1024 / 1024).toFixed(1) + ' МБ';
    }

    function dbMaintRow(label, value, ok) {
        const color = ok === true ? '#2ecc71' : (ok === false ? '#e74c3c' : 'var(--text-muted)');
        return `<div class="dbm-row"><span>${label}</span><b style="color:${color};">${value}</b></div>`;
    }

    async function dbMaintenanceAllowed() {
        try {
            const r = await fetch('/api/db/health');
            if (r.status === 403 || r.status === 401) return false;
            const d = await r.json();
            return !!(d && d.success);
        } catch (e) { return false; }
    }

    function dbMaintenanceBody(h, report, backup) {
        let rows = '';
        if (h) {
            rows += dbMaintRow('Целостность', h.integrity, h.integrity === 'ok');
            rows += dbMaintRow('Битые ссылки', h.foreign_keys_total, h.foreign_keys_total === 0);
            rows += dbMaintRow('Таблиц', h.tables, null);
            rows += dbMaintRow('Размер БД', dbMaintBytes(h.db_size), null);
        }
        if (report) {
            rows += '<div style="height:8px;"></div>';
            rows += dbMaintRow('Осиротевшие записи', report.total + ' шт.', report.total === 0);
            (report.steps || []).slice(0, 8).forEach(s => {
                rows += `<div style="font-size:11px;color:var(--text-muted);padding:2px 0 2px 8px;">`
                    + `${s.table}.${s.column} → ${s.target}: ${s.count}</div>`;
            });
        }
        if (backup) rows += dbMaintRow('Копия БД', backup, true);
        return `<div class="dbm-wrap">
            ${rows || '<div style="color:var(--text-muted);font-size:13px;">Загрузка...</div>'}
            <div class="dbm-actions">
                <button class="dbm-btn" onclick="dbMaintenanceRefresh()"><i class="fas fa-rotate"></i> Проверить</button>
                <button class="dbm-btn" onclick="dbMaintenanceBackup()"><i class="fas fa-copy"></i> Сделать копию</button>
                <button class="dbm-btn" id="dbmClean" onclick="dbMaintenanceClean(this)"><i class="fas fa-broom"></i> Очистить осиротевшие</button>
            </div>
        </div>`;
    }

    function dbMaintenanceShow(h, report, backup) {
        showModal('Обслуживание БД', dbMaintenanceBody(h, report, backup));
    }

    function dbMaintenanceRefresh() {
        dbMaintenanceShow(null, null, null);
        fetch('/api/db/health').then(r => r.json()).then(d => {
            dbMaintenanceShow((d && d.health) || null, null, null);
        }).catch(() => showToast('Ошибка сети'));
    }

    function dbMaintenanceBackup() {
        dbMaintenanceShow(null, null, null);
        fetch('/api/db/backup', { method: 'POST' }).then(r => r.json()).then(d => {
            if (d && d.success) {
                fetch('/api/db/health').then(x => x.json()).then(h => {
                    dbMaintenanceShow((h && h.health) || null, null, d.backup);
                });
            } else showToast((d && d.error) || 'Не удалось');
        }).catch(() => showToast('Ошибка сети'));
    }

    function dbMaintenanceClean(btn) {
        // Двухшаговое подтверждение: кнопка просит подтвердить ещё раз.
        if (btn && btn.dataset.armed !== '1') {
            btn.dataset.armed = '1';
            btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Нажмите ещё раз: удалить записи';
            btn.style.background = 'var(--danger, #e74c3c)';
            btn.style.color = '#fff';
            setTimeout(() => {
                if (btn.dataset.armed === '1') {
                    btn.dataset.armed = '0';
                    btn.innerHTML = '<i class="fas fa-broom"></i> Очистить осиротевшие';
                    btn.style.background = '';
                    btn.style.color = '';
                }
            }, 6000);
            return;
        }
        dbMaintenanceShow(null, null, null);
        fetch('/api/db/cleanup_orphans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apply: true, confirm: 'DELETE' })
        }).then(r => r.json()).then(d => {
            if (!d || !d.success) { showToast((d && d.error) || 'Ошибка'); return; }
            const rep = d.report || {};
            fetch('/api/db/health').then(x => x.json()).then(h => {
                dbMaintenanceShow((h && h.health) || null, rep, rep.backup);
                showToast('Удалено: ' + rep.total);
            });
        }).catch(() => showToast('Ошибка сети'));
    }

    function openDbMaintenance() {
        closeBurgerMenu();
        closeModal('tempModal');
        dbMaintenanceRefresh();
    }

    // ===== ЗАКРЫТИЕ ПОИСКА =====
    document.addEventListener('click', function(e) {
        const searchResults = document.getElementById('searchResults');
        const searchInput = document.getElementById('globalSearch');
        if (searchResults && searchInput && !searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.remove('active');
        }
    });

    // ===== ЭКСПОРТ ФУНКЦИЙ ОБОЕВ =====
    window.openWallpaperCrop = openWallpaperCrop;
    window.wallpaperCropApply = wallpaperCropApply;
    window.wallpaperCropCancel = wallpaperCropCancel;
    window.wallpaperCropSetAspect = wallpaperCropSetAspect;
    window.wallpaperCropUpdate = wallpaperCropUpdate;

