/* =====================================================================
   MEDIA-EDITOR.JS — Спутник
   Полноэкранный редактор фото и видео ПЕРЕД отправкой (в стиле Telegram):
   обрезка (формат + поворот + отражение + зум + перетаскивание),
   стикеры и эмодзи, текст, рисование, подпись.
   По кнопке «Отправить» результат уходит в pendingFiles и отправляется
   обычным путём (sendFilesWithPreview), поэтому серверная часть не меняется.

   Зависимости: core.js (showToast, escapeHtml), emoji-data.js (EMOJI_FREQUENT).
   ===================================================================== */

const meState = {
    open: false,
    sending: false,
    items: [],
    index: 0,
    tool: 'crop',
    selected: null,
    textColor: '#ffffff',
    pendingText: '',
    textSize: 0.09,
    drawColor: '#ff453a',
    drawWidth: 0.014,
    stageW: 0,
    stageH: 0,
    dpr: 1,
    raf: null,
    domReady: false,
    stickersLoaded: false,
    stickers: [],
};

const ME_COLORS = ['#ffffff', '#000000', '#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#0a84ff', '#bf5af2'];

/* ======================= УТИЛИТЫ ======================= */

function meIsImage(file) {
    return /^image\//.test(file.type || '') ||
        /\.(jpe?g|png|gif|webp|bmp|heic|avif)$/i.test(file.name || '');
}

function meIsVideo(file) {
    return /^video\//.test(file.type || '') ||
        /\.(mp4|webm|mov|m4v|avi|mkv|3gp)$/i.test(file.name || '');
}

function meIsMedia(file) {
    return !!file && (meIsImage(file) || meIsVideo(file));
}

function meOutName(name, ext) {
    const base = (name || 'media').replace(/\.[^.]+$/, '') || 'media';
    return `${base}.${ext}`;
}

