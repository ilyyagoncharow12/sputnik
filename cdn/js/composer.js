/* =====================================================================
   COMPOSER.JS — Спутник v0.58.0
   Поле ввода, кнопки, эмодзи-панель, отложенные сообщения, кружки.

   Скрипт подключён ДО message-features.js, поэтому все «перехваты»
   существующих функций делаются на DOMContentLoaded — к этому моменту
   все исходные функции уже объявлены.
   ===================================================================== */

/* ======================= СОСТОЯНИЕ ======================= */
let composerState = {
    scheduledFor: null,      // ISO-строка отправки
    emojiTab: 'emoji',
    emojiQuery: '',
    vm: {
        open: false, stream: null, recorder: null,
        chunks: [], startedAt: 0, timer: null,
        seconds: 0, blob: null, url: null, facing: 'user', hasPreview: false,
    },
};

const COMPOSER_MAX_H = () => (isMobile && isMobile() ? 112 : 132);

/* ======================= ПОЛЕ ВВОДА ======================= */
function composerAutosize() {
    const inp = document.getElementById('messageInput');
    if (!inp) return;
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, COMPOSER_MAX_H()) + 'px';
    inp.style.overflowY = inp.scrollHeight > COMPOSER_MAX_H() ? 'auto' : 'hidden';
}

function composerUpdateSend() {
    const btn = document.getElementById('sendBtn');
    const inp = document.getElementById('messageInput');
    if (!btn || !inp) return;
    const hasText = !!inp.value.trim();
    btn.disabled = !hasText && !composerState.scheduledFor;

    // Как в Telegram: пока поле пустое — голосовая кнопка, с текстом — отправка.
    // Это освобождает ~44px ширины для текста на узких экранах.
    const mic = document.getElementById('micBtn');
    const hasFiles = typeof pendingFiles !== 'undefined' && pendingFiles.length > 0;
    if (mic) {
        const showMic = !hasText && !composerState.scheduledFor && !hasFiles;
        mic.style.display = showMic ? '' : 'none';
        btn.style.display = showMic ? 'none' : '';
    }
}

function composerInitInput() {
    const inp = document.getElementById('messageInput');
    if (!inp || inp.dataset.v2) return;
    inp.dataset.v2 = '1';
    composerAutosize();
    composerUpdateSend();
}

/* ======================= ЭМОДЗИ-ПАНЕЛЬ ======================= */
const EMOJI_CAT_ICONS = {
    people: '😀', nature: '🐻', foods: '🍔', activity: '⚽',
    places: '🏠', objects: '💡', symbols: '❤️', flags: '🏳️',
};
const EMOJI_CAT_ORDER = ['people', 'nature', 'foods', 'activity', 'places', 'objects', 'symbols', 'flags'];

function emojiData() {
    return window.EMOJI_CATEGORIES || null;
}

function emojiList() {
    const cats = emojiData();
    if (!cats) return [];
    const out = [];
    EMOJI_CAT_ORDER.forEach(k => (cats[k] || []).forEach(e => {
        if (Array.isArray(e)) out.push({ char: e[0], name: e[1] || '', cat: k });
        else out.push({ char: e, name: '', cat: k });
    }));
    return out;
}

function emojiInitCatBar() {
    const bar = document.getElementById('emojiCatBar');
    if (!bar || bar.dataset.bound) return;
    bar.dataset.bound = '1';
    bar.innerHTML = EMOJI_CAT_ORDER.map(k =>
        `<button class="emoji-cat-btn" data-cat="${k}" title="${k}">${EMOJI_CAT_ICONS[k] || '🙂'}</button>`
    ).join('') + `<button class="emoji-cat-btn" data-cat="__frequent" title="Частые">🕘</button>`;
    bar.addEventListener('click', e => {
        const b = e.target.closest('.emoji-cat-btn');
        if (!b) return;
        bar.querySelectorAll('.emoji-cat-btn').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        composerState.emojiCat = b.dataset.cat;
        renderEmojiBody();
    });
    bar.querySelector('[data-cat="people"]')?.classList.add('on');
}

