// static/js/call.js - ИСПРАВЛЕННЫЙ ЗВУК v5.0

console.log('📞 Sputnik Call System v5.0');

// ============ ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ============
let localStream = null;
let peerConnection = null;
let remoteStream = null;
let isInCall = false;
let isMuted = false;
let isVideoOff = false;
let callTimer = null;
let callSeconds = 0;
let currentCallType = null;
let currentTargetId = null;
let currentCallId = null;
let callStartTime = null;
let remoteAudio = null;

// ============ ИНИЦИАЛИЗАЦИЯ ============
document.addEventListener('DOMContentLoaded', () => {
    console.log('📞 Call system initializing...');

    // Создаем аудио элемент для удаленного звука
    remoteAudio = new Audio();
    remoteAudio.autoplay = true;
    remoteAudio.playsInline = true;

    const checkSocket = setInterval(() => {
        if (typeof socket !== 'undefined' && typeof currentUser !== 'undefined') {
            clearInterval(checkSocket);
            initCallSystem();
        }
    }, 200);
});

function initCallSystem() {
    console.log('✅ Socket connected');

    const audioBtn = document.getElementById('audioCallBtn');
    const videoBtn = document.getElementById('videoCallBtn');
    if (audioBtn) audioBtn.style.display = 'inline-flex';
    if (videoBtn) videoBtn.style.display = 'inline-flex';

    setupSocketListeners();
    console.log('✅ Call system ready');
}

// ============ SOCKET.IO СЛУШАТЕЛИ ============
function setupSocketListeners() {

    socket.onAny((eventName, ...args) => {
        if (eventName.includes('call') || eventName.includes('ice')) {
            console.log(`📡 [${eventName}]`);
        }
    });

    socket.on('incoming_call', (data) => {
        console.log('🔔 INCOMING CALL!');

        if (isInCall) {
            socket.emit('reject_call', {
                call_id: data.call_id,
                caller_id: data.caller_id
            });
            return;
        }

        currentCallId = data.call_id;
        currentTargetId = data.caller_id;
        currentCallType = data.call_type;

        showIncomingCallModal(data);
    });

    socket.on('call_accepted', async (data) => {
        console.log('✅ Call accepted');
        hideRingingOverlay();
        document.getElementById('callStatusText').textContent = 'Соединение...';
        await createAndSendOffer();
    });

    socket.on('call_rejected', () => {
        console.log('❌ Call rejected');
        hideCallInterface();
        showNotification('❌ Звонок отклонен');
    });

    socket.on('call_offer_received', async (data) => {
        console.log('📨 Offer received');
        await handleOffer(data);
    });

    socket.on('call_answer_received', async (data) => {
        console.log('📨 Answer received');
        await handleAnswer(data);
    });

    socket.on('ice_candidate_received', async (data) => {
        if (data.candidate && peerConnection) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch(e) {
                console.error('ICE error:', e);
            }
        }
    });

    socket.on('call_ended_by_peer', () => {
        console.log('🔴 Peer ended call');
        hideCallInterface();
        showNotification('📞 Собеседник завершил звонок');
        cleanupCall();
    });
}

// ============ НАЧАТЬ ЗВОНОК ============

async function makeCall(type) {
    console.log('📞 makeCall:', type);

    if (!currentChat || currentChatType !== 'personal') {
        alert('Выберите пользователя для звонка');
        return;
    }

    const targetId = currentChat.other_user_id || currentChat.id;
    const targetName = currentChat.name || 'Пользователь';

    if (targetId === currentUser.id) {
        alert('Нельзя позвонить самому себе');
        return;
    }

    if (isInCall) {
        alert('Вы уже в звонке');
        return;
    }

    currentCallType = type;
    currentTargetId = targetId;
    isInCall = true;

    showCallInterface(type, targetName);

    try {
        // ВАЖНО: Правильные constraints для аудио
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
                sampleRate: 48000
            },
            video: type === 'video' ? {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } : false
        };

        console.log('🎤 Requesting media with constraints:', constraints);
        localStream = await navigator.mediaDevices.getUserMedia(constraints);

        console.log('✅ Media obtained');
        console.log('Audio tracks:', localStream.getAudioTracks().length);
        console.log('Video tracks:', localStream.getVideoTracks().length);

        // Проверяем аудио треки
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            console.log('🎤 Audio track:', audioTracks[0].label);
            console.log('🎤 Audio enabled:', audioTracks[0].enabled);
        }

        // Локальное видео
        const localVideo = document.getElementById('localCallVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.style.display = type === 'video' ? 'block' : 'none';
        }

        // Отправляем сигнал
        socket.emit('initiate_call', {
            target_user_id: targetId,
            call_type: type
        });

        document.getElementById('callStatusText').textContent = 'Звоним...';
        document.getElementById('ringingOverlay').style.display = 'flex';
        document.getElementById('ringingText').textContent = 'Звоним...';

    } catch(error) {
        console.error('Media error:', error);
        hideCallInterface();
        isInCall = false;
        cleanupCall();

        if (error.name === 'NotAllowedError') {
            alert('Доступ к микрофону запрещен!\n\nРазрешите доступ в настройках браузера:\n1. Нажмите на значок замка в адресной строке\n2. Разрешите микрофон');
        } else if (error.name === 'NotFoundError') {
            alert('Микрофон не найден!\n\nПроверьте подключение микрофона.');
        } else {
            alert('Ошибка: ' + error.message);
        }
    }
}

