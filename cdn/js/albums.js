/* =====================================================================
   ALBUMS.JS — Спутник v0.58.0
   Альбомы медиа (как в Telegram): сетка 2-10 фото/видео одним блоком,
   просмотрщик с перелистыванием и перестановкой фотографий.
   Также рендер кружков и стикеров в ленте.

   Интеграция: не трогаем чужой код отрисовки, а ПОСЛЕ неё собираем
   подряд идущие .message[data-album] в одну сетку (mergeAlbumCells).
   Это работает одинаково и для массовой загрузки, и для новых
   сообщений по Socket.IO.
   ===================================================================== */

const ALBUM_MAX = 10;

const albumState = {
    albumId: null,
    items: [],
    index: 0,
    editMode: false,
    canReorder: false,
};

/* ======================= ХЕЛПЕРЫ ======================= */
const albumExt = m => (m.file_name || '').split('.').pop().toLowerCase();
const albumIsImage = m => m.file_type === 'photo'
    || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(albumExt(m));
const albumIsVideo = m => m.file_type === 'video'
    || ['mp4', 'webm', 'mov', 'm4v', '3gp'].includes(albumExt(m));

function albumCellHTML(m, n) {
    const p = '/' + m.file_path;
    const inner = albumIsImage(m)
        ? `<img src="${p}" alt="" loading="lazy">`
        : (albumIsVideo(m)
            ? `<video src="${p}" preload="metadata" muted playsinline></video>`
            : `<div class="message-file"><i class="fas fa-file"></i><div class="message-file-info">
                 <div class="message-file-name">${escapeHtml(m.file_name || 'Файл')}</div></div></div>`);

    const more = n > ALBUM_MAX ? `<div class="ma-more">+${n - ALBUM_MAX}</div>` : '';
    return `<div class="ma-cell" data-idx="${m.__ord ?? 0}">${inner}${more}</div>`;
}

function albumGridHTML(cells, n, caption) {
    const cls = n === 2 ? 'n2' : n === 3 ? 'n3' : n === 4 ? 'n4' : 'many';
    return `<div class="media-album ${cls}">${cells.join('')}` +
        (caption ? `<div class="ma-cap">${renderFormattedText(caption)}</div>` : '') + '</div>';
}

