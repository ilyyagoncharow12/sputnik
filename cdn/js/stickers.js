/* =====================================================================
   STICKERS.JS — Спутник v0.58.0
   Стикеры: панель в поле ввода, вкладки «Стикеры» / «Избранные» / «Создать»,
   редактор (обрезка в квадрат + эмодзи + текст), отправка, сохранение
   стикера из чужого сообщения, избранное.
   ===================================================================== */

let stickerCache = [];        // все мои стикеры
let stickerFavCache = [];     // избранные
const stickerEmojiLayer = []; // [{x,y,size,ch,el}] — перетаскиваемые эмодзи

/* ======================= ЗАГРУЗКА ======================= */
async function loadStickers(force) {
    if (!force && stickerCache.length) return stickerCache;
    try {
        const r = await fetch('/api/stickers');
        const d = await r.json();
        stickerCache = d.stickers || [];
    } catch (e) { stickerCache = []; }
    return stickerCache;
}

async function loadFavoriteStickers(force) {
    if (!force && stickerFavCache.length) return stickerFavCache;
    try {
        const r = await fetch('/api/stickers?favorites=1');
        const d = await r.json();
        stickerFavCache = d.stickers || [];
    } catch (e) { stickerFavCache = []; }
    return stickerFavCache;
}

async function invalidateStickers() {
    stickerCache = [];
    stickerFavCache = [];
    await loadStickers(true);
    await loadFavoriteStickers(true);
}

/* ======================= ОТРИСОВКА В ПАНЕЛИ ======================= */
function renderStickerGrid(box, onlyFav) {
    box.innerHTML = '<div class="emoji-empty">Загрузка…</div>';
    (onlyFav ? loadFavoriteStickers() : loadStickers()).then(list => {
        if (!box.isConnected) return;
        if (!list.length) {
            box.innerHTML = `<div class="emoji-empty">${onlyFav
                ? 'Нет избранных стикеров.<br>Нажмите на стикер в сообщении, чтобы добавить.'
                : 'У вас пока нет стикеров.<br>Нажмите «Создать» и сделайте свой!'}</div>`;
            return;
        }
        const cells = list.map(s => `
            <button class="sticker-cell" data-id="${s.id}" data-path="${s.file_path}"
                    data-caption="${escapeHtml(s.caption || '')}" title="${escapeHtml(s.caption || 'Стикер')}">
                <img src="/${s.file_path}" alt="" loading="lazy">
                ${s.emoji ? `<span class="st-emoji">${s.emoji}</span>` : ''}
            </button>`).join('');
        const addBtn = onlyFav ? '' : `
            <button class="sticker-cell add" onclick="openStickerCreator()">
                <i class="fas fa-plus"></i><span>Создать</span>
            </button>`;
        box.innerHTML = `<div class="sticker-grid">${cells}${addBtn}</div>`;
    });
}

function renderStickerCreateTab(box) {
    box.innerHTML = `
        <div style="padding:14px 10px;display:flex;flex-direction:column;gap:10px;">
            <button class="sticker-tool gold" onclick="openStickerCreator()">
                <i class="fas fa-wand-magic-sparkles"></i> Создать стикер
            </button>
            <div class="sticker-tool gray" style="cursor:default;">
                <i class="fas fa-crop-simple"></i> Квадрат 512×512, PNG с прозрачностью
            </div>
            <div class="sticker-tool gray" style="cursor:default;">
                <i class="fas fa-font"></i> Можно наложить текст и эмодзи
            </div>
            <button class="sticker-tool" onclick="switchEmojiTab('stickers')">
                <i class="fas fa-sticker-mood"></i> К моим стикерам
            </button>
        </div>`;
}

