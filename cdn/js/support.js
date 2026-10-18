/* ===== ТЕХПОДДЕРЖКА: бот-чат, категории, шаблоны, тикеты ===== */

const Support = {
    categories: [],
    currentCategory: null,
    draft: { subject: '', message: '', attachments: [] }
};

async function openSupport() {
    closeBurgerMenu();
    showModal('Техподдержка', '<div id="supportBody"><div class="tg-hint">Загрузка…</div></div>');

    if (!Support.categories.length) {
        try {
            const r = await fetch('/api/support/categories');
            Support.categories = await r.json();
        } catch (e) {
            document.getElementById('supportBody').innerHTML =
                '<div class="tg-hint">Не удалось загрузить категории</div>';
            return;
        }
    }
    renderSupportHome();
}

function renderSupportHome() {
    const el = document.getElementById('supportBody');
    if (!el) return;
    el.innerHTML = `
        <div class="tg-hint">Выберите категорию проблемы — я подготовлю шаблон, который нужно заполнить и отправить.</div>
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 16px;">
            ${Support.categories.map(c => `
                <button class="tg-action-btn" onclick="Support.pick('${c.id}')">
                    <i class="fas ${c.icon || 'fa-question'}"></i> ${c.name}
                </button>
            `).join('')}
        </div>
    `;
}

