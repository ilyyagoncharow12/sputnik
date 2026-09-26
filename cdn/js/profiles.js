    // ===== ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ =====
function openUserProfileModal(userId) {

// Запоминаем, откуда пришли — из чата или из контактов
    const returnTo = currentChat ? 'openChatInfo' : 'openContacts';
    modalReturnTo = returnTo;


    // Сначала получаем кастомное имя контакта (если есть)
    fetch(`/api/check_contact/${userId}`)
        .then(r => r.json())
        .then(contactInfo => {
            // Запоминаем кастомное имя
            const customName = contactInfo.contact_name || null;

            // Теперь загружаем профиль пользователя
            fetch(`/api/get_user_profile/${userId}`)
                .then(r => r.json())
                .then(user => {
                    if (!user || user.error) {
                        alert('Пользователь не найден');
                        return;
                    }

                    const isBlocked = user.is_blocked_by_me;
                    const hasBlockedMe = user.has_blocked_me;

                    // ===== ВАЖНО: используем кастомное имя, если оно есть =====
                    const displayName = customName || user.display_name || user.username || 'Пользователь';

                    let bannerStyle = '';
                    if (user.banner_image) {
                        bannerStyle = `background-image: url('/${user.banner_image}'); background-size: cover; background-position: center;`;
                    } else if (user.banner_color) {
                        bannerStyle = `background: ${user.banner_color};`;
                    } else {
                        bannerStyle = `background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);`;
                    }

                    fetch(`/api/playlist/list?user_id=${userId}`)
                        .then(r2 => r2.json())
                        .then(songs => {
                            let songHtml = '';
                            if (songs && songs.length > 0) {
                                const firstSong = songs[0];
                                songHtml = `
                                    <div class="song-row" onclick="openPlaylistManager(${userId})">
                                        <i class="fas fa-music"></i>
                                        <span class="song-text">${escapeHtml(firstSong.title)} - ${escapeHtml(firstSong.artist || 'Неизвестен')}</span>
                                        <i class="fas fa-chevron-right arrow"></i>
                                    </div>
                                `;
                            }

                            // СБОРКА HTML
                            let html = `
                                <div class="other-profile">
                                    <div class="modal-content" style="background: #0f0f0f; border-radius: 24px; overflow: hidden; color: white; max-width: 420px;">
                                        <div class="banner" style="${bannerStyle}">
                                            <div class="overlay"></div>
                                            <div class="top-bar">
                                                <button class="back-btn" onclick="closeModal('tempModal')"><i class="fas fa-arrow-left"></i></button>
                                                
                                            </div>
                                        </div>

                                        <div class="avatar-wrap">
                                            ${hasBlockedMe ? `<div class="avatar-placeholder" style="background: #2c2c2e;"><i class="fas fa-user-slash" style="color: #8e8e93; font-size: 32px;"></i></div>` : (user.is_banned ? `<div class="avatar-placeholder" style="background: linear-gradient(135deg, #4fc3f7, #0288d1);"><span style="font-size: 32px;">❄</span></div>` : (user.avatar ? `<img src="/${user.avatar}" class="avatar">` : `<div class="avatar-placeholder">${displayName[0].toUpperCase()}</div>`))}
                                        </div>

                                        <div class="name-wrap">
                                            <div class="display-name">${escapeHtml(displayName)}${user.is_banned ? ' <span style="color:#4fc3f7;">❄</span>' : ''}</div>
                                            <div class="username">@${escapeHtml(user.username)}</div>
                                            <div class="id">ID: ${user.unique_id}</div>
                                        </div>

                                        ${songHtml}

                                        <div class="body">
                                            ${user.bio ? `<div class="bio-box"><div class="bio-text">${escapeHtml(user.bio)}</div></div>` : ''}

                                            <div class="actions">
                                                <button class="action-btn" onclick="openChat(${user.id}, 'personal'); closeModal('tempModal');">
                                                    <i class="fas fa-comment"></i><span>Чат</span>
                                                </button>
                                                <button class="action-btn" onclick="makeCallToUser(${user.id}); closeModal('tempModal');">
                                                    <i class="fas fa-phone"></i><span>Звонок</span>
                                                </button>
                                                <button class="action-btn" onclick="startVideoCallToUser(${user.id}); closeModal('tempModal');">
                                                    <i class="fas fa-video"></i><span>Видео</span>
                                                </button>
                                                <button class="action-btn" onclick="showChatSearchModal(${currentChat ? currentChat.chat_id : ''}); closeModal('tempModal');">
                                                    <i class="fas fa-search"></i><span>Поиск</span>
                                                </button>
                                                <button class="more-btn" onclick="showUserMenu(${user.id})">
                                                    <i class="fas fa-ellipsis-h"></i><span>ещё</span>
                                                </button>
                                            </div>

                                            <div class="info-box">
                                                <div class="info-row">
                                                    <span class="label">мобильный</span>
                                                    <span class="value blue">${user.phone || 'Номер скрыт'}</span>
                                                </div>
                                                <div class="info-row">
                                                    <span class="label">имя пользователя</span>
                                                    <span class="value blue">@${escapeHtml(user.username)}</span>
                                                </div>
                                                <div class="info-row">
                                                    <span class="label">день рождения</span>
                                                    <span class="value">${user.birthday || 'Не указан'}</span>
                                                </div>
                                            </div>

                                            <div class="about-box">
                                                <div class="about-label">о себе</div>
                                                <div class="about-text">${user.bio ? escapeHtml(user.bio) : 'Нет информации о себе'}</div>
                                            </div>

                                            ${isBlocked ? `
                                                <button class="unblock-btn" onclick="unblockUserAction(${user.id}); closeModal('tempModal');">
                                                    <i class="fas fa-unlock"></i> Разблокировать
                                                </button>
                                            ` : `
                                                <button class="block-btn" onclick="blockUserAction(${user.id}); closeModal('tempModal');">
                                                    <i class="fas fa-ban"></i> Заблокировать
                                                </button>
                                            `}

                                            ${hasBlockedMe ? `
                                                <div class="blocked-warning">⚠️ Вы заблокированы этим пользователем</div>
                                            ` : ''}
                                        </div>
                                    </div>
                                </div>
                            `;

                            document.getElementById('tempModalBody').innerHTML = html;
                            openModal('tempModal');
                        })
                        .catch(() => {
                            // Если плейлист не загрузился — показываем профиль без него
                            let html = `
                                <div class="other-profile">
                                    <div class="modal-content" style="background: #0f0f0f; border-radius: 24px; overflow: hidden; color: white; max-width: 420px;">
                                        <div class="banner" style="${bannerStyle}">
                                            <div class="overlay"></div>
                                            <div class="top-bar">
                                                <button class="back-btn" onclick="closeModal('tempModal')"><i class="fas fa-arrow-left"></i></button>
                                                
                                            </div>
                                        </div>

                                        <div class="avatar-wrap">
                                            ${hasBlockedMe ? `<div class="avatar-placeholder" style="background: #2c2c2e;"><i class="fas fa-user-slash" style="color: #8e8e93; font-size: 32px;"></i></div>` : (user.is_banned ? `<div class="avatar-placeholder" style="background: linear-gradient(135deg, #4fc3f7, #0288d1);"><span style="font-size: 32px;">❄</span></div>` : (user.avatar ? `<img src="/${user.avatar}" class="avatar">` : `<div class="avatar-placeholder">${displayName[0].toUpperCase()}</div>`))}
                                        </div>

                                        <div class="name-wrap">
                                            <div class="display-name">${escapeHtml(displayName)}${user.is_banned ? ' <span style="color:#4fc3f7;">❄</span>' : ''}</div>
                                            <div class="username">@${escapeHtml(user.username)}</div>
                                            <div class="id">ID: ${user.unique_id}</div>
                                        </div>

                                        <div class="body">
                                            ${user.bio ? `<div class="bio-box"><div class="bio-text">${escapeHtml(user.bio)}</div></div>` : ''}

                                            <div class="actions">
                                                <button class="action-btn" onclick="openChat(${user.id}, 'personal'); closeModal('tempModal');">
                                                    <i class="fas fa-comment"></i><span>Чат</span>
                                                </button>
                                                <button class="action-btn" onclick="makeCallToUser(${user.id}); closeModal('tempModal');">
                                                    <i class="fas fa-phone"></i><span>Звонок</span>
                                                </button>
                                                <button class="action-btn" onclick="startVideoCallToUser(${user.id}); closeModal('tempModal');">
                                                    <i class="fas fa-video"></i><span>Видео</span>
                                                </button>
                                                <button class="action-btn" onclick="showChatSearchModal(${currentChat ? currentChat.chat_id : ''}); closeModal('tempModal');">
                                                    <i class="fas fa-search"></i><span>Поиск</span>
                                                </button>
                                                <button class="more-btn" onclick="showUserMenu(${user.id})">
                                                    <i class="fas fa-ellipsis-h"></i><span>ещё</span>
                                                </button>
                                            </div>

                                            <div class="info-box">
                                                <div class="info-row">
                                                    <span class="label">мобильный</span>
                                                    <span class="value blue">${user.phone || 'Номер скрыт'}</span>
                                                </div>
                                                <div class="info-row">
                                                    <span class="label">имя пользователя</span>
                                                    <span class="value blue">@${escapeHtml(user.username)}</span>
                                                </div>
                                                <div class="info-row">
                                                    <span class="label">день рождения</span>
                                                    <span class="value">${user.birthday || 'Не указан'}</span>
                                                </div>
                                            </div>

                                            <div class="about-box">
                                                <div class="about-label">о себе</div>
                                                <div class="about-text">${user.bio ? escapeHtml(user.bio) : 'Нет информации о себе'}</div>
                                            </div>

                                            ${isBlocked ? `
                                                <button class="unblock-btn" onclick="unblockUserAction(${user.id}); closeModal('tempModal');">
                                                    <i class="fas fa-unlock"></i> Разблокировать
                                                </button>
                                            ` : `
                                                <button class="block-btn" onclick="blockUserAction(${user.id}); closeModal('tempModal');">
                                                    <i class="fas fa-ban"></i> Заблокировать
                                                </button>
                                            `}

                                            ${hasBlockedMe ? `
                                                <div class="blocked-warning">⚠️ Вы заблокированы этим пользователем</div>
                                            ` : ''}
                                        </div>
                                    </div>
                                </div>
                            `;

                            document.getElementById('tempModalBody').innerHTML = html;
                            openModal('tempModal');
                        });
                })
                .catch(err => {
                    console.error('Error loading user profile:', err);
                    alert('Ошибка загрузки профиля');
                });
        })
        .catch(err => {
            console.error('Error checking contact:', err);
            // Если ошибка при проверке контакта — загружаем профиль без кастомного имени
            fetch(`/api/get_user_profile/${userId}`)
                .then(r => r.json())
                .then(user => {
                    if (!user || user.error) {
                        alert('Пользователь не найден');
                        return;
                    }
                    openUserProfileModalFallback(user);
                });
        });
}