/* ======================= ОТПРАВКА ======================= */
async function sendSticker(path, caption) {
    if (!path) return;
    if (!currentChat) { showToast('Сначала выберите чат'); return; }

    const body = { file_path: path, content: '' };
    if (currentChatType === 'personal') body.chat_id = currentChat.chat_id;
    else if (currentChatType === 'group') body.group_id = currentChat.id;
    else if (currentChatType === 'channel') body.channel_id = currentChat.id;

    const fd = new FormData();
    Object.entries(body).forEach(([k, v]) => fd.append(k, v));

    try {
        const r = await fetch('/api/send_sticker', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const d = await r.json();
        if (d.success) {
            displayMessage(d.message);
            loadChatsList();
        } else {
            showToast(d.error || 'Не удалось отправить стикер');
        }
    } catch (e) {
        showToast('Ошибка отправки стикера');
    }
}

/* Сохранить чужой стикер себе в избранное */
async function saveStickerFromMessage(filePath) {
    if (!filePath) return;
    try {
        const r = await fetch('/api/stickers/from_message', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_path: filePath, is_favorite: true })
        });
        const d = await r.json();
        if (d.success) {
            showToast('Стикер сохранён в избранное');
            invalidateStickers();
        } else {
            showToast(d.error || 'Не удалось сохранить');
        }
    } catch (e) { showToast('Ошибка сохранения'); }
}

/* Избранное — переключить */
async function toggleStickerFavorite(sid, ev) {
    if (ev) ev.stopPropagation();
    try {
        const r = await fetch(`/api/stickers/${sid}/favorite`, { method: 'POST' });
        const d = await r.json();
        if (!d.success) { showToast(d.error || 'Ошибка'); return; }
        showToast(d.is_favorite ? 'Добавлено в избранное' : 'Убрано из избранного');
        await invalidateStickers();
        if (composerState.emojiTab === 'favstickers') {
            const box = document.getElementById('emojiBody');
            if (box) renderStickerGrid(box, true);
        }
    } catch (e) { showToast('Ошибка'); }
}

async function deleteSticker(sid, ev) {
    if (ev) ev.stopPropagation();
    if (!confirm('Удалить стикер?')) return;
    try {
        const r = await fetch(`/api/stickers/${sid}`, { method: 'DELETE' });
        const d = await r.json();
        if (d.success) {
            showToast('Стикер удалён');
            await invalidateStickers();
            const box = document.getElementById('emojiBody');
            if (box) renderStickerGrid(box, composerState.emojiTab === 'favstickers');
        }
    } catch (e) { showToast('Ошибка удаления'); }
}

/* ======================= РЕДАКТОР СТИКЕРА ======================= */
const stickerEditor = {
    img: null,        // HTMLImageElement
    canvas: null,
    ctx: null,
    text: '',
    textColor: '#ffffff',
    textSize: 64,
    textX: 256,
    textY: 400,
    file: null,
    crop: { x: 0, y: 0, size: 512 },
    scale: 1,
    dragging: null,
};

function openStickerCreator() {
    stickerEmojiLayer.length = 0;
    showModal('Создать стикер', `
        <div class="sticker-editor">
            <div class="sticker-stage" id="seStage">
                <div class="se-hint" id="seHint">
                    <i class="fas fa-image" style="font-size:32px;display:block;margin-bottom:8px;"></i>
                    Выберите фото — обрежем в квадрат автоматически
                </div>
                <canvas id="seCanvas" width="512" height="512" style="display:none;"></canvas>
                <div class="sticker-emoji-layer" id="seEmojiLayer"></div>
            </div>

            <div class="sticker-tools">
                <button class="sticker-tool" onclick="document.getElementById('stickerUploadInput').click()">
                    <i class="fas fa-photo-video"></i> Фото
                </button>
                <button class="sticker-tool" onclick="seAddEmoji()">
                    <i class="fas fa-smile"></i> Эмодзи
                </button>
                <button class="sticker-tool" onclick="seZoomOut()"><i class="fas fa-search-minus"></i></button>
                <button class="sticker-tool" onclick="seZoomIn()"><i class="fas fa-search-plus"></i></button>
                <button class="sticker-tool gray" onclick="seReset()"><i class="fas fa-rotate-left"></i></button>
            </div>

            <div class="sticker-text-row">
                <input type="text" id="seText" placeholder="Текст на стикере" maxlength="40">
                <select id="seColor">
                    <option value="#ffffff">Белый</option>
                    <option value="#000000">Чёрный</option>
                    <option value="#ff453a">Красный</option>
                    <option value="#ffd60a">Жёлтый</option>
                    <option value="#30d158">Зелёный</option>
                    <option value="#0a84ff">Синий</option>
                    <option value="#bf5af2">Фиолетовый</option>
                </select>
            </div>

            <div id="seEmojiPicker" style="display:none;">
                <div class="emoji-picker-inline" id="seEmojiGrid"></div>
            </div>

            <div class="sticker-tools">
                <button class="sticker-tool primary" onclick="saveSticker(false)">
                    <i class="fas fa-paper-plane"></i> Сохранить
                </button>
                <button class="sticker-tool gold" onclick="saveSticker(true)">
                    <i class="fas fa-star"></i> В избранное
                </button>
            </div>
        </div>
    `);
    bindStickerEditor();
}

