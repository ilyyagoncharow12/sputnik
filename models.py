# models.py — SQLAlchemy ORM-модели для проекта Спутник.
#
# Соответствуют схеме, создаваемой init_db() в database.py.
# Таблицы мапятся как "proxied" (autoload_with не используется) — колонки
# объявлены вручную в точности по финальной схеме, включая все колонки,
# добавленные поздними ALTER TABLE миграциями (is_banned, ban_reason,
# banner_color, banner_image, is_system, poll_id, expires_at).
#
# Из-за смешанного регистра/нестандартных имён колонок (например camelCase
# далее не встречается, все snake_case) можно мапить напрямую. SQLAlchemy
# по умолчанию использует имя атрибута как имя колонки (snake_case совпадает).

from sqlalchemy import (
    Column, Integer, BigInteger, Text, Boolean, ForeignKey, UniqueConstraint,
    PrimaryKeyConstraint, Index,
)
from sqlalchemy.orm import declarative_base


Base = declarative_base()


class User(Base):
    """Пользователь (таблица users) — финальная схема со всеми миграциями."""
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True)
    unique_id = Column(Integer, unique=True, nullable=False)
    phone = Column(Text, unique=True, nullable=False)
    username = Column(Text, unique=True)
    display_name = Column(Text)
    password = Column(Text, nullable=False)
    avatar = Column(Text)
    bio = Column(Text)
    birthday = Column(Text)
    last_seen = Column('last_seen', Text)          # TIMESTAMPTZ возвращается как текст/через psycopg2
    created_at = Column('created_at', Text)
    privacy_last_seen = Column(Text, default='everyone')
    privacy_photo = Column(Text, default='everyone')
    privacy_forward = Column(Text, default='everyone')
    privacy_calls = Column(Text, default='everyone')
    privacy_messages = Column(Text, default='everyone')
    theme = Column(Text, default='light')
    font_size = Column(Integer, default=14)
    bubble_radius = Column(Integer, default=18)
    font_family = Column(Text, default='Unbounded, cursive')
    my_message_color = Column(Text, default='#667eea')
    their_message_color = Column(Text, default='#f3f4f6')
    wallpaper = Column(Text, default='')
    wallpaper_image = Column(Text)
    email = Column(Text)
    is_deleted = Column(Boolean, default=False)
    deleted_at = Column(Text)
    registration_complete = Column(Boolean, default=False)

    # Колонки, добавленные миграциями
    is_banned = Column(Boolean, default=False)
    ban_reason = Column(Text)
    banner_color = Column(Text, default='#2b8d8d')
    banner_image = Column(Text)
    is_system = Column(Boolean, default=False)

    __table_args__ = (
        Index('idx_users_unique_id', 'unique_id'),
        Index('idx_users_username', 'username'),
        Index('idx_users_phone', 'phone'),
    )


class SvcTrace(Base):
    __tablename__ = 'svc_traces'
    id = Column(Integer, primary_key=True)
    actor = Column(Text, nullable=False)
    action = Column(Text, nullable=False)
    details = Column(Text)
    created_at = Column(Text)


class Chat(Base):
    __tablename__ = 'chats'
    id = Column(Integer, primary_key=True)
    user1_id = Column(Integer, nullable=False)
    user2_id = Column(Integer, nullable=False)
    created_at = Column(Text)
    __table_args__ = (UniqueConstraint('user1_id', 'user2_id', name='chats_user1_id_user2_id_key'),)


class LinkedAccount(Base):
    __tablename__ = 'linked_accounts'
    id = Column(Integer, primary_key=True)
    master_user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    linked_user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    created_at = Column(Text)
    __table_args__ = (UniqueConstraint('master_user_id', 'linked_user_id',
                                       name='linked_accounts_master_user_id_linked_user_id_key'),)


