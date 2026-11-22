// ===== ПОИСК СООБЩЕНИЙ В ЧАТЕ (как в Telegram) =====
// Верхняя строка «Поиск сообщений», нижняя — поле ввода + счётчик 0/0 + стрелки.
// Найденные слова подсвечиваются, стрелки переключают совпадения.

let chatSearchState = {
    active: false,
    query: '',
    results: [],
    index: -1,
    scope: null,
    restore: null,
    timer: null,
    requestId: 0
};

function openChatSearch() {
    if (!currentChat) {
        if (typeof showToast === 'function') showToast('Сначала откройте чат');
        return;
    }

    const type = currentChat.type || currentChatType || 'personal';
    let scopeId;
    if (type === 'personal') {
        // Для личного чата нужен числовой id чата, а не id собеседника.
        scopeId = currentChat.chat_id || currentChat.other_user_id || currentChat.id;
    } else {
        scopeId = currentChat.id;
    }
    if (!scopeId) {
        if (typeof showToast === 'function') showToast('Чат ещё загружается');
        return;
    }

    chatSearchState.scope = { type: type, id: scopeId };
    chatSearchState.restore = { id: currentChat.id, type: type };
    chatSearchState.active = true;
    chatSearchState.query = '';
    chatSearchState.results = [];
    chatSearchState.index = -1;
    chatSearchState.requestId++;

    const header = document.getElementById('chatSearchHeader');
    const bar = document.getElementById('chatSearchBar');
    const composer = document.getElementById('messageInputArea');
    const pinned = document.getElementById('pinnedBanner');
    if (header) header.style.display = 'flex';
    if (bar) bar.style.display = 'flex';
    if (composer) composer.style.display = 'none';
    if (pinned) pinned.style.display = 'none';

    const input = document.getElementById('chatSearchInput');
    const counter = document.getElementById('chatSearchCounter');
    const clear = document.getElementById('chatSearchClear');
    if (input) { input.value = ''; }
    if (counter) counter.textContent = '0/0';
    if (clear) clear.style.display = 'none';
    updateChatSearchNav();

    if (input) setTimeout(() => input.focus(), 0);
}

function closeChatSearch(opts) {
    if (!chatSearchState.active) return;
    const restore = !!(opts && opts.restore);
    const target = chatSearchState.restore;

    chatSearchState.active = false;
    chatSearchState.query = '';
    chatSearchState.results = [];
    chatSearchState.index = -1;
    chatSearchState.requestId++;
    if (chatSearchState.timer) {
        clearTimeout(chatSearchState.timer);
        chatSearchState.timer = null;
    }

    const header = document.getElementById('chatSearchHeader');
    const bar = document.getElementById('chatSearchBar');
    if (header) header.style.display = 'none';
    if (bar) bar.style.display = 'none';

    // restore=false при переключении чата — continueOpenChat сам перерисует ленту
    if (restore && target && typeof continueOpenChat === 'function') {
        continueOpenChat(target.id, target.type);
    }
}

function onChatSearchInput() {
    const input = document.getElementById('chatSearchInput');
    const clear = document.getElementById('chatSearchClear');
    const q = (input ? input.value : '').trim();
    chatSearchState.query = q;
    if (clear) clear.style.display = q ? 'flex' : 'none';

    if (chatSearchState.timer) clearTimeout(chatSearchState.timer);
    chatSearchState.timer = setTimeout(() => performChatSearch(q), 300);
}

function clearChatSearchInput() {
    const input = document.getElementById('chatSearchInput');
    if (input) { input.value = ''; input.focus(); }
    onChatSearchInput();
}

function onChatSearchKey(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        navigateChatSearch(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
        e.preventDefault();
        closeChatSearch({ restore: true });
    }
}

function performChatSearch(query) {
    if (!chatSearchState.active || !chatSearchState.scope) return;
    const area = document.getElementById('messagesArea');

    if (!query || query.length < 2) {
        chatSearchState.results = [];
        chatSearchState.index = -1;
        chatSearchState.requestId++;
        if (area) {
            area.innerHTML = '<div class="chat-search-empty"><i class="fas fa-search"></i><p>Введите минимум 2 символа</p></div>';
        }
        updateChatSearchCounter();
        updateChatSearchNav();
        return;
    }

    const scope = chatSearchState.scope;
    const requestId = ++chatSearchState.requestId;

    fetch('/api/search_in_chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: scope.id, chat_type: scope.type, query: query })
    })
        .then(r => r.json())
        .then(d => {
            if (!chatSearchState.active || requestId !== chatSearchState.requestId) return;
            const msgs = d.messages || [];
            chatSearchState.results = msgs;
            chatSearchState.index = msgs.length ? 0 : -1;
            renderChatSearchResults(msgs, query);
            updateChatSearchCounter();
            updateChatSearchNav();
            if (msgs.length) scrollToChatSearchResult(0);
        })
        .catch(() => {
            if (!chatSearchState.active || requestId !== chatSearchState.requestId) return;
            if (area) {
                area.innerHTML = '<div class="chat-search-empty"><i class="fas fa-exclamation-triangle"></i><p>Ошибка поиска</p></div>';
            }
        });
}