function bindStickerEditor() {
    const up = document.getElementById('stickerUploadInput');
    if (up && !up.dataset.bound) {
        up.dataset.bound = '1';
        up.addEventListener('change', e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) loadStickerSource(f);
        });
    }
    const txt = document.getElementById('seText');
    txt?.addEventListener('input', () => { stickerEditor.text = txt.value; sePaint(); });
    document.getElementById('seColor')?.addEventListener('change', e => {
        stickerEditor.textColor = e.target.value; sePaint();
    });

    // Перетаскивание эмодзи по холсту
    const stage = document.getElementById('seStage');
    stage?.addEventListener('pointerdown', e => {
        const span = e.target.closest('.sticker-emoji-layer span');
        if (!span) return;
        const item = stickerEmojiLayer.find(x => x.el === span);
        if (!item) return;
        stickerEditor.dragging = item;
        item.el.classList.add('dragging');
        span.setPointerCapture(e.pointerId);
    });
    stage?.addEventListener('pointermove', e => {
        const it = stickerEditor.dragging;
        if (!it) return;
        const r = stage.getBoundingClientRect();
        it.x = Math.max(0, Math.min(512, ((e.clientX - r.left) / r.width) * 512));
        it.y = Math.max(0, Math.min(512, ((e.clientY - r.top) / r.height) * 512));
        it.el.style.left = it.x + 'px';
        it.el.style.top = it.y + 'px';
    });
    const stopDrag = () => {
        if (stickerEditor.dragging) stickerEditor.dragging.el.classList.remove('dragging');
        stickerEditor.dragging = null;
    };
    stage?.addEventListener('pointerup', stopDrag);
    stage?.addEventListener('pointercancel', stopDrag);

    // Долгое нажатие на эмодзи в панели выбора — увеличить
}

function loadStickerSource(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        stickerEditor.img = img;
        stickerEditor.file = file;
        // Центральная квадратная обрезка
        const side = Math.min(img.width, img.height);
        stickerEditor.crop = {
            x: (img.width - side) / 2,
            y: (img.height - side) / 2,
            size: side,
        };
        stickerEditor.scale = 1;
        document.getElementById('seHint').style.display = 'none';
        const c = document.getElementById('seCanvas');
        c.style.display = 'block';
        stickerEditor.canvas = c;
        stickerEditor.ctx = c.getContext('2d');
        sePaint();
    };
    img.onerror = () => showToast('Не удалось прочитать изображение');
    img.src = url;
}