function meFmtTime(sec) {
    sec = Math.max(0, Number(sec) || 0);
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function meCloneEdit(item) {
    return JSON.parse(JSON.stringify({
        aspect: item.edit.aspect,
        rotate: item.edit.rotate,
        flipH: item.edit.flipH,
        flipV: item.edit.flipV,
        zoom: item.edit.zoom,
        offsetX: item.edit.offsetX,
        offsetY: item.edit.offsetY,
        layers: item.edit.layers.map(l => ({
            type: l.type, text: l.text, ch: l.ch, src: l.src,
            x: l.x, y: l.y, size: l.size, color: l.color,
        })),
        strokes: item.edit.strokes,
        trimStart: item.edit.trimStart,
        trimEnd: item.edit.trimEnd,
    }));
}

function mePushUndo(item) {
    if (!item) return;
    item.undo.push(meCloneEdit(item));
    if (item.undo.length > 40) item.undo.shift();
}

/* ======================= ЗАГРУЗКА МЕДИА ======================= */

function meLoadItem(file) {
    return new Promise(resolve => {
        const url = URL.createObjectURL(file);
        const edit = {
            aspect: null,
            rotate: 0,
            flipH: false,
            flipV: false,
            zoom: 1,
            offsetX: 0,
            offsetY: 0,
            layers: [],
            strokes: [],
            trimStart: 0,
            trimEnd: 0,
        };

        if (meIsVideo(file)) {
            const v = document.createElement('video');
            v.src = url;
            v.muted = true;
            v.playsInline = true;
            v.preload = 'auto';
            v.className = 'me-video-src';
            v.setAttribute('playsinline', '');
            document.body.appendChild(v);

            const fail = () => { try { v.remove(); } catch (e) {} resolve(null); };
            const timer = setTimeout(() => { if (!v.videoWidth) fail(); }, 8000);

            const finish = (dur) => {
                clearTimeout(timer);
                const d = isFinite(dur) && dur > 0 ? dur : 0;
                edit.trimEnd = d;
                try { v.currentTime = 0; } catch (e) {}
                resolve({
                    file, url, kind: 'video', src: v,
                    w: v.videoWidth || 640, h: v.videoHeight || 360,
                    dur: d,
                    edit, undo: [],
                });
            };

            v.onloadedmetadata = () => {
                if (isFinite(v.duration) && v.duration > 0) {
                    finish(v.duration);
                    return;
                }
                // WebM из MediaRecorder (и часть mp4) отдают duration = Infinity/0.
                // Трюк: перемотка далеко вперёд заставляет браузер посчитать длительность.
                let done = false;
                const onSeek = () => {
                    if (done) return;
                    done = true;
                    v.removeEventListener('timeupdate', onSeek);
                    finish(v.duration);
                };
                v.addEventListener('timeupdate', onSeek);
                try { v.currentTime = 1e101; } catch (e) { done = true; finish(0); }
                setTimeout(() => { if (!done) { done = true; finish(v.duration); } }, 2000);
            };
            v.onerror = () => { clearTimeout(timer); fail(); };
        } else {
            const img = new Image();
            img.onload = () => resolve({
                file, url, kind: 'image', src: img,
                w: img.naturalWidth || 640, h: img.naturalHeight || 480,
                dur: 0, edit, undo: [],
            });
            img.onerror = () => resolve(null);
            img.src = url;
        }
    });
}

/* ======================= DOM ======================= */

function meEnsureDom() {
    if (meState.domReady) return;
    meState.domReady = true;

    const wrap = document.createElement('div');
    wrap.className = 'me-overlay';
    wrap.id = 'meOverlay';
    wrap.innerHTML = `
        <div class="me-topbar">
            <button class="me-icon-btn" onclick="meClose()" title="Закрыть"><i class="fas fa-xmark"></i></button>
            <div class="me-title">
                <button class="me-nav" id="mePrev" onclick="mePrevItem()"><i class="fas fa-chevron-left"></i></button>
                <span class="me-counter" id="meCounter">1 / 1</span>
                <button class="me-nav" id="meNext" onclick="meNextItem()"><i class="fas fa-chevron-right"></i></button>
            </div>
        </div>
        <div class="me-body">
            <div class="me-stage-wrap" id="meStageWrap">
                <canvas class="me-canvas" id="meCanvas"></canvas>
                <canvas class="me-draw-canvas" id="meDrawCanvas"></canvas>
                <div class="me-layer" id="meLayer"></div>
                <div class="me-trim" id="meTrim">
                    <div class="me-trim-row">
                        <span>Начало</span>
                        <input type="range" id="meTrimStart" min="0" max="1" step="0.01" value="0">
                        <span id="meTrimStartLbl">0:00</span>
                    </div>
                    <div class="me-trim-row">
                        <span>Конец</span>
                        <input type="range" id="meTrimEnd" min="0" max="1" step="0.01" value="1">
                        <span id="meTrimEndLbl">0:00</span>
                    </div>
                </div>
                <div class="me-progress" id="meProgress">
                    <div class="me-progress-spinner"></div>
                    <div class="me-progress-text" id="meProgressText">Обработка…</div>
                    <div class="me-progress-bar"><div id="meProgressFill"></div></div>
                </div>
            </div>
        </div>
        <div class="me-toolbar">
            <div class="me-caption-row">
                <input type="text" id="meCaption" placeholder="Добавить подпись…" maxlength="1000" autocomplete="off">
            </div>
            <div class="me-selection-bar" id="meSelectionBar">
                <span id="meSelectionLabel">Элемент</span>
                <button onclick="meLayerSize(-1)" title="Меньше"><i class="fas fa-minus"></i></button>
                <button onclick="meLayerSize(1)" title="Больше"><i class="fas fa-plus"></i></button>
                <button class="danger" onclick="meDeleteLayer()" title="Удалить"><i class="fas fa-trash"></i></button>
            </div>
            <!-- Кнопки отправки и сброса — внизу, чтобы было удобно нажимать пальцем -->
            <div class="me-row" style="justify-content: space-between; align-items: center; margin-top: 6px;">
                <button class="me-icon-btn" id="meUndoBtn" onclick="meUndo()" title="Отменить" style="flex: 0 0 auto;"><i class="fas fa-rotate-left"></i></button>
                <button class="me-send-btn" id="meSendBtn" onclick="meSend()" title="Отправить" style="flex: 0 0 auto;"><i class="fas fa-paper-plane"></i></button>
            </div>
            <div class="me-tool-panel" id="meToolPanel"></div>
            <div class="me-tabs">
                <button class="me-tab" data-metool="crop" onclick="meSetTool('crop')"><i class="fas fa-crop-simple"></i><span>Обрезка</span></button>
                <button class="me-tab" data-metool="stickers" onclick="meSetTool('stickers')"><i class="fas fa-sticker-mood"></i><span>Стикеры</span></button>
                <button class="me-tab" data-metool="text" onclick="meSetTool('text')"><i class="fas fa-font"></i><span>Текст</span></button>
                <button class="me-tab" data-metool="draw" onclick="meSetTool('draw')"><i class="fas fa-pen"></i><span>Рисование</span></button>
            </div>
        </div>
    `;
    document.body.appendChild(wrap);

    const stage = document.getElementById('meStageWrap');
    stage.addEventListener('pointerdown', meStagePointerDown);
    stage.addEventListener('pointermove', meStagePointerMove);
    stage.addEventListener('pointerup', meStagePointerUp);
    stage.addEventListener('pointercancel', meStagePointerUp);
    stage.addEventListener('wheel', meStageWheel, { passive: false });
    stage.addEventListener('touchstart', meStageTouchStart, { passive: false });
    stage.addEventListener('touchmove', meStageTouchMove, { passive: false });
    stage.addEventListener('touchend', meStageTouchEnd, { passive: false });
    stage.addEventListener('touchcancel', meStageTouchEnd, { passive: false });

    const draw = document.getElementById('meDrawCanvas');
    draw.addEventListener('pointerdown', meDrawPointerDown);
    draw.addEventListener('pointermove', meDrawPointerMove);
    draw.addEventListener('pointerup', meDrawPointerUp);
    draw.addEventListener('pointercancel', meDrawPointerUp);

    document.getElementById('meTrimStart').addEventListener('input', meTrimChanged);
    document.getElementById('meTrimEnd').addEventListener('input', meTrimChanged);

    document.addEventListener('keydown', meKeyDown);
    window.addEventListener('resize', () => { if (meState.open) meLayout(); });
}

function meKeyDown(e) {
    if (!meState.open) return;
    if (e.key === 'Escape') { e.preventDefault(); meClose(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); meUndo(); }
}

/* ======================= ОТКРЫТИЕ / ЗАКРЫТИЕ ======================= */

async function openMediaEditor(files) {
    const list = Array.from(files || []).filter(meIsMedia);
    if (!list.length) return false;

    meState.sending = false;
    meState.selected = null;
    meState.tool = 'crop';
    meState.pendingText = '';
    meState.index = 0;
    meState.items = [];

    meEnsureDom();
    document.getElementById('meOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
    document.getElementById('meCaption').value = '';
    meShowProgress(true, 'Загрузка…', 0);

    for (const f of list) {
        const item = await meLoadItem(f);
        if (item) meState.items.push(item);
    }

    meShowProgress(false);

    if (!meState.items.length) {
        meClose();
        if (typeof showToast === 'function') showToast('Не удалось открыть файл');
        return false;
    }

    meState.open = true;
    meSetTool('crop');
    meSelectItem(0, true);
    return true;
}

function meClose() {
    if (meState.sending) return;
    meState.open = false;
    meStopLoop();
    meState.items.forEach(it => {
        if (it.kind === 'video' && it.src) {
            try { it.src.pause(); it.src.remove(); } catch (e) {}
        }
        try { URL.revokeObjectURL(it.url); } catch (e) {}
    });
    meState.items = [];
    meState.selected = null;
    const ov = document.getElementById('meOverlay');
    if (ov) ov.classList.remove('active');
    document.body.style.overflow = '';
}

function meSelectItem(i, force) {
    const items = meState.items;
    if (!items.length) return;
    i = Math.max(0, Math.min(items.length - 1, i));
    if (!force && i === meState.index) return;

    items.forEach(it => { if (it.kind === 'video' && it.src) { try { it.src.pause(); } catch (e) {} } });

    meState.index = i;
    meState.selected = null;
    const item = items[i];

    if (item.kind === 'video') {
        try {
            item.src.currentTime = item.edit.trimStart || 0;
            item.src.play().catch(() => {});
        } catch (e) {}
    }

    meLayout();
    meSyncTrim();
    meRenderPanel();
    meUpdateTopbar();
    meStartLoop();
}

function mePrevItem() { meSelectItem(meState.index - 1); }
function meNextItem() { meSelectItem(meState.index + 1); }

function meUpdateTopbar() {
    const n = meState.items.length;
    const counter = document.getElementById('meCounter');
    if (counter) counter.textContent = `${meState.index + 1} / ${n}`;
    const prev = document.getElementById('mePrev');
    const next = document.getElementById('meNext');
    if (prev) prev.disabled = meState.index <= 0;
    if (next) next.disabled = meState.index >= n - 1;
    if (prev) prev.style.visibility = n > 1 ? 'visible' : 'hidden';
    if (next) next.style.visibility = n > 1 ? 'visible' : 'hidden';
    const item = meState.items[meState.index];
    const undo = document.getElementById('meUndoBtn');
    if (undo) undo.disabled = !item || !item.undo.length;
}

/* ======================= ГЕОМЕТРИЯ И РЕНДЕР ======================= */

function meOutputAspect(item) {
    const e = item.edit;
    if (e.aspect) return e.aspect;
    const swap = (e.rotate % 180) !== 0;
    const w = swap ? item.h : item.w;
    const h = swap ? item.w : item.h;
    return (w > 0 && h > 0) ? (w / h) : 1;
}

function meLayout() {
    const item = meState.items[meState.index];
    if (!item) return;
    const body = document.querySelector('.me-body');
    if (!body) return;

    const availW = Math.max(120, body.clientWidth - 24);
    const availH = Math.max(120, body.clientHeight - 24);
    const asp = meOutputAspect(item) || 1;

    let w = availW;
    let h = w / asp;
    if (h > availH) { h = availH; w = h * asp; }

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    meState.stageW = w;
    meState.stageH = h;
    meState.dpr = dpr;

    const stage = document.getElementById('meStageWrap');
    if (stage) {
        stage.style.width = Math.round(w) + 'px';
        stage.style.height = Math.round(h) + 'px';
    }

    const c = document.getElementById('meCanvas');
    if (c) {
        c.width = Math.max(1, Math.round(w * dpr));
        c.height = Math.max(1, Math.round(h * dpr));
    }
    const d = document.getElementById('meDrawCanvas');
    if (d) {
        d.width = Math.max(1, Math.round(w * dpr));
        d.height = Math.max(1, Math.round(h * dpr));
    }

    meRenderFrame();
    meRenderStrokes();
    meSyncLayers();
}

function meDrawMedia(ctx, item, outW, outH, srcOverride) {
    const src = srcOverride || item.src;
    if (!src) return;
    const e = item.edit;

    const srcW = item.w || 1;
    const srcH = item.h || 1;
    const swap = (e.rotate % 180) !== 0;
    const rw = swap ? srcH : srcW;
    const rh = swap ? srcW : srcH;

    const cover = Math.max(outW / rw, outH / rh);
    const s = cover * (e.zoom || 1);

    ctx.save();
    ctx.translate(
        outW / 2 + (e.offsetX || 0) * outW,
        outH / 2 + (e.offsetY || 0) * outH
    );
    if (e.rotate) ctx.rotate(e.rotate * Math.PI / 180);
    ctx.scale(e.flipH ? -1 : 1, e.flipV ? -1 : 1);
    try {
        ctx.drawImage(src, -srcW * s / 2, -srcH * s / 2, srcW * s, srcH * s);
    } catch (err) { /* кадр ещё не готов */ }
    ctx.restore();
}

function meRenderFrame() {
    const item = meState.items[meState.index];
    const c = document.getElementById('meCanvas');
    if (!item || !c) return;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, c.width, c.height);
    meDrawMedia(ctx, item, c.width, c.height);
}

function meRenderStrokes() {
    const item = meState.items[meState.index];
    const c = document.getElementById('meDrawCanvas');
    if (!item || !c) return;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const min = Math.min(c.width, c.height);
    (item.edit.strokes || []).forEach(st => {
        if (!st.points || st.points.length < 2) return;
        ctx.save();
        ctx.strokeStyle = st.color;
        ctx.lineWidth = Math.max(1, st.width * min);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        st.points.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x * c.width, p.y * c.height);
            else ctx.lineTo(p.x * c.width, p.y * c.height);
        });
        ctx.stroke();
        ctx.restore();
    });
}