function renderChatSearchResults(msgs, query) {
    const area = document.getElementById('messagesArea');
    if (!area) return;

    if (!msgs.length) {
        area.innerHTML = '<div class="chat-search-empty"><i class="fas fa-search"></i><p>Ничего не найдено</p></div>';
        return;
    }

    let html = '';
    msgs.forEach(m => {
        if (typeof formatMessage === 'function') {
            html += formatMessage(m);
        } else {
            const text = escapeHtml(m.content || '[Медиафайл]');
            html += '<div class="message" data-message-id="' + m.id + '">' +
                '<div class="message-bubble"><div class="message-text">' + text + '</div></div></div>';
        }
    });
    area.innerHTML = html;

    const nodes = area.querySelectorAll('.message[data-message-id]');
    nodes.forEach((el, i) => {
        el.dataset.searchIndex = i;
        const textEl = el.querySelector('.message-text');
        if (textEl) highlightTextMatches(textEl, query);
    });
}

// Подсветка слов прямо в text-узлах .message-text — не ломает разметку
// форматирования (ссылки, спойлеры, жирный и т.п.).
function highlightTextMatches(el, query) {
    if (!el || !query) return;
    clearTextHighlights(el);

    const needle = query.toLowerCase();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    const nodes = [];
    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.nodeValue || node.nodeValue.toLowerCase().indexOf(needle) === -1) continue;
        if (node.parentElement && node.parentElement.closest('mark.search-highlight')) continue;
        nodes.push(node);
    }

    nodes.forEach(node => {
        const text = node.nodeValue;
        const lower = text.toLowerCase();
        const frag = document.createDocumentFragment();
        let pos = 0;
        let idx = lower.indexOf(needle);
        while (idx !== -1) {
            frag.appendChild(document.createTextNode(text.slice(pos, idx)));
            const mark = document.createElement('mark');
            mark.className = 'search-highlight';
            mark.textContent = text.slice(idx, idx + query.length);
            frag.appendChild(mark);
            pos = idx + query.length;
            idx = lower.indexOf(needle, pos);
        }
        frag.appendChild(document.createTextNode(text.slice(pos)));
        if (node.parentNode) node.parentNode.replaceChild(frag, node);
    });
}

function clearTextHighlights(el) {
    if (!el) return;
    el.querySelectorAll('mark.search-highlight').forEach(mark => {
        mark.replaceWith(document.createTextNode(mark.textContent));
    });
}

function navigateChatSearch(direction) {
    const total = chatSearchState.results.length;
    if (!total) return;
    let idx = chatSearchState.index + direction;
    if (idx < 0) idx = total - 1;
    if (idx >= total) idx = 0;
    chatSearchState.index = idx;
    scrollToChatSearchResult(idx);
    updateChatSearchCounter();
}

function scrollToChatSearchResult(idx) {
    const area = document.getElementById('messagesArea');
    if (!area) return;
    area.querySelectorAll('.message.chat-search-active').forEach(el => el.classList.remove('chat-search-active'));
    const el = area.querySelector('.message[data-search-index="' + idx + '"]');
    if (el) {
        el.classList.add('chat-search-active');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function updateChatSearchCounter() {
    const el = document.getElementById('chatSearchCounter');
    if (!el) return;
    const total = chatSearchState.results.length;
    el.textContent = (total ? chatSearchState.index + 1 : 0) + '/' + total;
}

function updateChatSearchNav() {
    const total = chatSearchState.results.length;
    document.querySelectorAll('.chat-search-nav').forEach(btn => { btn.disabled = total === 0; });
}

// Экспорт в window — для inline-обработчиков и вызовов из других модулей.
window.openChatSearch = openChatSearch;
window.closeChatSearch = closeChatSearch;
window.navigateChatSearch = navigateChatSearch;
