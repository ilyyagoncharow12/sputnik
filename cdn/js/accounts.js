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

/* ======================= ФОРМАТ НОМЕРА ======================= */
/* РАЗ-ЗА-ЗА для RU/KZ, остальным — тройками. */
function addFormatDigits(d, c) {
    if (!d) return '';
    if (c && (c.code === 'RU' || c.code === 'KZ')) {
        if (d.length <= 3) return d;
        if (d.length <= 6) return d.slice(0, 3) + ' ' + d.slice(3);
        if (d.length <= 8) return d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6);
        return d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6, 8) + ' ' + d.slice(8);
    }
    // 10 цифр — «555 012 3456» (как в США), иначе тройками
    if (d.length === 10) return d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6);
    let out = d.slice(0, 3), i = 3;
    while (i < d.length) { out += ' ' + d.slice(i, i + 3); i += 3; }
    return out;
}

/* ======================= АВТО-РАСПОЗНАВАНИЕ ======================= */
/* Отделяет код страны от номера. Возвращает {country, digits} либо
   null, если код не распознан. */
function addParsePhone(raw) {
    const s = String(raw || '');
    const hadPlus = /^\s*\+/.test(s);
    let digits = s.replace(/\D/g, '');
    if (!digits) return null;

    // Сначала пробуем выбранную страну — у RU и KZ один код +7,
    // не надо «перекидывать» номер на другую страну того же кода.
    const cur = window._addCountry;
    if (cur) {
        const cd = cur.dial.replace(/\D/g, '');
        if (digits.indexOf(cd) === 0 && digits.length - cd.length >= cur.minLen) {
            return { country: cur, digits: digits.slice(cd.length) };
        }
    }

    // Иначе ищем по списку: длинные коды первыми (+995 до +7).
    const sorted = [...COUNTRIES].sort(
        (a, b) => b.dial.replace(/\D/g, '').length - a.dial.replace(/\D/g, '').length
    );
    for (const c of sorted) {
        const cd = c.dial.replace(/\D/g, '');
        if (digits.indexOf(cd) === 0 && digits.length - cd.length >= c.minLen) {
            return { country: c, digits: digits.slice(cd.length) };
        }
    }

    // Плюс был, но код не узнали — не выдумываем: отдаём «как есть».
    if (hadPlus) return { country: cur, digits: null };
    return { country: cur, digits: digits };
}


/* Перерисовывает превью полного номера и счётчик цифр. */
function addPaint() {
    const c = window._addCountry || COUNTRIES[0];
    const d = window._addDigits || '';
    const full = document.getElementById('addPhoneFull');
    const hint = document.getElementById('addPhoneHint');
    // Полный номер показываем слитно, иначе форматирование по тройкам
    // склеивало код и номер вроде «+79 991 234 567».
    if (full) full.textContent = d ? (c.dial + d) : c.dial;
    if (!hint) return;

    if (!d) {
        hint.textContent = `Код страны ${c.dial} выбран отдельно — введите только номер`;
        hint.style.color = '#8a8a92';
        return;
    }
    if (d.length < c.minLen) {
        hint.textContent = `Не хватает цифр: нужно ${c.minLen}, введено ${d.length}`;
        hint.style.color = '#ef4444';
        return;
    }
    if (d.length > c.maxLen) {
        hint.textContent = `Лишние цифры: максимум ${c.maxLen}`;
        hint.style.color = '#ef4444';
        return;
    }
    hint.textContent = `Номер готов: ${c.dial} ${d.length} из ${c.minLen}–${c.maxLen} цифр`;
    hint.style.color = '#34c759';
}



// Общая часть: выбор страны + поле номера
function addPhoneBlock() {
    const def = window._addCountry || COUNTRIES[0];
    const opts = COUNTRIES.map((c, i) =>
        `<option value="${i}" ${c === def ? 'selected' : ''}>${c.flag} ${c.name} (${c.dial})</option>`).join('');
    return `
        <div class="profile-field">
            <label>Страна</label>
            <select id="addCountrySel" class="modal-input" autocomplete="off">
                ${opts}
            </select>
        </div>
        <div class="profile-field">
            <label>Номер телефона</label>
            <input type="text" id="addPhone" class="modal-input" placeholder="000 000 00 00"
                   inputmode="numeric" autocomplete="off" autocorrect="off" spellcheck="false">
            <div class="aa-full-row">
                <span class="aa-full-label">Получится:</span>
                <span class="aa-full-num" id="addPhoneFull">${def.dial}</span>
            </div>
            <div class="aa-hint" id="addPhoneHint"></div>
        </div>`;
}