function albumTime(m) {
    try {
        return new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
}

/* ======================= СБОРКА СЕТКИ В DOM ======================= */
/* Разворачивает уже собранную сетку обратно в список элементов: приход
   нового сообщения альбома (Socket.IO) пересобирает сетку целиком,
   а не плодит рядом вторую. */
function albumUnitsOf(node) {
    if (node.dataset.albumGroup) {
        let items = [];
        try { items = JSON.parse(node.dataset.albumItems || '[]') || []; } catch (e) { items = []; }
        return { items, isRead: node.dataset.isRead === '1' };
    }
    if (!node?.dataset?.album) return null;
    return {
        items: [{
            ord: +(node.dataset.ord || 0),
            cellHtml: node.querySelector('.ma-cell-src')?.innerHTML || '',
            content: node.dataset.content || '',
            id: node.dataset.messageId,
        }],
        isRead: node.dataset.isRead === '1',
    };
}

function mergeAlbumCells(area) {
    if (!area) return;
    let kids = Array.from(area.children);
    let i = 0;

    while (i < kids.length) {
        const el = kids[i];
        if (!el?.classList.contains('message')) { i++; continue; }
        const aid = el.dataset.album || el.dataset.albumGroup;
        if (!aid) { i++; continue; }

        // Подряд идущие узлы того же альбома (включая уже собранные сетки)
        const run = [el];
        const items = [];
        let isRead = false;
        let j = i + 1;
        while (j < kids.length) {
            const nx = kids[j];
            if (!nx?.classList.contains('message')) break;
            if ((nx.dataset.album || nx.dataset.albumGroup) !== aid) break;
            run.push(nx);
            const u = albumUnitsOf(nx);
            if (u) { items.push(...u.items); isRead = isRead || u.isRead; }
            j++;
        }
        const u0 = albumUnitsOf(el);
        if (u0) { items.push(...u0.items); isRead = isRead || u0.isRead; }

        // Одно и то же сообщение может попасть в список и из уже собранной
        // сетки, и из отдельного узла (приход через сокет) — оставляем
        // по одному входу на каждое сообщение.
        const uniq = new Map();
        items.forEach((it, k) => {
            const key = (it.id != null && it.id !== '') ? `id:${it.id}` : `k:${k}:${it.ord}`;
            if (!uniq.has(key)) uniq.set(key, it);
        });
        const itemsFinal = [...uniq.values()].sort((a, b) => a.ord - b.ord);

        if (itemsFinal.length < 2) { i = j; continue; }

        const n = itemsFinal.length;
        const shown = itemsFinal.slice(0, ALBUM_MAX);
        const caption = itemsFinal.map(x => x.content).find(Boolean) || '';
        const cells = shown.map((it, k) => {
            const extra = n > ALBUM_MAX && k === ALBUM_MAX - 1
                ? `<div class="ma-more">+${n - ALBUM_MAX}</div>` : '';
            return `<div class="ma-cell" data-idx="${it.ord}" data-mid="${it.id || ''}">${it.cellHtml}${extra}</div>`;
        });

        const outgoing = el.classList.contains('outgoing');
        const meta = run.map(albumTimeFromDataset).filter(Boolean).pop() || '';
        const readTick = isRead
            ? '<i class="fas fa-check-double" style="font-size:8px;color:#53d769;"></i>'
            : (outgoing ? '<i class="fas fa-check" style="font-size:8px;"></i>' : '');

        const grid = document.createElement('div');
        grid.className = `message ${outgoing ? 'outgoing' : 'incoming'}`;
        grid.dataset.albumGroup = aid;
        grid.dataset.isRead = isRead ? '1' : '0';
        grid.dataset.albumItems = JSON.stringify(itemsFinal);
        grid.innerHTML = `
            <div class="message-bubble" style="padding:3px;background:transparent;">
                ${albumGridHTML(cells, n, caption)}
                <div class="message-meta" style="justify-content:flex-end;">
                    <span>${meta}</span>${readTick}
                </div>
            </div>`;

        run[run.length - 1].after(grid);
        run.forEach(x => x.remove());
        kids = Array.from(area.children);
        i = kids.indexOf(grid) + 1;
    }
}

function albumTimeFromDataset(node) {
    return node.querySelector('.message-meta span')?.textContent || '';
}

/* ======================= ПРОСМОТРЩИК ======================= */
async function openAlbum(albumId, startIdx) {
    const view = document.getElementById('albumViewer');
    if (!view) return;
    albumState.albumId = albumId;
    albumState.index = Math.max(0, +(startIdx || 0));
    albumState.editMode = false;

    view.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    document.getElementById('albumReorderBar').style.display = 'none';
    document.getElementById('albumEditBtn').innerHTML = '<i class="fas fa-shuffle"></i>';
    document.getElementById('albumViewerMain').innerHTML =
        '<div style="color:#888;">Загрузка…</div>';

    await loadAlbumItems(albumId);
    albumPaint();
}

async function loadAlbumItems(albumId) {
    try {
        const r = await fetch(`/api/album/${albumId}`);
        const d = await r.json();
        albumState.items = (d.items || []).slice()
            .sort((a, b) => (a.album_order || 0) - (b.album_order || 0));
        albumState.canReorder = !!albumState.items[0]?.can_reorder;
    } catch (e) {
        albumState.items = [];
    }
}

function albumPaint() {
    const items = albumState.items;
    const cur = items[albumState.index];
    if (!cur) { closeAlbumViewer(); return; }

    document.getElementById('albumCounter').textContent = `${albumState.index + 1} / ${items.length}`;
    const main = document.getElementById('albumViewerMain');
    main.innerHTML = (albumIsImage(cur)
        ? `<img src="/${cur.file_path}" alt="">`
        : `<video src="/${cur.file_path}" controls playsinline></video>`)
        + (items.length > 1
            ? `<button class="album-nav prev" onclick="albumStep(-1)"><i class="fas fa-chevron-left"></i></button>
               <button class="album-nav next" onclick="albumStep(1)"><i class="fas fa-chevron-right"></i></button>`
            : '');

    document.getElementById('albumEditBtn').style.display =
        albumState.canReorder && items.length > 1 ? 'flex' : 'none';
    albumPaintStrip();
}

function albumPaintStrip() {
    const strip = document.getElementById('albumStrip');
    if (!strip || !albumState.editMode) return;
    strip.innerHTML = albumState.items.map((it, i) => {
        const inner = albumIsImage(it)
            ? `<img src="/${it.file_path}" alt="">`
            : `<video src="/${it.file_path}" muted></video>`;
        return `<div class="album-thumb ${i === albumState.index ? 'on' : ''}" data-pos="${i}">
            <span class="at-pos">${i + 1}</span>${inner}</div>`;
    }).join('');

    strip.onclick = e => {
        const t = e.target.closest('.album-thumb');
        if (!t) return;
        const pos = +t.dataset.pos;
        if (pos === albumState.index) return;
        const it = albumState.items;
        [it[albumState.index], it[pos]] = [it[pos], it[albumState.index]];
        albumState.index = pos;
        albumPaint();
        saveAlbumOrder();
    };
}

function albumStep(dir) {
    const n = albumState.items.length;
    if (!n) return;
    albumState.index = (albumState.index + dir + n) % n;
    albumPaint();
}

function toggleAlbumEdit() {
    albumState.editMode = !albumState.editMode;
    document.getElementById('albumReorderBar').style.display = albumState.editMode ? 'block' : 'none';
    document.getElementById('albumEditBtn').innerHTML = albumState.editMode
        ? '<i class="fas fa-check"></i>' : '<i class="fas fa-shuffle"></i>';
    albumPaintStrip();
}

let _albumOrderTimer = null;
function saveAlbumOrder() {
    clearTimeout(_albumOrderTimer);
    _albumOrderTimer = setTimeout(async () => {
        const ids = albumState.items.map(x => x.id);
        try {
            const r = await fetch(`/api/album/${albumState.albumId}/reorder`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message_ids: ids })
            });
            const d = await r.json();
            if (d.success) {
                (d.order || []).forEach((o, i) => {
                    const it = albumState.items.find(x => x.id === o.id);
                    if (it) it.album_order = i;
                });
                loadChatsList();
            } else {
                showToast(d.error || 'Не удалось сохранить порядок');
            }
        } catch (e) { showToast('Ошибка сохранения порядка'); }
    }, 500);
}

