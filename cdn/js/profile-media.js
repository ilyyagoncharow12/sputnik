// ===== МЕДИА В ПРОФИЛЕ (v0.62.4) =====
// Раздел «Медиа» в профиле пользователя: фото, видео, аудио и файлы,
// которые человек отправил в личном чате. Фильтр по типу + просмотр
// крупно. Сервер отдаёт только медиа из личного чата с тем, кто смотрит.
(function () {
    'use strict';

    const KINDS = [
        { key: 'all', label: 'Все', icon: 'fa-photo-film' },
        { key: 'photo', label: 'Фото', icon: 'fa-image' },
        { key: 'video', label: 'Видео', icon: 'fa-video' },
        { key: 'audio', label: 'Аудио', icon: 'fa-music' },
        { key: 'file', label: 'Файлы', icon: 'fa-file' }
    ];

    const state = {
        userId: null,
        name: '',
        type: 'all',
        items: [],
        counts: {},
        total: 0,
        offset: 0,
        hasMore: false,
        loading: false,
        viewerIndex: -1
    };

    function esc(s) {
        return escapeHtml(String(s == null ? '' : s));
    }

    function fileSize(bytes) {
        const n = Number(bytes) || 0;
        if (!n) return '';
        if (n < 1024) return n + ' Б';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1).replace('.0', '') + ' КБ';
        return (n / (1024 * 1024)).toFixed(1).replace('.0', '') + ' МБ';
    }

    function timeAgo(value) {
        if (!value) return '';
        const d = new Date(String(value).replace(' ', 'T'));
        if (isNaN(d)) return '';
        const diff = (Date.now() - d.getTime()) / 1000;
        if (diff < 60) return 'только что';
        if (diff < 3600) return Math.floor(diff / 60) + ' мин назад';
        if (diff < 86400) return Math.floor(diff / 3600) + ' ч назад';
        return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
    }

    function isPhoto(item) {
        return (item.file_type || '').toLowerCase() === 'photo';
    }

    function isVideo(item) {
        return ['video', 'video_circle'].includes((item.file_type || '').toLowerCase());
    }

    // ---- загрузка ----
    function load(type, append) {
        if (!state.userId || state.loading) return;
        state.loading = true;
        const kind = type || state.type;
        const offset = append ? state.items.length : 0;
        paintSkeleton();

        fetch(`/api/get_user_media/${state.userId}?type=${encodeURIComponent(kind)}&limit=60&offset=${offset}`)
            .then(r => r.json().then(d => ({ status: r.status, data: d })))
            .then(res => {
                state.loading = false;
                if (res.status !== 200) {
                    state.items = [];
                    state.total = 0;
                    paintError(res.data && res.data.error ? res.data.error : 'Не удалось загрузить медиа');
                    return;
                }
                const d = res.data || {};
                state.type = d.type || kind;
                state.counts = d.counts || {};
                state.total = d.total || 0;
                state.hasMore = !!d.has_more;
                state.items = append ? state.items.concat(d.items || []) : (d.items || []);
                paint();
            })
            .catch(() => {
                state.loading = false;
                state.items = [];
                state.total = 0;
                paintError('Нет связи с сервером');
            });
    }

    // ---- отрисовка ----
    function shell(inner) {
        return `<div class="media-view">
                    <div class="media-head">
                        <button class="back-btn" onclick="closeModal('tempModal')"><i class="fas fa-arrow-left"></i></button>
                        <div class="media-title">
                            <div class="media-name">Медиа</div>
                            <div class="media-sub">${esc(state.name)}</div>
                        </div>
                    </div>
                    <div class="media-filters">
                        ${KINDS.map(k => {
                            const n = k.key === 'all' ? state.total : (state.counts[k.key] || 0);
                            return `<button type="button" class="media-filter ${state.type === k.key ? 'active' : ''}"
                                onclick="mediaGalleryFilter('${k.key}')">
                                <i class="fas ${k.icon}"></i> ${k.label}${n ? ` <span class="media-filter-count">${n}</span>` : ''}
                            </button>`;
                        }).join('')}
                    </div>
                    ${inner}
                </div>`;
    }

    function paintSkeleton() {
        const body = document.getElementById('tempModalBody');
        if (body) body.innerHTML = shell('<div class="media-loading"><i class="fas fa-spinner fa-spin"></i> Загрузка…</div>');
    }

    function paintError(text) {
        const body = document.getElementById('tempModalBody');
        if (body) body.innerHTML = shell(`<div class="media-empty"><i class="fas fa-ban"></i><div>${esc(text)}</div></div>`);
    }

    function itemCard(item, index) {
        if (isPhoto(item)) {
            return `<div class="media-cell photo" onclick="mediaGalleryOpen(${index})">
                        <img src="/${esc(item.file_path)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('broken'); this.remove();">
                        <div class="media-cell-time">${esc(timeAgo(item.created_at))}</div>
                    </div>`;
        }
        if (isVideo(item)) {
            const circle = (item.file_type || '').toLowerCase() === 'video_circle';
            return `<div class="media-cell video" onclick="mediaGalleryOpen(${index})">
                        <video src="/${esc(item.file_path)}" preload="metadata" muted></video>
                        <div class="media-cell-badge"><i class="fas fa-${circle ? 'circle-notch' : 'play'}"></i></div>
                        ${item.media_duration ? `<div class="media-cell-dur">${esc(item.media_duration)}</div>` : ''}
                    </div>`;
        }
        const isAudio = ['audio', 'voice'].includes((item.file_type || '').toLowerCase());
        return `<div class="media-row">
                    <div class="media-row-icon"><i class="fas fa-${isAudio ? 'music' : 'file'}"></i></div>
                    <div class="media-row-info">
                        <div class="media-row-name">${esc(item.file_name || 'Файл')}</div>
                        <div class="media-row-sub">${esc(fileSize(item.file_size))}${item.created_at ? ' · ' + esc(timeAgo(item.created_at)) : ''}</div>
                    </div>
                    <a class="media-row-dl" href="/${esc(item.file_path)}" download title="Скачать"><i class="fas fa-download"></i></a>
                </div>`;
    }

    function paint() {
        const body = document.getElementById('tempModalBody');
        if (!body) return;

        if (!state.items.length) {
            body.innerHTML = shell(`<div class="media-empty">
                    <i class="fas fa-images"></i>
                    <div>${state.total ? 'В этом типе ничего нет' : 'Медиа пока нет'}</div>
                    <div class="media-empty-hint">Показываются файлы, отправленные в личном чате</div>
                </div>`);
            return;
        }

        // Фото и видео — плиткой, аудио и файлы — списком. Индексы в
        // onclick считаются по state.items, поэтому фильтруем с сохранением.
        const visual = state.items.map((it, i) => ({ it, i })).filter(x => isPhoto(x.it) || isVideo(x.it));
        const plain = state.items.map((it, i) => ({ it, i })).filter(x => !isPhoto(x.it) && !isVideo(x.it));

        let inner = '';
        if (visual.length) inner += `<div class="media-grid">${visual.map(x => itemCard(x.it, x.i)).join('')}</div>`;
        if (plain.length) {
            if (state.type === 'all' && visual.length) inner += '<div class="media-subhead">файлы и аудио</div>';
            inner += `<div class="media-list">${plain.map(x => itemCard(x.it, x.i)).join('')}</div>`;
        }

        const more = state.hasMore
            ? `<button type="button" class="media-more" onclick="mediaGalleryMore()">Показать ещё</button>`
            : '';

        body.innerHTML = shell(inner + more);
    }

    // ---- просмотр крупно ----
    function paintViewer() {
        const old = document.getElementById('mediaViewerOverlay');
        if (old) old.remove();
        const item = state.items[state.viewerIndex];
        if (!item) return;

        const photo = isPhoto(item);
        const video = isVideo(item);
        if (!photo && !video) return;

        const order = visualIndexes();
        const pos = order.indexOf(state.viewerIndex);
        const nav = order.length > 1 && pos !== -1 ? `
            <button class="media-viewer-nav prev" onclick="mediaGalleryStep(-1)"><i class="fas fa-chevron-left"></i></button>
            <button class="media-viewer-nav next" onclick="mediaGalleryStep(1)"><i class="fas fa-chevron-right"></i></button>` : '';

        const media = photo
            ? `<img src="/${esc(item.file_path)}" alt="">`
            : `<video src="/${esc(item.file_path)}" controls autoplay playsinline
                   ${(item.file_type || '').toLowerCase() === 'video_circle' ? 'loop muted' : ''}></video>`;

        const el = document.createElement('div');
        el.id = 'mediaViewerOverlay';
        el.className = 'media-viewer-overlay';
        el.onclick = (e) => {
            if (e.target === el || e.target.closest('.media-viewer-close')) closeMediaViewer();
        };
        el.innerHTML = `
            <button class="media-viewer-close" onclick="closeMediaViewer()"><i class="fas fa-times"></i></button>
            ${nav}
            ${media}
            <div class="media-viewer-caption">
                <div class="media-viewer-name">${esc(item.file_name || (photo ? 'Фото' : 'Видео'))}</div>
                <div class="media-viewer-time">${esc(timeAgo(item.created_at))}</div>
            </div>`;
        document.body.appendChild(el);
    }

    function closeMediaViewer() {
        const el = document.getElementById('mediaViewerOverlay');
        if (el) {
            const v = el.querySelector('video');
            if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
            el.remove();
        }
        state.viewerIndex = -1;
    }

    // Переключение фото стрелками (в том числе с клавиатуры)
    document.addEventListener('keydown', (e) => {
        if (state.viewerIndex < 0) return;
        if (e.key === 'Escape') closeMediaViewer();
        else if (e.key === 'ArrowLeft') window.mediaGalleryStep(-1);
        else if (e.key === 'ArrowRight') window.mediaGalleryStep(1);
    });

    // ---- публичные действия (вызываются из разметки) ----
    function openUserMedia(userId, name) {
        state.userId = userId;
        state.name = name || '';
        state.type = 'all';
        state.items = [];
        state.counts = {};
        state.total = 0;
        state.hasMore = false;
        closeMediaViewer();
        paintSkeleton();
        if (typeof openModal === 'function') openModal('tempModal');
        load('all', false);
    }

    function filter(type) {
        closeMediaViewer();
        state.items = [];
        load(type, false);
    }

    function more() {
        load(state.type, true);
    }

    function openItem(index) {
        state.viewerIndex = index;
        paintViewer();
    }

    // Стрелки листают фото и видео — файлы в просмотре не показываем
    function visualIndexes() {
        return state.items
            .map((it, i) => (isPhoto(it) || isVideo(it)) ? i : -1)
            .filter(i => i >= 0);
    }

    function step(delta) {
        const order = visualIndexes();
        if (!order.length) return;
        let pos = order.indexOf(state.viewerIndex);
        if (pos === -1) {
            state.viewerIndex = delta > 0 ? order[0] : order[order.length - 1];
        } else {
            state.viewerIndex = order[(pos + delta + order.length) % order.length];
        }
        paintViewer();
    }

    window.openUserMedia = openUserMedia;
    window.mediaGalleryFilter = filter;
    window.mediaGalleryMore = more;
    window.mediaGalleryOpen = openItem;
    window.mediaGalleryStep = step;
    window.closeMediaViewer = closeMediaViewer;
})();
