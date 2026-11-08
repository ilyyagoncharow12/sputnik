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
            return;
        }
        openWallpaperCrop(file);
    }
}

// ===== ОБОИ: МОДАЛЬНОЕ ОКНО ВЫБОРА/ОБРЕЗКИ (как в Telegram) =====
let wallpaperCropState = {
    file: null,
    url: null,
    aspect: '16:9',
    offsetX: 0.5,
    offsetY: 0.5,
    img: null,
};

function openWallpaperCrop(file) {
    wallpaperCropState.file = file;
    wallpaperCropState.url = URL.createObjectURL(file);
    wallpaperCropState.aspect = '16:9';
    wallpaperCropState.offsetX = 0.5;
    wallpaperCropState.offsetY = 0.5;

    const overlay = document.createElement('div');
    overlay.className = 'wallpaper-crop-overlay';
    overlay.id = 'wallpaperCropOverlay';

    const is16x9 = wallpaperCropState.aspect === '16:9';
    const maxW = Math.min(window.innerWidth * 0.92, 600);
    const frameH = is16x9 ? Math.round(maxW * 9 / 16) : Math.round(maxW * 16 / 9);

    overlay.innerHTML = `
        <div class="wallpaper-crop-topbar">
            <button class="wallpaper-crop-btn" onclick="wallpaperCropCancel()"><i class="fas fa-xmark"></i></button>
            <div style="flex:1;"></div>
            <button class="wallpaper-crop-btn primary" onclick="wallpaperCropApply()"><i class="fas fa-check"></i></button>
        </div>
        <div class="wallpaper-crop-body">
            <div class="wallpaper-crop-bg-blur" id="wallpaperCropBgBlur"></div>
            <div class="wallpaper-crop-frame" id="wallpaperCropFrame" style="width:${maxW}px;height:${frameH}px;">
                <div class="wallpaper-crop-aspect" id="wallpaperCropAspect"></div>
                <img class="wallpaper-crop-frame-image" id="wallpaperCropImage" src="${wallpaperCropState.url}" alt="">
            </div>
        </div>
        <div class="wallpaper-crop-bottom">
            <div class="wallpaper-crop-aspect-row">
                <button class="wallpaper-crop-aspect-chip ${wallpaperCropState.aspect==='16:9'?'active':''}" onclick="wallpaperCropSetAspect('16:9')">16:9</button>
                <button class="wallpaper-crop-aspect-chip ${wallpaperCropState.aspect==='9:16'?'active':''}" onclick="wallpaperCropSetAspect('9:16')">9:16</button>
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
    if (bgBlur) bgBlur.style.backgroundImage = `url('${wallpaperCropState.url}')`;

    const img = document.getElementById('wallpaperCropImage');
    const frame = document.getElementById('wallpaperCropFrame');

    img.onload = () => {
        wallpaperCropState.img = img;
        wallpaperCropUpdate();
    };

    // Перетаскивание изображения пальцами/курсором
    let isDragging = false;
    let startX = 0, startY = 0, baseOffsetX = 0.5, baseOffsetY = 0.5;

    const startDrag = (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDragging = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        startX = clientX;
        startY = clientY;
        baseOffsetX = wallpaperCropState.offsetX;
        baseOffsetY = wallpaperCropState.offsetY;
        e.preventDefault();
    };

    const moveDrag = (e) => {
        if (!isDragging) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const dx = (clientX - startX) / Math.max(1, frame.clientWidth);
        const dy = (clientY - startY) / Math.max(1, frame.clientHeight);
        wallpaperCropState.offsetX = Math.max(0, Math.min(1, baseOffsetX + dx));
        wallpaperCropState.offsetY = Math.max(0, Math.min(1, baseOffsetY + dy));
        wallpaperCropUpdate();
        e.preventDefault();
    };

    const endDrag = () => { isDragging = false; };

    frame.addEventListener('pointerdown', startDrag);
    frame.addEventListener('pointermove', moveDrag);
    frame.addEventListener('pointerup', endDrag);
    frame.addEventListener('pointercancel', endDrag);
    frame.addEventListener('touchstart', startDrag, { passive: false });
    frame.addEventListener('touchmove', moveDrag, { passive: false });
    frame.addEventListener('touchend', endDrag);
}

function wallpaperCropUpdate() {
    const img = document.getElementById('wallpaperCropImage');
    const frame = document.getElementById('wallpaperCropFrame');
    if (!img || !frame) return;

    const is16x9 = wallpaperCropState.aspect === '16:9';
    const frameW = frame.clientWidth;
    const frameH = frame.clientHeight;
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;
    const targetAsp = is16x9 ? 16 / 9 : 9 / 16;

    let drawW, drawH;
    if (imgW / imgH > targetAsp) {
        drawH = frameH;
        drawW = drawH * (imgW / imgH);
    } else {
        drawW = frameW;
        drawH = drawW / (imgW / imgH);
    }

    const scaleX = drawW / frameW;
    const scaleY = drawH / frameH;
    const scale = Math.max(scaleX, scaleY);

    const finalW = imgW * scale;
    const finalH = imgH * scale;
    const offsetX = (frameW - finalW) * wallpaperCropState.offsetX;
    const offsetY = (frameH - finalH) * wallpaperCropState.offsetY;

    img.style.width = Math.round(finalW) + 'px';
    img.style.height = Math.round(finalH) + 'px';
    img.style.left = Math.round(offsetX) + 'px';
    img.style.top = Math.round(offsetY) + 'px';
    img.style.position = 'absolute';
    img.style.objectFit = 'none';
    img.style.cursor = 'grab';

    const bgBlur = document.getElementById('wallpaperCropBgBlur');
    if (bgBlur) {
        bgBlur.style.backgroundImage = `url('${wallpaperCropState.url}')`;
    }
}

function wallpaperCropSetAspect(aspect) {
    wallpaperCropState.aspect = aspect;
    document.querySelectorAll('.wallpaper-crop-aspect-chip').forEach(b => {
        b.classList.toggle('active', b.textContent === aspect);
    });
    const frame = document.getElementById('wallpaperCropFrame');
    const is16x9 = aspect === '16:9';
    const maxW = Math.min(window.innerWidth * 0.92, 600);
    const frameH = is16x9 ? Math.round(maxW * 9 / 16) : Math.round(maxW * 16 / 9);
    frame.style.width = maxW + 'px';
    frame.style.height = frameH + 'px';
    wallpaperCropState.offsetX = 0.5;
    wallpaperCropState.offsetY = 0.5;
    wallpaperCropUpdate();
}

function wallpaperCropCancel() {
    const overlay = document.getElementById('wallpaperCropOverlay');
    if (overlay) {
        if (wallpaperCropState.url) URL.revokeObjectURL(wallpaperCropState.url);
        overlay.remove();
    }
    wallpaperCropState = { file: null, url: null, aspect: '16:9', offsetX: 0.5, offsetY: 0.5, img: null };
}

async function wallpaperCropApply() {
    const overlay = document.getElementById('wallpaperCropOverlay');
    if (!overlay) return;

    const img = document.getElementById('wallpaperCropImage');
    const frame = document.getElementById('wallpaperCropFrame');
    if (!img || !frame) return;

    const is16x9 = wallpaperCropState.aspect === '16:9';
    const frameW = frame.clientWidth;
    const frameH = frame.clientHeight;
    const targetAsp = is16x9 ? 16 / 9 : 9 / 16;

    const canvas = document.createElement('canvas');
    const outW = 1600;
    const outH = is16x9 ? Math.round(outW * 9 / 16) : Math.round(outW * 16 / 9);
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');

    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;

    let drawW, drawH;
    if (imgW / imgH > targetAsp) {
        drawH = frameH;
        drawW = drawH * (imgW / imgH);
    } else {
        drawW = frameW;
        drawH = drawW / (imgW / imgH);
    }

    const scaleX = drawW / frameW;
    const scaleY = drawH / frameH;
    const scale = Math.max(scaleX, scaleY);

    const finalW = imgW * scale;
    const finalH = imgH * scale;
    const offsetX = (frameW - finalW) * wallpaperCropState.offsetX;
    const offsetY = (frameH - finalH) * wallpaperCropState.offsetY;

    const srcX = Math.max(0, -offsetX) * scale;
    const srcY = Math.max(0, -offsetY) * scale;
    const srcW = Math.min(frameW * scale, imgW - srcX);
    const srcH = Math.min(frameH * scale, imgH - srcY);

    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);

    canvas.toBlob(async (blob) => {
        if (!blob) {
            showToast('❌ Ошибка обработки изображения');
            wallpaperCropCancel();
            return;
        }

        const file = new File([blob], wallpaperCropState.file.name, { type: 'image/jpeg' });
        wallpaperCropCancel();

        const fd = new FormData();
        fd.append('wallpaper', file);

        try {
            const r = await fetch('/api/update_wallpaper', { method: 'POST', body: fd });
            const data = await r.json();
            if (data.success) {
                document.getElementById('messagesArea').style.backgroundImage = `url('/${data.wallpaper_image}')`;
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

    function showChatMenu() {
        if (!currentChat) return;
        let html = `
            <div class="user-profile-body">
                <div class="burger-item" onclick="openChatInfo(); closeModal('tempModal');"><i class="fas fa-info-circle"></i> Информация</div>
                ${currentChatType === 'group' ? `<div class="burger-item" onclick="openGroupInfo(${currentChat.id}); closeModal('tempModal');"><i class="fas fa-users"></i> Участники</div>` : ''}
                ${currentChatType === 'channel' ? `<div class="burger-item" onclick="openChannelInfo(${currentChat.id}); closeModal('tempModal');"><i class="fas fa-user-shield"></i> Администраторы</div>` : ''}
                <div class="burger-item" onclick="openChatTrash(); closeModal('tempModal');"><i class="fas fa-trash-restore"></i> Корзина</div>
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