function meDrawOverlays(ctx, item, w, h) {
    const min = Math.min(w, h);
    const e = item.edit;

    (e.strokes || []).forEach(st => {
        if (!st.points || st.points.length < 2) return;
        ctx.save();
        ctx.strokeStyle = st.color;
        ctx.lineWidth = Math.max(1, st.width * min);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        st.points.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x * w, p.y * h);
            else ctx.lineTo(p.x * w, p.y * h);
        });
        ctx.stroke();
        ctx.restore();
    });

    (e.layers || []).forEach(l => {
        const x = l.x * w;
        const y = l.y * h;
        const fs = Math.max(6, l.size * min);
        if (l.type === 'text') {
            ctx.save();
            ctx.font = `700 ${fs}px "Segoe UI", Roboto, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = Math.max(2, fs / 9);
            ctx.strokeStyle = 'rgba(0,0,0,.65)';
            ctx.strokeText(l.text || '', x, y);
            ctx.fillStyle = l.color || '#fff';
            ctx.fillText(l.text || '', x, y);
            ctx.restore();
        } else if (l.type === 'emoji') {
            ctx.save();
            ctx.font = `${fs}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(l.ch || '', x, y);
            ctx.restore();
        } else if (l.type === 'sticker' && l.img) {
            const sw = fs;
            const ratio = (l.img.naturalHeight && l.img.naturalWidth)
                ? (l.img.naturalHeight / l.img.naturalWidth) : 1;
            const sh = sw * ratio;
            try { ctx.drawImage(l.img, x - sw / 2, y - sh / 2, sw, sh); } catch (err) {}
        }
    });
}

