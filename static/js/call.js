// static/js/call.js - Sputnik Call System v6.0 (Telegram-style)
// Аудио- и видеозвонки 1-на-1: рингбек/рингтон (WebAudio), офлайн/занят/отменён,
// таймауты, wake-lock, переключение камеры, динамик, таймер, чистый обрыв.

console.log('📞 Sputnik Call System v6.0');

// ============ СОСТОЯНИЕ ============
const CALL = {
    state: 'idle',        // idle | dialing | incoming | connecting | active
    type: 'audio',        // audio | video
    callId: null,
    targetId: null,
    targetName: '',
    incomingTimer: null,  // авто-отказ на входящий
    ringTimeout: null     // авто-отмена исходящего
};

let localStream = null;
let remoteStream = null;
let peerConnection = null;
let callTimerHandle = null;
let callStartTs = 0;
let callSeconds = 0;
let isMuted = false;
let isVideoOff = false;
let isSpeakerOn = true;
let wakeLock = null;
let ringbackTimer = null;
let ringtoneTimer = null;
let remoteAudioEl = null;
let controlsHideTimer = null;

const CALLEE_WAIT_MS = 30000;  // 30 сек на входящий
const CALLER_WAIT_MS = 30000;  // 30 сек на исходящий
const CONTROLS_HIDE_MS = 4000; // автопрятанье панели в видеорежиме

// ============ УТИЛИТЫ ============
function call$ (id) { return document.getElementById(id); }

const callToast = (typeof showToast === 'function') ? showToast : (m) => console.log('[call]', m);

// Убеждаемся, что звук в фоне не ломает интерфейс
function bindUserGestureUnlock() {
    ['pointerdown', 'touchend'].forEach(ev => {
        document.addEventListener(ev, () => { try { ac(); } catch (e) {} }, { once: false });
    });
}

// ============ ЗВУК (WebAudio, без файлов) ============
let audioCtx = null;
function ac() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    } catch (e) {}
    return audioCtx;
}

function toneAt(freq, startOffset, dur, vol, type) {
    const ctx = ac();
    if (!ctx) return;
    try {
        const t0 = ctx.currentTime + startOffset;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type || 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(vol || 0.1, t0 + 0.02);
        g.gain.setValueAtTime(vol || 0.1, t0 + dur - 0.06);
        g.gain.linearRampToValueAtTime(0, t0 + dur);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(t0);
        o.stop(t0 + dur + 0.06);
    } catch (e) {}
}

// Рингбек «Звоним...» (гудки в трубке)
function ringbackPattern() {
    toneAt(425, 0, 0.3, 0.08);
    toneAt(425, 0.48, 0.3, 0.08);
}
function startRingback() {
    stopRingback();
    try { ringbackPattern(); } catch (e) {}
    ringbackTimer = setInterval(() => { try { ringbackPattern(); } catch (e) {} }, 2300);
}
function stopRingback() {
    if (ringbackTimer) { clearInterval(ringbackTimer); ringbackTimer = null; }
}

// Рингтон входящего вызова
function ringtonePattern() {
    toneAt(825, 0, 0.2, 0.11);
    toneAt(1100, 0.26, 0.22, 0.11);
}
function startRingtone() {
    stopRingtone();
    try { ringtonePattern(); } catch (e) {}
    ringtoneTimer = setInterval(() => { try { ringtonePattern(); } catch (e) {} }, 1300);
}
function stopRingtone() {
    if (ringtoneTimer) { clearInterval(ringtoneTimer); ringtoneTimer = null; }
}

function playConnectSound() {
    toneAt(660, 0, 0.12, 0.09);
    toneAt(880, 0.16, 0.18, 0.09);
}
function playEndSound() {
    toneAt(520, 0, 0.16, 0.08);
}

function vibratePattern() {
    try { if (navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 250]); } catch (e) {}
}

// ============ WAKE-LOCK (не даём экрану уснуть) ============
async function requestWakeLock() {
    try {
        if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) { wakeLock = null; }
}
function releaseWakeLock() {
    try { if (wakeLock) wakeLock.release(); } catch (e) {}
    wakeLock = null;
}