function showUserMenu(userId) {
    fetch('/api/check_contact/' + userId)
        .then(r => r.json())
        .then(data => {
            let html = `
                <div class="contact-action-menu">
            `;

            if (data.is_contact) {
                html += `
                    <button class="contact-action-item" onclick="renameContactDialog(${userId}); closeModal('tempModal');">
                        <i class="fas fa-edit"></i>
                        <span>Переименовать контакт</span>
                    </button>
                    <div class="contact-action-divider"></div>
                    <button class="contact-action-item danger" onclick="removeContactById(${userId}); closeModal('tempModal');">
                        <i class="fas fa-user-minus"></i>
                        <span>Удалить из контактов</span>
                    </button>
                `;
            } else {
                html += `
                    <button class="contact-action-item" onclick="addContactDialog(${userId}); closeModal('tempModal');">
                        <i class="fas fa-user-plus"></i>
                        <span>Добавить в контакты</span>
                    </button>
                `;
            }

            html += `
                <div class="contact-action-divider"></div>
                <button class="contact-action-item" onclick="closeModal('tempModal');">
                    <i class="fas fa-times"></i>
                    <span>Закрыть</span>
                </button>
            </div>
            `;

            document.getElementById('tempModalBody').innerHTML = html;
            openModal('tempModal');
        })
        .catch(err => console.error('Error loading user menu:', err));
}

function addContactDialog(userId) {
    fetch('/api/get_user_profile/' + userId)
        .then(r => r.json())
        .then(user => {
            const initial = (user.display_name || user.username || '?')[0].toUpperCase();

            let html = `
                <div class="tg-modal-content">
                    <div class="tg-modal-header">
                        <button class="cancel-btn" onclick="closeModal('tempModal')"><i class="fas fa-arrow-left"></i></button>
                        
                        <span class="title">Новый контакт</span>
                        <button class="done-btn" onclick="saveNewContact(${userId})">Готово</button>
                    </div>
                    <div class="tg-modal-body">
                        <div class="tg-avatar-preview">${initial}</div>
                        <div>
                            <label class="tg-label">Имя</label>
                            <input type="text" id="cfn" class="tg-input" value="${escapeHtml(user.display_name || '')}" placeholder="Имя">
                        </div>
                        <div>
                            <label class="tg-label">Фамилия</label>
                            <input type="text" id="cln" class="tg-input" placeholder="Фамилия">
                        </div>
                        <div class="tg-info-row">
                            <i class="fas fa-phone"></i>
                            <span>${user.phone || 'Номер скрыт'}</span>
                        </div>
                    </div>
                </div>
            `;

            document.getElementById('tempModalBody').innerHTML = html;
            openModal('tempModal');
        });
}

function saveContact(uid) {
    let name = (document.getElementById('cfname').value + ' ' + document.getElementById('clname').value).trim();
    if (!name) { alert('Введите имя'); return; }

    fetch('/api/add_contact', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({contact_id: uid, name: name})
    })
    .then(r => r.json())
    .then(d => {
        if (d.success) { closeModal('tempModal'); alert('Готово!'); }
    });
}

function renameContactDialog(uid) {
    fetch('/api/get_user_profile/' + uid)
    .then(r => r.json())
    .then(user => {
        fetch('/api/check_contact/' + uid)
        .then(r => r.json())
        .then(data => {
            let cur = data.contact_name || user.display_name || '';
            let parts = cur.split(' ');
            let html = '';
            html += '<div style="background:#0f0f0f;border-radius:20px;color:white;">';
            html += '<div style="display:flex;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #2c2c2e;">';
            html += '<button onclick="closeModal(\'tempModal\')" style="background:none;border:none;color:#8e8e93;font-size:18px;cursor:pointer;padding:4px;"><i class="fas fa-arrow-left"></i></button>';
            
            html += '<div style="font-size:18px;font-weight:600;">Изменить</div>';
            html += '<button onclick="saveRename(' + uid + ')" style="background:none;border:none;color:#007aff;font-weight:600;">Готово</button>';
            html += '</div><div style="padding:20px;">';
            html += '<div style="text-align:center;margin-bottom:20px;"><div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);display:inline-flex;align-items:center;justify-content:center;font-size:36px;color:white;">' + cur[0].toUpperCase() + '</div></div>';
            html += '<div style="margin-bottom:16px;"><div style="font-size:13px;color:#8e8e93;">Имя</div><input id="cfname" value="' + (parts[0]||'') + '" style="background:#1c1c1e;border:1px solid #2c2c2e;border-radius:12px;padding:12px;width:100%;color:white;font-size:16px;"></div>';
            html += '<div style="margin-bottom:16px;"><div style="font-size:13px;color:#8e8e93;">Фамилия</div><input id="clname" value="' + (parts.slice(1).join(' ')||'') + '" style="background:#1c1c1e;border:1px solid #2c2c2e;border-radius:12px;padding:12px;width:100%;color:white;font-size:16px;"></div>';
            html += '</div></div>';

            document.getElementById('tempModalBody').innerHTML = html;
            openModal('tempModal');
        });
    });
}

