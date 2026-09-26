# webrtc.py
import logging
from flask_socketio import emit
from flask import session

# Настройка логирования
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)


class WebRTCManager:
    """Управление WebRTC-сигналами для страниц call_interface.html.

    Здесь остаются только события, которых нет в main.py:
      - webrtc_offer / webrtc_answer / ice_candidate-маршруты по target_sid
        (вызовы с call_interface.html);
      - toggle_audio / toggle_video (статусы микрофона/камеры в комнате).
    Обработчики initiate_call / accept_call / reject_call / end_call /
    ice_candidate дублируют main.py и были удалены (main.py регистрируется
    позже и перекрывает их).
    """

    def __init__(self, socketio):
        self.socketio = socketio
        self.setup_handlers()

    def setup_handlers(self):
        """Настройка обработчиков WebRTC сигналов"""

        @self.socketio.on('webrtc_offer')
        def handle_offer(data):
            """Пересылает SDP offer другому участнику"""
            try:
                target_sid = data.get('target_sid')
                offer = data.get('offer')
                from_user = session.get('display_name', session.get('username', 'Unknown'))

                if target_sid and offer:
                    logger.info(f"Forwarding WebRTC offer to {target_sid}")
                    emit('webrtc_offer', {
                        'offer': offer,
                        'from_sid': data.get('from_sid'),
                        'from_user': from_user,
                        'call_type': data.get('call_type', 'audio')
                    }, room=target_sid)
            except Exception as e:
                logger.error(f"Error handling offer: {e}")

        @self.socketio.on('webrtc_answer')
        def handle_answer(data):
            """Пересылает SDP answer инициатору звонка"""
            try:
                target_sid = data.get('target_sid')
                answer = data.get('answer')

                if target_sid and answer:
                    logger.info(f"Forwarding WebRTC answer to {target_sid}")
                    emit('webrtc_answer', {
                        'answer': answer,
                        'from_sid': data.get('from_sid')
                    }, room=target_sid)
            except Exception as e:
                logger.error(f"Error handling answer: {e}")

        @self.socketio.on('toggle_audio')
        def handle_toggle_audio(data):
            """Обрабатывает включение/выключение аудио"""
            try:
                room_id = data.get('room_id')
                enabled = data.get('enabled', True)

                if room_id:
                    emit('audio_toggled', {
                        'user_id': session.get('user_id'),
                        'enabled': enabled
                    }, room=room_id, include_self=False)
            except Exception as e:
                logger.error(f"Error toggling audio: {e}")

        @self.socketio.on('toggle_video')
        def handle_toggle_video(data):
            """Обрабатывает включение/выключение видео"""
            try:
                room_id = data.get('room_id')
                enabled = data.get('enabled', True)

                if room_id:
                    emit('video_toggled', {
                        'user_id': session.get('user_id'),
                        'enabled': enabled
                    }, room=room_id, include_self=False)
            except Exception as e:
                logger.error(f"Error toggling video: {e}")


# Фабрика для создания менеджера
def init_webrtc(socketio):
    return WebRTCManager(socketio)