// ============ ИНИЦИАЛИЗАЦИЯ ============
document.addEventListener('DOMContentLoaded', () => {
    remoteAudioEl = new Audio();
    remoteAudioEl.autoplay = true;
    remoteAudioEl.playsInline = true;
    document.body.appendChild(remoteAudioEl);

    bindUserGestureUnlock();

    const waitSocket = setInterval(() => {
        if (typeof socket !== 'undefined' && typeof currentUser !== 'undefined') {
            clearInterval(waitSocket);
            setupCallSocketListeners();
            initCallUi();
        }
    }, 200);
});

function initCallUi() {
    if (!call$('callInterface')) return;
    // Клик по видео-офверлею показывает/прячет панель управления
    call$('callInterface').addEventListener('click', (e) => {
        if (CALL.state !== 'active' || CALL.type !== 'video') return;
        if (e.target.closest('.call-ctrl')) return;
        toggleControlsVisibility(true);
    });
    // Клик по аватару/имени скрывает панель (для аудио ничего)
    makeLocalVideoDraggable();
    console.log('✅ Call system ready (v6.0)');
}

function makeLocalVideoDraggable() {
    const v = call$('localCallVideo');
    if (!v) return;
    let dragging = false, startX = 0, startY = 0, origX = 0, origY = 0;
    v.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
        dragging = true;
        const rect = v.getBoundingClientRect();
        origX = rect.left; origY = rect.top;
        startX = e.clientX; startY = e.clientY;
        v.setPointerCapture(e.pointerId);
        v.style.transition = 'none';
        e.preventDefault();
    });
    v.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        v.style.left = (origX + e.clientX - startX) + 'px';
        v.style.top = (origY + e.clientY - startY) + 'px';
    });
    const stop = () => {
        if (!dragging) return;
        dragging = false;
        v.style.transition = '';
    };
    v.addEventListener('pointerup', stop);
    v.addEventListener('pointercancel', stop);
}

// ============ СЛУШАТЕЛИ SOCKET ============
function setupCallSocketListeners() {
    socket.onAny((eventName, ...args) => {
        if (eventName.includes('call') || eventName === 'ice_candidate') {
            console.log(`📡 [${eventName}]`, args[0] || '');
        }
    });

    socket.on('call_initiated', (data) => {
        if (data && data.call_id) CALL.callId = data.call_id;
    });

    socket.on('incoming_call', (data) => {
        if (CALL.state !== 'idle') {
            // Уже занят — автоматически отклоняем
            socket.emit('reject_call', { call_id: data.call_id, caller_id: data.caller_id });
            return;
        }
        CALL.callId = data.call_id;
        CALL.targetId = data.caller_id;
        CALL.targetName = data.caller_name || 'Пользователь';
        CALL.type = data.call_type || 'audio';
        CALL.state = 'incoming';
        showIncomingCallModal(data);
        startRingtone();
        vibratePattern();
        if (CALL.incomingTimer) clearTimeout(CALL.incomingTimer);
        CALL.incomingTimer = setTimeout(() => {
            if (CALL.state === 'incoming') rejectIncomingCall();
        }, CALLEE_WAIT_MS);
    });

    socket.on('call_accepted', async () => {
        // Инициатор: собеседник поднял трубку
        stopRingback();
        clearTimeout(CALL.ringTimeout);
        if (CALL.state === 'dialing') CALL.state = 'connecting';
        setDialText('Соединение...');
        setCallStatus('Соединение...');
        await createAndSendOffer();
    });

    socket.on('call_offer_received', async (data) => {
        await handleOffer(data);
    });

    socket.on('call_answer_received', async (data) => {
        await handleAnswer(data);
    });

    socket.on('ice_candidate_received', async (data) => {
        if (!peerConnection) return;
        try {
            if (data.candidate) await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
            console.error('ICE error:', e);
        }
    });

    socket.on('call_rejected', () => {
        stopRingback();
        hideCallOverlay();
        callToast('❌ Звонок отклонён');
        playEndSound();
        resetCall();
    });

    socket.on('call_busy', () => {
        stopRingback();
        hideCallOverlay();
        callToast('Абонент занят');
        playEndSound();
        resetCall();
    });

    socket.on('call_offline', () => {
        stopRingback();
        hideCallOverlay();
        callToast('Пользователь сейчас не в сети');
        playEndSound();
        resetCall();
    });

    socket.on('call_blocked', () => {
        stopRingback();
        hideCallOverlay();
        callToast('Звонок не может быть доставлен');
        playEndSound();
        resetCall();
    });

    socket.on('call_cancelled', () => {
        stopRingtone();
        clearTimeout(CALL.incomingTimer);
        hideIncomingCallModal();
        resetCall();
    });

    socket.on('call_ended_by_peer', () => {
        stopRingback();
        stopRingtone();
        hideCallOverlay();
        hideIncomingCallModal();
        callToast('Звонок завершён');
        playEndSound();
        resetCall();
    });
}