function saveRename(uid) {
    let name = (document.getElementById('cfname').value + ' ' + document.getElementById('clname').value).trim();
    if (!name) { alert('Введите имя'); return; }

    fetch('/api/rename_contact', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({contact_id: uid, name: name})
    })
    .then(r => r.json())
    .then(d => {
        if (d.success) { closeModal('tempModal'); alert('Готово!'); }
    });
}

function removeContactById(uid) {
    if (!confirm('Удалить контакт?')) return;

    fetch('/api/remove_contact', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({contact_id: uid})
    })
    .then(r => r.json())
    .then(d => {
        if (d.success) { closeModal('tempModal'); alert('Удален!'); }
    });
}

// Загрузка списка контактов
function loadContactsList() {
    // Обновляем список контактов в бургер-меню
    fetch('/api/get_contacts')
        .then(r => r.json())
        .then(contacts => {
            // Сохраняем контакты глобально для использования в других местах
            window.contactsData = contacts;
            console.log('Contacts updated:', contacts.length);
        })
        .catch(err => console.error('Error loading contacts:', err));
}


    // ===== МОЙ ПРОФИЛЬ =====
function openMyProfile() {
    closeBurgerMenu();
    // Запоминаем, что пришли из бургер-меню
    modalReturnTo = 'openBurgerMenu';

    fetch('/api/get_my_user')
        .then(r => r.json())
        .then(u => {
            fetch('/api/get_settings')
                .then(r2 => r2.json())
                .then(settings => {
                    console.log('Profile settings:', settings);

                    let bannerStyle = '';
                    if (settings.banner_image) {
                        bannerStyle = `background-image: url('/${settings.banner_image}'); background-size: cover; background-position: center;`;
                    } else if (settings.banner_color) {
                        bannerStyle = `background: ${settings.banner_color};`;
                    } else {
                        bannerStyle = `background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);`;
                    }

                    fetch(`/api/playlist/list?user_id=${u.id}`)
                        .then(r3 => r3.json())
                        .then(songs => {
                            let songHtml = '';
                            if (songs && songs.length > 0) {
                                const firstSong = songs[0];
                                songHtml = `
                                    <div class="song-row" onclick="openPlaylistManager(${u.id})">
                                        <i class="fas fa-music"></i>
                                        <span class="song-text">${escapeHtml(firstSong.title)} - ${escapeHtml(firstSong.artist || 'Неизвестен')}</span>
                                        <i class="fas fa-chevron-right arrow"></i>
                                    </div>
                                `;
                            }

                            let html = '<div class="other-profile">';
                            html += '<div class="modal-content" style="background: #0f0f0f; border-radius: 24px; overflow: hidden; color: white; max-width: 420px;">';

                            // БАННЕР (ИСПРАВЛЕНО - кавычки на месте)
                            html += `<div class="banner" id="profileBanner" style="${bannerStyle}">`;
                            html += '<div class="overlay"></div>';
                            html += '<div class="top-bar">';
                            html += '<button class="back-btn" onclick="closeModal(\'tempModal\')"><i class="fas fa-arrow-left"></i></button>';
                            
                            html += '</div>';
                            html += '</div>';

                            html += '<div class="avatar-wrap">';
                            if (u.avatar) {
                                html += `<img src="/${u.avatar}" class="avatar">`;
                            } else {
                                html += `<div class="avatar-placeholder">${(u.display_name || u.username || '?')[0].toUpperCase()}</div>`;
                            }
                            html += '</div>';

                            html += '<div class="name-wrap">';
                            html += `<div class="display-name">${escapeHtml(u.display_name || u.username)}</div>`;
                            html += `<div class="username">@${escapeHtml(u.username)}</div>`;
                            html += `<div class="id">ID: ${u.unique_id}</div>`;
                            html += '</div>';

                            html += songHtml;

                            html += '<div class="body">';
                            html += '<div class="actions">';
                            html += '<button class="action-btn" onclick="openEditProfile()"><i class="fas fa-edit"></i><span>Ред.</span></button>';
                            html += '<button class="action-btn" onclick="openPlaylistManager()"><i class="fas fa-music"></i><span>Плейлист</span></button>';
                            html += '<button class="action-btn" onclick="closeModal(\'tempModal\'); setTimeout(function(){ openPersonalColors(); }, 100);"><i class="fas fa-palette"></i><span>Цвета</span></button>';
                            html += '<button class="action-btn" onclick="changeAvatar()"><i class="fas fa-camera"></i><span>Аватар</span></button>';
                            html += '</div>';

                            html += '<div class="info-box">';
                            html += `<div class="info-row"><span class="label">мобильный</span><span class="value blue">${u.phone || 'Номер скрыт'}</span></div>`;
                            html += `<div class="info-row"><span class="label">имя пользователя</span><span class="value blue">@${escapeHtml(u.username)}</span></div>`;
                            html += `<div class="info-row"><span class="label">день рождения</span><span class="value">${u.birthday || 'Не указан'}</span></div>`;
                            html += '</div>';

                            html += '<div class="about-box">';
                            html += '<div class="about-label">о себе</div>';
                            html += `<div class="about-text">${u.bio ? escapeHtml(u.bio) : 'Нет информации о себе'}</div>`;
                            html += '</div>';

                            html += '</div>'; // body
                            html += '</div>'; // modal-content
                            html += '</div>'; // other-profile

                            document.getElementById('tempModalBody').innerHTML = html;
                            openModal('tempModal');
                        })
                        .catch(() => {
                            let html = '<div class="other-profile">';
                            html += '<div class="modal-content" style="background: #0f0f0f; border-radius: 24px; overflow: hidden; color: white; max-width: 420px;">';
                            html += `<div class="banner" id="profileBanner" style="${bannerStyle}">`;
                            html += '<div class="overlay"></div>';
                            html += '<div class="top-bar">';
                            html += '<button class="back-btn" onclick="closeModal(\'tempModal\')"><i class="fas fa-arrow-left"></i></button>';
                            
                            html += '</div>';
                            html += '</div>';
                            html += '<div class="avatar-wrap">';
                            if (u.avatar) {
                                html += `<img src="/${u.avatar}" class="avatar">`;
                            } else {
                                html += `<div class="avatar-placeholder">${(u.display_name || u.username || '?')[0].toUpperCase()}</div>`;
                            }
                            html += '</div>';
                            html += '<div class="name-wrap">';
                            html += `<div class="display-name">${escapeHtml(u.display_name || u.username)}</div>`;
                            html += `<div class="username">@${escapeHtml(u.username)}</div>`;
                            html += `<div class="id">ID: ${u.unique_id}</div>`;
                            html += '</div>';
                            html += '<div class="body">';
                            html += '<div class="actions">';
                            html += '<button class="action-btn" onclick="openEditProfile()"><i class="fas fa-edit"></i><span>Ред.</span></button>';
                            html += '<button class="action-btn" onclick="openPlaylistManager()"><i class="fas fa-music"></i><span>Плейлист</span></button>';
                            html += '<button class="action-btn" onclick="closeModal(\'tempModal\'); setTimeout(function(){ openPersonalColors(); }, 100);"><i class="fas fa-palette"></i><span>Цвета</span></button>';
                            html += '<button class="action-btn" onclick="changeAvatar()"><i class="fas fa-camera"></i><span>Аватар</span></button>';
                            html += '</div>';
                            html += '<div class="info-box">';
                            html += `<div class="info-row"><span class="label">мобильный</span><span class="value blue">${u.phone || 'Номер скрыт'}</span></div>`;
                            html += `<div class="info-row"><span class="label">имя пользователя</span><span class="value blue">@${escapeHtml(u.username)}</span></div>`;
                            html += `<div class="info-row"><span class="label">день рождения</span><span class="value">${u.birthday || 'Не указан'}</span></div>`;
                            html += '</div>';
                            html += '<div class="about-box">';
                            html += '<div class="about-label">о себе</div>';
                            html += `<div class="about-text">${u.bio ? escapeHtml(u.bio) : 'Нет информации о себе'}</div>`;
                            html += '</div>';
                            html += '</div>';
                            html += '</div>';
                            html += '</div>';

                            document.getElementById('tempModalBody').innerHTML = html;
                            openModal('tempModal');
                        });
                });
        });
}

