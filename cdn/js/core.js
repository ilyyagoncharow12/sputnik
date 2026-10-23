    // ===== CSRF: автоматически добавляем заголовок ко всем не-GET fetch-запросам =====
    (function () {
        const _fetch = window.fetch;
        window.fetch = function (url, opts) {
            opts = opts || {};
            if (!opts.method || opts.method.toUpperCase() === 'GET') {
                return _fetch.apply(this, arguments);
            }
            opts.headers = opts.headers instanceof Headers ? opts.headers : new Headers(opts.headers || {});
            const meta = document.querySelector('meta[name="csrf-token"]');
            if (meta && !opts.headers.has('X-CSRF-Token')) {
                opts.headers.set('X-CSRF-Token', meta.content);
            }
            return _fetch.call(this, url, opts);
        };
    })();

    // ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====
    const socket = io();
    const currentUser = window.CURRENT_USER;

    let currentChat = null;
    let currentChatType = null;
    let currentReplyMessage = null;
    let currentContextMessage = null;
    let currentTab = 'chats';
    let chatsData = [];
    let groupsData = [];
    let channelsData = [];
    let currentStories = [];
    let currentStoryIndex = 0;
    let currentStoryUserId = null;
    let storyTimerInterval = null;
    let typingTimeout = null;
    let pendingFiles = [];
    let pendingCaption = '';
    let currentStoryReplyId = null;
    let currentReplaceStoryId = null;
    let searchResultsList = [];
    let currentSearchIndex = -1;
    let liveTicker = { busy: false, lastListSync: 0, lastMsgSync: 0, lastStories: 0, sig: '', sockDeadSince: 0 };

    const AVAILABLE_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥', '👏', '💯', '🙏', '✨', '💔', '🤔', '👀'];
    const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡'];


    // ===== СИСТЕМА ИСТОРИИ НАВИГАЦИИ МОДАЛЬНЫХ ОКОН (v0.64.0) =====
    // Стек экранов: каждая новая модалка кладёт предыдущий экран в стек,
    // кнопка «назад» (стрелка в шапке) возвращает на шаг назад, а не
    // закрывает всё. Полное закрытие (крестик/оверлей/«Закрыть») чистит стек.

    let navStack = [];        // [{html}] — предыдущие экраны tempModal
    let navSkipNext = null;   // html, который восстанавливаем — не пушить его

    // Автосохранение: ловим ЛЮБУЮ замену содержимого #tempModalBody
    // (showModal, прямые innerHTML=... в profiles.js и т.д.)
    (function installNavObserver() {
        const boot = () => {
            const body = document.getElementById('tempModalBody');
            if (!body || body.__navObserved) return;
            body.__navObserved = true;
            let prev = body.innerHTML;
            new MutationObserver(() => {
                const now = body.innerHTML;
                if (now === prev) return;
                const modal = document.getElementById('tempModal');
                const isOpen = modal && modal.classList.contains('active');
                if (isOpen && prev && prev.trim()) {
                    if (navSkipNext !== null && prev === navSkipNext) {
                        // это восстановление из стека — не пушим
                    } else {
                        navStack.push(prev);
                        if (navStack.length > 20) navStack.shift();
                    }
                }
                if (navSkipNext !== null && now === navSkipNext) navSkipNext = null;
                prev = now;
            }).observe(body, { childList: true, subtree: true });
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
        else boot();
    })();

    // Кнопка «назад» в шапке модалки
    function navBack() {
        const modal = document.getElementById('tempModal');
        const body = document.getElementById('tempModalBody');
        if (!modal || !body) return;
        if (navStack.length > 0) {
            const html = navStack.pop();
            navSkipNext = html;
            body.innerHTML = html;
            modal.classList.add('active');
        } else {
            navStack = [];
            modal.classList.remove('active');
        }
    }

    // Полное закрытие модалки (с очисткой истории)
    function closeTempModal() {
        navStack = [];
        navSkipNext = null;
        const modal = document.getElementById('tempModal');
        if (modal) modal.classList.remove('active');
    }

    // Совместимость: старое имя = «назад»
    function closeModalWithRoute() {
        navBack();
    }

    function openModalWithRoute(modalId, returnTo) {
        openModal(modalId);
    }


    // ===== БУРГЕР-МЕНЮ =====
    function openBurgerMenu() {
        document.getElementById('burgerMenu').classList.add('active');
        document.getElementById('burgerOverlay').classList.add('active');
    }

    function closeBurgerMenu() {
        document.getElementById('burgerMenu').classList.remove('active');
        document.getElementById('burgerOverlay').classList.remove('active');
    }

    // В обработчике клика по overlay — закрыть меню
    document.getElementById('burgerOverlay').onclick = function () {
        closeBurgerMenu();
    };




    // ===== УТИЛИТЫ =====
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function openModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.add('active');
    }

    // Полное закрытие модалки (крестик/оверлей) — чистит историю навигации
    function closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.remove('active');
        if (id === 'tempModal') {
            navStack = [];
            navSkipNext = null;
        }
    }

    function isMobile() {
        return window.innerWidth <= 768 || document.body.classList.contains('mobile');
    }

    function toggleSidebar() {
        if (!isMobile()) return;
        const sidebar = document.getElementById('sidebar');
        const chatArea = document.getElementById('chatArea');
        sidebar.classList.remove('chat-open');
        chatArea.classList.remove('chat-open');
    }

    function toggleBurgerMenu() {
        document.getElementById('burgerMenu').classList.toggle('active');
        document.getElementById('burgerOverlay').classList.toggle('active');
    }

    function logout() {
        window.location.href = '/logout';
    }

    function formatChatTime(t) {
        if (!t) return '';
        const d = new Date(t);
        const n = new Date();
        if (d.toDateString() === n.toDateString()) {
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    }

    function formatLastSeen(ls) {
        if (!ls) return 'был(а) давно';
        const l = new Date(ls);
        const n = new Date();
        const diff = Math.floor((n - l) / 60000);
        // «в сети» показывается только по реальному присутствию (presence.js),
        // здесь — время последнего захода.
        if (diff < 1) return 'только что';
        if (diff < 60) return `${diff} мин назад`;
        const h = Math.floor(diff / 60);
        if (h < 24) return `${h} ч назад`;
        const d = Math.floor(h / 24);
        if (d === 1) return 'вчера';
        return `${d} дн назад`;
    }

    function formatStoryTime(t) {
        const d = new Date(t);
        const n = new Date();
        const diff = Math.floor((n - d) / 3600000);
        if (diff < 1) return 'Только что';
        if (diff < 24) return `${diff} ч назад`;
        return `${Math.floor(diff / 24)} дн назад`;
    }

    function formatFileSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function formatDuration(seconds) {
        if (!seconds || seconds === 0) return '';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function showModal(title, content) {
    const modalBody = document.getElementById('tempModalBody');

    if (modalBody) {
        // Если контент уже содержит other-profile или personal-colors-section,
        // показываем как есть (профиль)
        if (content.includes('other-profile') || content.includes('personal-colors-section') ||
            content.includes('edit-profile-modal') || content.includes('playlist-header')) {
            modalBody.innerHTML = content;
        } else {
            // Для обычных модалок — единый TG-стиль через классы
            modalBody.innerHTML = `
                <div class="tg-modal-wrapper">
                    <div class="tg-modal-header">
                        <button class="close-btn" onclick="navBack()">
                            <i class="fas fa-arrow-left"></i>
                        </button>
                        <div class="title">${title || ''}</div>
                        <button class="close-btn" onclick="closeModal('tempModal')" style="margin-right:-4px;">
                            <i class="fas fa-xmark"></i>
                        </button>
                    </div>
                    <div class="tg-modal-body">
                        ${content}
                    </div>
                </div>
            `;
        }
    }
    openModal('tempModal');
}

    function showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: #333;
            color: white;
            padding: 12px 24px;
            border-radius: 25px;
            font-size: 14px;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.3s;
            font-family: var(--font-family);
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '1'; }, 100);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    // ===== ГАЛОЧКИ СООБЩЕНИЙ (✓ отправлено / ✓✓ доставлено / ✓✓ прочитано) =====
    // Состояния: sent (одна серая), delivered (две серые), read (две синие).
    // В группах и каналах галочек нет — как в Telegram.
    function messageTickState(m) {
        if (!m || m.chat_id == null) return null;      // не личный чат
        if (m.is_read) return 'read';
        if (m.delivered_at) return 'delivered';
        return 'sent';
    }

    function messageTicksHTML(m) {
        const state = messageTickState(m);
        if (!state) return '';
        if (state === 'read') {
            return '<i class="fas fa-check-double msg-tick msg-tick--read"></i>';
        }
        if (state === 'delivered') {
            return '<i class="fas fa-check-double msg-tick msg-tick--delivered"></i>';
        }
        return '<i class="fas fa-check msg-tick msg-tick--sent"></i>';
    }

    // Обновляет галочку уже отрисованного сообщения (socket-события).
    function setMessageTick(messageId, state) {
        if (!messageId) return;
        const tick = document.querySelector(
            `.message[data-message-id="${messageId}"] .message-meta .msg-tick`
        );
        if (!tick) return;
        tick.className = 'fas msg-tick '
            + (state === 'read' ? 'fa-check-double msg-tick--read'
                : state === 'delivered' ? 'fa-check-double msg-tick--delivered'
                    : 'fa-check msg-tick--sent');
    }



    // ===== ���� ����ջ ��������� (��� � Telegram: ���� ���� �� �������/����� ����) =====
    function sputnikApplyBubbleColor(raw) {
        const BUILTIN = ['#eeffde', '#2b5278', '#3390ec', '#667eea'];
        window.__myBubbleColor = raw || '';
        const dark = document.body.classList.contains('dark');
        const isBuiltin = !raw || BUILTIN.indexOf(String(raw).toLowerCase()) !== -1;
        const c = isBuiltin ? (dark ? '#2b5278' : '#eeffde') : raw;
        document.documentElement.style.setProperty('--primary-color', c);
        let fg = '#ffffff';
        const m = /^#?([0-9a-f]{6})$/i.exec(c);
        if (m) {
            const v = parseInt(m[1], 16);
            const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
            if ((0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62) fg = '#17212b';
        }
        document.documentElement.style.setProperty('--out-fg', fg);
    }