// ============ ИСХОДЯЩИЙ ЗВОНОК ============
async function makeCall(type) {
    if (CALL.state !== 'idle') { callToast('Вы уже в звонке'); return; }
    if (!currentChat || currentChatType !== 'personal') { callToast('Выберите пользователя для звонка'); return; }

    const targetId = currentChat.other_user_id || currentChat.id || currentChat.chat_id;
    if (targetId == currentUser.id) { callToast('Нельзя позвонить самому себе'); return; }

    CALL.type = type || 'audio';
    CALL.targetId = targetId;
    CALL.targetName = (currentChat.name || 'Пользователь').toString();

    showCallOverlay(CALL.type, CALL.targetName);
    setDialText(type === 'video' ? 'Видеозвонок...' : 'Звоним...');
    setCallStatus(type === 'video' ? 'Видеозвонок...' : 'Звоним...');

    CALL.state = 'dialing';

    try {
        localStream = await navigator.mediaDevices.getUserMedia(buildConstraints(type));
    } catch (err) {
        hideCallOverlay();
        CALL.state = 'idle';
        showMediaError(err);
        resetCall();
        return;
    }

    attachLocalMedia();
    socket.emit('initiate_call', { target_user_id: targetId, call_type: CALL.type });
    requestWakeLock();
    startRingback();

    CALL.ringTimeout = setTimeout(() => {
        if (CALL.state === 'dialing') {
            callToast('Абонент не ответил');
            endCall();
        }
    }, CALLER_WAIT_MS);
}

async function makeCallToUser(userId) {
    try {
        const resp = await fetch(`/api/get_user_profile/${userId}`);
        const user = await resp.json();
        if (!user || user.error) { callToast('Пользователь не найден'); return; }
        currentChat = {
            other_user_id: userId,
            name: user.display_name || user.username || 'Пользователь',
            id: userId,
            type: 'personal'
        };
        currentChatType = 'personal';
        await makeCall('audio');
    } catch (e) {
        console.error('makeCallToUser error:', e);
        callToast('Ошибка при звонке');
    }
}

async function startVideoCallToUser(userId) {
    try {
        const resp = await fetch(`/api/get_user_profile/${userId}`);
        const user = await resp.json();
        if (!user || user.error) { callToast('Пользователь не найден'); return; }
        currentChat = {
            other_user_id: userId,
            name: user.display_name || user.username || 'Пользователь',
            id: userId,
            type: 'personal'
        };
        currentChatType = 'personal';
        await makeCall('video');
    } catch (e) {
        console.error('startVideoCallToUser error:', e);
        callToast('Ошибка при звонке');
    }
}

// ============ ВХОДЯЩИЙ ЗВОНОК ============
async function acceptIncomingCall() {
    if (CALL.state !== 'incoming') return;
    clearTimeout(CALL.incomingTimer);
    stopRingtone();
    hideIncomingCallModal();

    CALL.state = 'connecting';
    CALL.type = CALL.type || 'audio';

    showCallOverlay(CALL.type, CALL.targetName);
    setDialText('Соединение...');
    setCallStatus('Соединение...');

    try {
        localStream = await navigator.mediaDevices.getUserMedia(buildConstraints(CALL.type));
    } catch (err) {
        hideCallOverlay();
        CALL.state = 'idle';
        showMediaError(err);
        socket.emit('reject_call', { call_id: CALL.callId, caller_id: CALL.targetId });
        resetCall();
        return;
    }

    attachLocalMedia();
    socket.emit('accept_call', { call_id: CALL.callId, accepter_id: currentUser.id });
    requestWakeLock();
}