// Общая часть: переключатель способа входа + поля
function addAuthBlock() {
    return `
        <div class="profile-field">
            <label>Способ входа</label>
            <div class="aa-seg">
                <button type="button" id="addModePwd" class="aa-seg-btn" onclick="setAddMode('password')">🔑 Пароль</button>
                <button type="button" id="addModeCode" class="aa-seg-btn" onclick="setAddMode('code')">🔢 Код</button>
            </div>
        </div>
        <div id="addPanePwd" class="profile-field">
            <label>Пароль от аккаунта</label>
            <input type="password" id="addPassword" class="modal-input" placeholder="••••••••" autocomplete="new-password">
        </div>
        <div id="addPaneCode" class="profile-field" style="display:none">
            <label>Код входа</label>
            <div class="aa-code-row">
                <input type="text" id="addCode" class="modal-input aa-code" placeholder="•••••" maxlength="5" inputmode="numeric"
                       oninput="this.value=this.value.replace(/\D/g,'').slice(0,5)">
                <button type="button" id="addSendCodeBtn" class="aa-code-send" onclick="sendAddCode()">Получить код</button>
            </div>
            <div id="addCodeStatus" class="aa-code-status">Код придёт в системный чат @sputnik</div>
        </div>`;
}

// ===== Модалка «Добавить аккаунт» =====
// Стандартная showModal (та же карточка, что у всех окон приложения):
// одна колонка — страна, номер, вход. Свой выпадающий список стран и
// отдельные раскладки для ПК/телефона убраны: из-за них окно вылезало
// за экран, а карточка оставалась без фона.
function openAddAccountModal() {
    closeBurgerMenu();

    window._addCountry = COUNTRIES[0];
    window._addDigits = '';
    window._addAuthType = 'password';

    showModal('Добавить аккаунт', `
        <div class="addacct">
            <div class="addacct-hint">Второй номер в Спутнике — переключайтесь без входа заново</div>
            ${addPhoneBlock()}
            ${addAuthBlock()}
            <div class="addacct-actions">
                <button type="button" class="aa-btn aa-btn-primary" onclick="addNewAccount()">Войти</button>
            </div>
        </div>`);

    const sel = document.getElementById('addCountrySel');
    if (sel) {
        sel.addEventListener('change', () => {
            window._addCountry = COUNTRIES[Number(sel.value)] || COUNTRIES[0];
            addPaint();
        });
    }

    const phoneInput = document.getElementById('addPhone');
    if (phoneInput) {
        // Браузер подставляет сохранённый номер — чистим, иначе пустая
        // форма сразу показывает «не хватает цифр».
        phoneInput.value = '';
        phoneInput.addEventListener('focus', function () { this.select?.(); });
        phoneInput.addEventListener('input', function (e) {
            if (this.matches(':autofill') || e.inputType === 'insertReplacementText') {
                this.value = '';
                window._addDigits = '';
                addPaint();
                return;
            }
            const raw = this.value;
            const c = window._addCountry || COUNTRIES[0];
            const rawDigits = raw.replace(/\D/g, '');

            // Вставлен полный номер с кодом страны — отделяем код сами.
            if (rawDigits && (/^\s*\+/.test(raw) || rawDigits.length > c.maxLen)) {
                const p = addParsePhone(raw);
                if (p && p.digits) {
                    const pc = p.country;
                    if (pc !== c) {
                        window._addCountry = pc;
                        const s2 = document.getElementById('addCountrySel');
                        if (s2) s2.value = String(COUNTRIES.indexOf(pc));
                    }
                    let d = p.digits;
                    if (pc.dial === '+7' && d.length === pc.maxLen + 1 && d[0] === '8') d = d.slice(1);
                    if (d.length > pc.maxLen) d = d.slice(0, pc.maxLen);
                    window._addDigits = d;
                    this.value = addFormatDigits(d, pc);
                    addPaint();
                    return;
                }
            }

            let d = rawDigits;
            if (d.length > c.maxLen) d = d.slice(0, c.maxLen);
            window._addDigits = d;
            this.value = addFormatDigits(d, c);
            addPaint();
        });
    }

    const pw = document.getElementById('addPassword');
    if (pw) {
        pw.value = '';
        pw.addEventListener('focus', function () { if (this.value) { this.value = ''; this.select?.(); } });
    }
    const cd = document.getElementById('addCode');
    if (cd) cd.value = '';

    setAddMode('password');
}

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

        function adjustKb() {
            const vh = window.visualViewport.height;
            const keyboardHeight = window.innerHeight - vh;
            if (keyboardHeight > 100) {
                document.documentElement.style.setProperty('--keyboard-height', keyboardHeight + 'px');
                document.body.style.height = vh + 'px';
                document.documentElement.style.height = vh + 'px';
                if (messagesArea) {
                    setTimeout(() => { messagesArea.scrollTop = messagesArea.scrollHeight; }, 100);
                }
            } else {
                document.documentElement.style.removeProperty('--keyboard-height');
                document.body.style.height = '';
                document.documentElement.style.height = '';
            }
        }

        window.visualViewport.addEventListener('resize', adjustKb);

        if (messageInput) {
            messageInput.addEventListener('focus', function () {
                setTimeout(() => {
                    if (messagesArea) messagesArea.scrollTop = messagesArea.scrollHeight;
                }, 300);
            });
        }
    }
});