function sePaint() {
    const ctx = stickerEditor.ctx;
    const img = stickerEditor.img;
    if (!ctx || !img) return;

    ctx.clearRect(0, 0, 512, 512);
    const c = stickerEditor.crop;
    const s = c.size * stickerEditor.scale;
    const ox = c.x + (c.size - s) / 2;
    const oy = c.y + (c.size - s) / 2;
    ctx.drawImage(img, ox, oy, s, s, 0, 0, 512, 512);

    if (stickerEditor.text) {
        ctx.save();
        ctx.font = `800 ${stickerEditor.textSize}px "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(3, stickerEditor.textSize / 8);
        ctx.strokeStyle = 'rgba(0,0,0,.75)';
        ctx.strokeText(stickerEditor.text, stickerEditor.textX, stickerEditor.textY);
        ctx.fillStyle = stickerEditor.textColor;
        ctx.fillText(stickerEditor.text, stickerEditor.textX, stickerEditor.textY);
        ctx.restore();
    }
}

function seZoomIn() { stickerEditor.scale = Math.min(3, stickerEditor.scale + 0.15); sePaint(); }
function seZoomOut() { stickerEditor.scale = Math.max(1, stickerEditor.scale - 0.15); sePaint(); }
function seReset() { stickerEditor.scale = 1; sePaint(); }

function seAddEmoji() {
    const box = document.getElementById('seEmojiPicker');
    if (!box) return;
    if (box.style.display === 'none') {
        box.style.display = 'block';
        const grid = document.getElementById('seEmojiGrid');
        const list = (window.EMOJI_FREQUENT || []).slice(0, 120);
        grid.innerHTML = list.map(c => `<button class="emoji-cell" data-emoji="${c}">${c}</button>`).join('')
            || '<div class="emoji-empty">Эмодзи не загрузились</div>';
        grid.onclick = e => {
            const b = e.target.closest('.emoji-cell');
            if (b) sePlaceEmoji(b.dataset.emoji);
        };
    } else {
        box.style.display = 'none';
    }
}

function sePlaceEmoji(ch) {
    const layer = document.getElementById('seEmojiLayer');
    if (!layer) return;
    const span = document.createElement('span');
    span.textContent = ch;
    span.style.left = '256px';
    span.style.top = '200px';
    span.style.fontSize = '80px';
    layer.appendChild(span);
    stickerEmojiLayer.push({ ch, x: 256, y: 200, el: span });

    // Тап по уже поставленному эмодзи — увеличить
    span.addEventListener('click', () => {
        const it = stickerEmojiLayer.find(x => x.el === span);
        if (!it) return;
        const cur = parseFloat(span.style.fontSize) || 80;
        span.style.fontSize = (cur >= 160 ? 50 : cur + 20) + 'px';
    });
}

async function saveSticker(asFav) {
    const ed = stickerEditor;
    if (!ed.img) { showToast('Сначала выберите фото'); return; }

    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const c = ed.crop;
    const s = c.size * ed.scale;
    ctx.drawImage(ed.img, c.x + (c.size - s) / 2, c.y + (c.size - s) / 2, s, s, 0, 0, 512, 512);

    if (ed.text) {
        ctx.font = `800 ${ed.textSize}px "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(3, ed.textSize / 8);
        ctx.strokeStyle = 'rgba(0,0,0,.75)';
        ctx.strokeText(ed.text, ed.textX, ed.textY);
        ctx.fillStyle = ed.textColor;
        ctx.fillText(ed.text, ed.textX, ed.textY);
    }

    // Наклеенные эмодзи впечатываем в PNG — иначе они видны только
    // в редакторе и теряются после сохранения.
    for (const em of stickerEmojiLayer) {
        if (!em || !em.ch) continue;
        const fs = parseFloat(em.el?.style?.fontSize) || 80;
        ctx.save();
        ctx.font = `${fs}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,.6)';
        ctx.lineWidth = Math.max(2, fs / 14);
        ctx.strokeText(em.ch, em.x, em.y);
        ctx.fillText(em.ch, em.x, em.y);
        ctx.restore();
    }

    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    if (!blob) { showToast('Не удалось сохранить картинку'); return; }

    const fd = new FormData();
    fd.append('file', new File([blob], 'sticker.png', { type: 'image/png' }));
    fd.append('is_favorite', asFav ? '1' : '0');
    fd.append('set_name', 'Мои стикеры');
    const layer = document.getElementById('seEmojiLayer');
    fd.append('emoji', (stickerEmojiLayer[0]?.ch) || '');

    try {
        const r = await fetch('/api/stickers/upload', { method: 'POST', body: fd });
        const d = await r.json();
        if (d.success) {
            showToast(asFav ? 'Стикер сохранён в избранное' : 'Стикер создан');
            closeModal('tempModal');
            await invalidateStickers();
            const box = document.getElementById('emojiBody');
            if (box && composerState.emojiTab !== 'emoji') {
                renderStickerGrid(box, composerState.emojiTab === 'favstickers');
            }
        } else {
            showToast(d.error || 'Ошибка сохранения');
        }
    } catch (e) { showToast('Ошибка сохранения'); }
}

/* ======================= ИНИЦИАЛИЗАЦИЯ ======================= */
document.addEventListener('DOMContentLoaded', () => {
    // Прогрев кэша стикеров в фоне
    setTimeout(() => { loadStickers(); loadFavoriteStickers(); }, 1200);
});
