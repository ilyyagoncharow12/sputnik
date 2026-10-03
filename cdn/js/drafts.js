// ===== ЧЕРНОВИКИ СООБЩЕНИЙ (v0.62.1) =====
// Неотправленный текст хранится в localStorage по паре «тип чата + id»,
// поэтому переключение чатов и перезагрузка страницы его не теряют.
// Ключ включает id пользователя: на одном компьютере могут сидеть
// несколько аккаунтов (см. accounts.js), и черновики не должны смешиваться.
(function () {
    const PREFIX = 'sputnik_draft:';
    let saveTimer = null;
    let restoredFor = null;

    function currentKey() {
        if (typeof currentUser === 'undefined' || !currentUser || !currentUser.id) return null;
        if (typeof currentChat === 'undefined' || !currentChat) return null;
        const type = currentChatType || currentChat.type;
        if (!type) return null;
        // Для личных чатов id в списке — это id собеседника, а currentChat.id
        // уже приведён к chat_id в openChat. Используем то, что есть.
        const id = currentChat.chat_id || currentChat.id;
        if (!id) return null;
        return PREFIX + currentUser.id + ':' + type + ':' + id;
    }

    function saveNow() {
        saveTimer = null;
        const key = currentKey();
        if (!key) return;
        const input = document.getElementById('messageInput');
        if (!input) return;
        const text = input.value;
        try {
            if (text && text.trim()) {
                localStorage.setItem(key, text);
                showHint();
            } else {
                localStorage.removeItem(key);
                hideHint();
            }
        } catch (e) {
            // приватный режим браузера — просто не сохраняем
        }
    }

    function scheduleSave() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(saveNow, 400);
    }

    function clearDraft() {
        const key = currentKey();
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        if (!key) return;
        try { localStorage.removeItem(key); } catch (e) {}
        hideHint();
    }

    function showHint() {
        const area = document.getElementById('messageInputArea');
        if (!area) return;
        let hint = document.getElementById('draftHint');
        if (!hint) {
            hint = document.createElement('div');
            hint.id = 'draftHint';
            hint.className = 'draft-hint';
            hint.innerHTML = '<i class="fas fa-file-alt"></i> Неотправленный текст сохранён' +
                ' <button onclick="discardDraft()" title="Удалить черновик"><i class="fas fa-times"></i></button>';
            area.insertBefore(hint, area.firstChild);
        }
        hint.style.display = 'flex';
    }

    function hideHint() {
        const hint = document.getElementById('draftHint');
        if (hint) hint.style.display = 'none';
    }

    function loadDraft() {
        const key = currentKey();
        const input = document.getElementById('messageInput');
        if (!key || !input) return;
        // не подставляем черновик повторно в тот же чат
        if (restoredFor === key) { return; }
        restoredFor = key;
        let text = '';
        try { text = localStorage.getItem(key) || ''; } catch (e) { return; }
        const replyBox = document.getElementById('replyPreview');
        if (!text || (replyBox && replyBox.style.display !== 'none' && replyBox.style.display)) {
            return;
        }
        input.value = text;
        if (typeof composerAutosize === 'function') composerAutosize();
        if (typeof composerUpdateSend === 'function') composerUpdateSend();
        showHint();
        showToast('Восстановлен неотправленный текст');
    }

    function discardDraft() {
        clearDraft();
        const input = document.getElementById('messageInput');
        if (input) {
            input.value = '';
            if (typeof composerAutosize === 'function') composerAutosize();
            if (typeof composerUpdateSend === 'function') composerUpdateSend();
        }
    }

    function countDrafts() {
        let n = 0;
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.indexOf(PREFIX) === 0) n++;
            }
        } catch (e) {}
        return n;
    }

    // Глобальный доступ
    window.saveDraftNow = saveNow;
    window.scheduleDraftSave = scheduleSave;
    window.clearCurrentDraft = clearDraft;
    window.loadChatDraft = loadDraft;
    window.discardDraft = discardDraft;
    window.countDrafts = countDrafts;

    document.addEventListener('DOMContentLoaded', function () {
        const input = document.getElementById('messageInput');
        if (!input) return;
        input.addEventListener('input', scheduleSave);
        // на всякий случай сохраняем и при закрытии вкладки
        window.addEventListener('beforeunload', saveNow);
        // первый запуск — подставить черновик текущего чата
        loadDraft();
    });
})();