function rejectIncomingCall() {
    if (CALL.state !== 'incoming') return;
    clearTimeout(CALL.incomingTimer);
    stopRingtone();
    hideIncomingCallModal();
    socket.emit('reject_call', { call_id: CALL.callId, caller_id: CALL.targetId });
    resetCall();
}

// ============ ЗАВЕРШЕНИЕ ============
function endCall() {
    const dialing = CALL.state === 'dialing' || CALL.state === 'incoming';
    const wasDialing = CALL.state === 'dialing';
    const secs = callSeconds;

    stopRingback();
    stopRingtone();

    if (wasDialing) {
        socket.emit('cancel_call', { call_id: CALL.callId, target_user_id: CALL.targetId });
    } else if (!dialing && CALL.callId) {
        socket.emit('end_call', { target_user_id: CALL.targetId, call_id: CALL.callId, duration: secs });
    }

    hideCallOverlay();
    hideIncomingCallModal();
    playEndSound();
    resetCall();
}

// ============ ИНТЕРФЕЙС ============
function showCallOverlay(type, name) {
    const el = call$('callInterface');
    if (!el) return;
    el.classList.remove('audio-mode', 'video-mode');
    el.classList.add(type === 'video' ? 'video-mode' : 'audio-mode');
    el.classList.add('open');

    call$('callContactName').textContent = name;
    call$('callStatusText').textContent = 'Подключение...';
    call$('callTimer').textContent = '00:00';
    call$('callTimer').style.display = 'none';
    call$('ringingOverlay').style.display = 'flex';
    call$('callControls').classList.remove('hidden');

    // Свой/чужой аватар
    setCallAvatar();

    // Кнопки, видимые только в видеорежиме
    call$('callVideoBtn').style.display = type === 'video' ? 'inline-flex' : 'none';
    call$('callSwitchBtn').style.display = type === 'video' ? 'inline-flex' : 'none';

    // Сброс состояний кнопок
    isMuted = false;
    isVideoOff = false;
    isSpeakerOn = true;
    resetMicBtn();
    resetVideoBtn();
    resetSpeakerBtn();

    document.body.classList.add('call-active');
}

function setCallAvatar() {
    const wrap = call$('callAvatar');
    if (!wrap) return;
    const name = CALL.targetName || '?';
    const img = currentChat && (currentChat.avatar || (currentChat.user && currentChat.user.avatar));
    wrap.innerHTML = img
        ? `<img src="/${img.replace(/^\//, '')}" onerror="this.remove()">`
        : (name || '?').charAt(0).toUpperCase();
}

function hideCallOverlay() {
    document.body.classList.remove('call-active');
    const el = call$('callInterface');
    if (el) el.classList.remove('open');
    call$('ringingOverlay').style.display = 'none';
    hideControlsNow();
}

function setCallStatus(text) {
    const el = call$('callStatusText');
    if (el) el.textContent = text;
}

function setDialText(text) {
    const el = call$('ringingText');
    if (el) el.textContent = text;
}

function showIncomingCallModal(data) {
    call$('incomingCallerName').textContent = data.caller_name || 'Пользователь';
    call$('incomingCallType').textContent = (data.call_type === 'video') ? 'Видеозвонок' : 'Аудиозвонок';
    const av = call$('incomingCallAvatar');
    if (av) {
        av.textContent = (data.caller_name || '?').charAt(0).toUpperCase();
        if (data.caller_avatar) av.innerHTML = `<img src="/${String(data.caller_avatar).replace(/^\//, '')}">`;
    }
    call$('incomingCallModal').classList.add('open');
}

function hideIncomingCallModal() {
    const el = call$('incomingCallModal');
    if (el) el.classList.remove('open');
}

function attachLocalMedia() {
    const localVideo = call$('localCallVideo');
    if (localVideo) {
        localVideo.srcObject = localStream;
        localVideo.style.display = CALL.type === 'video' ? 'block' : 'none';
        localVideo.muted = true;
    }
    if (CALL.state === 'dialing') {
        // Пока звоним: скрываем миниатюру в аудиорежиме, показываем во видео
    }
}

// ============ КНОПКИ ============
function toggleCallMute() {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(t => { t.enabled = !isMuted; });
    resetMicBtn();
}

function resetMicBtn() {
    const btn = call$('callMicBtn');
    if (!btn) return;
    btn.innerHTML = isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
    btn.classList.toggle('active-danger', isMuted);
}