function renderEmojiBody() {
    const body = document.getElementById('emojiBody');
    if (!body) return;

    if (composerState.emojiTab === 'stickers' || composerState.emojiTab === 'favstickers') {
        renderStickerGrid(body, composerState.emojiTab === 'favstickers');
        return;
    }
    if (composerState.emojiTab === 'create') {
        renderStickerCreateTab(body);
        return;
    }

    const q = composerState.emojiQuery.trim().toLowerCase();
    const cats = emojiData();
    if (!cats) {
        body.innerHTML = '<div class="emoji-empty">Эмодзи не загрузились</div>';
        return;
    }

    let html = '';
    if (q) {
        const hits = emojiList().filter(e =>
            e.char === q || (e.name || '').toLowerCase().includes(q)).slice(0, 260);
        if (!hits.length) {
            body.innerHTML = '<div class="emoji-empty">Ничего не найдено</div>';
            return;
        }
        html = `<div class="emoji-grid big">` + hits.map(e =>
            `<button class="emoji-cell" data-emoji="${e.char}" title="${emojiTitle(e.name)}">${e.char}</button>`).join('') + '</div>';
        body.innerHTML = html;
        body.scrollTop = 0;
        return;
    }

    if (composerState.emojiCat === '__frequent') {
        const freq = window.EMOJI_FREQUENT || [];
        if (freq.length) {
            html = `<div class="emoji-cat-title">Часто используемые</div><div class="emoji-grid big">` +
                freq.map(c => `<button class="emoji-cell" data-emoji="${c}">${c}</button>`).join('') + '</div>';
        }
        EMOJI_CAT_ORDER.forEach(k => { html += buildEmojiCat(cats[k], k); });
        body.innerHTML = html;
        return;
    }

    Object.keys(cats).forEach(k => { html += buildEmojiCat(cats[k], k); });
    body.innerHTML = html;
}

