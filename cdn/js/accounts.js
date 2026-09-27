// ===== УПРАВЛЕНИЕ АККАУНТАМИ =====

// ===== СПИСОК СТРАН ДЛЯ ДОБАВЛЕНИЯ АККАУНТА =====
const COUNTRIES = [
    { code: 'RU', name: 'Россия',         dial: '+7',     flag: '🇷🇺', minLen: 10, maxLen: 10 },
    { code: 'KZ', name: 'Казахстан',      dial: '+7',     flag: '🇰🇿', minLen: 10, maxLen: 10 },
    { code: 'BY', name: 'Беларусь',       dial: '+375',   flag: '🇧🇾', minLen: 9,  maxLen: 9  },
    { code: 'UA', name: 'Украина',        dial: '+380',   flag: '🇺🇦', minLen: 9,  maxLen: 9  },
    { code: 'US', name: 'США',            dial: '+1',     flag: '🇺🇸', minLen: 10, maxLen: 10 },
    { code: 'GB', name: 'Великобритания', dial: '+44',    flag: '🇬🇧', minLen: 10, maxLen: 10 },
    { code: 'DE', name: 'Германия',       dial: '+49',    flag: '🇩🇪', minLen: 10, maxLen: 11 },
    { code: 'FR', name: 'Франция',        dial: '+33',    flag: '🇫🇷', minLen: 9,  maxLen: 9  },
    { code: 'ES', name: 'Испания',        dial: '+34',    flag: '🇪🇸', minLen: 9,  maxLen: 9  },
    { code: 'IT', name: 'Италия',         dial: '+39',    flag: '🇮🇹', minLen: 10, maxLen: 10 },
    { code: 'TR', name: 'Турция',         dial: '+90',    flag: '🇹🇷', minLen: 10, maxLen: 10 },
    { code: 'GE', name: 'Грузия',         dial: '+995',   flag: '🇬🇪', minLen: 9,  maxLen: 9  },
    { code: 'AM', name: 'Армения',        dial: '+374',   flag: '🇦🇲', minLen: 8,  maxLen: 8  },
    { code: 'AZ', name: 'Азербайджан',    dial: '+994',   flag: '🇦🇿', minLen: 9,  maxLen: 9  },
    { code: 'UZ', name: 'Узбекистан',     dial: '+998',   flag: '🇺🇿', minLen: 9,  maxLen: 9  },
    { code: 'KG', name: 'Кыргызстан',     dial: '+996',   flag: '🇰🇬', minLen: 9,  maxLen: 9  },
    { code: 'TJ', name: 'Таджикистан',    dial: '+992',   flag: '🇹🇯', minLen: 9,  maxLen: 9  },
    { code: 'TM', name: 'Туркменистан',   dial: '+993',   flag: '🇹🇲', minLen: 8,  maxLen: 8  },
    { code: 'MD', name: 'Молдова',        dial: '+373',   flag: '🇲🇩', minLen: 8,  maxLen: 8  },
    { code: 'LV', name: 'Латвия',         dial: '+371',   flag: '🇱🇻', minLen: 8,  maxLen: 8  },
    { code: 'LT', name: 'Литва',          dial: '+370',   flag: '🇱🇹', minLen: 8,  maxLen: 8  },
    { code: 'EE', name: 'Эстония',        dial: '+372',   flag: '🇪🇪', minLen: 7,  maxLen: 8  },
    { code: 'PL', name: 'Польша',         dial: '+48',    flag: '🇵🇱', minLen: 9,  maxLen: 9  },
    { code: 'CZ', name: 'Чехия',          dial: '+420',   flag: '🇨🇿', minLen: 9,  maxLen: 9  },
    { code: 'RS', name: 'Сербия',         dial: '+381',   flag: '🇷🇸', minLen: 9,  maxLen: 9  },
    { code: 'BG', name: 'Болгария',       dial: '+359',   flag: '🇧🇬', minLen: 9,  maxLen: 9  },
    { code: 'RO', name: 'Румыния',        dial: '+40',    flag: '🇷🇴', minLen: 9,  maxLen: 9  },
    { code: 'IL', name: 'Израиль',        dial: '+972',   flag: '🇮🇱', minLen: 9,  maxLen: 9  },
    { code: 'AE', name: 'ОАЭ',            dial: '+971',   flag: '🇦🇪', minLen: 9,  maxLen: 9  },
    { code: 'CN', name: 'Китай',          dial: '+86',    flag: '🇨🇳', minLen: 11, maxLen: 11 },
    { code: 'JP', name: 'Япония',         dial: '+81',    flag: '🇯🇵', minLen: 10, maxLen: 10 },
    { code: 'KR', name: 'Южная Корея',    dial: '+82',    flag: '🇰🇷', minLen: 9,  maxLen: 10 },
    { code: 'IN', name: 'Индия',          dial: '+91',    flag: '🇮🇳', minLen: 10, maxLen: 10 },
    { code: 'BR', name: 'Бразилия',       dial: '+55',    flag: '🇧🇷', minLen: 10, maxLen: 11 },
    { code: 'MX', name: 'Мексика',        dial: '+52',    flag: '🇲🇽', minLen: 10, maxLen: 10 },
    { code: 'FI', name: 'Финляндия',      dial: '+358',   flag: '🇫🇮', minLen: 9,  maxLen: 9  },
    { code: 'SE', name: 'Швеция',         dial: '+46',    flag: '🇸🇪', minLen: 9,  maxLen: 9  },
    { code: 'NO', name: 'Норвегия',       dial: '+47',    flag: '🇳🇴', minLen: 8,  maxLen: 8  },
    { code: 'DK', name: 'Дания',          dial: '+45',    flag: '🇩🇰', minLen: 8,  maxLen: 8  },
    { code: 'NL', name: 'Нидерланды',     dial: '+31',    flag: '🇳🇱', minLen: 9,  maxLen: 9  },
    { code: 'CH', name: 'Швейцария',      dial: '+41',    flag: '🇨🇭', minLen: 9,  maxLen: 9  },
    { code: 'AT', name: 'Австрия',        dial: '+43',    flag: '🇦🇹', minLen: 9,  maxLen: 9  },
    { code: 'BE', name: 'Бельгия',        dial: '+32',    flag: '🇧🇪', minLen: 9,  maxLen: 9  },
    { code: 'PT', name: 'Португалия',     dial: '+351',   flag: '🇵🇹', minLen: 9,  maxLen: 9  },
    { code: 'GR', name: 'Греция',         dial: '+30',    flag: '🇬🇷', minLen: 10, maxLen: 10 }
];