function openEditProfile() {
    fetch('/api/get_my_user')
        .then(r => r.json())
        .then(u => {
            let html = `
                <div class="edit-profile-modal">
                    <div class="edit-header">
                        <button class="cancel-btn" onclick="closeModal('tempModal')"><i class="fas fa-arrow-left"></i></button>
                        
                        <div class="title">Редактировать</div>
                        <button class="done-btn" onclick="saveProfileEdit()">Готово</button>
                    </div>
                    <div class="edit-field">
                        <label>Имя</label>
                        <input type="text" id="editDisplayName" value="${escapeHtml(u.display_name || '')}">
                    </div>
                    <div class="edit-field">
                        <label>Имя пользователя</label>
                        <input type="text" id="editUsername" value="${escapeHtml(u.username)}">
                    </div>
                    <div class="edit-field">
                        <label>О себе</label>
                        <textarea id="editBio">${escapeHtml(u.bio || '')}</textarea>
                    </div>
                    <div class="edit-field">
                        <label>День рождения</label>
                        <input type="date" id="editBirthday" value="${u.birthday || ''}">
                    </div>
                </div>
            `;
            closeModal('tempModal');
            setTimeout(() => {
                showModal('Редактировать профиль', html);
            }, 300);
        });
}



function saveProfileEdit() {
    const fd = new FormData();
    fd.append('display_name', document.getElementById('editDisplayName').value);
    fd.append('username', document.getElementById('editUsername').value);
    fd.append('bio', document.getElementById('editBio').value);
    fd.append('birthday', document.getElementById('editBirthday').value);

    fetch('/api/update_profile', { method: 'POST', body: fd })
        .then(() => {
            closeModal('tempModal');
            setTimeout(() => {
                openMyProfile();
            }, 300);
        });
}


// ===== ПЕРСОНАЛЬНЫЕ ЦВЕТА =====
function openPersonalColors() {
    fetch('/api/get_settings')
        .then(r => r.json())
        .then(settings => {
            let currentBannerColor = settings.banner_color || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            let currentBannerImage = settings.banner_image || '';

            let bannerPreviewStyle = '';
            if (currentBannerImage) {
                bannerPreviewStyle = `background-image: url('/${currentBannerImage}'); background-size: cover; background-position: center;`;
            } else {
                bannerPreviewStyle = `background: ${currentBannerColor};`;
            }

            let html = `
                <div class="tg-modal-wrapper">
                    <div class="tg-modal-header">
                        <button class="close-btn" onclick="closeModal('tempModal')">
                            <i class="fas fa-arrow-left"></i>
                        </button>
                        
                        <div class="title">Персональные цвета</div>
                        <div style="width: 24px;"></div>
                    </div>
                    <div class="tg-modal-body">
                        <div class="tg-hint">
                            Вы можете изменить цвет своего имени и оформление ответов на Ваши сообщения.
                            <span class="link" onclick="closeModal('tempModal'); openAppearance();">Изменить &gt;</span>
                        </div>

                        <div class="tg-banner-preview" id="bannerPreviewBox" style="${bannerPreviewStyle}"></div>

                        <div class="tg-section-title">Предложенные цвета</div>
                        <div class="tg-color-grid">
                            <div class="tg-color-circle" data-color="#007aff" style="background: #007aff;" onclick="updateBannerColor('#007aff')"></div>
                            <div class="tg-color-circle" data-color="#34c759" style="background: #34c759;" onclick="updateBannerColor('#34c759')"></div>
                            <div class="tg-color-circle" data-color="#ff9500" style="background: #ff9500;" onclick="updateBannerColor('#ff9500')"></div>
                            <div class="tg-color-circle" data-color="#ff3b30" style="background: #ff3b30;" onclick="updateBannerColor('#ff3b30')"></div>
                        </div>
                        <div class="tg-color-grid">
                            <div class="tg-color-circle" data-color="#af52de" style="background: #af52de;" onclick="updateBannerColor('#af52de')"></div>
                            <div class="tg-color-circle" data-color="#5ac8fa" style="background: #5ac8fa;" onclick="updateBannerColor('#5ac8fa')"></div>
                            <div class="tg-color-circle" data-color="#ff2d55" style="background: #ff2d55;" onclick="updateBannerColor('#ff2d55')"></div>
                            <div class="tg-color-circle" data-color="#8e8e93" style="background: #8e8e93;" onclick="updateBannerColor('#8e8e93')"></div>
                        </div>

                        <div class="tg-section-title">Градиенты</div>
                        <div class="tg-color-grid">
                            <div class="tg-color-circle" data-color="linear-gradient(135deg, #2b8d8d 0%, #2c3e50 100%)" style="background: linear-gradient(135deg, #2b8d8d 0%, #2c3e50 100%);" onclick="updateBannerColor('linear-gradient(135deg, #2b8d8d 0%, #2c3e50 100%)')"></div>
                            <div class="tg-color-circle" data-color="linear-gradient(135deg, #667eea 0%, #764ba2 100%)" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);" onclick="updateBannerColor('linear-gradient(135deg, #667eea 0%, #764ba2 100%)')"></div>
                            <div class="tg-color-circle" data-color="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);" onclick="updateBannerColor('linear-gradient(135deg, #f093fb 0%, #f5576c 100%)')"></div>
                            <div class="tg-color-circle" data-color="linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);" onclick="updateBannerColor('linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)')"></div>
                        </div>

                        <div class="tg-section-title">Свой цвет</div>
                        <div class="tg-custom-color-row">
                            <input type="color" id="customColorPicker" class="tg-custom-color-input" value="#667eea">
                            <button class="tg-custom-color-btn" onclick="applyCustomBannerColor()">Применить свой цвет</button>
                        </div>

                        <button class="tg-action-btn" onclick="document.getElementById('bannerFileInput').click()">
                            <i class="fas fa-image"></i> Загрузить фотографию для баннера
                        </button>
                        <input type="file" id="bannerFileInput" accept="image/*" class="tg-hidden-input" onchange="uploadBannerImage(this)">

                        <button class="tg-reset-btn" onclick="resetBannerColor()">
                            <i class="fas fa-undo"></i> Сбросить цвет профиля
                        </button>
                    </div>
                </div>
            `;

            document.getElementById('tempModalBody').innerHTML = html;
            openModal('tempModal');

            setTimeout(() => {
                highlightCurrentColor(currentBannerColor, currentBannerImage);
            }, 100);
        })
        .catch(err => {
            console.error('Error loading settings:', err);
            alert('Ошибка загрузки настроек');
        });
}

function highlightCurrentColor(color, image) {
    document.querySelectorAll('.tg-color-circle').forEach(el => {
        el.classList.remove('selected');
        if (!image && el.getAttribute('data-color') === color) {
            el.classList.add('selected');
        }
    });
}

function updateBannerColor(color) {
    const preview = document.getElementById('bannerPreviewBox');
    if (preview) {
        preview.style.background = color;
        preview.style.backgroundImage = 'none';
    }

    highlightCurrentColor(color);

    fetch('/api/update_banner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banner_color: color })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            document.querySelectorAll('.banner').forEach(banner => {
                banner.style.background = color;
                banner.style.backgroundImage = 'none';
            });
            showToast('Цвет баннера обновлен!');
        } else {
            alert('Ошибка при сохранении цвета: ' + (data.error || 'неизвестная ошибка'));
        }
    })
    .catch(err => {
        console.error('Error updating banner:', err);
        alert('Ошибка соединения с сервером');
    });
}