function closeAlbumViewer() {
    const v = document.getElementById('albumViewer');
    if (v) v.style.display = 'none';
    document.body.style.overflow = '';
    albumState.albumId = null;
    albumState.editMode = false;
    document.getElementById('albumReorderBar').style.display = 'none';
    document.getElementById('albumEditBtn').innerHTML = '<i class="fas fa-shuffle"></i>';
    if (typeof refreshMessages === 'function') refreshMessages();
}

/* ======================= КРУЖКИ ======================= */
function renderVideoCircle(m) {
    const dur = m.media_duration ? Math.round(m.media_duration) : 0;
    const seen = m.views_count > 0;
    return `<div class="video-msg ${seen ? 'seen' : 'unseen'}" data-circle="${m.id}">
        <video src="/${m.file_path}" preload="metadata" playsinline muted loop
               onclick="toggleVideoCircle(${m.id}, this)"></video>
        <div class="vm-play"><i class="fas fa-play"></i></div>
        ${dur ? `<div class="vm-badge"><i class="far fa-clock"></i> 0:${String(dur).padStart(2, '0')}</div>` : ''}
    </div>`;
}

async function toggleVideoCircle(id, video) {
    const box = video?.closest('.video-msg');
    if (!box) return;
    if (video.paused) {
        document.querySelectorAll('.video-msg.playing').forEach(b => {
            if (b !== box) { b.classList.remove('playing'); b.querySelector('video')?.pause(); }
        });
        try { await video.play(); } catch (e) {}
        box.classList.add('playing');
        if (box.classList.contains('unseen')) {
            box.classList.remove('unseen');
            fetch(`/api/video_message/${id}/viewed`, { method: 'POST' }).catch(() => {});
        }
    } else {
        video.pause();
        box.classList.remove('playing');
    }
}

/* ======================= СТИКЕРЫ В ЛЕНТЕ ======================= */
function renderStickerMessage(m) {
    const cap = m.content ? `<div class="message-text" style="margin-top:6px;">${renderFormattedText(m.content)}</div>` : '';
    return `<div class="sticker-msg" data-sticker="${m.id}">
        <button class="st-save" title="Сохранить себе"
                onclick="event.stopPropagation();saveStickerFromMessage('${m.file_path}')">
            <i class="far fa-bookmark"></i></button>
        <img src="/${m.file_path}" alt="" onclick="stickerBounce(this)"></div>${cap}`;
}

function stickerBounce(img) {
    if (!img.animate) return;
    img.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
        { duration: 260, easing: 'ease-out' });
}

