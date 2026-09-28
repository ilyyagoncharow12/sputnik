/* =====================================================================
   FORMATTING.JS — Спутник v0.58.0
   Форматирование текста v2: безопасный рендер разметки + панель,
   которая появляется при выделении текста в поле ввода.

   Храним разметку ТЕГАМИ прямо в тексте сообщения:
     <b>жирный</b>  <i>курсив</i>  <u>подчёркнутый</u>  <s>зачёркнутый</s>
     <code>код</code>  <monoall>весь текст</monoall>  <spoiler>спойлер</spoiler>
     <quote>цитата</quote>
   Плюс поддерживаются «ручные» markdown-маркеры с низким риском ложного
   срабатывания: **жирный**, ~~зачёркнутый~~, `код`.
   Одиночная звёздочка (*курсив*) НЕ разбирается намеренно — иначе «2*3*4»
   превратилось бы в курсив. Для курсива/подчёркивания пользуйтесь панелью.

   Безопасность: текст пользователя экранируется, разрешены только
   перечисленные выше теги, URL превращаются в ссылки с протокол-фильтром.
   ===================================================================== */

/* --- Справочник разрешённых тегов --- */
const FMT_TAGS = {
    b:        { cls: 'fmt-bold',      name: 'Жирный' },
    i:        { cls: 'fmt-italic',    name: 'Курсив' },
    u:        { cls: 'fmt-underline', name: 'Подчёркнутый' },
    s:        { cls: 'fmt-strike',    name: 'Зачёркнутый' },
    code:     { cls: 'fmt-code',      name: 'Монокод' },
    monoall:  { cls: 'fmt-mono-all',  name: 'Весь текст кодом' },
    spoiler:  { cls: 'fmt-spoiler',   name: 'Спойлер' },
    quote:    { cls: 'fmt-quote',     name: 'Цитата' },
};

/* Обёртка выделения при нажатии кнопки панели */
const FMT_WRAP = {
    bold: 'b', italic: 'i', underline: 'u',
    strike: 's', code: 'code', spoiler: 'spoiler',
};