/* ======================= СЛОИ (DOM) ======================= */

function meSyncLayers() {
    const box = document.getElementById('meLayer');
    const item = meState.items[meState.index];
    if (!box || !item) return;
    box.innerHTML = '';

    const min = Math.min(meState.stageW, meState.stageH);

    item.edit.layers.forEach(layer => {
        const el = document.createElement('div');
        el.className = 'me-layer-item';
        el.dataset.kind = layer.type;

        if (layer.type === 'text') {
            el.classList.add('me-text');
            el.textContent = layer.text || '';
            el.style.color = layer.color || '#fff';
            el.style.fontSize = Math.max(10, layer.size * min) + 'px';
        } else if (layer.type === 'emoji') {
            el.classList.add('me-emoji');
            el.textContent = layer.ch || '';
            el.style.fontSize = Math.max(12, layer.size * min) + 'px';
        } else if (layer.type === 'sticker') {
            el.classList.add('me-sticker');
            const img = document.createElement('img');
            img.src = layer.src;
            img.draggable = false;
            const sz = Math.max(16, layer.size * min);
            img.style.width = sz + 'px';
            img.style.height = 'auto';
            el.appendChild(img);
        }

        el.style.left = (layer.x * 100) + '%';
        el.style.top = (layer.y * 100) + '%';

        if (meState.selected === layer) el.classList.add('selected');

        el.addEventListener('pointerdown', ev => meLayerPointerDown(ev, layer, el));
        box.appendChild(el);
    });

    meRenderSelectionBar();
}

function meLayerPointerDown(e, layer, el) {
    if (meState.tool === 'draw') return;
    e.preventDefault();
    e.stopPropagation();
    meState.selected = layer;
    meState.dragging = {
        layer, el,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        baseX: layer.x,
        baseY: layer.y,
        moved: false,
    };
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
    // Не пересобираем DOM (иначе сломается pointer capture) —
    // только подсвечиваем выбранный слой.
    meUpdateSelectionClasses();
}

function meUpdateSelectionClasses() {
    const box = document.getElementById('meLayer');
    const item = meState.items[meState.index];
    if (!box || !item) return;
    const els = box.querySelectorAll('.me-layer-item');
    els.forEach((el, i) => {
        el.classList.toggle('selected', item.edit.layers[i] === meState.selected);
    });
    meRenderSelectionBar();
}

function meStagePointerDown(e) {
    if (meState.tool === 'draw') return;
    if (e.target.closest('.me-layer-item')) return;

    meState.panning = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        baseX: meState.items[meState.index].edit.offsetX,
        baseY: meState.items[meState.index].edit.offsetY,
        pushed: false,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
}

function meStagePointerMove(e) {
    const item = meState.items[meState.index];
    if (!item) return;

    const drag = meState.dragging;
    if (drag && drag.pointerId === e.pointerId) {
        const dx = (e.clientX - drag.startX) / Math.max(1, meState.stageW);
        const dy = (e.clientY - drag.startY) / Math.max(1, meState.stageH);
        if (Math.abs(dx) + Math.abs(dy) > 0.005) drag.moved = true;
        drag.layer.x = Math.max(-0.1, Math.min(1.1, drag.baseX + dx));
        drag.layer.y = Math.max(-0.1, Math.min(1.1, drag.baseY + dy));
        drag.el.style.left = (drag.layer.x * 100) + '%';
        drag.el.style.top = (drag.layer.y * 100) + '%';
        return;
    }

    const pan = meState.panning;
    if (pan && pan.pointerId === e.pointerId) {
        if (!pan.pushed) { mePushUndo(item); pan.pushed = true; }
        const dx = (e.clientX - pan.startX) / Math.max(1, meState.stageW);
        const dy = (e.clientY - pan.startY) / Math.max(1, meState.stageH);
        item.edit.offsetX = Math.max(-1.5, Math.min(1.5, pan.baseX + dx));
        item.edit.offsetY = Math.max(-1.5, Math.min(1.5, pan.baseY + dy));
        meRenderFrame();
    }
}

function meStagePointerUp(e) {
    if (meState.dragging && meState.dragging.pointerId === e.pointerId) {
        const d = meState.dragging;
        meState.dragging = null;
        if (d.moved) {
            const item = meState.items[meState.index];
            mePushUndo(item);
            meUpdateTopbar();
        }
    }
    if (meState.panning && meState.panning.pointerId === e.pointerId) {
        meState.panning = null;
        meUpdateTopbar();
    }
}

function meStageWheel(e) {
    if (!meState.open) return;
    const item = meState.items[meState.index];
    if (!item) return;
    e.preventDefault();
    mePushUndo(item);
    const dir = e.deltaY > 0 ? -1 : 1;
    item.edit.zoom = Math.max(1, Math.min(4, (item.edit.zoom || 1) + dir * 0.08));
    meRenderFrame();
    meSyncZoom();
    meUpdateTopbar();
}

/* ======================= РИСОВАНИЕ ======================= */

function meDrawPointerDown(e) {
    if (meState.tool !== 'draw') return;
    const item = meState.items[meState.index];
    if (!item) return;
    e.preventDefault();
    mePushUndo(item);
    const r = e.currentTarget.getBoundingClientRect();
    const p = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    const stroke = { color: meState.drawColor, width: meState.drawWidth, points: [p] };
    item.edit.strokes.push(stroke);
    meState.drawing = { pointerId: e.pointerId, stroke, rect: r };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    meRenderStrokes();
    meUpdateTopbar();
}