function emojiTitle(name) {
    if (!name) return '';
    return String(name).replace(/"/g, '&quot;').replace(/</g, '&lt;').slice(0, 120);
}

function buildEmojiCat(list, key) {
    if (!list || !list.length) return '';
    const title = ({
        people: 'Смайлы и люди', nature: 'Животные и природа', foods: 'Еда и напитки',
        activity: 'Занятия', places: 'Путешествия', objects: 'Предметы',
        symbols: 'Символы', flags: 'Флаги',
    })[key] || key;
    return `<div class="emoji-cat-title" data-cat-title="${key}">${title}</div>` +
        `<div class="emoji-grid">` + list.map(e => {
            const ch = Array.isArray(e) ? e[0] : e;
            const nm = Array.isArray(e) ? (e[1] || '') : '';
            return `<button class="emoji-cell" data-emoji="${ch}" title="${emojiTitle(nm)}">${ch}</button>`;
        }).join('') + '</div>';
}

function insertEmoji(ch) {
    const inp = document.getElementById('messageInput');
    if (!inp) return;
    fmtInsertAtCursor(inp, ch, false);
    composerAutosize();
    composerUpdateSend();
    inp.focus();
}

function toggleEmojiPanel(e) {
    if (e) e.stopPropagation();
    const panel = document.getElementById('emojiPanel');
    const btn = document.getElementById('emojiBtn');
    if (!panel) return;
    if (panel.style.display === 'flex') { closeEmojiPanel(); return; }
    panel.style.display = 'flex';
    btn?.classList.add('active');
    emojiInitCatBar();
    renderEmojiBody();
    setTimeout(() => document.getElementById('emojiSearch')?.focus({ preventScroll: true }), 60);
}

function closeEmojiPanel() {
    const panel = document.getElementById('emojiPanel');
    if (panel) panel.style.display = 'none';
    document.getElementById('emojiBtn')?.classList.remove('active');
}

function switchEmojiTab(tab) {
    composerState.emojiTab = tab;
    document.querySelectorAll('.emoji-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.etab === tab));
    const searchRow = document.querySelector('.emoji-search-row');
    if (searchRow) searchRow.style.display = tab === 'emoji' ? 'flex' : 'none';
    renderEmojiBody();
}

function clearEmojiSearch() {
    composerState.emojiQuery = '';
    const s = document.getElementById('emojiSearch');
    if (s) s.value = '';
    document.getElementById('emojiClear').style.display = 'none';
    renderEmojiBody();
}

function composerBindEmoji() {
    const panel = document.getElementById('emojiPanel');
    if (!panel || panel.dataset.bound) return;
    panel.dataset.bound = '1';

    document.getElementById('emojiTabs')?.addEventListener('click', e => {
        const t = e.target.closest('.emoji-tab');
        if (t) switchEmojiTab(t.dataset.etab);
    });

    panel.addEventListener('click', e => {
        const cell = e.target.closest('.emoji-cell');
        if (cell) { insertEmoji(cell.dataset.emoji); return; }
        const st = e.target.closest('.sticker-cell');
        if (st && !st.classList.contains('add') && !st.classList.contains('del')) {
            e.stopPropagation();
            sendSticker(st.dataset.path, st.dataset.caption || '');
        }
    });

    const search = document.getElementById('emojiSearch');
    search?.addEventListener('input', () => {
        composerState.emojiQuery = search.value;
        document.getElementById('emojiClear').style.display = search.value ? 'block' : 'none';
        renderEmojiBody();
    });

    // Категории подпрыгивают к нужному разделу
    const body = document.getElementById('emojiBody');
    body?.addEventListener('scroll', () => {
        const bar = document.getElementById('emojiCatBar');
        if (!bar) return;
        const titles = body.querySelectorAll('[data-cat-title]');
        let active = null;
        titles.forEach(t => { if (t.offsetTop - body.scrollTop <= 8) active = t.dataset.catTitle; });
        if (!active) return;
        bar.querySelectorAll('.emoji-cat-btn').forEach(x =>
            x.classList.toggle('on', x.dataset.cat === active));
    }, { passive: true });
}

/* ======================= ОТЛОЖЕННЫЕ СООБЩЕНИЯ ======================= */
function fmtSchedHuman(dt) {
    const d = dt instanceof Date ? dt : new Date(dt);
    if (isNaN(d)) return '';
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return `сегодня в ${t}`;
    const tom = new Date(now.getTime() + 86400000);
    if (d.toDateString() === tom.toDateString()) return `завтра в ${t}`;
    return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} в ${t}`;
}

function cancelSchedule() {
    composerState.scheduledFor = null;
    const strip = document.getElementById('schedStrip');
    if (strip) strip.style.display = 'none';
    composerUpdateSend();
}

function updateScheduleStrip() {
    const strip = document.getElementById('schedStrip');
    const txt = document.getElementById('schedStripText');
    if (!strip) return;
    if (composerState.scheduledFor) {
        strip.style.display = 'flex';
        txt.textContent = 'Отправится ' + fmtSchedHuman(composerState.scheduledFor);
    } else {
        strip.style.display = 'none';
    }
}

function openScheduleSheet(e) {
    if (e) e.stopPropagation();
    closeEmojiPanel();
    const inp = document.getElementById('messageInput');
    if (!inp?.value.trim() && !document.getElementById('fileInput')?.files.length) {
        showToast('Сначала напишите сообщение');
        return;
    }
    const now = new Date();
    const def = new Date(now.getTime() + 3600000);
    const pad = n => String(n).padStart(2, '0');
    const dtLocal = `${def.getFullYear()}-${pad(def.getMonth() + 1)}-${pad(def.getDate())}T${pad(def.getHours())}:${pad(def.getMinutes())}`;

    showBottomSheet(`
        <div class="cb-sheet-grab"></div>
        <h3>Отложить сообщение</h3>
        <div class="cb-sub">Сообщение отправится само в указанное время</div>
        <div class="cb-quick">
            <button data-min="30">30 минут</button>
            <button data-min="60">1 час</button>
            <button data-min="360">6 часов</button>
            <button data-min="1440">Завтра</button>
            <button data-min="10080">Неделя</button>
        </div>
        <div class="cb-custom">
            <input type="datetime-local" id="schedDate" value="${dtLocal}" min="${now.toISOString().slice(0, 16)}">
        </div>
        <div class="cb-actions">
            <button class="cb-ghost" data-act="cancel">Отмена</button>
            <button class="cb-primary" data-act="set">Отложить</button>
        </div>
        <div style="margin-top:14px;">
            <button class="cb-ghost" style="width:100%;" data-act="list">
                <i class="fas fa-list-ul"></i> Запланированные сообщения (${scheduledCache.length})
            </button>
        </div>
    `, sheet => {
        sheet.addEventListener('click', ev => {
            const q = ev.target.closest('.cb-quick button');
            if (q) {
                sheet.querySelectorAll('.cb-quick button').forEach(x => x.classList.remove('on'));
                q.classList.add('on');
                const d = new Date(Date.now() + (+q.dataset.min) * 60000);
                document.getElementById('schedDate').value =
                    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                return;
            }
            const act = ev.target.closest('[data-act]')?.dataset.act;
            if (act === 'cancel') { closeBottomSheet(); cancelSchedule(); }
            if (act === 'set') {
                const v = document.getElementById('schedDate').value;
                if (!v) return showToast('Выберите дату');
                const d = new Date(v);
                if (isNaN(d) || d <= new Date()) return showToast('Выберите время в будущем');
                composerState.scheduledFor = d.toISOString();
                updateScheduleStrip();
                composerUpdateSend();
                closeBottomSheet();
                showToast('Отправка отложена');
            }
            if (act === 'list') { closeBottomSheet(); openScheduledList(); }
        });
    });
}

let scheduledCache = [];

async function openScheduledList() {
    showBottomSheet('<div class="cb-sheet-grab"></div><h3>Запланированные</h3><div class="cb-list" id="schedListBox"><div class="emoji-empty">Загрузка…</div></div>', sheet => {
        fetch('/api/scheduled_messages?status=pending')
            .then(r => r.json())
            .then(d => {
                scheduledCache = d.scheduled || [];
                paintScheduledList();
                loadChatsList();
            })
            .catch(() => { document.getElementById('schedListBox').innerHTML = '<div class="emoji-empty">Ошибка загрузки</div>'; });
    });
}

function paintScheduledList() {
    const box = document.getElementById('schedListBox');
    if (!box) return;
    if (!scheduledCache.length) {
        box.innerHTML = '<div class="emoji-empty">Пока ничего не запланировано</div>';
        return;
    }
    box.innerHTML = scheduledCache.map(s => `
        <div class="cb-item" data-sched="${s.id}">
            <i class="cb-item-ico fas fa-clock"></i>
            <div class="cb-item-main">
                <div class="cb-item-when">${escapeHtml(fmtSchedHuman(s.scheduled_for))}</div>
                <div class="cb-item-txt">${escapeHtml(s.content || s.file_name || 'Медиа')}</div>
            </div>
            <button class="cb-iconbtn" data-send-now="${s.id}" title="Отправить сейчас"><i class="fas fa-paper-plane"></i></button>
            <button class="cb-iconbtn del" data-del="${s.id}" title="Удалить"><i class="fas fa-trash"></i></button>
        </div>`).join('');

    // Без {once:true}: список перерисовывается через innerHTML, но сам box
    // остаётся — слушатель должен переживать многократные клики.
    box.onclick = ev => {
        const now = ev.target.closest('[data-send-now]');
        if (now) return sendScheduledNow(+now.dataset.sendNow, now);
        const del = ev.target.closest('[data-del]');
        if (del) {
            fetch(`/api/scheduled_messages/${del.dataset.del}`, { method: 'DELETE' })
                .then(() => { scheduledCache = scheduledCache.filter(x => x.id != del.dataset.del); paintScheduledList(); });
        }
    };
}

function sendScheduledNow(id, btn) {
    btn.disabled = true;
    fetch(`/api/scheduled_messages/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' })
    }).then(r => r.json()).then(() => {
        scheduledCache = scheduledCache.filter(x => x.id != id);
        paintScheduledList();
        refreshMessages();
        loadChatsList();
    });
}