function toggleCallVideo() {
    if (CALL.type !== 'video' || !localStream) return;
    isVideoOff = !isVideoOff;
    localStream.getVideoTracks().forEach(t => { t.enabled = !isVideoOff; });
    const v = call$('localCallVideo');
    if (v) v.style.display = isVideoOff ? 'none' : 'block';
    resetVideoBtn();
}

function resetVideoBtn() {
    const btn = call$('callVideoBtn');
    if (!btn) return;
    btn.innerHTML = isVideoOff ? '<i class="fas fa-video-slash"></i>' : '<i class="fas fa-video"></i>';
    btn.classList.toggle('active-danger', isVideoOff);
}

function toggleCallSpeaker() {
    isSpeakerOn = !isSpeakerOn;
    if (remoteAudioEl) remoteAudioEl.muted = !isSpeakerOn;
    resetSpeakerBtn();
}

function resetSpeakerBtn() {
    const btn = call$('callSpeakerBtn');
    if (!btn) return;
    btn.innerHTML = isSpeakerOn ? '<i class="fas fa-volume-up"></i>' : '<i class="fas fa-volume-mute"></i>';
    btn.classList.toggle('active-danger', !isSpeakerOn);
}

async function switchCallCamera() {
    if (CALL.type !== 'video' || !localStream) return;
    try {
        const tracks = localStream.getVideoTracks();
        if (!tracks.length) return;
        const settings = tracks[0].getSettings ? tracks[0].getSettings() : {};
        const next = settings.facingMode === 'user' ? 'environment' : 'user';
        const newStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: next, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        const newTrack = newStream.getVideoTracks()[0];
        const sender = peerConnection && peerConnection.getSenders()
            ? peerConnection.getSenders().find(s => s.track && s.track.kind === 'video')
            : null;
        if (sender) {
            await sender.replaceTrack(newTrack);
        }
        tracks.forEach(t => t.stop());
        localStream.removeTrack(tracks[0]);
        localStream.addTrack(newTrack);
        const v = call$('localCallVideo');
        if (v) v.srcObject = localStream;
        if (isVideoOff) newTrack.enabled = false;
    } catch (e) {
        console.error('Switch camera error:', e);
        callToast('Не удалось переключить камеру');
    }
}

// ============ WEBRTC ============
async function createAndSendOffer() {
    try {
        peerConnection = createPeerConnection();
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: CALL.type === 'video'
        });
        await peerConnection.setLocalDescription(offer);
        socket.emit('call_offer', { target_user_id: CALL.targetId, offer: offer });
    } catch (e) {
        console.error('Offer error:', e);
    }
}

async function handleOffer(data) {
    try {
        peerConnection = createPeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: CALL.type === 'video'
        });
        await peerConnection.setLocalDescription(answer);
        socket.emit('call_answer', { target_user_id: data.from_user_id, answer: answer });
    } catch (e) {
        console.error('Handle offer error:', e);
    }
}

async function handleAnswer(data) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } catch (e) {
        console.error('Handle answer error:', e);
    }
}

function createPeerConnection() {
    const config = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 4
    };

    const pc = new RTCPeerConnection(config);

    if (localStream) {
        localStream.getTracks().forEach(track => {
            try {
                pc.addTrack(track, localStream);
            } catch (e) { console.error('addTrack error:', e); }
        });
    }

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice_candidate', { target_user_id: CALL.targetId, candidate: event.candidate });
        }
    };

    pc.ontrack = (event) => {
        const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
        if (event.track.kind === 'audio') {
            remoteStream = stream;
            if (remoteAudioEl) {
                remoteAudioEl.srcObject = stream;
                remoteAudioEl.muted = !isSpeakerOn;
                remoteAudioEl.play().catch(() => {});
            }
            enterActiveState();
        } else if (event.track.kind === 'video') {
            const remoteVideo = call$('remoteVideo');
            if (remoteVideo) {
                remoteVideo.srcObject = stream;
                if (!remoteStream) remoteStream = stream;
                call$('callInterface').classList.add('has-video');
            }
        }
    };

    pc.onconnectionstatechange = () => {
        console.log('📡 WebRTC state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
            enterActiveState();
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            callToast('📞 Связь прервана');
            endCallByPeer();
        }
    };

    return pc;
}