Support.pick = function (categoryId) {
    const cat = Support.categories.find(c => c.id === categoryId);
    if (!cat) return;
    Support.currentCategory = cat;
    Support.draft = { subject: '', message: '', attachments: [] };
    const el = document.getElementById('supportBody');
    if (!el) return;
    el.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">
            <button onclick="renderSupportHome()" style="background:none;border:none;color:#8e8e93;font-size:18px;cursor:pointer;">
                <i class="fas fa-arrow-left"></i>
            </button>
            <div style="font-weight:600;">${cat.name}</div>
        </div>
        <div class="tg-hint">Заполните шаблон одним сообщением и отправьте. Можно прикрепить фото/видео.</div>
        <div class="tg-section-title">Тема</div>
        <input id="supportSubject" class="tg-input" placeholder="Кратко: что случилось?" value="${escapeHtml(Support.draft.subject)}">
        <div class="tg-section-title">Описание по пунктам</div>
        <textarea id="supportMessage" class="tg-textarea" placeholder="${escapeHtml(cat.template)}">${escapeHtml(Support.draft.message)}</textarea>
        <input type="file" id="supportFiles" multiple accept="image/*,video/*" style="display:none" onchange="Support.addFiles(this)">
        <button class="tg-dashed-btn" style="margin-top:10px;" onclick="document.getElementById('supportFiles').click()">
            <i class="fas fa-paperclip"></i> Прикрепить фото/видео
        </button>
        <div id="supportAttachList" style="margin-top:10px;"></div>
        <button class="tg-btn tg-btn-primary tg-btn-block" style="margin-top:16px;" onclick="Support.send()">
            Отправить в техподдержку
        </button>
    `;
};

Support.addFiles = function (input) {
    const files = Array.from(input.files || []);
    files.forEach(f => {
        const url = URL.createObjectURL(f);
        Support.draft.attachments.push({ name: f.name, size: f.size, url });
    });
    Support.renderAttach();
};

Support.renderAttach = function () {
    const el = document.getElementById('supportAttachList');
    if (!el) return;
    el.innerHTML = Support.draft.attachments.map((a, i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px;background:#1c1c1e;border-radius:10px;margin-bottom:6px;">
            <img src="${a.url}" style="width:36px;height:36px;border-radius:8px;object-fit:cover;">
            <span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(a.name)}</span>
            <button onclick="Support.draft.attachments.splice(${i},1);Support.renderAttach()" style="background:none;border:none;color:#ff3b30;cursor:pointer;"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
};

Support.send = async function () {
    const subjectEl = document.getElementById('supportSubject');
    const messageEl = document.getElementById('supportMessage');
    const subject = subjectEl ? subjectEl.value.trim() : '';
    const message = messageEl ? messageEl.value.trim() : '';
    if (!subject || !message) {
        showToast('Заполните тему и описание');
        return;
    }
    const btn = document.querySelector('#supportBody .tg-btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Отправка…'; }
    try {
        const r = await fetch('/api/support/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': (window.CSRF_TOKEN || '') },
            body: JSON.stringify({
                category: Support.currentCategory.id,
                subject, message,
                attachments: Support.draft.attachments.map(a => a.name)
            })
        });
        const data = await r.json();
        if (data.success) {
            closeModal('tempModal');
            showToast('Тикет #' + data.ticket_id + ' отправлен в техподдержку');
            if (typeof loadSupportTickets === 'function') loadSupportTickets();
        } else {
            showToast(data.error || 'Ошибка отправки');
        }
    } catch (e) {
        showToast('Ошибка соединения');
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Отправить в техподдержку'; }
};

/* ===== МОИ ТИКЕТЫ ===== */
async function loadSupportTickets() {
    const r = await fetch('/api/support/tickets');
    const tickets = await r.json();
    const el = document.getElementById('myTickets');
    if (!el) return;
    if (!tickets.length) {
        el.innerHTML = '<div class="tg-hint">У вас пока нет обращений.</div>';
        return;
    }
    el.innerHTML = tickets.map(t => {
        const statusLabel = { open: 'Ожидает', answered: 'Есть ответ', closed: 'Закрыт' }[t.status] || t.status;
        const statusColor = { open: '#ff9500', answered: '#34c759', closed: '#8e8e93' }[t.status] || '#8e8e93';
        return `
            <div onclick="openSupportTicket(${t.id})" class="tg-row" style="border-bottom:1px solid #2c2c2e;">
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;">${escapeHtml(t.subject)}</div>
                    <div style="font-size:12px;color:#8e8e93;">${escapeHtml(t.category)} · ${new Date(t.created_at).toLocaleString('ru-RU')}</div>
                </div>
                <span style="color:${statusColor};font-size:12px;font-weight:600;">${statusLabel}</span>
            </div>
        `;
    }).join('');
}

async function openSupportTicket(ticketId) {
    const r = await fetch('/api/support/tickets/' + ticketId);
    const t = await r.json();
    if (t.error) { showToast(t.error); return; }
    showModal('Тикет #' + t.id, `
        <div class="tg-section-title">${escapeHtml(t.subject)}</div>
        <div class="tg-hint" style="white-space:pre-wrap;margin-bottom:16px;">${escapeHtml(t.message)}</div>
        <div class="tg-section-title">Переписка</div>
        <div id="ticketReplies">
            ${(t.replies || []).map(r => `
                <div style="padding:10px 12px;border-radius:12px;margin-bottom:6px;background:${r.from_admin ? '#0a84ff' : '#1c1c1e'};${r.from_admin ? 'color:#fff;margin-left:24px;' : 'margin-right:24px;'}">
                    <div style="font-size:12px;opacity:0.7;">${r.from_admin ? 'Техподдержка' : 'Вы'} · ${new Date(r.created_at).toLocaleString('ru-RU')}</div>
                    <div style="margin-top:4px;">${escapeHtml(r.message)}</div>
                </div>
            `).join('') || '<div class="tg-hint">Ответа пока нет.</div>'}
        </div>
        <textarea id="ticketReply" class="tg-textarea" placeholder="Ваш ответ…" style="margin-top:12px;"></textarea>
        <button class="tg-btn tg-btn-primary tg-btn-block" style="margin-top:8px;" onclick="sendTicketReply(${t.id})">Отправить</button>
    `);
}

async function sendTicketReply(ticketId) {
    const el = document.getElementById('ticketReply');
    const message = el ? el.value.trim() : '';
    if (!message) return;
    const r = await fetch('/api/support/tickets/' + ticketId + '/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': (window.CSRF_TOKEN || '') },
        body: JSON.stringify({ message })
    });
    const data = await r.json();
    if (data.success) { closeModal('tempModal'); loadSupportTickets(); }
    else showToast(data.error || 'Ошибка');
}

/* ===== Кнопка в бургер-меню ===== */
document.addEventListener('DOMContentLoaded', () => {
    const items = document.querySelector('.burger-menu-items');
    if (!items) return;
    const btn = document.createElement('div');
    btn.className = 'burger-item';
    btn.innerHTML = `<i class="fas fa-life-ring"></i><span>Техподдержка</span>`;
    btn.onclick = () => openSupport();
    items.prepend(btn);
});