function meDrawPointerMove(e) {
    const d = meState.drawing;
    if (!d || d.pointerId !== e.pointerId) return;
    const r = d.rect;
    const p = {
        x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
        y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
    d.stroke.points.push(p);
    meRenderStrokes();
}

function meDrawPointerUp(e) {
    if (meState.drawing && meState.drawing.pointerId === e.pointerId) {
        meState.drawing = null;
        meUpdateTopbar();
    }
}

/* ======================= ИНСТРУМЕНТЫ ======================= */

function meSetTool(tool) {
    meState.tool = tool;
    if (tool !== 'text' && tool !== 'stickers') meState.selected = null;
    document.querySelectorAll('.me-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.metool === tool);
    });
    const draw = document.getElementById('meDrawCanvas');
    if (draw) draw.style.pointerEvents = tool === 'draw' ? 'auto' : 'none';
    const stage = document.getElementById('meStageWrap');
    if (stage) {
        stage.style.cursor = tool === 'draw' ? 'crosshair' : 'grab';
        stage.classList.toggle('me-draw-mode', tool === 'draw');
    }
    meRenderPanel();
    meSyncLayers();
}

function meRenderPanel() {
    const panel = document.getElementById('meToolPanel');
    const item = meState.items[meState.index];
    if (!panel || !item) return;

    if (meState.tool === 'crop') {
        const asp = item.edit.aspect;
        const isVideo = item.kind === 'video';
        panel.innerHTML = `
            <div class="me-row">
                <button class="me-chip ${!asp ? 'active' : ''}" onclick="meSetAspect(null)">Оригинал</button>
                <button class="me-chip ${asp === 1 ? 'active' : ''}" onclick="meSetAspect(1)">1:1</button>
                <button class="me-chip ${asp === 0.8 ? 'active' : ''}" onclick="meSetAspect(0.8)">4:5</button>
                <button class="me-chip ${Math.abs((asp || 0) - 16 / 9) < 0.001 ? 'active' : ''}" onclick="meSetAspect(${16 / 9})">16:9</button>
                <button class="me-chip ${Math.abs((asp || 0) - 9 / 16) < 0.001 ? 'active' : ''}" onclick="meSetAspect(${9 / 16})">9:16</button>
            </div>
            <div class="me-row">
                <button class="me-chip" onclick="meRotate()"><i class="fas fa-rotate-right"></i> Повернуть</button>
                <button class="me-chip ${item.edit.flipH ? 'active' : ''}" onclick="meFlip()"><i class="fas fa-left-right"></i> Отразить</button>
                <button class="me-chip" onclick="meResetCrop()"><i class="fas fa-arrow-rotate-left"></i> Сброс</button>
            </div>
            <div class="me-row me-zoom-row">
                <i class="fas fa-search-minus"></i>
                <input type="range" id="meZoom" min="1" max="4" step="0.01" value="${item.edit.zoom || 1}" oninput="meSetZoom(this.value)">
                <i class="fas fa-search-plus"></i>
            </div>
            ${isVideo ? '<div class="me-section-title">Обрезка видео — ползунки на кадре</div>' : ''}
        `;
    } else if (meState.tool === 'text') {
        const curSize = (meState.selected && meState.selected.type === 'text') ? (meState.selected.size || 0.09) : 0.09;
        panel.innerHTML = `
            <div class="me-row">
                <input class="me-input" id="meTextInput" placeholder="Введите текст" maxlength="120" autocomplete="off">
                <button class="me-chip primary" onclick="meAddText()">${meState.selected && meState.selected.type === 'text' ? 'Изменить' : 'Добавить'}</button>
            </div>
            <div class="me-row">
                <div class="me-section-title">Размер текста</div>
                <input type="range" id="meTextSize" min="0.04" max="0.3" step="0.01" value="${curSize}" oninput="meSetTextSize(this.value)">
                <span id="meTextSizeLbl">${Math.round(curSize * 100)}%</span>
            </div>
            <div class="me-row">
                <div class="me-swatches">
                    ${ME_COLORS.map(c => `<button class="me-swatch ${meState.textColor === c ? 'active' : ''}" style="background:${c}" onclick="mePickTextColor('${c}')"></button>`).join('')}
                </div>
            </div>
        `;
        const inp = document.getElementById('meTextInput');
        if (inp) {
            if (meState.selected && meState.selected.type === 'text') {
                inp.value = meState.selected.text || '';
                meState.textColor = meState.selected.color || meState.textColor;
            } else {
                inp.value = meState.pendingText || '';
            }
            setTimeout(() => { if (meState.tool === 'text') inp.focus({ preventScroll: true }); }, 50);
            inp.addEventListener('input', () => { meState.pendingText = inp.value; });
            inp.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); meAddText(); }
            });
        }
    } else if (meState.tool === 'draw') {
        panel.innerHTML = `
            <div class="me-row">
                <div class="me-swatches">
                    ${ME_COLORS.map(c => `<button class="me-swatch ${meState.drawColor === c ? 'active' : ''}" style="background:${c}" onclick="mePickDrawColor('${c}')"></button>`).join('')}
                </div>
            </div>
            <div class="me-row">
                <button class="me-chip ${meState.drawWidth === 0.006 ? 'active' : ''}" onclick="mePickDrawWidth(0.006)">Тонкая</button>
                <button class="me-chip ${meState.drawWidth === 0.014 ? 'active' : ''}" onclick="mePickDrawWidth(0.014)">Средняя</button>
                <button class="me-chip ${meState.drawWidth === 0.03 ? 'active' : ''}" onclick="mePickDrawWidth(0.03)">Толстая</button>
                <button class="me-chip danger" onclick="meClearDraw()"><i class="fas fa-trash"></i> Очистить</button>
            </div>
        `;
    } else if (meState.tool === 'stickers') {
        panel.innerHTML = `
            <div class="me-section-title">Мои стикеры</div>
            <div class="me-sticker-grid" id="meStickerGrid"><div class="me-sticker-empty">Загрузка…</div></div>
            <div class="me-section-title">Эмодзи</div>
            <div class="me-emoji-grid" id="meEmojiGrid"></div>
        `;
        meRenderEmojiGrid();
        meLoadStickersForEditor();
    }
}