function applyCustomBannerColor() {
    const colorPicker = document.getElementById('customColorPicker');
    if (colorPicker) {
        updateBannerColor(colorPicker.value);
    } else {
        alert('Палитра цветов не найдена');
    }
}

function uploadBannerImage(input) {
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];
    if (file.size > 5 * 1024 * 1024) {
        alert('Файл слишком большой. Максимальный размер: 5MB');
        input.value = '';
        return;
    }

    const fd = new FormData();
    fd.append('banner_image', file);

    const uploadBtn = document.querySelector('.tg-action-btn');
    const originalHTML = uploadBtn ? uploadBtn.innerHTML : '';
    if (uploadBtn) {
        uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Загрузка...';
        uploadBtn.disabled = true;
    }

    fetch('/api/update_banner', { method: 'POST', body: fd })
    .then(r => r.json())
    .then(data => {
        if (data.success && data.banner_image) {
            const imageUrl = '/' + data.banner_image;
            const bgStyle = `background-image: url('${imageUrl}'); background-size: cover; background-position: center;`;

            const preview = document.getElementById('bannerPreviewBox');
            if (preview) preview.setAttribute('style', bgStyle);

            document.querySelectorAll('.banner').forEach(banner => {
                banner.setAttribute('style', bgStyle);
            });

            document.querySelectorAll('.tg-color-circle').forEach(el => {
                el.classList.remove('selected');
            });

            showToast('Баннер обновлен!');
            closeModal('tempModal');
            setTimeout(() => openMyProfile(), 300);
        } else {
            alert('Ошибка при загрузке баннера: ' + (data.error || 'неизвестная ошибка'));
        }
    })
    .catch(err => {
        console.error('Upload error:', err);
        alert('Ошибка соединения с сервером');
    })
    .finally(() => {
        if (uploadBtn) {
            uploadBtn.innerHTML = originalHTML || '<i class="fas fa-image"></i> Загрузить фотографию для баннера';
            uploadBtn.disabled = false;
        }
        input.value = '';
    });
}

function resetBannerColor() {
    if (confirm('Сбросить цвет профиля до стандартного?')) {
        const defaultColor = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

        fetch('/api/update_banner', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ banner_color: defaultColor })
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                const preview = document.getElementById('bannerPreviewBox');
                if (preview) {
                    preview.style.background = defaultColor;
                    preview.style.backgroundImage = 'none';
                }

                document.querySelectorAll('.banner').forEach(banner => {
                    banner.style.background = defaultColor;
                    banner.style.backgroundImage = 'none';
                });

                showToast('Цвет профиля сброшен');
            }
        })
        .catch(err => {
            console.error('Reset error:', err);
            alert('Ошибка при сбросе цвета');
        });
    }
}


    function subscribeToChannel(channelId) {
        fetch(`/api/subscribe/channel/id/${channelId}`)
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    alert('Вы подписались на канал!');
                    loadChannelsList();
                }
            });
    }

    // ===== ПЛЕЙЛИСТ =====
function openPlaylistManager(targetUserId) {
    const userId = targetUserId || currentUser.id;
    const isMyPlaylist = userId == currentUser.id;
    const returnTo = targetUserId === currentUser.id ? 'openMyProfile' : 'openUserProfileModal';
    modalReturnTo = returnTo;


    fetch(`/api/playlist/list?user_id=${userId}`)
        .then(r => r.json())
        .then(songs => {
            let html = `
                <div style="background: #0f0f0f; border-radius: 20px; overflow: hidden; color: white;">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #2c2c2e;">
                        <div style="display: flex; align-items: center; gap: 6px; margin-left: -8px;">
                            <button onclick="closeModal('tempModal')" style="background: none; border: none; color: #8e8e93; font-size: 20px; cursor: pointer; padding: 4px;">
                                <i class="fas fa-arrow-left"></i>
                            </button>
                            
                        </div>
                        <div style="font-size: 18px; font-weight: 600;">${isMyPlaylist ? 'Мой плейлист' : 'Плейлист'}</div>
                        <div style="width: 20px;"></div>
                    </div>
                    <div style="padding: 0; max-height: 400px; overflow-y: auto;">
            `;

            if (!songs || songs.length === 0) {
                html += `
                    <div style="text-align: center; padding: 60px 20px; color: #8e8e93;">
                        <i class="fas fa-music" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;"></i>
                        <p style="font-size: 16px;">Плейлист пуст</p>
                        ${isMyPlaylist ? '<p style="font-size: 13px; margin-top: 8px; opacity: 0.7;">Добавьте песни, нажав на кнопку ниже</p>' : ''}
                    </div>
                `;
            } else {
                songs.forEach((song, index) => {
                    html += `
                        <div style="display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid #1c1c1e; cursor: pointer; transition: background 0.2s;"
                             onclick="playSongFromList('${escapeHtml(song.file_path)}', '${escapeHtml(song.title)}', '${escapeHtml(song.artist || 'Неизвестен')}', ${index})"
                             onmouseover="this.style.background='#1c1c1e'"
                             onmouseout="this.style.background='transparent'">
                            <div style="width: 44px; height: 44px; border-radius: 8px; background: #2d2d2d; display: flex; align-items: center; justify-content: center; margin-right: 12px; flex-shrink: 0;">
                                <i class="fas fa-music" style="color: #8e8e93; font-size: 18px;"></i>
                            </div>
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: 500; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(song.title)}</div>
                                <div style="font-size: 12px; color: #8e8e93;">${escapeHtml(song.artist || 'Неизвестен')}</div>
                            </div>
                            <div style="font-size: 12px; color: #8e8e93; margin-left: 8px;">${song.duration ? formatDuration(song.duration) : ''}</div>
                            ${isMyPlaylist ? `
                            <button onclick="event.stopPropagation(); deleteSongFromPlaylist(${song.id})" style="background: none; border: none; color: #ff3b30; margin-left: 8px; cursor: pointer; font-size: 16px;">
                                <i class="fas fa-trash"></i>
                            </button>` : ''}
                        </div>
                    `;
                });
            }

            html += `</div>`;

            if (isMyPlaylist) {
                html += `
                    <div style="padding: 16px;">
                        <button class="modal-btn modal-btn-primary" style="width: 100%;" onclick="uploadSongToPlaylist()">
                            <i class="fas fa-plus-circle"></i> Добавить песню
                        </button>
                    </div>
                `;
            }

            if (songs && songs.length > 0) {
                html += `
                    <div id="playerBar" style="display: none; align-items: center; padding: 12px 16px; background: #1c1c1e; border-top: 1px solid #2c2c2e;">
                        <div style="width: 40px; height: 40px; border-radius: 6px; background: var(--primary-gradient); display: flex; align-items: center; justify-content: center; margin-right: 12px;">
                            <i class="fas fa-music" style="color: white; font-size: 16px;"></i>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div id="playerTrackName" style="font-weight: 500; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Не выбрано</div>
                            <div id="playerTrackArtist" style="font-size: 11px; color: #8e8e93;">-</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <button onclick="prevTrack()" style="background: none; border: none; color: #8e8e93; cursor: pointer; font-size: 16px;">
                                <i class="fas fa-step-backward"></i>
                            </button>
                            <button id="playPauseBtn" onclick="togglePlayPause()" style="background: none; border: none; cursor: pointer;">
                                <i class="fas fa-play-circle" style="font-size: 32px; color: #007aff;"></i>
                            </button>
                            <button onclick="nextTrack()" style="background: none; border: none; color: #8e8e93; cursor: pointer; font-size: 16px;">
                                <i class="fas fa-step-forward"></i>
                            </button>
                        </div>
                    </div>
                `;
            }

            html += `</div>`;

            document.getElementById('tempModalBody').innerHTML = html;
            openModal('tempModal');

            window.currentPlaylist = songs;
            window.currentPlaylistIndex = -1;
            window.currentAudio = null;
        })
        .catch(err => {
            console.error('Error loading playlist:', err);
            document.getElementById('tempModalBody').innerHTML = `
                <div style="text-align: center; padding: 60px 20px; color: #8e8e93;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;"></i>
                    <p>Ошибка загрузки плейлиста</p>
                </div>
            `;
            openModal('tempModal');
        });
}