// Открыть модалку добавления аккаунта
function openAddAccountModal() {
    closeBurgerMenu();

    // Строим выпадающий список стран
    const countriesHtml = COUNTRIES.map(c => `
        <div class="add-country-item" data-code="${c.code}" data-dial="${c.dial}" data-min="${c.minLen}" data-max="${c.maxLen}">
            <span class="add-cflag">${c.flag}</span>
            <span class="add-cname">${c.name}</span>
            <span class="add-ccode">${c.dial}</span>
        </div>
    `).join('');

    // По умолчанию — Россия
    const defCountry = COUNTRIES[0];

    let html = `
        <div style="padding: 4px 0; color: white;">
            <div class="profile-field">
                <label>Номер телефона</label>
                <div style="display:flex;gap:8px;margin-bottom:4px">
                    <div style="position:relative">
                        <button type="button" id="addCountryBtn" style="display:flex;align-items:center;gap:4px;padding:10px 12px;background:#232323;border:1.5px solid transparent;border-radius:8px;cursor:pointer;font-size:14px;font-family:inherit;color:white;height:46px;white-space:nowrap;transition:border-color .2s" onmouseover="this.style.borderColor='#2ea6ff'" onmouseout="this.style.borderColor='transparent'">
                            <span id="addSelFlag">${defCountry.flag}</span>
                            <span id="addSelCode" style="font-weight:600">${defCountry.dial}</span>
                            <span style="font-size:8px;color:#6a6a72;margin-left:2px">▾</span>
                        </button>
                        <div id="addCountryDD" style="display:none;position:absolute;top:100%;left:0;min-width:240px;background:#2b2b32;border:1px solid #44444c;border-radius:10px;max-height:280px;overflow:hidden;z-index:200;box-shadow:0 8px 40px rgba(0,0,0,.6)">
                            <div style="padding:6px 8px;border-bottom:1px solid #44444c">
                                <input type="text" id="addCountrySearch" placeholder="Поиск..." style="width:100%;padding:8px 10px;background:#3a3a42;border:none;border-radius:6px;font-size:13px;font-family:inherit;color:white;outline:none" oninput="filterAddCountries(this.value)">
                            </div>
                            <div id="addCountryList" style="overflow-y:auto;max-height:230px">${countriesHtml}</div>
                        </div>
                    </div>
                    <div style="flex:1">
                        <input type="tel" id="addPhone" class="modal-input" placeholder="000 000 00 00" inputmode="numeric" style="height:46px;font-size:16px;letter-spacing:.3px">
                    </div>
                </div>
            </div>
            <div class="profile-field">
                <label>Способ входа</label>
                <div style="display:flex;gap:6px;background:#232323;padding:4px;border-radius:10px;margin-bottom:12px">
                    <button type="button" id="addModePwd" onclick="setAddMode('password')" style="flex:1;padding:9px 6px;background:#3a3a42;border:none;border-radius:7px;cursor:pointer;font-size:13px;font-family:inherit;color:white;font-weight:600;transition:all .2s">🔑 Пароль</button>
                    <button type="button" id="addModeCode" onclick="setAddMode('code')" style="flex:1;padding:9px 6px;background:none;border:none;border-radius:7px;cursor:pointer;font-size:13px;font-family:inherit;color:#8a8a92;font-weight:600;transition:all .2s">🔢 Код</button>
                </div>
            </div>

            <div id="addPanePwd" class="profile-field">
                <label>Пароль</label>
                <input type="password" id="addPassword" class="modal-input" placeholder="••••••••" style="height:46px">
            </div>

            <div id="addPaneCode" class="profile-field" style="display:none">
                <label>Код входа</label>
                <div style="display:flex;gap:8px;align-items:center">
                    <input type="text" id="addCode" class="modal-input" placeholder="•••••" maxlength="5" inputmode="numeric" style="flex:1;height:46px;text-align:center;letter-spacing:8px;font-size:18px;font-weight:700" oninput="this.value=this.value.replace(/\D/g,'').slice(0,5)">
                    <button type="button" id="addSendCodeBtn" onclick="sendAddCode()" style="flex-shrink:0;height:46px;padding:0 14px;background:linear-gradient(135deg,#667eea,#764ba2);border:none;border-radius:10px;color:#fff;font-size:12px;font-family:inherit;font-weight:700;cursor:pointer;transition:all .2s">Получить код</button>
                </div>
                <div id="addCodeStatus" style="font-size:12px;color:#8a8a92;margin-top:8px">Код придёт в системный чат @sputnik</div>
            </div>
            <div class="user-profile-buttons">
                <button class="user-profile-btn user-profile-btn-secondary" onclick="closeModal('tempModal')">Отмена</button>
                <button class="user-profile-btn user-profile-btn-primary" onclick="addNewAccount()">Войти</button>
            </div>
        </div>
    `;
    showModal('Добавить аккаунт', html);

    // Инициализация после открытия модалки
    setTimeout(() => {
        const phoneInput = document.getElementById('addPhone');
        if (!phoneInput) return;

        // Состояние
        window._addCountry = COUNTRIES[0];
        window._addDigits = '';
        window._addAuthType = 'password';

        // Обработчик ввода телефона
        phoneInput.oninput = function() {
            let d = this.value.replace(/\D/g, '');
            const max = window._addCountry.maxLen;
            if (d.length > max) d = d.slice(0, max);
            window._addDigits = d;
            // Форматирование как в России
            let f = '';
            if (d.length > 0) {
                if (d.length <= 3)      f = d;
                else if (d.length <= 6) f = d.slice(0,3) + ' ' + d.slice(3);
                else if (d.length <= 8) f = d.slice(0,3) + ' ' + d.slice(3,6) + ' ' + d.slice(6);
                else                    f = d.slice(0,3) + ' ' + d.slice(3,6) + ' ' + d.slice(6,8) + ' ' + d.slice(8,10);
            }
            this.value = f;
        };

        // Обработчик вставки
        phoneInput.addEventListener('paste', function() {
            setTimeout(() => {
                const raw = this.value.replace(/\s/g, '');
                const match = raw.match(/^(\+?\d{1,4})(\d+)$/);
                if (!match) return;
                const countryPart = match[1].replace(/\D/g, '');
                const localPart = match[2];
                const sorted = [...COUNTRIES].sort((a,b) => b.dial.length - a.dial.length);
                let found = null;
                for (const c of sorted) {
                    if (countryPart === c.dial.replace(/\D/g, '')) { found = c; break; }
                }
                if (found) {
                    window._addCountry = found;
                    document.getElementById('addSelFlag').textContent = found.flag;
                    document.getElementById('addSelCode').textContent = found.dial;
                }
                const max = window._addCountry.maxLen;
                window._addDigits = localPart.slice(0, max);
                this.value = window._addDigits;
                if (document.getElementById('addCountryDD')) {
                    document.getElementById('addCountryDD').style.display = 'none';
                }
            }, 10);
        });

        // Обработчик выбора страны
        document.querySelectorAll('.add-country-item').forEach(el => {
            el.onclick = function() {
                const code = this.dataset.code;
                const c = COUNTRIES.find(x => x.code === code);
                if (!c) return;
                window._addCountry = c;
                document.getElementById('addSelFlag').textContent = c.flag;
                document.getElementById('addSelCode').textContent = c.dial;
                document.getElementById('addCountryDD').style.display = 'none';
                // Очищаем телефон при смене страны
                const inp = document.getElementById('addPhone');
                inp.value = '';
                window._addDigits = '';
                inp.focus();
            };
        });

        // Открытие/закрытие списка стран
        document.getElementById('addCountryBtn').onclick = function(e) {
            e.stopPropagation();
            const dd = document.getElementById('addCountryDD');
            dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
            if (dd.style.display === 'block') {
                document.getElementById('addCountrySearch').value = '';
                document.getElementById('addCountrySearch').focus();
                filterAddCountries('');
            }
        };

        // Закрытие при клике снаружи
        document.addEventListener('click', function addCountryClose(e) {
            if (!e.target.closest('#addCountryBtn') && !e.target.closest('#addCountryDD')) {
                const dd = document.getElementById('addCountryDD');
                if (dd) dd.style.display = 'none';
            }
        }, { once: false });
    }, 100);
}