/* Универсальный bottom-sheet */
let _sheetClose = null;
function showBottomSheet(html, onBind) {
    closeBottomSheet();
    const back = document.createElement('div');
    back.className = 'sheet-backdrop';
    const sheet = document.createElement('div');
    sheet.className = 'cb-sheet';
    sheet.innerHTML = html;
    document.body.append(back, sheet);
    document.body.style.overflow = 'hidden';
    back.addEventListener('click', closeBottomSheet);
    _sheetClose = () => {
        back.remove(); sheet.remove();
        document.body.style.overflow = '';
        _sheetClose = null;
    };
    if (typeof onBind === 'function') onBind(sheet);
}
function closeBottomSheet() { if (_sheetClose) _sheetClose(); }

/* ======================= КРУЖКИ ======================= */
const VM_MAX_SEC = 60;

function startVideoMessage() {
    if (!currentChat) { showToast('Сначала выберите чат'); return; }
    closeAttachMenu();
    closeEmojiPanel();
    const ov = document.getElementById('vmOverlay');
    ov.style.display = 'flex';
    vmReset();
    vmOpenCamera();
}

function vmReset() {
    const vm = composerState.vm;
    if (vm.timer) clearInterval(vm.timer);
    if (vm.recorder && vm.recorder.state !== 'inactive') { try { vm.recorder.stop(); } catch (e) {} }
    if (vm.stream) vm.stream.getTracks().forEach(t => t.stop());
    if (vm.url) URL.revokeObjectURL(vm.url);
    Object.assign(vm, { open: true, stream: null, recorder: null, chunks: [],
                        startedAt: 0, timer: null, seconds: 0, blob: null, url: null, hasPreview: false });
    const prev = document.getElementById('vmPreview');
    if (prev) { prev.classList.remove('on'); prev.removeAttribute('src'); }
    document.getElementById('vmPreviewBar').style.display = 'none';
    document.getElementById('vmHint').textContent = 'Нажмите на кнопку записи (максимум 60 сек)';
    document.getElementById('vmTimer').textContent = '0:00';
    const rec = document.getElementById('vmRecordBtn');
    rec.classList.remove('rec');
    rec.innerHTML = '<i class="fas fa-circle"></i>';
    document.getElementById('vmFlipBtn').classList.remove('off');
}