// ===== ФУНКЦИЯ ИЗМЕНЕНИЯ АВАТАРКИ =====
function changeAvatar() {

// Запоминаем, что нужно вернуться в профиль
    modalReturnTo = 'openMyProfile';

    fetch('/api/preloaded_avatars')
        .then(r => r.json())
        .then(avatars => {
            let html = `
                <div style="background: #0f0f0f; border-radius: 24px; overflow: hidden;">
                    <div class="modal-header-block">
                        <button class="close-modal-btn" onclick="closeModal('tempModal')">
                            <i class="fas fa-arrow-left"></i>
                        </button>
                        
                        <h3>Изменить фотографию</h3>
                        <div style="width: 28px;"></div>
                    </div>
                    <div class="modal-body-content">
                        <div style="margin-bottom: 24px;">
                            <button onclick="uploadCustomAvatar()" style="width: 100%; padding: 14px; background: #1c1c1e; border: none; border-radius: 14px; color: #007aff; font-size: 15px; font-weight: 500; cursor: pointer; transition: 0.2s; font-family: var(--font-family);" onmouseover="this.style.background='#2c2c2e'" onmouseout="this.style.background='#1c1c1e'">
                                <i class="fas fa-cloud-upload-alt"></i> Загрузить свою фотографию
                            </button>
                        </div>

                        <div style="font-size: 13px; color: #8e8e93; margin-bottom: 12px; text-align: center;">или выберите из предложенных</div>

                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; max-height: 400px; overflow-y: auto; padding: 4px;">
            `;

            avatars.forEach(ava => {
                html += `
                    <div onclick="selectPreloadedAvatar('${ava.filename}')" style="cursor: pointer; border-radius: 50%; overflow: hidden; border: 3px solid transparent; transition: all 0.2s; aspect-ratio: 1;" onmouseover="this.style.borderColor='#007aff'; this.style.transform='scale(1.05)'" onmouseout="this.style.borderColor='transparent'; this.style.transform='scale(1)'">
                        <img src="/static/avatar-swg/${ava.filename}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='/static/avatar-swg/avatar1.jpg';">
                    </div>
                `;
            });

            html += `
                        </div>
                        <input type="file" id="customAvatarInput" accept="image/*" style="display: none;" onchange="handleCustomAvatarUpload(this)">
                    </div>
                </div>
            `;

            document.getElementById('tempModalBody').innerHTML = html;
            openModal('tempModal');
        })
        .catch(err => {
            console.error('Error loading avatars:', err);
            let html = `
                <div style="background: #0f0f0f; border-radius: 24px; overflow: hidden;">
                    <div class="modal-header-block">
                        <button class="close-modal-btn" onclick="closeModal('tempModal')">
                            <i class="fas fa-arrow-left"></i>
                        </button>
                        
                        <h3>Изменить фотографию</h3>
                        <div style="width: 28px;"></div>
                    </div>
                    <div class="modal-body-content">
                        <button onclick="uploadCustomAvatar()" style="width: 100%; padding: 14px; background: #1c1c1e; border: none; border-radius: 14px; color: #007aff; font-size: 15px; font-weight: 500; cursor: pointer; font-family: var(--font-family);">
                            <i class="fas fa-cloud-upload-alt"></i> Загрузить свою фотографию
                        </button>
                        <input type="file" id="customAvatarInput" accept="image/*" style="display: none;" onchange="handleCustomAvatarUpload(this)">
                    </div>
                </div>
            `;
            document.getElementById('tempModalBody').innerHTML = html;
            openModal('tempModal');
        });
}

function uploadCustomAvatar() {
    document.getElementById('customAvatarInput').click();
}

function handleCustomAvatarUpload(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];

        if (file.size > 10 * 1024 * 1024) {
            alert('Файл слишком большой. Максимальный размер: 10MB');
            return;
        }

        if (!file.type.startsWith('image/')) {
            alert('Пожалуйста, выберите изображение');
            return;
        }

        const formData = new FormData();
        formData.append('avatar', file);

        const uploadBtn = document.querySelector('button[onclick="uploadCustomAvatar()"]');
        if (uploadBtn) {
            uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Загрузка...';
            uploadBtn.disabled = true;
        }

        fetch('/api/update_profile', {
            method: 'POST',
            body: formData
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                closeModal('tempModal');
                loadUserAvatar();
                if (data.user && data.user.avatar) {
                    updateAllAvatars(data.user.avatar);
                }
                alert('Аватарка обновлена!');
            } else {
                alert('Ошибка при обновлении аватарки: ' + (data.error || 'неизвестная ошибка'));
            }
        })
        .catch(err => {
            alert('Ошибка при загрузке: ' + err.message);
        })
        .finally(() => {
            if (uploadBtn) {
                uploadBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Загрузить свою фотографию';
                uploadBtn.disabled = false;
            }
        });
    }
}

function selectPreloadedAvatar(filename) {
    const avatars = document.querySelectorAll('[onclick^="selectPreloadedAvatar"]');
    avatars.forEach(ava => {
        ava.style.opacity = '0.5';
        ava.style.pointerEvents = 'none';
    });

    fetch('/api/update_profile_avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: 'static/avatar-swg/' + filename })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            closeModal('tempModal');
            updateAllAvatars('static/avatar-swg/' + filename);
            loadUserAvatar();
            alert('Аватарка обновлена!');
        } else {
            alert('Ошибка при обновлении аватарки');
        }
    })
    .catch(err => {
        alert('Ошибка: ' + err.message);
    })
    .finally(() => {
        avatars.forEach(ava => {
            ava.style.opacity = '1';
            ava.style.pointerEvents = 'auto';
        });
    });
}

function updateAllAvatars(avatarPath) {
    const burgerAvatar = document.getElementById('burgerAvatar');
    if (burgerAvatar) {
        burgerAvatar.innerHTML = `<img src="/${avatarPath}" style="width: 100%; height: 100%; object-fit: cover;">`;
    }

    const profileAvatars = document.querySelectorAll('.profile-avatar-wrap img, .avatar-wrap img');
    profileAvatars.forEach(img => {
        img.src = '/' + avatarPath;
    });
}


    function makeCallToUser(userId) {
        fetch('/api/make_call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ receiver_id: userId, call_type: 'audio' })
        });
    }

    function startVideoCallToUser(userId) {
        fetch('/api/make_call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ receiver_id: userId, call_type: 'video' })
        });
    }

    function shareContactWithChat(contactId) {
        if (!currentChat || currentChatType !== 'personal') {
            alert('Выберите чат для отправки контакта');
            return;
        }
        fetch('/api/share_contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contact_id: contactId, chat_id: currentChat.chat_id })
        }).then(r => r.json()).then(data => {
            if (data.success) {
                displayMessage(data.message);
                alert('Контакт отправлен!');
            } else {
                alert('Ошибка при отправке контакта');
            }
        });
    }

    function blockUserAction(userId) {
        if (confirm('Заблокировать этого пользователя?')) {
            fetch('/api/block_user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            }).then(r => r.json()).then(data => {
                if (data.success) {
                    alert('Пользователь заблокирован');
                    closeModal('tempModal');
                }
            });
        }
    }

    function unblockUserAction(userId) {
        if (confirm('Разблокировать пользователя?')) {
            fetch('/api/unblock_user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            }).then(r => r.json()).then(data => {
                if (data.success) {
                    alert('Пользователь разблокирован');
                    closeModal('tempModal');
                }
            });
        }
    }

    // ===== ПРОФИЛЬ ИЗ ИСТОРИИ =====