async function makeCallToUser(userId) {
    try {
        const response = await fetch(`/api/get_user_profile/${userId}`);
        const user = await response.json();

        if (!user || user.error) {
            alert('Пользователь не найден');
            return;
        }

        currentChat = {
            other_user_id: userId,
            name: user.display_name || user.username,
            id: userId
        };
        currentChatType = 'personal';

        await makeCall('audio');
    } catch(error) {
        console.error('Error:', error);
    }
}

async function startVideoCallToUser(userId) {
    try {
        const response = await fetch(`/api/get_user_profile/${userId}`);
        const user = await response.json();

        if (!user || user.error) {
            alert('Пользователь не найден');
            return;
        }

        currentChat = {
            other_user_id: userId,
            name: user.display_name || user.username,
            id: userId
        };
        currentChatType = 'personal';

        await makeCall('video');
    } catch(error) {
        console.error('Error:', error);
    }
}

// ============ ИНТЕРФЕЙС ============

function showCallInterface(type, name) {
    console.log('🎨 Showing call UI');

    document.getElementById('callContactName').textContent = name;
    document.getElementById('callStatusText').textContent = 'Подключение...';
    document.getElementById('callTimer').textContent = '00:00';

    document.getElementById('callInterface').style.display = 'flex';

    const videoBtn = document.getElementById('callVideoBtn');
    if (videoBtn) {
        videoBtn.style.display = type === 'video' ? 'inline-flex' : 'none';
    }

    // Сбрасываем состояние кнопок
    isMuted = false;
    isVideoOff = false;
    document.getElementById('callMicBtn').style.background = 'rgba(255,255,255,0.15)';
    document.getElementById('callMicBtn').innerHTML = '<i class="fas fa-microphone"></i>';
    if (videoBtn) {
        videoBtn.style.background = 'rgba(255,255,255,0.15)';
        videoBtn.innerHTML = '<i class="fas fa-video"></i>';
    }

    isInCall = true;
}

function hideCallInterface() {
    document.getElementById('callInterface').style.display = 'none';
    document.getElementById('ringingOverlay').style.display = 'none';
    isInCall = false;
}

function hideRingingOverlay() {
    document.getElementById('ringingOverlay').style.display = 'none';
    startCallTimer();
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.9);
        color: white;
        padding: 20px 30px;
        border-radius: 16px;
        font-size: 16px;
        z-index: 10001;
        text-align: center;
        font-family: 'Unbounded', cursive;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        animation: fadeInOut 2s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.5s';
        setTimeout(() => notification.remove(), 500);
    }, 2000);
}

function showIncomingCallModal(data) {
    console.log('📲 Showing incoming modal');

    document.getElementById('incomingCallerName').textContent = data.caller_name;
    document.getElementById('incomingCallType').textContent =
        data.call_type === 'video' ? '📹 Видеозвонок' : '📞 Аудиозвонок';
    document.getElementById('incomingCallAvatar').textContent =
        data.caller_name.charAt(0).toUpperCase();

    document.getElementById('incomingCallModal').style.display = 'flex';

    setTimeout(() => {
        if (document.getElementById('incomingCallModal').style.display === 'flex') {
            rejectIncomingCall();
        }
    }, 30000);
}

// ============ КНОПКИ ============