/* ======================= ИНТЕГРАЦИЯ ======================= */
function installAlbums() {
    if (typeof window.formatMessage !== 'function' || window.formatMessage.__v2) return;
    const origFmt = window.formatMessage;

    /* --- 1. Кружки и стикеры получают свою разметку --- */
    window.formatMessage = function (m) {
        if (m.file_type === 'video_circle' && m.file_path) {
            const out = m.sender_id == currentUser?.id;
            return `<div class="message ${out ? 'outgoing' : 'incoming'}" data-message-id="${m.id}">
                <div class="message-bubble" style="background:transparent;padding:2px;">
                    ${renderVideoCircle(m)}
                    ${m.content ? `<div class="message-text" style="margin-top:6px;">${renderFormattedText(m.content)}</div>` : ''}
                    <div class="message-meta" style="justify-content:flex-end;">
                        <span>${albumTime(m)}</span>
                        ${out ? (m.is_read ? '<i class="fas fa-check-double" style="font-size:8px;color:#53d769;"></i>'
                                          : '<i class="fas fa-check" style="font-size:8px;"></i>') : ''}
                    </div></div></div>`;
        }

        if (m.file_type === 'sticker' && m.file_path) {
            const out = m.sender_id == currentUser?.id;
            return `<div class="message ${out ? 'outgoing' : 'incoming'}" data-message-id="${m.id}"
                         oncontextmenu="showContextMenu(event, ${m.id}, '', this)">
                <div class="message-bubble" style="background:transparent;padding:2px;">
                    ${renderStickerMessage(m)}
                    <div class="message-meta" style="justify-content:flex-end;">
                        <span>${albumTime(m)}</span>
                        ${out ? '<i class="fas fa-check" style="font-size:8px;"></i>' : ''}
                    </div></div></div>`;
        }

        /* --- 2. Обычное сообщение: разметка + маркеры альбома --- */
        const html = origFmt.call(this, m);
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        const root = tmp.firstElementChild;
        if (!root) return html;

        // Безопасный рендер форматирования
        const textEl = root.querySelector('.message-text');
        if (textEl && m.content && typeof renderFormattedText === 'function') {
            textEl.innerHTML = renderFormattedText(m.content);
        }

        // Медиа кладём в .ma-cell-src, чтобы mergeAlbumCells собрал сетку
        const media = root.querySelector('.message-media');
        if (media) {
            const holder = document.createElement('div');
            holder.className = 'ma-cell-src';
            holder.innerHTML = media.outerHTML;
            media.replaceWith(holder);
        }

        if (m.album_id) {
            root.dataset.album = m.album_id;
            root.dataset.ord = m.album_order || 0;
            root.dataset.content = m.content || '';
            root.dataset.isRead = m.is_read ? '1' : '0';
        }
        return root.outerHTML;
    };
    window.formatMessage.__v2 = true;

    /* --- 3. Собираем альбомы после любой отрисовки --- */
    const wrap = (name) => {
        const orig = window[name];
        if (typeof orig !== 'function' || orig.__v2) return;
        const v2 = function () {
            const res = orig.apply(this, arguments);
            if (name === 'displayMessages') {
                mergeAlbumCells(document.getElementById('messagesArea'));
                if (typeof applyPremiumMarks === 'function') applyPremiumMarks(document);
            }
            return res;
        };
        v2.__v2 = true;
        window[name] = v2;
    };
    wrap('displayMessages');

    /* displayMessage вставляет по одному — объединяем микро-батчем */
    if (typeof window.displayMessage === 'function' && !window.displayMessage.__album) {
        const origOne = window.displayMessage;
        const v2one = function () {
            const res = origOne.apply(this, arguments);
            mergeAlbumCells(document.getElementById('messagesArea'));
            if (typeof applyPremiumMarks === 'function') applyPremiumMarks(document.getElementById('messagesArea'));
            return res;
        };
        v2one.__album = true;
        window.displayMessage = v2one;
    }

    /* --- 4. Клики по клеткам альбома и реакция на album_id из сокета --- */
    document.getElementById('messagesArea')?.addEventListener('click', e => {
        const cell = e.target.closest('.ma-cell');
        if (!cell) return;
        const grid = cell.closest('.media-album');
        const group = grid?.closest('.message[data-album-group]');
        const aid = group?.dataset.albumGroup;
        if (!aid) return;
        const idx = [...grid.querySelectorAll('.ma-cell')].indexOf(cell);
        openAlbum(+aid, idx);
    });

    /* --- 5. Клавиатура и свайпы --- */
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (document.getElementById('albumViewer')?.style.display === 'flex') closeAlbumViewer();
        else if (document.getElementById('vmOverlay')?.style.display === 'flex') closeVideoMessage();
        else if (typeof closeBottomSheet === 'function') closeBottomSheet();
    });

    let sx = 0, sy = 0;
    document.addEventListener('touchstart', e => {
        if (document.getElementById('albumViewer')?.style.display !== 'flex') return;
        sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', e => {
        if (document.getElementById('albumViewer')?.style.display !== 'flex') return;
        const dx = e.changedTouches[0].clientX - sx;
        const dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) albumStep(dx < 0 ? 1 : -1);
    }, { passive: true });
}

document.addEventListener('DOMContentLoaded', installAlbums);