function openUserProfileModalFromStory(userId) {
    closeStoryViewer();
    openUserProfileModal(userId);
}

    // ===== БУРГЕР-МЕНЮ ФУНКЦИИ =====
    function openContacts() {
    closeBurgerMenu();
    modalReturnTo = 'openBurgerMenu';

    fetch('/api/get_contacts')
        .then(r => r.json())
        .then(contacts => {
            let html = `
                <div class="tg-modal-content">
                    <div class="tg-modal-header">
                        <button class="cancel-btn" onclick="closeModal('tempModal')">
                            <i class="fas fa-arrow-left" style="font-size: 18px;"></i>
                        </button>
                        
                        <span class="title">Контакты</span>
                        <div style="width: 24px;"></div>
                    </div>
                    <div class="tg-modal-body" style="padding: 4px 0;">
                        <div class="tg-contacts-list">
            `;

            if (!contacts || contacts.length === 0) {
                html += `
                    <div style="padding: 40px 20px; text-align: center; color: #8e8e93;">
                        <i class="fas fa-address-book" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;"></i>
                        <p>Нет контактов</p>
                    </div>
                `;
            } else {
                contacts.forEach(contact => {
                    const frozenC = !!contact.is_banned;
                    const displayName = frozenC ? 'Удалённый аккаунт' : (contact.custom_name || contact.display_name || contact.username);
                    const initial = (displayName || '?')[0].toUpperCase();

                    html += `
                        <div class="tg-contact-item">
                            <div class="tg-contact-avatar" onclick="openChat(${contact.id}, 'personal'); closeModal('tempModal');">
                                ${frozenC ? `<span>❄</span>` : (contact.avatar ? `<img src="/${contact.avatar}">` : `<span>${initial}</span>`)}
                            </div>
                            <div class="tg-contact-info" onclick="openChat(${contact.id}, 'personal'); closeModal('tempModal');">
                                <div class="tg-contact-name">${escapeHtml(displayName)}${frozenC ? '<span class="snow-emoji">❄</span>' : ''}</div>
                                <div class="tg-contact-username">@${escapeHtml(contact.username)}</div>
                            </div>
                            <button class="tg-contact-more-btn" onclick="event.stopPropagation(); showContactActions(${contact.id});">
                                <i class="fas fa-ellipsis-h"></i>
                            </button>
                        </div>
                    `;
                });
            }

            html += `
                        </div>
                    </div>
                </div>
            `;

            document.getElementById('tempModalBody').innerHTML = html;
            openModal('tempModal');
        })
        .catch(err => {
            console.error('Error loading contacts:', err);
            showModal('Контакты', '<div style="padding: 40px; text-align: center; color: #8e8e93;">Ошибка загрузки</div>');
        });
}

function showContactActions(contactId) {
    fetch('/api/check_contact/' + contactId)
        .then(r => r.json())
        .then(data => {
            let html = `
                <div class="tg-modal-content">
                    <div class="tg-action-menu">
            `;

            if (data.is_contact) {
                html += `
                        <button class="tg-action-item" onclick="renameContactDialog(${contactId}); closeModal('tempModal');">
                            <i class="fas fa-edit"></i>
                            <span>Переименовать контакт</span>
                        </button>
                        <div class="tg-action-divider"></div>
                        <button class="tg-action-item danger" onclick="removeContactById(${contactId}); closeModal('tempModal');">
                            <i class="fas fa-user-minus"></i>
                            <span>Удалить контакт</span>
                        </button>
                `;
            } else {
                html += `
                        <button class="tg-action-item" onclick="addContactDialog(${contactId}); closeModal('tempModal');">
                            <i class="fas fa-user-plus"></i>
                            <span>Добавить в контакты</span>
                        </button>
                `;
            }

            html += `
                        <div class="tg-action-divider"></div>
                        <button class="tg-action-item" onclick="closeModal('tempModal');">
                            <i class="fas fa-times"></i>
                            <span>Закрыть</span>
                        </button>
                    </div>
                </div>
            `;

            document.getElementById('tempModalBody').innerHTML = html;
            openModal('tempModal');
        });
}

// Сохранение нового контакта
function saveNewContact(userId) {
    const firstName = document.getElementById('cfn').value.trim();
    const lastName = document.getElementById('cln').value.trim();
    const fullName = (firstName + ' ' + lastName).trim();

    if (!fullName) {
        alert('Введите имя');
        return;
    }

    fetch('/api/add_contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: userId, name: fullName })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            closeModal('tempModal');
            showToast('✅ Контакт добавлен!');

            // ===== ОБНОВЛЯЕМ СПИСОК ЧАТОВ =====
            loadChatsList();

            // ===== ЕСЛИ ЭТОТ ЧАТ ОТКРЫТ — ОБНОВЛЯЕМ ИМЯ В ШАПКЕ =====
            if (currentChat && currentChat.other_user_id == userId) {
                currentChat.name = fullName;
                document.getElementById('chatUserName').textContent = fullName;
            }
        } else {
            alert('Ошибка при добавлении контакта');
        }
    });
}

// Диалог переименования контакта
function renameContactDialog(userId) {
    fetch('/api/get_user_profile/' + userId)
        .then(r => r.json())
        .then(user => {
            fetch('/api/check_contact/' + userId)
                .then(r => r.json())
                .then(data => {
                    const currentName = data.contact_name || user.display_name || '';
                    const parts = currentName.split(' ');
                    const firstName = parts[0] || '';
                    const lastName = parts.slice(1).join(' ') || '';
                    const initial = (currentName || user.display_name || '?')[0].toUpperCase();

                    let html = `
                        <div class="tg-modal-content">
                            <div class="tg-modal-header">
                                <button class="cancel-btn" onclick="closeModal('tempModal')"><i class="fas fa-arrow-left"></i></button>
                        
                                <span class="title">Переименовать</span>
                                <button class="done-btn" onclick="saveRenameContact(${userId})">Готово</button>
                            </div>
                            <div class="tg-modal-body">
                                <div class="tg-avatar-preview">${initial}</div>
                                <div>
                                    <label class="tg-label">Имя</label>
                                    <input type="text" id="cfn" class="tg-input" value="${escapeHtml(firstName)}" placeholder="Имя">
                                </div>
                                <div>
                                    <label class="tg-label">Фамилия</label>
                                    <input type="text" id="cln" class="tg-input" value="${escapeHtml(lastName)}" placeholder="Фамилия">
                                </div>
                            </div>
                        </div>
                    `;

                    document.getElementById('tempModalBody').innerHTML = html;
                    openModal('tempModal');
                });
        });
}

// Сохранение переименования
function saveRenameContact(userId) {
    const firstName = document.getElementById('cfn').value.trim();
    const lastName = document.getElementById('cln').value.trim();
    const fullName = (firstName + ' ' + lastName).trim();

    if (!fullName) {
        alert('Введите имя');
        return;
    }

    fetch('/api/rename_contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: userId, name: fullName })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            closeModal('tempModal');
            showToast('✅ Контакт переименован!');

            // ===== ОБНОВЛЯЕМ СПИСОК ЧАТОВ =====
            loadChatsList();

            // ===== ЕСЛИ ЭТОТ ЧАТ ОТКРЫТ — ОБНОВЛЯЕМ ИМЯ В ШАПКЕ =====
            if (currentChat && currentChat.other_user_id == userId) {
                currentChat.name = fullName;
                document.getElementById('chatUserName').textContent = fullName;
            }
        } else {
            alert('Ошибка при переименовании контакта');
        }
    });
}

