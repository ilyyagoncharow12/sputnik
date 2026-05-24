# call_manager.py
import uuid
from datetime import datetime
from database import add_call, update_call_status, get_user_by_id


class CallManager:
    def __init__(self):
        self.active_calls = {}  # {room_id: CallSession}

    def create_call_room(self, initiator_id, call_type='audio'):
        """Создает новую комнату для звонка"""
        room_id = f"call_{uuid.uuid4().hex[:12]}"

        self.active_calls[room_id] = {
            'room_id': room_id,
            'initiator_id': initiator_id,
            'call_type': call_type,
            'participants': [initiator_id],
            'started_at': datetime.now(),
            'status': 'initiated'
        }

        return room_id

    def join_call(self, room_id, user_id):
        """Присоединиться к звонку"""
        if room_id in self.active_calls:
            if user_id not in self.active_calls[room_id]['participants']:
                self.active_calls[room_id]['participants'].append(user_id)
            self.active_calls[room_id]['status'] = 'active'
            return True
        return False

    def leave_call(self, room_id, user_id):
        """Покинуть звонок"""
        if room_id in self.active_calls:
            if user_id in self.active_calls[room_id]['participants']:
                self.active_calls[room_id]['participants'].remove(user_id)

            if len(self.active_calls[room_id]['participants']) == 0:
                del self.active_calls[room_id]
            return True
        return False

    def end_call(self, room_id):
        """Завершить звонок"""
        if room_id in self.active_calls:
            call = self.active_calls[room_id]
            duration = int((datetime.now() - call['started_at']).total_seconds())

            # Сохраняем в БД
            for participant_id in call['participants']:
                if participant_id != call['initiator_id']:
                    add_call(call['initiator_id'], participant_id, call['call_type'], 'ended')
                    update_call_status(
                        add_call(call['initiator_id'], participant_id, call['call_type'], 'ended'),
                        'ended',
                        duration
                    )

            del self.active_calls[room_id]
            return duration
        return 0

    def get_call_info(self, room_id):
        """Получить информацию о звонке"""
        return self.active_calls.get(room_id)

    def is_user_in_call(self, user_id):
        """Проверить, находится ли пользователь в звонке"""
        for room_id, call in self.active_calls.items():
            if user_id in call['participants']:
                return room_id
        return None


# Глобальный экземпляр
call_manager = CallManager()