// Фильтрация стран в модалке добавления аккаунта
function filterAddCountries(query) {
    const q = (query || '').toLowerCase().trim();
    document.querySelectorAll('.add-country-item').forEach(el => {
        const name = (el.querySelector('.add-cname')?.textContent || '').toLowerCase();
        const dial = el.dataset.dial || '';
        const code = el.dataset.code || '';
        const match = !q || name.includes(q) || dial.includes(q) || code.toLowerCase().includes(q);
        el.style.display = match ? '' : 'none';
    });
}





// Переключение на другой аккаунт
function switchToAccount(userId) {
    // Если уже на этом аккаунте — просто закрываем меню
    if (userId == currentUser.id) {
        closeBurgerMenu();
        return;
    }

    fetch('/api/auth/switch_account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            // Перезагружаем страницу — сессия уже обновлена
            location.reload();
        } else {
            alert('Ошибка переключения: ' + (data.error || 'Неизвестная ошибка'));
        }
    })
    .catch(() => alert('Ошибка соединения с сервером'));
}


// ===== ПРОСТОЙ ВЫВОД АККАУНТОВ =====
function loadAccountsManually() {
    const container = document.getElementById('burgerAccounts');
    if (!container) return;

    // Сначала получаем текущего пользователя
    const currentId = currentUser.id;

    // Получаем список привязанных аккаунтов
    fetch('/api/auth/linked_accounts')
        .then(r => r.json())
        .then(accounts => {
            let html = '';

            // ВСЕГДА показываем текущий аккаунт первым (активным)
            html += `
                <div class="account-item active" data-user-id="${currentId}" onclick="switchToAccount(${currentId})">
                    <div class="account-avatar" style="background: var(--primary-gradient);">
                        <span>${currentUser.display_name[0].toUpperCase()}</span>
                    </div>
                    <div class="account-name">${currentUser.display_name}</div>
                </div>
            `;

            // Добавляем привязанные аккаунты
            accounts.forEach(acc => {
                // Если это не текущий аккаунт — показываем
                if (acc.id !== currentId) {
                    const letter = (acc.display_name || acc.username || '?')[0].toUpperCase();
                    html += `
                        <div class="account-item" onclick="switchToAccount(${acc.id})">
                            <div class="account-avatar" style="background: var(--primary-gradient);">
                                ${acc.avatar ? `<img src="/${acc.avatar}">` : `<span>${letter}</span>`}
                            </div>
                            <div class="account-name">${acc.display_name || acc.username}</div>
                        </div>
                    `;
                }
            });

            // Кнопка добавления
            html += `
                <div class="account-add" onclick="openAddAccountModal()">
                    <div class="account-add-icon"><i class="fas fa-plus"></i></div>
                </div>
            `;

            container.innerHTML = html;
        })
        .catch(err => {
            console.error('Ошибка загрузки аккаунтов:', err);
            // Если ошибка, показываем только текущий
            container.innerHTML = `
                <div class="account-item active" data-user-id="${currentId}">
                    <div class="account-avatar" style="background: var(--primary-gradient);">
                        <span>${currentUser.display_name[0].toUpperCase()}</span>
                    </div>
                    <div class="account-name">${currentUser.display_name}</div>
                </div>
                <div class="account-add" onclick="openAddAccountModal()">
                    <div class="account-add-icon"><i class="fas fa-plus"></i></div>
                </div>
            `;
        });
}

