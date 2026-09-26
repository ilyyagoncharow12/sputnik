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


    // ===== СИСТЕМА МАРШРУТИЗАЦИИ МОДАЛЬНЫХ ОКОН =====

let modalHistory = [];
let modalReturnTo = null;

// Обертка для открытия модального окна с запоминанием маршрута
function openModalWithRoute(modalId, returnTo) {
    // Запоминаем, откуда пришли
    modalReturnTo = returnTo || null;
    // Запоминаем в историю
    if (returnTo) {
        modalHistory.push(returnTo);
    }
    openModal(modalId);
}

// Обертка для закрытия с возвратом по маршруту
function closeModalWithRoute() {
    closeModal('tempModal');

    // Если есть returnTo — открываем его
    if (modalReturnTo) {
        setTimeout(() => {
            const func = modalReturnTo;
            modalReturnTo = null;

            // Если это строка с именем функции — вызываем
            if (typeof func === 'function') {
                func();
            } else if (typeof func === 'string') {
                // По имени функции в глобальном объекте window
                if (window[func] && typeof window[func] === 'function') {
                    window[func]();
                }
            }
        }, 300);
    } else if (modalHistory.length > 0) {
        // Если есть история — извлекаем последний
        const lastRoute = modalHistory.pop();
        setTimeout(() => {
            if (typeof lastRoute === 'function') {
                lastRoute();
            } else if (typeof lastRoute === 'string') {
                if (window[lastRoute] && typeof window[lastRoute] === 'function') {
                    window[lastRoute]();
                }
            }
        }, 300);
    }
}

// Модифицированная функция showModal для поддержки маршрутизации
function showModalWithRoute(title, content, returnTo) {
    modalReturnTo = returnTo || null;
    if (returnTo) {
        modalHistory.push(returnTo);
    }

    // Оригинальная showModal
    const modalBody = document.getElementById('tempModalBody');
    if (modalBody) {
        modalBody.innerHTML = `
            <div style="background: #0f0f0f; border-radius: 24px; overflow: hidden; color: white;">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #2c2c2e;">
                    <div style="display: flex; align-items: center; gap: 6px; margin-left: -8px;">
                        <button onclick="closeModalWithRoute()" style="background: none; border: none; color: #8e8e93; font-size: 20px; cursor: pointer; padding: 4px;">
                            <i class="fas fa-arrow-left"></i>
                        </button>
                        
                    </div>
                    <div style="font-size: 18px; font-weight: 600;">${title || ''}</div>
                    <div style="width: 20px;"></div>
                </div>
                <div style="padding: 20px;">
                    ${content}
                </div>
            </div>
        `;
    }
    openModal('tempModal');
}

// Замена стандартной closeModal на маршрутизированную
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }

    // Если это tempModal и есть returnTo — возвращаемся
    if (modalId === 'tempModal' && modalReturnTo) {
        setTimeout(() => {
            const func = modalReturnTo;
            modalReturnTo = null;
            if (typeof func === 'function') {
                func();
            } else if (typeof func === 'string') {
                if (window[func] && typeof window[func] === 'function') {
                    window[func]();
                }
            }
        }, 300);
    }
}


// ===== БУРГЕР-МЕНЮ =====
function openBurgerMenu() {
    document.getElementById('burgerMenu').classList.add('active');
    document.getElementById('burgerOverlay').classList.add('active');
    modalReturnTo = null; // Сбрасываем, так как это корневой элемент
}

function closeBurgerMenu() {
    document.getElementById('burgerMenu').classList.remove('active');
    document.getElementById('burgerOverlay').classList.remove('active');
}

// В обработчике клика по overlay — возврат в корень
document.getElementById('burgerOverlay').onclick = function() {
    closeBurgerMenu();
    // Если есть история — очищаем
    modalHistory = [];
    modalReturnTo = null;
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

    function closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.remove('active');
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

    function closeBurgerMenu() {
        document.getElementById('burgerMenu').classList.remove('active');
        document.getElementById('burgerOverlay').classList.remove('active');
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
        if (diff < 1) return 'в сети';
        if (diff < 60) return `${diff} мин`;
        const h = Math.floor(diff / 60);
        if (h < 24) return `${h} ч`;
        return `${Math.floor(h / 24)} дн`;
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
            // Для обычных модалок добавляем заголовок и обертку
            modalBody.innerHTML = `
                <div style="background: #0f0f0f; border-radius: 24px; overflow: hidden; color: white;">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #2c2c2e;">
                        <div style="display: flex; align-items: center; gap: 6px; margin-left: -8px;">
                            <button onclick="closeModalWithRoute()" style="background: none; border: none; color: #8e8e93; font-size: 20px; cursor: pointer; padding: 4px;">
                                <i class="fas fa-arrow-left"></i>
                            </button>
                            </div>
                        <div style="font-size: 18px; font-weight: 600;">${title || ''}</div>
                        <div style="width: 20px;"></div>
                    </div>
                    <div style="padding: 20px;">
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