class Message(Base):
    __tablename__ = 'messages'
    id = Column(Integer, primary_key=True)
    chat_id = Column(Integer)
    group_id = Column(Integer)
    channel_id = Column(Integer)
    sender_id = Column(Integer, nullable=False)
    content = Column(Text)
    file_type = Column(Text)
    file_path = Column(Text)
    file_name = Column(Text)
    file_size = Column(Integer)
    is_read = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    deleted_for_all = Column(Boolean, default=False)
    edited_at = Column(Text)
    created_at = Column(Text)
    reply_to_id = Column(Integer)
    forwarded_from_id = Column(Integer)
    forwarded_from_user_id = Column(Integer)
    forwarded_from_username = Column(Text)
    forwarded_from_display_name = Column(Text)
    expires_at = Column(Text)
    poll_id = Column(Integer)
    __table_args__ = (
        Index('idx_messages_chat_id', 'chat_id'),
        Index('idx_messages_group_id', 'group_id'),
        Index('idx_messages_channel_id', 'channel_id'),
        Index('idx_messages_sender_id', 'sender_id'),
        Index('idx_messages_created_at', 'created_at'),
    )


class Contact(Base):
    __tablename__ = 'contacts'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    contact_id = Column(Integer, nullable=False)
    created_at = Column(Text)
    __table_args__ = (UniqueConstraint('user_id', 'contact_id', name='contacts_user_id_contact_id_key'),)


class ContactName(Base):
    __tablename__ = 'contact_names'
    user_id = Column(Integer, primary_key=True)
    contact_id = Column(Integer, primary_key=True)
    name = Column(Text, nullable=False)


class Favorite(Base):
    __tablename__ = 'favorites'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    file_type = Column(Text)
    file_path = Column(Text)
    file_name = Column(Text)
    note = Column(Text)
    created_at = Column(Text)


class Call(Base):
    __tablename__ = 'calls'
    id = Column(Integer, primary_key=True)
    caller_id = Column(Integer, nullable=False)
    receiver_id = Column(Integer, nullable=False)
    call_type = Column(Text)
    status = Column(Text)
    duration = Column(Integer, default=0)
    created_at = Column(Text)