// Загружаем при старте
document.addEventListener('DOMContentLoaded', function() {
    loadAccountsManually();

    // ===== МОБИЛЬНАЯ КЛАВИАТУРА: оптимизация как в Telegram =====
    if (window.visualViewport && isMobile()) {
        const chatArea = document.getElementById('chatArea');
        const messagesArea = document.getElementById('messagesArea');
        const messageInput = document.getElementById('messageInput');

        function adjustForKeyboard() {
            const vh = window.visualViewport.height;
            const fullHeight = window.innerHeight;
            const keyboardHeight = fullHeight - vh;

            if (keyboardHeight > 100) {
                // Клавиатура открыта
                document.documentElement.style.setProperty('--keyboard-height', keyboardHeight + 'px');
                document.body.style.height = vh + 'px';
                document.documentElement.style.height = vh + 'px';

                // Скролл к последнему сообщению
                if (messagesArea) {
                    setTimeout(() => {
                        messagesArea.scrollTop = messagesArea.scrollHeight;
                    }, 100);
                }
            } else {
                // Клавиатура закрыта
                document.documentElement.style.removeProperty('--keyboard-height');
                document.body.style.height = '';
                document.documentElement.style.height = '';
            }
        }

        window.visualViewport.addEventListener('resize', adjustForKeyboard);

        // При фокусе на input — скролл вниз
        if (messageInput) {
            messageInput.addEventListener('focus', function() {
                setTimeout(() => {
                    if (messagesArea) messagesArea.scrollTop = messagesArea.scrollHeight;
                }, 300);
            });
        }
    }
});


    function addNewAccount() {
    const country = window._addCountry || COUNTRIES[0];
    const digits = window._addDigits || '';
    const phone = country.dial + digits;
    const authType = window._addAuthType || 'password';

    if (!phone || phone === country.dial) {
        alert('Введите номер телефона');
        return;
    }

    const payload = { phone: phone, auth_type: authType };

    if (authType === 'code') {
        const code = document.getElementById('addCode').value.trim();
        if (code.length !== 5) {
            alert('Введите 5-значный код');
            return;
        }
        payload.code = code;
    } else {
        const password = document.getElementById('addPassword').value;
        if (!password) {
            alert('Введите пароль');
            return;
        }
        payload.password = password;
    }

    fetch('/api/auth/add_account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(data => {
        if (data.twofa_required) {
            // У добавляемого аккаунта включён облачный пароль
            const pw = prompt('Облачный пароль для ' + (data.phone || phone) +
                (data.hint ? '\nПодсказка: ' + data.hint : ''));
            if (!pw) return;
            payload.cloud_password = pw;
            return fetch('/api/auth/add_account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(r2 => r2.json())
            .then(d2 => {
                if (d2.success) {
                    closeModal('tempModal');
                    alert('✅ Аккаунт добавлен!');
                    location.reload();
                } else {
                    alert('❌ Ошибка: ' + (d2.error || 'Неверный облачный пароль'));
                }
            });
        }
        if (data.success) {
            closeModal('tempModal');
            alert('✅ Аккаунт добавлен!');
            location.reload();
        } else {
            alert('❌ Ошибка: ' + (data.error || 'Неизвестная ошибка'));
        }
    })
    .catch(error => {
        console.error('💥 Ошибка запроса:', error);
        alert('Ошибка соединения с сервером: ' + error.message);
    });
}