// Удаление контакта
function removeContactById(userId) {
    if (!confirm('Удалить контакт? Имя вернется к оригинальному.')) {
        return;
    }

    fetch('/api/remove_contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: userId })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            closeModal('tempModal');
            showToast('🗑️ Контакт удален');

            // ===== ОБНОВЛЯЕМ СПИСОК ЧАТОВ =====
            loadChatsList();

            // ===== ЕСЛИ ЭТОТ ЧАТ ОТКРЫТ — СБРАСЫВАЕМ ИМЯ В ШАПКЕ =====
            if (currentChat && currentChat.other_user_id == userId) {
                fetch('/api/get_user_profile/' + userId)
                    .then(r => r.json())
                    .then(user => {
                        const originalName = user.display_name || user.username;
                        currentChat.name = originalName;
                        document.getElementById('chatUserName').textContent = originalName;
                    });
            }
        } else {
            alert('Ошибка при удалении контакта');
        }
    });
}

    function openCalls() {
        closeBurgerMenu();
        fetch('/api/get_call_history')
            .then(r => r.json())
            .then(calls => {
                let h = '<div class="members-list">';
                if (!calls.length) {
                    h += '<div class="member-item">Нет звонков</div>';
                } else {
                    calls.forEach(c => {
                        h += `
                            <div class="member-item" onclick="openChat(${c.contact_id}, 'personal');closeModal('tempModal');">
                                <div class="member-avatar">
                                    <span>${c.contact_name?.[0] || '?'}</span>
                                </div>
                                <div class="member-info">
                                    <div class="member-name">${escapeHtml(c.contact_name || c.contact_username)}</div>
                                    <div class="member-role">
                                        <i class="fas fa-${c.call_type === 'video' ? 'video' : 'phone'}"></i>
                                        ${c.is_outgoing ? 'Исходящий' : 'Входящий'}
                                        ${c.status}
                                        ${c.duration ? `${Math.floor(c.duration/60)}:${(c.duration%60).toString().padStart(2,'0')}` : ''}
                                    </div>
                                </div>
                            </div>
                        `;
                    });
                }
                h += '</div>';
                showModal('Звонки', h);
            });
    }

    function openFavorites() {
        closeBurgerMenu();
        openChat(currentUser.id, 'personal');
    }

    function openBlockedUsers() {
        closeBurgerMenu();
        fetch('/api/get_blocked_users')
            .then(r => r.json())
            .then(users => {
                let h = '<div class="members-list">';
                if (!users || !users.length) {
                    h += '<div class="member-item">Нет заблокированных пользователей</div>';
                } else {
                    users.forEach(u => {
                        h += `
                            <div class="member-item" style="display: flex; align-items: center; justify-content: space-between;">
                                <div style="display: flex; align-items: center; gap: 12px; flex: 1; cursor: pointer;" onclick="openUserProfileModal(${u.id})">
                                    <div class="member-avatar">
                                        ${u.avatar ? `<img src="/${u.avatar}">` : `<span>${(u.display_name || u.username || '?')[0].toUpperCase()}</span>`}
                                    </div>
                                    <div class="member-info">
                                        <div class="member-name">${escapeHtml(u.display_name || u.username)}</div>
                                        <div class="member-role">@${escapeHtml(u.username || '')}</div>
                                    </div>
                                </div>
                                <button class="user-profile-btn user-profile-btn-primary" onclick="event.stopPropagation(); unblockUserAction(${u.id}); closeModal('tempModal');" style="padding: 6px 12px; font-size: 12px;">
                                    <i class="fas fa-unlock"></i> Разблокировать
                                </button>
                            </div>
                        `;
                    });
                }
                h += '</div>';
                showModal('Заблокированные пользователи', h);
            });
    }

    function createGroup() {
        closeBurgerMenu();
        let h = `
            <div class="user-profile-body">
                <div class="profile-field"><label>Название группы</label><input type="text" id="groupName" class="modal-input" placeholder="Введите название"></div>
                <div class="profile-field"><label>Описание</label><textarea id="groupDescription" class="modal-input" rows="3" placeholder="Описание группы"></textarea></div>
                <div class="profile-field"><label>Юзернейм (необязательно) <span style="color:#8a92a6;font-weight:400">@...</span></label><input type="text" id="groupUsername" class="modal-input" placeholder="@mygroup" maxlength="32" oninput="this.value=this.value.replace(/[^a-zA-Z0-9_@]/g,'')"></div>
                <div class="profile-field"><label><input type="checkbox" id="groupIsPublic" checked> Публичная группа</label></div>
                <div class="user-profile-buttons">
                    <button class="user-profile-btn user-profile-btn-secondary" onclick="closeModal('tempModal')">Отмена</button>
                    <button class="user-profile-btn user-profile-btn-primary" onclick="saveGroup()">Создать</button>
                </div>
            </div>
        `;
        showModal('Создать группу', h);
    }

    function saveGroup() {
        const name = document.getElementById('groupName').value;
        const description = document.getElementById('groupDescription').value;
        const isPublic = document.getElementById('groupIsPublic').checked;
        const groupUsername = document.getElementById('groupUsername') ? document.getElementById('groupUsername').value.trim() : '';

        if (!name) { alert('Введите название группы'); return; }

        fetch('/api/create_group', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, description: description, is_public: isPublic, username: groupUsername || null })
        }).then(r => r.json()).then(d => {
            if (d.success) {
                closeModal('tempModal');
                loadGroupsList();
                openChat(d.group_id, 'group');
            } else if (d.error) {
                alert(d.error);
            }
        });
    }

    function createChannel() {
        closeBurgerMenu();
        let h = `
            <div class="user-profile-body">
                <div class="profile-field"><label>Название канала</label><input type="text" id="channelName" class="modal-input" placeholder="Введите название"></div>
                <div class="profile-field"><label>Описание</label><textarea id="channelDescription" class="modal-input" rows="3" placeholder="Описание канала"></textarea></div>
                <div class="profile-field"><label>Юзернейм (необязательно) <span style="color:#8a92a6;font-weight:400">@...</span></label><input type="text" id="channelUsername" class="modal-input" placeholder="@mychannel" maxlength="32" oninput="this.value=this.value.replace(/[^a-zA-Z0-9_@]/g,'')"></div>
                <div class="profile-field"><label><input type="checkbox" id="channelIsPublic" checked> Публичный канал</label></div>
                <div class="user-profile-buttons">
                    <button class="user-profile-btn user-profile-btn-secondary" onclick="closeModal('tempModal')">Отмена</button>
                    <button class="user-profile-btn user-profile-btn-primary" onclick="saveChannel()">Создать</button>
                </div>
            </div>
        `;
        showModal('Создать канал', h);
    }

    function saveChannel() {
        const name = document.getElementById('channelName').value;
        const description = document.getElementById('channelDescription').value;
        const isPublic = document.getElementById('channelIsPublic').checked;
        const channelUsername = document.getElementById('channelUsername') ? document.getElementById('channelUsername').value.trim() : '';

        if (!name) { alert('Введите название канала'); return; }

        fetch('/api/create_channel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, description: description, is_public: isPublic, username: channelUsername || null })
        }).then(r => r.json()).then(d => {
            if (d.success) {
                closeModal('tempModal');
                loadChannelsList();
                openChat(d.channel_id, 'channel');
            } else if (d.error) {
                alert(d.error);
            }
        });
    }

    function openSettings() {
        closeBurgerMenu();
        let html = `
            <div class="user-profile-body">
                <div class="burger-item" onclick="openPrivacy();closeModal('tempModal');"><i class="fas fa-lock"></i><span>Конфиденциальность</span></div>
                <div class="burger-item" onclick="openAppearance();closeModal('tempModal');"><i class="fas fa-palette"></i><span>Оформление</span></div>
                <div class="burger-item" onclick="openSessions();closeModal('tempModal');"><i class="fas fa-shield-alt"></i><span>Активные сессии</span></div>
                <div class="burger-item" onclick="openNotifications();closeModal('tempModal');"><i class="fas fa-bell"></i><span>Уведомления</span></div>
                <div class="burger-divider"></div>
                <div class="burger-item danger" onclick="deleteAccount();closeModal('tempModal');"><i class="fas fa-trash-alt"></i><span>Удалить аккаунт</span></div>
            </div>
        `;
        showModal('Настройки', html);
    }