function meRenderEmojiGrid() {
    const grid = document.getElementById('meEmojiGrid');
    if (!grid) return;
    const list = (window.EMOJI_FREQUENT || []).slice(0, 200);
    grid.innerHTML = list.map(c => `<button type="button" data-emoji="${c}">${c}</button>`).join('');
    grid.onclick = e => {
        const b = e.target.closest('button[data-emoji]');
        if (b) meAddEmoji(b.dataset.emoji);
    };
}

async function meLoadStickersForEditor() {
    const grid = document.getElementById('meStickerGrid');
    if (!grid) return;
    if (!meState.stickersLoaded) {
        try {
            const r = await fetch('/api/stickers');
            const d = await r.json();
            meState.stickers = d.stickers || [];
            meState.stickersLoaded = true;
        } catch (e) {
            meState.stickers = [];
        }
    }
    if (!document.getElementById('meStickerGrid')) return;
    if (!meState.stickers.length) {
        grid.innerHTML = '<div class="me-sticker-empty">Стикеров пока нет — создайте их в панели эмодзи.</div>';
        return;
    }
    grid.innerHTML = meState.stickers.map(s =>
        `<button type="button" data-path="${escapeHtml(s.file_path)}" title="${escapeHtml(s.caption || 'Стикер')}">
            <img src="/${s.file_path}" alt="" loading="lazy">
         </button>`).join('');
    grid.onclick = e => {
        const b = e.target.closest('button[data-path]');
        if (b) meAddSticker(b.dataset.path);
    };
}

function meSetAspect(a) {
    const item = meState.items[meState.index];
    if (!item) return;
    mePushUndo(item);
    item.edit.aspect = a;
    meLayout();
    meRenderPanel();
    meUpdateTopbar();
}

function meRotate() {
    const item = meState.items[meState.index];
    if (!item) return;
    mePushUndo(item);
    item.edit.rotate = ((item.edit.rotate || 0) + 90) % 360;
    item.edit.offsetX = 0;
    item.edit.offsetY = 0;
    meLayout();
    meRenderPanel();
    meUpdateTopbar();
}

function meFlip() {
    const item = meState.items[meState.index];
    if (!item) return;
    mePushUndo(item);
    item.edit.flipH = !item.edit.flipH;
    meRenderFrame();
    meRenderPanel();
    meUpdateTopbar();
}

function meResetCrop() {
    const item = meState.items[meState.index];
    if (!item) return;
    mePushUndo(item);
    item.edit.aspect = null;
    item.edit.rotate = 0;
    item.edit.flipH = false;
    item.edit.flipV = false;
    item.edit.zoom = 1;
    item.edit.offsetX = 0;
    item.edit.offsetY = 0;
    meLayout();
    meRenderPanel();
    meUpdateTopbar();
}

function meSetZoom(val) {
    const item = meState.items[meState.index];
    if (!item) return;
    item.edit.zoom = Math.max(1, Math.min(4, Number(val) || 1));
    meRenderFrame();
}

function meSyncZoom() {
    const z = document.getElementById('meZoom');
    const item = meState.items[meState.index];
    if (z && item) z.value = item.edit.zoom || 1;
}

function mePickTextColor(c) {
    meState.textColor = c;
    const item = meState.items[meState.index];
    if (item && meState.selected && meState.selected.type === 'text') {
        mePushUndo(item);
        meState.selected.color = c;
        meLayout();
        meUpdateTopbar();
    }
    // Обновляем только подсветку кружков, не пересобирая панель
    // (иначе пропадёт уже введённый текст в поле).
    document.querySelectorAll('#meToolPanel .me-swatch').forEach(el => {
        el.classList.toggle('active', el.style.background === c ||
            el.getAttribute('style').includes(c));
    });
}

function meSetTextSize(val) {
    const size = parseFloat(val);
    const lbl = document.getElementById('meTextSizeLbl');
    if (lbl) lbl.textContent = Math.round(size * 100) + '%';
    const item = meState.items[meState.index];
    if (!item) return;
    if (meState.selected && meState.selected.type === 'text') {
        mePushUndo(item);
        meState.selected.size = size;
        meLayout();
        meUpdateTopbar();
    }
    meState.textSize = size;
}

function meAddText() {
    const item = meState.items[meState.index];
    const inp = document.getElementById('meTextInput');
    if (!item || !inp) return;
    const text = inp.value.trim();
    if (!text) { if (typeof showToast === 'function') showToast('Введите текст'); return; }

    mePushUndo(item);
    if (meState.selected && meState.selected.type === 'text') {
        meState.selected.text = text;
        meState.selected.color = meState.textColor;
    } else {
        const layer = {
            type: 'text', text,
            x: 0.5, y: 0.5,
            size: meState.textSize || 0.09,
            color: meState.textColor,
        };
        item.edit.layers.push(layer);
        meState.selected = layer;
    }
    meState.pendingText = '';
    inp.value = '';
    meLayout();
    meRenderPanel();
    meUpdateTopbar();
}

function meAddEmoji(ch) {
    const item = meState.items[meState.index];
    if (!item || !ch) return;
    mePushUndo(item);
    const layer = { type: 'emoji', ch, x: 0.5, y: 0.5, size: 0.16 };
    item.edit.layers.push(layer);
    meState.selected = layer;
    meLayout();
    meUpdateTopbar();
}

function meAddSticker(path) {
    const item = meState.items[meState.index];
    if (!item || !path) return;
    mePushUndo(item);
    const layer = { type: 'sticker', src: '/' + path, x: 0.5, y: 0.5, size: 0.28 };
    const img = new Image();
    img.onload = () => {
        layer.img = img;
        if (meState.items[meState.index] === item) meLayout();
    };
    img.src = '/' + path;
    item.edit.layers.push(layer);
    meState.selected = layer;
    meLayout();
    meUpdateTopbar();
}

function mePickDrawColor(c) {
    meState.drawColor = c;
    meRenderPanel();
}

function mePickDrawWidth(w) {
    meState.drawWidth = w;
    meRenderPanel();
}

function meClearDraw() {
    const item = meState.items[meState.index];
    if (!item) return;
    mePushUndo(item);
    item.edit.strokes = [];
    meRenderStrokes();
    meUpdateTopbar();
}

