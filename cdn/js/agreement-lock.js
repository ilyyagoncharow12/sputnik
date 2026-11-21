/* agreement-lock.js — замок общения при отозванном пользовательском соглашении.
   Выход из аккаунта НЕ производится: пользователь видит интерфейс, но все
   действия по отправке/приёму сообщений и звонков закрыты. */

(function () {
    let locked = false;

    const LOCK_TEXT = '🔒 Примите пользовательское соглашение, чтобы начать пользоваться мессенджером';

    function setAgreementLocked(state, opts) {
        opts = opts || {};
        locked = !!state;
        document.body.classList.toggle('agreement-locked', locked);

        const banner = document.getElementById('agreementLockBanner');
        if (banner) banner.style.display = locked ? 'flex' : 'none';

        const overlay = document.getElementById('agreementLockOverlay');
        if (overlay) {
            if (!locked) overlay.style.display = 'none';
            else if (opts.showOverlay) overlay.style.display = 'flex';
        }

        const input = document.getElementById('messageInput');
        if (input) {
            input.disabled = locked;
            input.placeholder = locked
                ? '🔒 Примите соглашение, чтобы писать сообщения'
                : 'Написать сообщение...';
        }

        const send = document.getElementById('sendBtn');
        if (send) send.disabled = locked;

        const ids = ['attachBtn', 'emojiBtn', 'micBtn', 'circleBtn', 'pollBtn',
                     'timerBtn', 'audioCallBtn', 'videoCallBtn', 'groupVideoCallBtn'];
        ids.forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.disabled = locked;
        });

        document.querySelectorAll('.agreement-lock-message').forEach(function (el) {
            el.textContent = opts.message || LOCK_TEXT;
        });
    }

    function showAgreementLock(message) {
        setAgreementLocked(true, { showOverlay: true, message: message });
    }

    function hideAgreementLockOverlay() {
        const overlay = document.getElementById('agreementLockOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    function acceptAgreement() {
        const btn = document.getElementById('agreementAcceptBtn');
        if (btn) btn.disabled = true;
        fetch('/api/agreement/accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
        })
        .then(function (r) { return r.json(); })
        .then(function (d) {
            if (!d.success) {
                if (typeof showToast === 'function') showToast(d.error || 'Не удалось принять соглашение');
                if (btn) btn.disabled = false;
                return;
            }
            setAgreementLocked(false);
            if (typeof showToast === 'function') showToast('✅ Соглашение принято — общение разблокировано');
            // Полная перезагрузка возвращает все обработчики и room-подписки
            // в исходное состояние после серверной смены флага.
            setTimeout(function () { window.location.reload(); }, 350);
        })
        .catch(function () {
            if (typeof showToast === 'function') showToast('Ошибка соединения с сервером');
            if (btn) btn.disabled = false;
        });
    }

    window.setAgreementLocked = setAgreementLocked;
    window.showAgreementLock = showAgreementLock;
    window.hideAgreementLockOverlay = hideAgreementLockOverlay;
    window.acceptAgreement = acceptAgreement;

    document.addEventListener('DOMContentLoaded', function () {
        const initial = window.CURRENT_USER && window.CURRENT_USER.agreement_accepted;
        // Применяем состояние сразу в обе стороны: после повторного принятия
        // кнопки должны быть разблокированы даже если браузер восстановил
        // страницу из bfcache с прежними inline-стилями/атрибутами.
        setAgreementLocked(initial === false, { showOverlay: initial === false });

        fetch('/api/agreement/status')
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (typeof d.accepted === 'boolean') {
                    setAgreementLocked(!d.accepted, {
                        showOverlay: !d.accepted,
                        message: d.message
                    });
                }
            })
            .catch(function () {});
    });
})();