function acceptIncomingCall() {
    console.log('✅ Accepting call');

    document.getElementById('incomingCallModal').style.display = 'none';

    const name = document.getElementById('incomingCallerName').textContent;
    showCallInterface(currentCallType, name);
    isInCall = true;

    const constraints = {
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        },
        video: currentCallType === 'video' ? {
            width: { ideal: 1280 },
            height: { ideal: 720 }
        } : false
    };

    navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
        localStream = stream;

        console.log('✅ Media obtained for incoming call');
        console.log('Audio tracks:', stream.getAudioTracks().length);

        const localVideo = document.getElementById('localCallVideo');
        if (localVideo) {
            localVideo.srcObject = stream;
            localVideo.style.display = currentCallType === 'video' ? 'block' : 'none';
        }

        socket.emit('accept_call', {
            call_id: currentCallId,
            accepter_id: currentUser.id
        });

        document.getElementById('callStatusText').textContent = 'Соединение...';
        document.getElementById('ringingOverlay').style.display = 'flex';
        document.getElementById('ringingText').textContent = 'Соединение...';
    })
    .catch(error => {
        console.error('Media error:', error);
        hideCallInterface();
        showNotification('❌ Ошибка доступа к микрофону');
        rejectIncomingCall();
    });
}

function rejectIncomingCall() {
    console.log('❌ Rejecting call');
    document.getElementById('incomingCallModal').style.display = 'none';

    socket.emit('reject_call', {
        call_id: currentCallId,
        caller_id: currentTargetId
    });
}

function endCall() {
    console.log('🔴 User ended call');

    hideCallInterface();
    cleanupCall();

    socket.emit('end_call', {
        target_user_id: currentTargetId,
        call_id: currentCallId,
        duration: callSeconds
    });
}

function cleanupCall() {
    if (callTimer) {
        clearInterval(callTimer);
        callTimer = null;
    }

    if (localStream) {
        localStream.getTracks().forEach(track => {
            console.log('Stopping track:', track.kind);
            track.stop();
        });
        localStream = null;
    }

    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
        remoteStream = null;
    }

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    if (remoteAudio) {
        remoteAudio.srcObject = null;
    }

    const localVideo = document.getElementById('localCallVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) {
        remoteVideo.srcObject = null;
        document.getElementById('noRemoteVideo').style.display = 'flex';
    }

    isInCall = false;
}

function toggleCallMute() {
    if (!localStream) {
        console.log('No local stream');
        return;
    }

    isMuted = !isMuted;
    const audioTracks = localStream.getAudioTracks();

    console.log('Audio tracks:', audioTracks.length);

    audioTracks.forEach(track => {
        track.enabled = !isMuted;
        console.log('Audio track enabled:', track.enabled);
    });

    const btn = document.getElementById('callMicBtn');
    if (btn) {
        btn.innerHTML = isMuted ?
            '<i class="fas fa-microphone-slash"></i>' :
            '<i class="fas fa-microphone"></i>';
        btn.style.background = isMuted ?
            'rgba(255,0,0,0.6)' : 'rgba(255,255,255,0.15)';
    }

    console.log('Microphone muted:', isMuted);
}

function toggleCallVideo() {
    if (!localStream) return;

    isVideoOff = !isVideoOff;
    const videoTracks = localStream.getVideoTracks();

    videoTracks.forEach(track => {
        track.enabled = !isVideoOff;
    });

    const btn = document.getElementById('callVideoBtn');
    const localVideo = document.getElementById('localCallVideo');

    if (btn) {
        btn.innerHTML = isVideoOff ?
            '<i class="fas fa-video-slash"></i>' :
            '<i class="fas fa-video"></i>';
        btn.style.background = isVideoOff ?
            'rgba(255,0,0,0.6)' : 'rgba(255,255,255,0.15)';
    }

    if (localVideo) {
        localVideo.style.display = isVideoOff ? 'none' : 'block';
    }
}

function toggleCallSpeaker() {
    if (remoteAudio) {
        remoteAudio.muted = !remoteAudio.muted;
        console.log('Speaker muted:', remoteAudio.muted);
    }

    const btn = document.getElementById('callSpeakerBtn');
    if (btn) {
        const isMuted = remoteAudio && remoteAudio.muted;
        btn.innerHTML = isMuted ?
            '<i class="fas fa-volume-mute"></i>' :
            '<i class="fas fa-volume-up"></i>';
    }
}