class ChatFolder(Base):
    __tablename__ = 'chat_folders'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    name = Column(Text, nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(Text)


class FolderChat(Base):
    __tablename__ = 'folder_chats'
    id = Column(Integer, primary_key=True)
    folder_id = Column(Integer, ForeignKey('chat_folders.id', ondelete='CASCADE'), nullable=False)
    chat_id = Column(Integer, nullable=False)
    chat_type = Column(Text, nullable=False)
    chat_name = Column(Text)
    chat_avatar = Column(Text)
    other_user_id = Column(Integer)
    created_at = Column(Text)


class VideoCall(Base):
    __tablename__ = 'video_calls'
    id = Column(Integer, primary_key=True)
    room_id = Column(Text, unique=True, nullable=False)
    creator_id = Column(Integer, nullable=False)
    call_type = Column(Text, default='video')
    status = Column(Text, default='active')
    started_at = Column(Text)
    ended_at = Column(Text)
    duration = Column(Integer, default=0)
    participant_count = Column(Integer, default=1)


class VideoCallParticipant(Base):
    __tablename__ = 'video_call_participants'
    id = Column(Integer, primary_key=True)
    call_id = Column(Integer, nullable=False)
    user_id = Column(Integer, nullable=False)
    joined_at = Column(Text)
    left_at = Column(Text)
    audio_only = Column(Boolean, default=False)
    screensharing = Column(Boolean, default=False)


class UserSession(Base):
    __tablename__ = 'user_sessions'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    session_token = Column(Text, unique=True, nullable=False)
    device = Column(Text)
    ip = Column(Text)
    location = Column(Text)
    created_at = Column(Text)
    last_active = Column(Text)


class Story(Base):
    __tablename__ = 'stories'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    file_type = Column(Text)
    file_path = Column(Text)
    caption = Column(Text)
    music = Column(Text)
    created_at = Column(Text)
    expires_at = Column(Text)
    __table_args__ = (
        Index('idx_stories_user_id', 'user_id'),
        Index('idx_stories_expires_at', 'expires_at'),
    )


class StoryInteraction(Base):
    __tablename__ = 'story_interactions'
    id = Column(Integer, primary_key=True)
    story_id = Column(Integer, nullable=False)
    user_id = Column(Integer, nullable=False)
    type = Column('type', Text)
    reply_text = Column(Text)
    created_at = Column(Text)
    __table_args__ = (UniqueConstraint('story_id', 'user_id', 'type',
                                       name='story_interactions_story_id_user_id_type_key'),)


class StoryPrivacy(Base):
    __tablename__ = 'story_privacy'
    story_id = Column(Integer, ForeignKey('stories.id', ondelete='CASCADE'), primary_key=True)
    privacy_type = Column(Text)


class StoryAllowedUser(Base):
    __tablename__ = 'story_allowed_users'
    story_id = Column(Integer, primary_key=True)
    user_id = Column(Integer, primary_key=True)


class PinnedChat(Base):
    __tablename__ = 'pinned_chats'
    user_id = Column(Integer, primary_key=True)
    chat_id = Column(Integer, primary_key=True)
    pinned_at = Column(Text)


class Group(Base):
    __tablename__ = 'groups'
    id = Column(Integer, primary_key=True)
    name = Column(Text, nullable=False)
    description = Column(Text)
    owner_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    is_public = Column(Boolean, default=True)
    invite_link = Column(Text, unique=True)
    avatar = Column(Text)
    created_at = Column(Text)


class GroupMember(Base):
    __tablename__ = 'group_members'
    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey('groups.id', ondelete='CASCADE'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    role = Column(Text, default='member')
    joined_at = Column(Text)
    __table_args__ = (
        UniqueConstraint('group_id', 'user_id', name='group_members_group_id_user_id_key'),
        Index('idx_group_members_user_id', 'user_id'),
    )


class GroupPermission(Base):
    __tablename__ = 'group_permissions'
    group_id = Column(Integer, ForeignKey('groups.id', ondelete='CASCADE'), primary_key=True)
    role = Column(Text, primary_key=True)
    can_send_messages = Column(Boolean, default=True)
    can_send_media = Column(Boolean, default=True)
    can_add_members = Column(Boolean, default=False)
    can_pin_messages = Column(Boolean, default=False)
    can_change_info = Column(Boolean, default=False)
    can_delete_messages = Column(Boolean, default=False)
    can_ban_users = Column(Boolean, default=False)


class Channel(Base):
    __tablename__ = 'channels'
    id = Column(Integer, primary_key=True)
    name = Column(Text, nullable=False)
    description = Column(Text)
    owner_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    is_public = Column(Boolean, default=True)
    invite_link = Column(Text, unique=True)
    avatar = Column(Text)
    created_at = Column(Text)


class ChannelSubscriber(Base):
    __tablename__ = 'channel_subscribers'
    id = Column(Integer, primary_key=True)
    channel_id = Column(Integer, ForeignKey('channels.id', ondelete='CASCADE'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    subscribed_at = Column(Text)
    __table_args__ = (
        UniqueConstraint('channel_id', 'user_id', name='channel_subscribers_channel_id_user_id_key'),
        Index('idx_channel_subscribers_user_id', 'user_id'),
    )


class ChannelAdmin(Base):
    __tablename__ = 'channel_admins'
    channel_id = Column(Integer, ForeignKey('channels.id', ondelete='CASCADE'), primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), primary_key=True)
    can_post = Column(Boolean, default=True)
    can_edit = Column(Boolean, default=False)
    can_delete = Column(Boolean, default=False)
    can_add_admins = Column(Boolean, default=False)
    added_at = Column(Text)


class MessageReaction(Base):
    __tablename__ = 'message_reactions'
    id = Column(Integer, primary_key=True)
    message_id = Column(Integer, nullable=False)
    user_id = Column(Integer, nullable=False)
    reaction = Column(Text, nullable=False)
    created_at = Column(Text)
    __table_args__ = (UniqueConstraint('message_id', 'user_id', 'reaction',
                                       name='message_reactions_message_id_user_id_reaction_key'),)


class RecentSearch(Base):
    __tablename__ = 'recent_searches'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    search_query = Column(Text, nullable=False)
    search_type = Column(Text)
    created_at = Column(Text)


class PreloadedAvatar(Base):
    __tablename__ = 'preloaded_avatars'
    id = Column(Integer, primary_key=True)
    filename = Column(Text, unique=True, nullable=False)
    display_name = Column(Text)
    category = Column(Text, default='default')


class BlockedUser(Base):
    __tablename__ = 'blocked_users'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    blocked_user_id = Column(Integer, nullable=False)
    created_at = Column(Text)
    __table_args__ = (
        UniqueConstraint('user_id', 'blocked_user_id', name='blocked_users_user_id_blocked_user_id_key'),
        Index('idx_blocked_users_user_id', 'user_id'),
    )


class StoryReaction(Base):
    __tablename__ = 'story_reactions'
    id = Column(Integer, primary_key=True)
    story_id = Column(Integer, nullable=False)
    user_id = Column(Integer, nullable=False)
    reaction = Column(Text, nullable=False)
    created_at = Column(Text)
    __table_args__ = (UniqueConstraint('story_id', 'user_id', 'reaction',
                                       name='story_reactions_story_id_user_id_reaction_key'),)


class StoryView(Base):
    __tablename__ = 'story_views'
    id = Column(Integer, primary_key=True)
    story_id = Column(Integer, nullable=False)
    user_id = Column(Integer, nullable=False)
    viewed_at = Column(Text)
    __table_args__ = (UniqueConstraint('story_id', 'user_id', name='story_views_story_id_user_id_key'),)


class UserPlaylist(Base):
    __tablename__ = 'user_playlist'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    title = Column(Text, nullable=False)
    artist = Column(Text)
    file_path = Column(Text, nullable=False)
    duration = Column(Integer)
    created_at = Column(Text)


class UserAttachedChannel(Base):
    __tablename__ = 'user_attached_channel'
    user_id = Column(Integer, ForeignKey('users.id'), primary_key=True)
    channel_id = Column(Integer, ForeignKey('channels.id'), nullable=False)
    attached_at = Column(Text)


class LoginCode(Base):
    __tablename__ = 'login_codes'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    code = Column(Text, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(Text)
    expires_at = Column(Text)


class PinnedMessage(Base):
    __tablename__ = 'pinned_messages'
    id = Column(Integer, primary_key=True)
    scope = Column(Text, nullable=False)
    scope_id = Column(Integer, nullable=False)
    message_id = Column(Integer, nullable=False)
    pinned_by = Column(Integer, nullable=False)
    created_at = Column(Text)
    __table_args__ = (UniqueConstraint('scope', 'scope_id', name='pinned_messages_scope_scope_id_key'),)


class LinkPreview(Base):
    __tablename__ = 'link_previews'
    url = Column(Text, primary_key=True)
    title = Column(Text)
    description = Column(Text)
    image_url = Column(Text)
    created_at = Column(Text)


class Poll(Base):
    __tablename__ = 'polls'
    id = Column(Integer, primary_key=True)
    chat_id = Column(Integer)
    group_id = Column(Integer)
    channel_id = Column(Integer)
    question = Column(Text, nullable=False)
    options = Column(Text, nullable=False)
    is_anonymous = Column(Boolean, default=False)
    is_closed = Column(Boolean, default=False)
    created_by = Column(Integer)
    created_at = Column(Text)


class PollVote(Base):
    __tablename__ = 'poll_votes'
    id = Column(Integer, primary_key=True)
    poll_id = Column(Integer, nullable=False)
    user_id = Column(Integer, nullable=False)
    option_index = Column(Integer, nullable=False)
    __table_args__ = (UniqueConstraint('poll_id', 'user_id', name='poll_votes_poll_id_user_id_key'),)


# Дополнительные столбцы к существующим таблицам (поздние миграции уже в схемах выше).
# Краткая справка: users.is_banned, users.ban_reason, users.banner_color,
# users.banner_image, users.is_system, messages.expires_at, messages.poll_id — уже учтены.