function enterActiveState() {
    if (CALL.state === 'active') return;
    CALL.state = 'active';
    stopRingback();
    stopRingtone();
    call$('ringingOverlay').style.display = 'none';
    call$('callControls').classList.remove('hidden');
    const timer = call$('callTimer');
    if (timer) {
        timer.style.display = 'block';
        setCallStatus('');
    }
    playConnectSound();
    startCallTimer();
    if (CALL.type === 'video') scheduleControlsHide();
}

function scheduleControlsHide() {
    if (controlsHideTimer) clearTimeout(controlsHideTimer);
    controlsHideTimer = setTimeout(() => {
        if (CALL.state === 'active' && CALL.type === 'video') {
            call$('callControls').classList.add('hidden');
        }
    }, CONTROLS_HIDE_MS);
}

function toggleControlsVisibility(show) {
    if (show) {
        call$('callControls').classList.remove('hidden');
        scheduleControlsHide();
    } else {
        call$('callControls').classList.add('hidden');
    }
}

function hideControlsNow() {
    if (controlsHideTimer) clearTimeout(controlsHideTimer);
    call$('callControls').classList.add('hidden');
}

// ============ ТАЙМЕР ============
function startCallTimer() {
    callStartTs = Date.now();
    callSeconds = 0;
    if (callTimerHandle) clearInterval(callTimerHandle);
    callTimerHandle = setInterval(() => {
        callSeconds = Math.floor((Date.now() - callStartTs) / 1000);
        const m = String(Math.floor(callSeconds / 60)).padStart(2, '0');
        const s = String(callSeconds % 60).padStart(2, '0');
        const el = call$('callTimer');
        if (el) el.textContent = `${m}:${s}`;
    }, 1000);
}

function stopCallTimer() {
    if (callTimerHandle) { clearInterval(callTimerHandle); callTimerHandle = null; }
}

// ============ ОЧИСТКА ============
function resetCall() {
    stopRingback();
    stopRingtone();
    stopCallTimer();
    clearTimeout(CALL.ringTimeout);
    clearTimeout(CALL.incomingTimer);
    releaseWakeLock();

    if (localStream) {
        try { localStream.getTracks().forEach(t => t.stop()); } catch (e) {}
        localStream = null;
    }
    if (remoteStream) {
        try { remoteStream.getTracks().forEach(t => t.stop()); } catch (e) {}
        remoteStream = null;
    }
    if (peerConnection) {
        try { peerConnection.close(); } catch (e) {}
        peerConnection = null;
    }
    if (remoteAudioEl) remoteAudioEl.srcObject = null;

    const localVideo = call$('localCallVideo');
    const remoteVideo = call$('remoteVideo');
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
    call$('callInterface').classList.remove('has-video');

    isMuted = false;
    isVideoOff = false;
    isSpeakerOn = true;

    CALL.state = 'idle';
    CALL.callId = null;
    CALL.targetId = null;
}

function endCallByPeer() {
    stopRingback();
    stopRingtone();
    hideCallOverlay();
    hideIncomingCallModal();
    playEndSound();
    resetCall();
}

// ============ ОШИБКИ МЕДИА ============
function showMediaError(err) {
    if (!err) { callToast('Ошибка доступа к устройству'); return; }
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        callToast('Доступ к микрофону/камере запрещён. Разрешите в настройках браузера');
    } else if (err.name === 'NotFoundError') {
        callToast('Микрофон или камера не найдены');
    } else if (err.name === 'NotReadableError') {
        callToast('Устройство занято другой программой');
    } else {
        callToast('Ошибка доступа к микрофону/камере');
    }
}

function buildConstraints(type) {
    const c = {
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        },
        video: false
    };
    if (type === 'video') {
        c.video = { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' };
    }
    return c;
}

// При закрытии страницы во время звонка — сообщаем собеседнику
window.addEventListener('beforeunload', () => {
    if (CALL.state === 'active' && CALL.callId) {
        socket.emit('end_call', { target_user_id: CALL.targetId, call_id: CALL.callId, duration: callSeconds });
    } else if (CALL.state === 'dialing') {
        socket.emit('cancel_call', { call_id: CALL.callId, target_user_id: CALL.targetId });
    }
});

console.log('✅ Call system v6.0 loaded');