function meLayerSize(dir) {
    const item = meState.items[meState.index];
    const l = meState.selected;
    if (!item || !l) return;
    mePushUndo(item);
    l.size = Math.max(0.02, Math.min(0.6, (l.size || 0.1) + dir * 0.02));
    meLayout();
    meUpdateTopbar();
}

function meDeleteLayer() {
    const item = meState.items[meState.index];
    const l = meState.selected;
    if (!item || !l) return;
    mePushUndo(item);
    item.edit.layers = item.edit.layers.filter(x => x !== l);
    meState.selected = null;
    meLayout();
    meRenderPanel();
    meUpdateTopbar();
}

function meRenderSelectionBar() {
    const bar = document.getElementById('meSelectionBar');
    const label = document.getElementById('meSelectionLabel');
    if (!bar) return;
    const l = meState.selected;
    if (!l) { bar.classList.remove('active'); return; }
    bar.classList.add('active');
    if (label) {
        label.textContent = l.type === 'text' ? (l.text || 'Текст')
            : l.type === 'emoji' ? `Эмодзи ${l.ch || ''}`
            : 'Стикер';
    }
}

function meUndo() {
    const item = meState.items[meState.index];
    if (!item || !item.undo.length) return;
    const snap = item.undo.pop();
    item.edit = snap;
    meState.selected = null;
    meLayout();
    meSyncTrim();
    meRenderPanel();
    meUpdateTopbar();
}

/* ======================= ВИДЕО: ОБРЕЗКА ======================= */

function meSyncTrim() {
    const item = meState.items[meState.index];
    const trim = document.getElementById('meTrim');
    if (!item || !trim) return;
    const isVideo = item.kind === 'video' && item.dur > 0;
    trim.classList.toggle('active', isVideo);
    if (!isVideo) return;

    const dur = item.dur;
    const s = document.getElementById('meTrimStart');
    const e = document.getElementById('meTrimEnd');
    if (s) { s.min = 0; s.max = dur; s.step = 0.05; s.value = item.edit.trimStart || 0; }
    if (e) { e.min = 0; e.max = dur; e.step = 0.05; e.value = item.edit.trimEnd || dur; }
    meUpdateTrimLabels();
}

function meUpdateTrimLabels() {
    const item = meState.items[meState.index];
    if (!item) return;
    const a = document.getElementById('meTrimStartLbl');
    const b = document.getElementById('meTrimEndLbl');
    if (a) a.textContent = meFmtTime(item.edit.trimStart || 0);
    if (b) b.textContent = meFmtTime(item.edit.trimEnd || 0);
}

function meTrimChanged(e) {
    const item = meState.items[meState.index];
    if (!item || item.kind !== 'video') return;
    const s = document.getElementById('meTrimStart');
    const en = document.getElementById('meTrimEnd');
    let start = Number(s.value);
    let end = Number(en.value);

    if (e && e.target && e.target.id === 'meTrimStart') {
        if (start > end - 0.3) { start = Math.max(0, end - 0.3); s.value = start; }
    } else {
        if (end < start + 0.3) { end = Math.min(item.dur, start + 0.3); en.value = end; }
    }

    mePushUndo(item);
    item.edit.trimStart = start;
    item.edit.trimEnd = end;
    meUpdateTrimLabels();
    meUpdateTopbar();

    try {
        if (item.src.readyState >= 1) {
            const t = e && e.target && e.target.id === 'meTrimEnd' ? end : start;
            item.src.currentTime = Math.max(0, Math.min(t, (item.dur || t) - 0.05));
        }
    } catch (err) {}
}

/* ======================= ЦИКЛ ПРОСМОТРА ВИДЕО ======================= */

function meStartLoop() {
    meStopLoop();
    const tick = () => {
        if (!meState.open) return;
        const item = meState.items[meState.index];
        if (!item) return;
        if (item.kind === 'video') {
            const v = item.src;
            const end = item.edit.trimEnd || item.dur || 0;
            if (end && v.currentTime >= end - 0.03) {
                try { v.currentTime = item.edit.trimStart || 0; } catch (e) {}
            }
            meRenderFrame();
            meState.raf = requestAnimationFrame(tick);
        } else {
            meState.raf = null;
        }
    };
    meState.raf = requestAnimationFrame(tick);
}

function meStopLoop() {
    if (meState.raf) cancelAnimationFrame(meState.raf);
    meState.raf = null;
}

/* ======================= ЭКСПОРТ ======================= */

function meExportSize(item) {
    const asp = meOutputAspect(item) || 1;
    const longSide = Math.min(1920, Math.max(item.w || 1280, item.h || 720));
    let w, h;
    if (asp >= 1) { w = longSide; h = Math.round(longSide / asp); }
    else { h = longSide; w = Math.round(longSide * asp); }
    return { w: Math.max(2, w), h: Math.max(2, h) };
}

function meIsPristine(item) {
    const e = item.edit;
    if (e.layers.length || e.strokes.length) return false;
    if (e.rotate || e.flipH || e.flipV) return false;
    if (Math.abs((e.zoom || 1) - 1) > 0.001) return false;
    if (Math.abs(e.offsetX || 0) > 0.0001 || Math.abs(e.offsetY || 0) > 0.0001) return false;
    if (e.aspect) return false;
    if (item.kind === 'video') {
        if ((e.trimStart || 0) > 0.05) return false;
        if (Math.abs((e.trimEnd || 0) - (item.dur || 0)) > 0.1) return false;
    }
    return true;
}

async function meExportImage(item) {
    if (meIsPristine(item)) return item.file;
    const { w, h } = meExportSize(item);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    meDrawMedia(ctx, item, w, h);
    meDrawOverlays(ctx, item, w, h);

    const isPng = /png/i.test(item.file.type || '') || /\.png$/i.test(item.file.name || '');
    const type = isPng ? 'image/png' : 'image/jpeg';
    const blob = await new Promise(res => canvas.toBlob(res, type, 0.92));
    if (!blob) return item.file;
    return new File([blob], meOutName(item.file.name, isPng ? 'png' : 'jpg'), { type });
}

