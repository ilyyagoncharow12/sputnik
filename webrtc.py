# webrtc.py
import json
import logging
from flask_socketio import emit, join_room, leave_room, rooms
from flask import session

# Настройка логирования
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Хранилище активных звонков
active_calls = {}  # {room_id: {participants: {}, call_type: 'audio'/'video'}}


class WebRTCManager:
    def __init__(self, socketio):
        self.socketio = socketio
        self.active_calls = {}
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

        @self.socketio.on('ice_candidate')
        def handle_ice_candidate(data):
            """Пересылает ICE кандидатов"""
            try:
                target_sid = data.get('target_sid')
                candidate = data.get('candidate')

                if target_sid and candidate:
                    emit('ice_candidate', {
                        'candidate': candidate,
                        'from_sid': data.get('from_sid')
                    }, room=target_sid)
            except Exception as e:
                logger.error(f"Error handling ICE candidate: {e}")

        @self.socketio.on('initiate_call')
        def handle_initiate_call(data):
            """Обрабатывает начало звонка"""
            try:
                user_id = session.get('user_id')
                if not user_id:
                    emit('call_error', {'error': 'Not authenticated'})
                    return

                target_user_id = data.get('target_user_id')
                call_type = data.get('call_type', 'audio')

                if not target_user_id:
                    emit('call_error', {'error': 'No target user specified'})
                    return

                # Создаем комнату для звонка
                call_room = f"call_{user_id}_{target_user_id}_{call_type}"

                # Отправляем запрос на звонок целевому пользователю
                caller_data = {
                    'caller_id': user_id,
                    'caller_name': session.get('display_name', session.get('username')),
                    'caller_sid': data.get('caller_sid'),
                    'call_type': call_type,
                    'room_id': call_room
                }

                # Присоединяем инициатора к комнате
                join_room(call_room)

                # Уведомляем целевого пользователя
                emit('incoming_call', caller_data, room=f"user_{target_user_id}")

                # Сохраняем информацию о звонке
                self.active_calls[call_room] = {
                    'initiator_id': user_id,
                    'target_id': target_user_id,
                    'call_type': call_type,
                    'start_time': None,
                    'status': 'ringing'
                }

                logger.info(f"Call initiated: {call_room}")

            except Exception as e:
                logger.error(f"Error initiating call: {e}")
                emit('call_error', {'error': str(e)})

        @self.socketio.on('accept_call')
        def handle_accept_call(data):
            """Обрабатывает принятие звонка"""
            try:
                user_id = session.get('user_id')
                if not user_id:
                    return

                room_id = data.get('room_id')
                caller_sid = data.get('caller_sid')

                if room_id:
                    join_room(room_id)

                    if room_id in self.active_calls:
                        self.active_calls[room_id]['status'] = 'active'

                    # Уведомляем инициатора что звонок принят
                    emit('call_accepted', {
                        'room_id': room_id,
                        'accepter_sid': data.get('accepter_sid'),
                        'accepter_id': user_id
                    }, room=caller_sid)

                    logger.info(f"Call accepted: {room_id}")

            except Exception as e:
                logger.error(f"Error accepting call: {e}")

        @self.socketio.on('reject_call')
        def handle_reject_call(data):
            """Обрабатывает отклонение звонка"""
            try:
                room_id = data.get('room_id')
                caller_sid = data.get('caller_sid')

                if room_id:
                    if room_id in self.active_calls:
                        self.active_calls[room_id]['status'] = 'rejected'

                    emit('call_rejected', {
                        'room_id': room_id,
                        'reason': 'declined'
                    }, room=caller_sid)

                    logger.info(f"Call rejected: {room_id}")

            except Exception as e:
                logger.error(f"Error rejecting call: {e}")

        @self.socketio.on('end_call')
        def handle_end_call(data):
            """Завершает звонок"""
            try:
                room_id = data.get('room_id')

                if room_id:
                    if room_id in self.active_calls:
                        self.active_calls[room_id]['status'] = 'ended'
                        del self.active_calls[room_id]

                    # Уведомляем всех участников о завершении звонка
                    emit('call_ended', {
                        'room_id': room_id,
                        'ended_by': session.get('user_id')
                    }, room=room_id)

                    # Покидаем комнату
                    leave_room(room_id)

                    logger.info(f"Call ended: {room_id}")

            except Exception as e:
                logger.error(f"Error ending call: {e}")

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