async function vmOpenCamera() {
    const vm = composerState.vm;
    if (!navigator.mediaDevices?.getUserMedia) {
        vmHint('Браузер не поддерживает запись кружков');
        return;
    }
    try {
        vm.stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: vm.facing, width: { ideal: 640 }, height: { ideal: 640 } },
            audio: true
        });
    } catch (e) {
        vmHint('Нет доступа к камере. Проверьте разрешения в браузере.');
        return;
    }
    const ring = document.getElementById('vmRing');
    const old = ring.querySelector('video');
    if (old) old.remove();
    const v = document.createElement('video');
    v.setAttribute('autoplay', ''); v.setAttribute('playsinline', ''); v.muted = true;
    v.srcObject = vm.stream;
    ring.prepend(v);
    v.play().catch(() => {});
    const flip = document.getElementById('vmFlipBtn');
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    if (!devices.some(d => d.kind === 'videoinput')) flip.classList.add('off');
}

function vmHint(text) { const h = document.getElementById('vmHint'); if (h) h.textContent = text; }

function startVideoRecording() {
    const vm = composerState.vm;
    if (!vm.stream) { vmOpenCamera(); return; }
    if (vm.recorder && vm.recorder.state === 'recording') { stopVideoRecording(); return; }

    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
        .find(m => MediaRecorder.isTypeSupported(m));
    try {
        vm.recorder = new MediaRecorder(vm.stream, mime ? { mimeType: mime } : undefined);
    } catch (e) { vmHint('Не удалось начать запись'); return; }

    vm.chunks = [];
    vm.recorder.ondataavailable = ev => { if (ev.data?.size) vm.chunks.push(ev.data); };
    vm.recorder.onstop = vmFinishRecording;
    vm.recorder.start();
    vm.startedAt = Date.now();
    vm.seconds = 0;

    const rec = document.getElementById('vmRecordBtn');
    rec.classList.add('rec');
    rec.innerHTML = '<i class="fas fa-stop"></i>';
    vmHint('Идёт запись…');

    vm.timer = setInterval(() => {
        vm.seconds = (Date.now() - vm.startedAt) / 1000;
        const s = Math.floor(vm.seconds);
        document.getElementById('vmTimer').textContent =
            `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        if (s >= VM_MAX_SEC) stopVideoRecording();
    }, 250);
}

function stopVideoRecording() {
    const vm = composerState.vm;
    if (vm.timer) { clearInterval(vm.timer); vm.timer = null; }
    if (vm.recorder && vm.recorder.state === 'recording') vm.recorder.stop();
}

function vmFinishRecording() {
    const vm = composerState.vm;
    if (!vm.chunks.length) { vmHint('Запись пустая'); return; }
    const type = vm.recorder?.mimeType || 'video/webm';
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    vm.blob = new Blob(vm.chunks, { type });
    vm.url = URL.createObjectURL(vm.blob);
    vm.seconds = vm.seconds || (Date.now() - vm.startedAt) / 1000;
    vm.hasPreview = true;

    const prev = document.getElementById('vmPreview');
    prev.src = vm.url;
    prev.loop = true; prev.muted = true; prev.controls = false;
    prev.classList.add('on');
    prev.play().catch(() => {});
    document.getElementById('vmPreviewBar').style.display = 'flex';
    document.getElementById('vmFlipBtn').classList.add('off');
    vmHint('Готово к отправке');

    const rec = document.getElementById('vmRecordBtn');
    rec.classList.remove('rec');
    rec.innerHTML = '<i class="fas fa-rotate"></i>';
    document.getElementById('vmTimer').textContent =
        `${Math.floor(vm.seconds / 60)}:${String(Math.floor(vm.seconds % 60)).padStart(2, '0')}`;
}

function flipVideoCamera() {
    const vm = composerState.vm;
    if (!vm.stream) return;
    vm.facing = vm.facing === 'user' ? 'environment' : 'user';
    vm.stream.getTracks().forEach(t => t.stop());
    vmOpenCamera();
}

function discardVideoMessage() {
    const vm = composerState.vm;
    if (vm.url) { URL.revokeObjectURL(vm.url); vm.url = null; }
    vm.blob = null; vm.hasPreview = false;
    vmReset();
    vmOpenCamera();
}

function closeVideoMessage() {
    const vm = composerState.vm;
    if (vm.timer) clearInterval(vm.timer);
    if (vm.recorder && vm.recorder.state === 'recording') { try { vm.recorder.stop(); } catch (e) {} }
    if (vm.stream) vm.stream.getTracks().forEach(t => t.stop());
    if (vm.url) URL.revokeObjectURL(vm.url);
    vm.open = false;
    document.getElementById('vmOverlay').style.display = 'none';
    document.getElementById('vmRing').querySelectorAll('video').forEach(v => v.remove());
}

function sendVideoMessage() {
    const vm = composerState.vm;
    if (!vm.blob) { showToast('Сначала запишите кружок'); return; }
    if (!currentChat) return;

    const ext = (vm.recorder?.mimeType || '').includes('mp4') ? 'mp4' : 'webm';
    const fd = new FormData();
    if (currentChatType === 'personal') fd.append('chat_id', currentChat.chat_id);
    else if (currentChatType === 'group') fd.append('group_id', currentChat.id);
    else if (currentChatType === 'channel') fd.append('channel_id', currentChat.id);
    fd.append('video', new File([vm.blob], `circle.${ext}`, { type: vm.blob.type }));
    fd.append('media_duration', String(Math.round(vm.seconds * 10) / 10));
    const reply = currentReplyMessage;
    if (reply) fd.append('reply_to_id', reply.id);

    const btn = document.querySelector('#vmPreviewBar .vm-chip-send');
    if (btn) { btn.disabled = true; btn.textContent = 'Отправка…'; }

    fetch('/api/send_video_message', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(d => {
            if (d.success) {
                displayMessage(d.message);
                loadChatsList();
                closeVideoMessage();
                cancelReply();
            } else {
                showToast(d.error || 'Не удалось отправить кружок');
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Отправить кружок'; }
            }
        })
        .catch(() => {
            showToast('Ошибка отправки');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Отправить кружок'; }
        });
}

/* ======================= ПЕРЕХВАТ СТАРЫХ ФУНКЦИЙ ======================= */

/**
 * Отправка v2. Перекрывает старую sendMessage() из message-features.js:
 * добавлены отложенная отправка, альбомы и корректная очистка composer-состояния.
 * Вызывается на DOMContentLoaded, когда исходная функция уже объявлена.
 */
function composerInstallSend() {
    if (window.sendMessage && window.sendMessage.__v2) return;
    if (typeof window.displayMessage !== 'function') return;

    window.sendMessage = function () {
        const input = document.getElementById('messageInput');
        if (!input) return;
        const content = input.value.trim();
        const fileInput = document.getElementById('fileInput');
        const fileList = fileInput?.files ? Array.from(fileInput.files) : [];
        const picked = (typeof pendingFiles !== 'undefined' && pendingFiles) ? pendingFiles.slice() : [];
        const files = fileList.length ? fileList : picked;
        const scheduled = composerState.scheduledFor;

        if (!content && !files.length && !scheduled) return;
        if (!currentChat) { showToast('Сначала выберите чат'); return; }

        const fd = new FormData();
        if (currentChatType === 'personal') {
            if (!currentChat.chat_id) { showToast('Нет id чата'); return; }
            fd.append('chat_id', currentChat.chat_id);
        } else if (currentChatType === 'group') {
            fd.append('group_id', currentChat.id);
        } else if (currentChatType === 'channel') {
            fd.append('channel_id', currentChat.id);
        }

        fd.append('content', content || '');

        if (currentReplyMessage) fd.append('reply_to_id', currentReplyMessage.id);
        if (typeof selfBurnSeconds !== 'undefined' && selfBurnSeconds) {
            fd.append('expire_after', selfBurnSeconds);
        }
        if (scheduled) fd.append('scheduled_for', scheduled);

        // Несколько медиа одним блоком -> альбом (как в Telegram)
        const mediaOnly = files.length > 1 && files.every(f => /^(image|video)\//.test(f.type || ''));
        if (mediaOnly) fd.append('album', '1');
        files.forEach(f => fd.append('files', f));

        // Оптимистичный показ (только текст, без медиа и без отложенной отправки)
        if (content && !files.length && !scheduled) {
            displayMessage({
                id: null, is_temp: true, sender_id: currentUser.id,
                content: content, created_at: new Date().toISOString(), is_read: false
            });
        }

        input.value = '';
        composerAutosize();
        cancelReply();
        cancelSchedule();
        if (fileInput) fileInput.value = '';
        if (typeof pendingFiles !== 'undefined') pendingFiles = [];

        const btn = document.getElementById('sendBtn');
        if (btn) btn.disabled = true;

        fetch('/api/send_message', { method: 'POST', body: fd })
            .then(r => r.json())
            .then(d => {
                if (btn) btn.disabled = false;
                document.querySelectorAll('.message.temp-message').forEach(el => el.remove());
                if (d.success && d.scheduled) {
                    showToast('Отправлено по расписанию: ' + fmtSchedHuman(d.scheduled.scheduled_for));
                    loadChatsList();
                } else if (d.success && d.messages && d.messages.length) {
                    d.messages.forEach(m => displayMessage(m));
                    loadChatsList();
                } else if (d.success) {
                    refreshMessages();
                    loadChatsList();
                } else {
                    showToast(d.error || 'Не удалось отправить');
                    input.value = content;
                    composerAutosize();
                    refreshMessages();
                }
            })
            .catch(() => {
                if (btn) btn.disabled = false;
                document.querySelectorAll('.message.temp-message').forEach(el => el.remove());
                showToast('Ошибка при отправке');
                input.value = content;
                composerAutosize();
            });
    };
    window.sendMessage.__v2 = true;
}

/* Расширяем отправку файлов: альбом из нескольких медиа */
function composerWrapFiles() {
    if (typeof window.sendFilesWithPreview !== 'function' || window.sendFilesWithPreview.__v2) return;
    const orig = window.sendFilesWithPreview;

    window.sendFilesWithPreview = function () {
        const files = (typeof pendingFiles !== 'undefined' && pendingFiles) ? pendingFiles.slice() : [];
        const mediaOnly = files.length > 1 && files.every(f => /^(image|video)\//.test(f.type || ''));
        if (!mediaOnly) return orig.apply(this, arguments);

        const caption = document.getElementById('previewCaption')?.value || '';
        if (!currentChat) { showToast('Выберите чат'); return; }

        const fd = new FormData();
        if (currentChatType === 'personal') fd.append('chat_id', currentChat.chat_id);
        else if (currentChatType === 'group') fd.append('group_id', currentChat.id);
        else if (currentChatType === 'channel') fd.append('channel_id', currentChat.id);
        fd.append('content', caption);
        fd.append('album', '1');
        files.forEach(f => fd.append('files', f));

        closeModal('filePreviewModal');
        const btn = document.getElementById('sendBtn');
        if (btn) btn.disabled = true;

        fetch('/api/send_message', { method: 'POST', body: fd })
            .then(r => r.json())
            .then(d => {
                if (btn) btn.disabled = false;
                pendingFiles = [];
                if (d.success && d.messages) {
                    d.messages.forEach(m => displayMessage(m));
                    loadChatsList();
                } else {
                    showToast(d.error || 'Ошибка отправки');
                }
            })
            .catch(() => { if (btn) btn.disabled = false; showToast('Ошибка отправки'); });
    };
    window.sendFilesWithPreview.__v2 = true;
}

/* ======================= INIT ======================= */
document.addEventListener('DOMContentLoaded', () => {
    composerInitInput();
    composerBindEmoji();
    composerInstallSend();
    composerWrapFiles();

    const inp = document.getElementById('messageInput');
    if (inp && !inp.dataset.v2ev) {
        inp.dataset.v2ev = '1';
        inp.addEventListener('input', () => { composerAutosize(); composerUpdateSend(); });

        inp.addEventListener('keydown', e => {
            // На ПК: Enter — отправить, Shift+Enter — перенос. На мобильных — всегда перенос.
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isMobile?.()) {
                e.preventDefault();
                const btn = document.getElementById('sendBtn');
                if (btn && !btn.disabled) window.sendMessage();
            }
        });

        // Вставленная/вставленная картинка сразу уходит в альбом
        inp.addEventListener('paste', e => {
            const items = [...(e.clipboardData?.items || [])];
            const img = items.find(i => i.type.startsWith('image/'));
            if (!img) return;
            const f = img.getAsFile();
            if (!f) return;
            e.preventDefault();
            if (typeof pendingFiles !== 'undefined') {
                pendingFiles = (pendingFiles || []).concat([f]);
                showFilePreview(pendingFiles);
            }
        });
    }

    document.getElementById('sendBtn')?.addEventListener('click', () => {
        if (composerState.scheduledFor) {
            showToast('Сообщение будет отправлено по расписанию');
        }
    });

    // Закрываем панель эмодзи по клику вне неё
    document.addEventListener('click', e => {
        const panel = document.getElementById('emojiPanel');
        if (!panel || panel.style.display !== 'flex') return;
        if (panel.contains(e.target)) return;
        if (e.target.closest('#emojiBtn') || e.target.closest('#attachBtn')) return;
        closeEmojiPanel();
    });

    updateScheduleStrip();
    initAppLock();
    loadPremiumBadge();
    if (typeof loadPremiumUsers === 'function') loadPremiumUsers();
});
