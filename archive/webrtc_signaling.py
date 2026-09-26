# webrtc_signaling.py
import json
import logging
from datetime import datetime
from flask_socketio import emit, join_room, leave_room

logger = logging.getLogger(__name__)


class WebRTCSignaling:
    def __init__(self, socketio):
        self.socketio = socketio
        self.active_rooms = {}  # {room_id: {participants: [], call_data: {}}}
        self.setup_handlers()

    def setup_handlers(self):
        """Настройка всех обработчиков WebRTC сигналов"""

        @self.socketio.on('call_join')
        def handle_call_join(data):
            """Пользователь присоединяется к звонку"""
            from flask import session
            user_id = session.get('user_id')
            if not user_id:
                return

            room_id = data.get('room_id')
            call_type = data.get('call_type', 'audio')

            join_room(room_id)

            if room_id not in self.active_rooms:
                self.active_rooms[room_id] = {
                    'participants': {},
                    'call_type': call_type,
                    'started_at': datetime.now().isoformat(),
                    'initiator_id': data.get('initiator_id')
                }

            self.active_rooms[room_id]['participants'][user_id] = {
                'sid': data.get('sid'),
                'username': session.get('display_name', session.get('username')),
                'joined_at': datetime.now().isoformat(),
                'audio_enabled': True,
                'video_enabled': call_type == 'video',
                'screen_sharing': False
            }

            # Уведомляем всех о новом участнике
            emit('user_joined_call', {
                'user_id': user_id,
                'username': session.get('display_name', session.get('username')),
                'participants': list(self.active_rooms[room_id]['participants'].keys()),
                'total': len(self.active_rooms[room_id]['participants'])
            }, room=room_id)

            logger.info(f"User {user_id} joined call room {room_id}")

        @self.socketio.on('call_leave')
        def handle_call_leave(data):
            """Пользователь покидает звонок"""
            from flask import session
            user_id = session.get('user_id')
            if not user_id:
                return

            room_id = data.get('room_id')

            if room_id in self.active_rooms:
                if user_id in self.active_rooms[room_id]['participants']:
                    del self.active_rooms[room_id]['participants'][user_id]

                # Уведомляем оставшихся участников
                emit('user_left_call', {
                    'user_id': user_id,
                    'participants': list(self.active_rooms[room_id]['participants'].keys()),
                    'total': len(self.active_rooms[room_id]['participants'])
                }, room=room_id)

                # Если никого не осталось, удаляем комнату
                if len(self.active_rooms[room_id]['participants']) == 0:
                    del self.active_rooms[room_id]

            leave_room(room_id)
            logger.info(f"User {user_id} left call room {room_id}")

        @self.socketio.on('call_offer')
        def handle_call_offer(data):
            """Пересылает SDP offer"""
            target_user_id = data.get('target_user_id')
            offer = data.get('offer')

            if target_user_id and offer:
                from flask import session
                emit('call_offer_received', {
                    'offer': offer,
                    'from_user_id': session.get('user_id'),
                    'from_username': session.get('display_name', session.get('username')),
                    'is_screen_share': data.get('is_screen_share', False)
                }, room=f"user_{target_user_id}")

        @self.socketio.on('call_answer')
        def handle_call_answer(data):
            """Пересылает SDP answer"""
            target_user_id = data.get('target_user_id')
            answer = data.get('answer')

            if target_user_id and answer:
                from flask import session
                emit('call_answer_received', {
                    'answer': answer,
                    'from_user_id': session.get('user_id'),
                    'from_username': session.get('display_name', session.get('username'))
                }, room=f"user_{target_user_id}")

        @self.socketio.on('ice_candidate')
        def handle_ice_candidate(data):
            """Пересылает ICE кандидатов"""
            target_user_id = data.get('target_user_id')
            candidate = data.get('candidate')

            if target_user_id and candidate:
                emit('ice_candidate_received', {
                    'candidate': candidate,
                    'from_user_id': data.get('from_user_id')
                }, room=f"user_{target_user_id}")

        @self.socketio.on('call_control')
        def handle_call_control(data):
            """Управление звонком (mute, video off, screen share)"""
            room_id = data.get('room_id')
            action = data.get('action')  # 'mute', 'unmute', 'video_off', 'video_on', 'screen_start', 'screen_stop'

            if room_id:
                from flask import session
                user_id = session.get('user_id')

                if room_id in self.active_rooms and user_id in self.active_rooms[room_id]['participants']:
                    participant = self.active_rooms[room_id]['participants'][user_id]

                    if action == 'mute':
                        participant['audio_enabled'] = False
                    elif action == 'unmute':
                        participant['audio_enabled'] = True
                    elif action == 'video_off':
                        participant['video_enabled'] = False
                    elif action == 'video_on':
                        participant['video_enabled'] = True
                    elif action == 'screen_start':
                        participant['screen_sharing'] = True
                    elif action == 'screen_stop':
                        participant['screen_sharing'] = False

                    # Уведомляем всех об изменении
                    emit('call_state_changed', {
                        'user_id': user_id,
                        'action': action,
                        'participants': {
                            uid: {
                                'audio_enabled': p['audio_enabled'],
                                'video_enabled': p['video_enabled'],
                                'screen_sharing': p['screen_sharing']
                            }
                            for uid, p in self.active_rooms[room_id]['participants'].items()
                        }
                    }, room=room_id)

        @self.socketio.on('request_call')
        def handle_request_call(data):
            """Запрос на звонок другому пользователю"""
            from flask import session
            target_user_id = data.get('target_user_id')
            call_type = data.get('call_type', 'audio')
            room_id = data.get('room_id')

            if target_user_id:
                emit('incoming_call_request', {
                    'caller_id': session.get('user_id'),
                    'caller_name': session.get('display_name', session.get('username')),
                    'call_type': call_type,
                    'room_id': room_id
                }, room=f"user_{target_user_id}")

        @self.socketio.on('call_response')
        def handle_call_response(data):
            """Ответ на запрос звонка"""
            target_user_id = data.get('target_user_id')
            accepted = data.get('accepted', False)
            room_id = data.get('room_id')

            if target_user_id:
                emit('call_response_received', {
                    'accepted': accepted,
                    'room_id': room_id,
                    'from_user_id': data.get('from_user_id')
                }, room=f"user_{target_user_id}")

    def get_room_info(self, room_id):
        """Получить информацию о комнате"""
        return self.active_rooms.get(room_id)

    def get_active_calls_count(self):
        """Получить количество активных звонков"""
        return len(self.active_rooms)