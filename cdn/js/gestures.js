// ===== ЖЕСТЫ ДЛЯ МОБИЛЬНЫХ =====
//  - Свайп сообщения влево/вправо -> ответить (как в Telegram)
//  - Свайп от левого края внутри открытого чата -> назад к списку чатов
//  - Долгое нажатие -> контекстное меню с реакциями (свой таймер 500 мс,
//    т.к. браузерный contextmenu на телефонах срабатывает ненадёжно)
(function () {
    if (typeof isMobile !== 'function' || typeof contextAction !== 'function') return;

    const SWIPE_TRIGGER = 70;   // px, порог срабатывания ответа
    const MAX_SHIFT = 130;      // px, макс сдвиг пузыря
    const EDGE_ZONE = 24;       // px, зона от левого края для жеста «назад»
    const EDGE_TRIGGER = 70;    // px, порог жеста «назад»

    let msgEl = null;      // сообщение, на котором идёт свайп
    let bubble = null;     // .message-bubble
    let hint = null;       // .msg-swipe-hint
    let sx = 0, sy = 0;
    let swiping = false;
    let edgeNav = false;
    let lpTimer = null;    // таймер долгого нажатия (контекстное меню)
    let suppressCtxUntil = 0; // подавляем нативный contextmenu после нашего меню

    function clearLongPress() {
        if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
    }

    function hintFor(m) {
        let h = m.querySelector('.msg-swipe-hint');
        if (!h) {
            h = document.createElement('div');
            h.className = 'msg-swipe-hint';
            h.innerHTML = '<i class="fas fa-reply"></i><span>Ответить</span>';
            m.appendChild(h);
        }
        return h;
    }

    function resetGesture() {
        if (msgEl && bubble) {
            bubble.style.transition = 'transform .18s ease-out';
            bubble.style.transform = '';
        }
        if (hint) {
            hint.style.opacity = '0';
            setTimeout(() => { if (hint && hint.parentNode) hint.remove(); }, 220);
        }
        msgEl = null; bubble = null; hint = null;
        swiping = false; edgeNav = false;
    }

    function springBack() {
        if (!msgEl || !bubble) return;
        bubble.style.transition = 'transform .18s ease-out';
        bubble.style.transform = '';
        if (hint) hint.style.opacity = '0';
    }

    function triggerReply() {
        if (!msgEl || !bubble) return;
        const mid = msgEl.dataset.messageId;
        if (!mid || String(mid).indexOf('temp') === 0) { springBack(); return; }
        msgEl.classList.add('swipe-replied');
        setTimeout(() => msgEl.classList.remove('swipe-replied'), 600);
        currentContextMessage = {
            id: mid,
            content: (msgEl.querySelector('.message-text') || {}).textContent || 'Медиафайл',
            element: msgEl
        };
        contextAction('reply');
    }

    function onTouchStart(e) {
        const t = e.touches[0];
        const area = document.getElementById('messagesArea');
        if (!area) return;

        // Жест «назад» от левого края (когда чат открыт)
        const chatArea = document.getElementById('chatArea');
        if (chatArea && chatArea.classList.contains('chat-open') && t.clientX <= EDGE_ZONE) {
            edgeNav = true;
            sx = t.clientX; sy = t.clientY;
            return;
        }

        const m = t.target.closest ? t.target.closest('.message') : null;
        if (!m) return;
        // Не перехватываем жесты на интерактивных элементах сообщения
        if (t.target.closest('button, .message-media, .message-file, .reaction-badge, audio, video, a, .message-meta')) return;

        msgEl = m;
        bubble = m.querySelector('.message-bubble');
        hint = null;
        sx = t.clientX; sy = t.clientY;
        swiping = false;

        // Долгое нажатие -> контекстное меню с реакциями (как на ПК).
        // Браузерный contextmenu на телефонах срабатывает ненадёжно, поэтому
        // реализуем свой таймер (500 мс) на мобильных.
        clearLongPress();
        if (typeof isMobile === 'function' && isMobile()) {
            lpTimer = setTimeout(openMenuOnLongPress, 500);
        }
    }

    function openMenuOnLongPress() {
        lpTimer = null;
        if (!msgEl) return;
        const mid = msgEl.dataset.messageId;
        if (!mid || String(mid).indexOf('temp') === 0) return;
        const content = (msgEl.querySelector('.message-text') || {}).textContent || 'Медиафайл';
        const el = msgEl;
        // Подавляем нативный contextmenu этого же жеста, чтобы меню не открылось дважды
        suppressCtxUntil = Date.now() + 800;
        if (typeof showContextMenu === 'function') {
            showContextMenu({ preventDefault() {}, stopPropagation() {} }, mid, content, el);
        }
    }

    function onTouchMove(e) {
        const t = e.touches[0];
        const dx = t.clientX - sx;
        const dy = t.clientY - sy;

        if (edgeNav) {
            if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
                if (Math.abs(dx) > Math.abs(dy) * 1.2 && dx > EDGE_TRIGGER) {
                    e.preventDefault();
                    edgeNav = false;
                    toggleSidebar();
                    return;
                }
                // не горизонтальный свайп от края — отменяем жест
                edgeNav = false;
                return;
            }
            return;
        }

        if (!msgEl || !bubble) return;

        if (!swiping) {
            if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
            if (Math.abs(dx) <= Math.abs(dy) * 1.15) {
                // пользователь скроллит — отменяем свайп сообщения
                clearLongPress();
                msgEl = null; bubble = null;
                return;
            }
            swiping = true;
            clearLongPress();
            msgEl.classList.add('message-gesture');
            hint = hintFor(msgEl);
        }

        e.preventDefault();
        const shift = Math.max(0, Math.min(dx, MAX_SHIFT));
        bubble.style.transform = 'translateX(' + shift + 'px)';
        const prog = Math.min(1, shift / SWIPE_TRIGGER);
        hint.style.opacity = String(prog);
        hint.style.transform = 'translateY(-50%) translateX(' + (-14 - 10 * prog) + 'px)';
    }

    function onTouchEnd(e) {
        clearLongPress();
        if (edgeNav) { edgeNav = false; return; }
        if (!msgEl || !bubble) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - sx;
        const wasSwipe = swiping;
        if (wasSwipe) {
            if (dx >= SWIPE_TRIGGER) {
                triggerReply();
            } else {
                springBack();
            }
        }
        msgEl = null; bubble = null; hint = null; swiping = false;
    }

    function init() {
        const area = document.getElementById('messagesArea');
        if (!area) return;
        area.addEventListener('contextmenu', (e) => {
            if (Date.now() < suppressCtxUntil) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);
        area.addEventListener('touchstart', onTouchStart, { passive: true });
        area.addEventListener('touchmove', onTouchMove, { passive: false });
        area.addEventListener('touchend', onTouchEnd, { passive: true });
        area.addEventListener('touchcancel', onTouchEnd, { passive: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();