// ============ WEBRTC С ИСПРАВЛЕННЫМ ЗВУКОМ ============

async function createAndSendOffer() {
    console.log('🔗 Creating offer');

    peerConnection = createPeerConnection();

    try {
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: currentCallType === 'video'
        });
        await peerConnection.setLocalDescription(offer);

        console.log('📡 Local description set');
        console.log('Offer SDP has audio:', offer.sdp.includes('m=audio'));

        socket.emit('call_offer', {
            target_user_id: currentTargetId,
            offer: offer
        });

        console.log('📡 Offer sent');
    } catch(error) {
        console.error('Offer error:', error);
    }
}

async function handleOffer(data) {
    console.log('📨 Handling offer');

    peerConnection = createPeerConnection();

    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        console.log('📨 Remote description set');

        const answer = await peerConnection.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: currentCallType === 'video'
        });
        await peerConnection.setLocalDescription(answer);

        console.log('📡 Answer SDP has audio:', answer.sdp.includes('m=audio'));

        socket.emit('call_answer', {
            target_user_id: data.from_user_id,
            answer: answer
        });

        console.log('📡 Answer sent');
        hideRingingOverlay();

    } catch(error) {
        console.error('Handle offer error:', error);
    }
}

async function handleAnswer(data) {
    console.log('📨 Handling answer');

    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        console.log('✅ Connection established');

        document.getElementById('callStatusText').textContent = 'Соединение установлено';
        hideRingingOverlay();

    } catch(error) {
        console.error('Handle answer error:', error);
    }
}

function createPeerConnection() {
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ]
    };

    const pc = new RTCPeerConnection(configuration);

    // ДОБАВЛЯЕМ ЛОКАЛЬНЫЕ ТРЕКИ
    if (localStream) {
        localStream.getTracks().forEach(track => {
            console.log('Adding local track:', track.kind, track.enabled);
            pc.addTrack(track, localStream);
        });
    }

    // ICE КАНДИДАТЫ
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice_candidate', {
                target_user_id: currentTargetId,
                candidate: event.candidate
            });
        }
    };

    // ПОЛУЧЕНИЕ УДАЛЕННЫХ ТРЕКОВ
    pc.ontrack = (event) => {
        console.log('📹📢 Remote track received:', event.track.kind);
        console.log('Track enabled:', event.track.enabled);
        console.log('Stream active:', event.streams[0].active);

        if (event.track.kind === 'audio') {
            // ВАЖНО: Подключаем аудио к элементу
            if (remoteAudio && event.streams[0]) {
                remoteAudio.srcObject = event.streams[0];
                remoteAudio.play().then(() => {
                    console.log('✅ Remote audio playing');
                }).catch(e => {
                    console.error('❌ Audio play failed:', e);
                    // Пробуем еще раз с взаимодействием пользователя
                    document.addEventListener('click', function playAudio() {
                        remoteAudio.play().then(() => {
                            console.log('✅ Audio playing after user interaction');
                        });
                        document.removeEventListener('click', playAudio);
                    }, { once: true });
                });
            }
        }

        if (event.track.kind === 'video') {
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                document.getElementById('noRemoteVideo').style.display = 'none';
            }
        }
    };

    // СОСТОЯНИЕ СОЕДИНЕНИЯ
    pc.onconnectionstatechange = () => {
        console.log('📡 WebRTC state:', pc.connectionState);

        if (pc.connectionState === 'connected') {
            console.log('✅ Peers connected!');
            document.getElementById('callStatusText').textContent = 'Соединение установлено';
            hideRingingOverlay();
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            hideCallInterface();
            showNotification('📞 Связь прервана');
            cleanupCall();
        }
    };

    return pc;
}

// ============ ТАЙМЕР ============

function startCallTimer() {
    callSeconds = 0;
    callStartTime = Date.now();
    updateCallTimer();

    if (callTimer) clearInterval(callTimer);

    callTimer = setInterval(() => {
        callSeconds = Math.floor((Date.now() - callStartTime) / 1000);
        updateCallTimer();
    }, 1000);
}

function updateCallTimer() {
    const mins = Math.floor(callSeconds / 60);
    const secs = callSeconds % 60;
    const el = document.getElementById('callTimer');
    if (el) {
        el.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    }
}

// Анимация для уведомлений
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInOut {
        0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
        15% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        85% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
    }
`;
document.head.appendChild(style);

console.log('✅ Call system v5.0 loaded - Audio fixed');