// Проверка номера перед отправкой
function addCheckPhone(statusEl) {
    const c = window._addCountry || COUNTRIES[0];
    const d = window._addDigits || '';
    const fail = msg => {
        if (statusEl) {
            statusEl.style.color = '#ef4444';
            statusEl.textContent = msg;
        }
        showToast(msg);
        return null;
    };
    if (!d) return fail('Сначала введите номер телефона');
    if (d.length < c.minLen) return fail(`Не хватает цифр: нужно ${c.minLen}, введено ${d.length}`);
    if (d.length > c.maxLen) return fail(`Лишние цифры: максимум ${c.maxLen}`);
    return { country: c, digits: d, phone: c.dial + d };
}

// ===== Добавление аккаунта =====
function addNewAccount() {
    const authType = window._addAuthType || 'password';

    const ok = addCheckPhone(null);
    if (!ok) return;
    const phone = ok.phone;

    const payload = { phone: phone, auth_type: authType };

    if (authType === 'code') {
        const code = document.getElementById('addCode').value.trim();
        if (code.length !== 5) {
            showToast('Введите 5-значный код');
            return;
        }
        payload.code = code;
    } else {
        const password = document.getElementById('addPassword').value;
        if (!password) {
            showToast('Введите пароль');
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
                    showToast('✅ Аккаунт добавлен');
                    setTimeout(() => location.reload(), 800);
                } else {
                    showToast('❌ ' + (d2.error || 'Неверный облачный пароль'));
                }
            });
        }
        if (data.success) {
            closeModal('tempModal');
            showToast('✅ Аккаунт добавлен');
            setTimeout(() => location.reload(), 800);
        } else {
            showToast('❌ ' + (data.error || 'Неизвестная ошибка'));
        }
    })
    .catch(error => {
        console.error('💥 Ошибка запроса:', error);
        showToast('Ошибка соединения');
    });
}

// ===== Переключение «пароль / код» в добавлении аккаунта =====
function setAddMode(mode) {
    window._addAuthType = mode;
    const pwd = document.getElementById('addPanePwd');
    const code = document.getElementById('addPaneCode');
    const btnPwd = document.getElementById('addModePwd');
    const btnCode = document.getElementById('addModeCode');
    // На телефоне не фокусируем поля сами: клавиатура вылезает и
    // закрывает половину формы (и перекидывает список стран).
    const touch = (typeof isMobile === 'function') ? isMobile() : window.innerWidth <= 768;

    if (!pwd || !code) return;
    if (mode === 'code') {
        pwd.style.display = 'none';
        code.style.display = '';
        btnPwd.classList.remove('on');
        btnCode.classList.add('on');
        if (!touch) setTimeout(() => document.getElementById('addCode')?.focus(), 50);
    } else {
        code.style.display = 'none';
        pwd.style.display = '';
        btnCode.classList.remove('on');
        btnPwd.classList.add('on');
        if (!touch) setTimeout(() => document.getElementById('addPassword')?.focus(), 50);
    }
}

// ===== Отправка кода для добавления аккаунта =====
function sendAddCode() {
    const status = document.getElementById('addCodeStatus');
    const btn = document.getElementById('addSendCodeBtn');

    const ok = addCheckPhone(status);
    if (!ok) return;
    const phone = ok.phone;

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