// ===== Переключение «пароль / код» в добавлении аккаунта =====
function setAddMode(mode) {
    window._addAuthType = mode;
    const pwd = document.getElementById('addPanePwd');
    const code = document.getElementById('addPaneCode');
    const btnPwd = document.getElementById('addModePwd');
    const btnCode = document.getElementById('addModeCode');

    if (mode === 'code') {
        pwd.style.display = 'none';
        code.style.display = '';
        btnPwd.style.background = 'none';
        btnPwd.style.color = '#8a8a92';
        btnCode.style.background = '#3a3a42';
        btnCode.style.color = 'white';
        setTimeout(() => document.getElementById('addCode').focus(), 50);
    } else {
        code.style.display = 'none';
        pwd.style.display = '';
        btnCode.style.background = 'none';
        btnCode.style.color = '#8a8a92';
        btnPwd.style.background = '#3a3a42';
        btnPwd.style.color = 'white';
        setTimeout(() => document.getElementById('addPassword').focus(), 50);
    }
}

// ===== Отправка кода для добавления аккаунта =====
function sendAddCode() {
    const country = window._addCountry || COUNTRIES[0];
    const digits = window._addDigits || '';
    const phone = country.dial + digits;
    const status = document.getElementById('addCodeStatus');
    const btn = document.getElementById('addSendCodeBtn');

    if (!phone || phone === country.dial) {
        status.style.color = '#ef4444';
        status.textContent = 'Сначала введите номер телефона';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Отправка...';
    status.style.color = '#8a8a92';
    status.textContent = 'Отправляем код в @sputnik...';

    const body = new URLSearchParams();
    body.append('phone', phone);

    fetch('/api/auth/send_login_code', {
        method: 'POST',
        body: body,
        credentials: 'same-origin'
    })
    .then(r => r.json().then(j => ({ status: r.status, j })))
    .then(res => {
        if (res.status >= 400) {
            status.style.color = '#ef4444';
            status.textContent = res.j.error || 'Не удалось отправить код';
            btn.disabled = false;
            btn.textContent = 'Получить код';
            return;
        }
        status.style.color = '#10b981';
        status.textContent = res.j.message || 'Код отправлен в @sputnik';
        let t = 60;
        const timer = setInterval(() => {
            t--;
            if (t <= 0) {
                clearInterval(timer);
                btn.disabled = false;
                btn.textContent = 'Получить код снова';
            } else {
                btn.textContent = `Повторить через ${t}s`;
            }
        }, 1000);
        document.getElementById('addCode').focus();
    })
    .catch(() => {
        status.style.color = '#ef4444';
        status.textContent = 'Ошибка соединения с сервером';
        btn.disabled = false;
        btn.textContent = 'Получить код';
    });
}