function fmtEsc(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(String(s));
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Автоссылки: только http/https, кавычки и пробелы не внутри */
function fmtLinkify(escaped) {
    return escaped.replace(/(^|[\s(])(https?:\/\/[^\s<>"')\]]+)/g, (m, pre, url) => {
        const clean = url.replace(/[.,;:!?]+$/, '');
        const tail = url.slice(clean.length);
        return pre + `<a href="${clean}" target="_blank" rel="noopener noreferrer nofollow">${clean}</a>` + tail;
    });
}

/* Ручные markdown-маркеры -> теги (в уже экранированной строке) */
function fmtMarkdown(escaped) {
    return escaped
        .replace(/\*\*([^*\n]{1,2000}?)\*\*/g, '<b>$1</b>')
        .replace(/(^|[\s(])_([^_\n]{1,2000}?)_(?=[\s).,!?:;]|$)/g, '$1<i>$2</i>')
        .replace(/~~([^~\n]{1,2000}?)~~/g, '<s>$1</s>')
        .replace(/`([^`\n]{1,2000}?)`/g, '<code>$1</code>');
}

/**
 * Безопасно превращает текст сообщения в HTML.
 * Никакие пользовательские теги/скрипты не попадают в DOM.
 */
function renderFormattedText(raw) {
    if (raw === null || raw === undefined) return '';
    const text = String(raw);
    if (!text) return '';

    const re = /<(\/?)(b|i|u|s|code|monoall|spoiler|quote)>/g;
    let out = '';
    let last = 0;
    let buf = '';
    const stack = [];
    let m;

    const flushText = () => {
        if (!buf) return;
        out += fmtLinkify(fmtMarkdown(fmtEsc(buf)));
        buf = '';
    };

    while ((m = re.exec(text)) !== null) {
        buf += text.slice(last, m.index);
        last = re.lastIndex;
        const closing = m[1] === '/';
        const tag = m[2];
        flushText();

        if (!closing) {
            out += `<span class="${FMT_TAGS[tag].cls}">`;
            stack.push(tag);
        } else {
            const top = stack[stack.length - 1];
            if (top === tag) {
                stack.pop();
                out += '</span>';
            }
            // Незакрытый/лишний </тег> просто игнорируем
        }
    }
    buf += text.slice(last);
    flushText();
    while (stack.length) { stack.pop(); out += '</span>'; }
    return out;
}

/* Вставить текст в textarea с корректной работой IME */
function fmtInsertAtCursor(input, text, selectInner) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const from = start + (selectInner ? 1 : 0);
    const to = start + text.length - (selectInner ? 1 : 0);
    input.focus();
    try { input.setSelectionRange(from, to); } catch (e) { /* noop */ }
}

/** Оборачивает выделение (или всё поле) в <tag>…</tag> */
function applyFormat(kind) {
    const input = document.getElementById('messageInput');
    if (!input) return;

    if (kind === 'link') {
        fmtApplyLink(input);
        return;
    }
    if (kind === 'mono-all') {
        fmtApplyMonoAll(input);
        return;
    }
    if (kind === 'quote') {
        fmtWrapLines(input, 'quote');
        return;
    }

    const tag = FMT_WRAP[kind];
    if (!tag) return;

    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const value = input.value;
    const sel = value.slice(start, end);

    // Пустое выделение + уже открытый тег вокруг курсора -> снимаем
    if (!sel) {
        const before = value.slice(0, start);
        const after = value.slice(end);
        if (before.endsWith(`<${tag}>`) && after.startsWith(`</${tag}>`)) {
            input.value = before.slice(0, -(`<${tag}>`).length) + after.slice((`</${tag}>`).length);
            input.focus();
            try { input.setSelectionRange(start - (`<${tag}>`).length, start - (`<${tag}>`).length); } catch (e) {}
            fmtNotify(FMT_TAGS[tag].name + ' снят');
            return;
        }
        // Иначе вставляем пустой тег и ставим курсор внутрь
        fmtInsertAtCursor(input, `<${tag}></${tag}>`, true);
        fmtNotify(FMT_TAGS[tag].name);
        return;
    }

    // Уже обёрнуто? Снимаем.
    const inner = `<${tag}>${sel}</${tag}>`;
    if (inner === sel) {
        input.value = value.slice(0, start) + sel + value.slice(end);
        input.focus();
        try { input.setSelectionRange(start, start + sel.length); } catch (e) {}
        fmtNotify(FMT_TAGS[tag].name + ' снят');
        return;
    }

    fmtInsertAtCursor(input, inner, true);
    fmtNotify(FMT_TAGS[tag].name);
}

function fmtWrapLines(input, tag) {
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const value = input.value;
    let sel = value.slice(start, end) || (value.trim() || '');
    sel = sel.replace(/^> ?/gm, '');
    const lines = sel.split('\n');
    const quoted = lines.map(l => (l.startsWith('>') ? l : `> ${l}`)).join('\n');
    const piece = `<${tag}>${quoted}</${tag}>`;
    input.value = value.slice(0, start) + piece + value.slice(end);
    input.focus();
    try { input.setSelectionRange(start, start + piece.length); } catch (e) {}
    fmtNotify('Цитата');
}

function fmtApplyLink(input) {
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const sel = input.value.slice(start, end);
    const hint = sel || 'https://';
    const url = window.prompt('Введите ссылку:', hint);
    if (!url) return;
    const clean = url.trim().replace(/^([^h][^t]*)$/i, 'https://$1');
    fmtInsertAtCursor(input, clean.includes(' ') ? sel : clean, false);
    fmtNotify('Ссылка вставлена');
}

function fmtApplyMonoAll(input) {
    const value = input.value;
    // Уже весь текст в моно — снимаем
    if (value.startsWith('<monoall>') && value.trim().endsWith('</monoall>')) {
        input.value = value.replace(/^<monoall>/, '').replace(/<\/monoall>$/, '');
        fmtNotify('Обычный текст');
        return;
    }
    input.value = `<monoall>${value}</monoall>`;
    input.focus();
    try { input.setSelectionRange(9, value.length + 9); } catch (e) {}
    fmtNotify('Весь текст кодом');
}

/* Простые подсказки внизу экрана */
let _fmtToastTimer = null;
function fmtNotify(text) {
    if (typeof showToast === 'function') showToast(text);
}

/* --- Панель форматирования --- */
function fmtShowBar(show) {
    const bar = document.getElementById('fmtBar');
    if (!bar) return;
    bar.style.display = show ? 'flex' : 'none';
}

function fmtBindBar() {
    const bar = document.getElementById('fmtBar');
    if (!bar || bar.dataset.bound) return;
    bar.dataset.bound = '1';
    bar.addEventListener('mousedown', e => e.preventDefault()); // не терять выделение
    bar.addEventListener('click', e => {
        const btn = e.target.closest('.fmt-btn');
        if (!btn) return;
        const kind = btn.dataset.fmt;
        if (kind === '__close') { fmtShowBar(false); return; }
        applyFormat(kind);
    });
}

function fmtInit() {
    const input = document.getElementById('messageInput');
    if (!input) return;
    fmtBindBar();

    const isTyping = () => {
        const v = input.value;
        return !!v && document.activeElement === input;
    };

    const hide = () => { if (!window.getSelection().toString()) fmtShowBar(false); };

    // На ПК: выделили мышью/клавиатурой внутри поля — показали панель
    ['mouseup', 'keyup'].forEach(ev => input.addEventListener(ev, () => {
        // selectionStart может быть 0 — проверяем на null, а не на truthy
        setTimeout(() => fmtShowBar(isTyping() && input.selectionStart !== null &&
                                 input.selectionStart !== input.selectionEnd), 10);
    }));
    document.addEventListener('selectionchange', () => {
        if (document.activeElement !== input) return;
        const s = input.selectionStart, e = input.selectionEnd;
        fmtShowBar(s !== e);
    });
    input.addEventListener('blur', () => setTimeout(hide, 160));
    input.addEventListener('input', () => {
        if (!input.selectionStart || input.selectionStart === input.selectionEnd) fmtShowBar(false);
    });

    // На телефоне: долгое нажатие открывает панель (если есть выделение)
    let lpTimer = null;
    input.addEventListener('touchstart', () => {
        clearTimeout(lpTimer);
        lpTimer = setTimeout(() => {
            const s = input.selectionStart, e = input.selectionEnd;
            if (s !== e) fmtShowBar(true);
        }, 480);
    }, { passive: true });
    ['touchend', 'touchmove'].forEach(ev => input.addEventListener(ev, () => clearTimeout(lpTimer), { passive: true }));

    // Спойлеры раскрываются по тапу (делегирование, без inline-JS)
    document.addEventListener('click', e => {
        const sp = e.target.closest('.fmt-spoiler');
        if (sp) { sp.classList.toggle('shown'); return; }
        const a = e.target.closest('.message-text a[href]');
        if (a && e.ctrlKey === false && e.metaKey === false) {
            // На мобильных не мешаем скроллу — открываем только по явному тапу
            if (a.dataset.clicked) return;
            a.dataset.clicked = '1';
            setTimeout(() => delete a.dataset.clicked, 400);
        }
    });
}

document.addEventListener('DOMContentLoaded', fmtInit);