async function meExportVideo(item, onProgress) {
    if (meIsPristine(item)) return item.file;
    if (!window.MediaRecorder) throw new Error('MediaRecorder недоступен');

    const start = Math.max(0, item.edit.trimStart || 0);
    const end = Math.max(start + 0.2, item.edit.trimEnd || item.dur || 0);
    if (!isFinite(end) || end <= start) throw new Error('Некорректный отрезок');

    const { w, h } = meExportSize(item);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    if (!canvas.captureStream) throw new Error('captureStream недоступен');
    const stream = canvas.captureStream(30);

    const v = document.createElement('video');
    v.src = item.url;
    v.playsInline = true;
    v.preload = 'auto';
    v.className = 'me-video-src';
    document.body.appendChild(v);

    await new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('Видео не загрузилось')), 10000);
        v.onloadedmetadata = () => { clearTimeout(t); res(); };
        v.onerror = () => { clearTimeout(t); rej(new Error('Ошибка видео')); };
    });

    await new Promise(res => {
        try {
            v.currentTime = Math.min(start, Math.max(0, (v.duration || start) - 0.05));
        } catch (e) {}
        v.onseeked = () => res();
        setTimeout(res, 1000);
    });

    let audioCtx = null;
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
            audioCtx = new AC();
            const srcNode = audioCtx.createMediaElementSource(v);
            const dest = audioCtx.createMediaStreamDestination();
            srcNode.connect(dest);
            dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
            if (audioCtx.state === 'suspended') await audioCtx.resume();
        }
    } catch (e) {
        audioCtx = null;
    }

    const candidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
    ];
    let mime = '';
    for (const m of candidates) {
        try { if (MediaRecorder.isTypeSupported(m)) { mime = m; break; } } catch (e) {}
    }

    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4000000 } : undefined);
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise(res => { rec.onstop = res; });

    let raf = null;
    let finished = false;
    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        if (raf) cancelAnimationFrame(raf);
        raf = null;
        try { v.pause(); } catch (e) {}
        try { v.remove(); } catch (e) {}
        try { if (audioCtx && audioCtx.state !== 'closed') audioCtx.close(); } catch (e) {}
    };
    const finish = () => {
        if (finished) return;
        finished = true;
        try { rec.stop(); } catch (e) {}
        cleanup();
    };

    rec.start(200);
    try { await v.play(); } catch (e) { finish(); }
    const hardStop = setTimeout(finish, Math.max(2000, (end - start) * 1000 + 8000));

    const step = () => {
        if (finished) return;
        if (v.currentTime >= end - 0.02 || v.ended) { finish(); return; }
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        meDrawMedia(ctx, item, w, h, v);
        meDrawOverlays(ctx, item, w, h);
        if (onProgress) onProgress(Math.min(1, Math.max(0, (v.currentTime - start) / Math.max(0.2, end - start))));
        raf = requestAnimationFrame(step);
    };
    step();

    await stopped;
    clearTimeout(hardStop);
    cleanup();

    if (!chunks.length) throw new Error('Пустая запись');
    const blob = new Blob(chunks, { type: (mime || 'video/webm').split(';')[0] });
    if (!blob.size) throw new Error('Пустая запись');

    const type = blob.type || 'video/webm';
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    return new File([blob], meOutName(item.file.name, ext), { type });
}

/* ======================= ПРОГРЕСС ======================= */

function meShowProgress(show, text, ratio) {
    const box = document.getElementById('meProgress');
    if (!box) return;
    box.classList.toggle('active', !!show);
    const t = document.getElementById('meProgressText');
    if (t && text) t.textContent = text;
    const f = document.getElementById('meProgressFill');
    if (f) {
        if (typeof ratio === 'number' && isFinite(ratio)) {
            f.style.width = Math.round(Math.max(0, Math.min(1, ratio)) * 100) + '%';
        } else {
            f.style.width = '0%';
        }
    }
}

/* ======================= ОТПРАВКА ======================= */

async function meSend() {
    if (meState.sending || !meState.open) return;
    const items = meState.items.slice();
    if (!items.length) return;

    const captionEl = document.getElementById('meCaption');
    const caption = captionEl ? captionEl.value.trim() : '';

    meState.sending = true;
    const btn = document.getElementById('meSendBtn');
    if (btn) btn.disabled = true;
    meShowProgress(true, 'Подготовка…', 0);

    const out = [];
    try {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            let file;
            if (item.kind === 'image') {
                meShowProgress(true, `Обработка фото ${i + 1} из ${items.length}…`, 0);
                file = await meExportImage(item);
            } else {
                meShowProgress(true, `Обработка видео ${i + 1} из ${items.length}…`, 0);
                try {
                    file = await meExportVideo(item, p =>
                        meShowProgress(true, `Обработка видео ${i + 1} из ${items.length}…`, p));
                } catch (e) {
                    console.warn('Видео не удалось обработать, отправляем оригинал:', e);
                    file = item.file;
                }
            }
            out.push(file);
        }

        // Передаём результат обычной отправке файлов (она умеет альбомы)
        try { pendingFiles = out; } catch (e) { window.pendingFiles = out; }

        let cap = document.getElementById('previewCaption');
        if (!cap) {
            cap = document.createElement('textarea');
            cap.id = 'previewCaption';
            cap.style.display = 'none';
            document.body.appendChild(cap);
        }
        cap.value = caption;

        meShowProgress(false);
        meState.sending = false;
        if (btn) btn.disabled = false;
        meClose();

        if (typeof sendFilesWithPreview === 'function') {
            sendFilesWithPreview();
        } else if (typeof showToast === 'function') {
            showToast('Не удалось отправить файлы');
        }
    } catch (e) {
        console.error('Media editor export error:', e);
        if (typeof showToast === 'function') showToast('Не удалось обработать файл');
        meState.sending = false;
        if (btn) btn.disabled = false;
        meShowProgress(false);
    }
}

/* Экспорт для тестов/консоли */
window.openMediaEditor = openMediaEditor;
