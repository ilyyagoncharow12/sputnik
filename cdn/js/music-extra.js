    // ===== ПЕСНИ =====
    function uploadSongToPlaylist() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.onchange = function(e) {
            const file = e.target.files[0];
            if (!file) return;

            const title = prompt('Название песни:', file.name.replace(/\.[^/.]+$/, ''));
            const artist = prompt('Исполнитель:', 'Неизвестен');

            if (!title) {
                alert('Название обязательно');
                return;
            }

            const fd = new FormData();
            fd.append('file', file);
            fd.append('title', title);
            fd.append('artist', artist || 'Неизвестен');

            fetch('/api/playlist/add', { method: 'POST', body: fd })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        closeModal('tempModal');
                        openPlaylistManager();
                    } else {
                        alert('Ошибка при загрузке: ' + (data.error || 'неизвестная ошибка'));
                    }
                })
                .catch(err => alert('Ошибка при загрузке: ' + err.message));
        };
        input.click();
    }

    function playSongFromList(filePath, title, artist, index) {
        if (window.currentAudio) {
            window.currentAudio.pause();
            window.currentAudio = null;
        }

        const audio = new Audio('/' + filePath);
        window.currentAudio = audio;
        window.currentPlaylistIndex = index;

        document.getElementById('playerTrackName').textContent = title;
        document.getElementById('playerTrackArtist').textContent = artist;
        document.getElementById('playerBar').style.display = 'flex';
        document.getElementById('playPauseBtn').innerHTML = '<i class="fas fa-pause-circle" style="font-size: 28px; color: #007aff;"></i>';

        audio.play();

        audio.onended = function() {
            document.getElementById('playPauseBtn').innerHTML = '<i class="fas fa-play-circle" style="font-size: 28px; color: #007aff;"></i>';
            if (window.currentPlaylist && window.currentPlaylistIndex < window.currentPlaylist.length - 1) {
                const nextSong = window.currentPlaylist[window.currentPlaylistIndex + 1];
                if (nextSong && nextSong.file_path) {
                    playSongFromList(nextSong.file_path, nextSong.title, nextSong.artist, window.currentPlaylistIndex + 1);
                }
            }
        };
    }

    function togglePlayPause() {
        if (!window.currentAudio) return;

        if (window.currentAudio.paused) {
            window.currentAudio.play();
            document.getElementById('playPauseBtn').innerHTML = '<i class="fas fa-pause-circle" style="font-size: 28px; color: #007aff;"></i>';
        } else {
            window.currentAudio.pause();
            document.getElementById('playPauseBtn').innerHTML = '<i class="fas fa-play-circle" style="font-size: 28px; color: #007aff;"></i>';
        }
    }

    function prevTrack() {
        if (!window.currentPlaylist || window.currentPlaylistIndex <= 0) return;
        const prevSong = window.currentPlaylist[window.currentPlaylistIndex - 1];
        if (prevSong && prevSong.file_path) {
            playSongFromList(prevSong.file_path, prevSong.title, prevSong.artist, window.currentPlaylistIndex - 1);
        }
    }

    function nextTrack() {
        if (!window.currentPlaylist || window.currentPlaylistIndex >= window.currentPlaylist.length - 1) return;
        const nextSong = window.currentPlaylist[window.currentPlaylistIndex + 1];
        if (nextSong && nextSong.file_path) {
            playSongFromList(nextSong.file_path, nextSong.title, nextSong.artist, window.currentPlaylistIndex + 1);
        }
    }

    function deleteSongFromPlaylist(songId) {
        if (confirm('Удалить песню из плейлиста?')) {
            fetch(`/api/playlist/delete/${songId}`, { method: 'POST' })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        closeModal('tempModal');
                        openPlaylistManager();
                    } else {
                        alert('Ошибка при удалении');
                    }
                });
        }
    }

    // ===== ПРИНУДИТЕЛЬНАЯ ПРИВЯЗКА СОБЫТИЙ ДЛЯ ИСТОРИЙ =====
document.getElementById('storyViewerModal').addEventListener('click', function(e) {
    const target = e.target;

    // Кнопка статистики
    if (target.closest('.stats-btn') || (target.closest('button') && target.closest('button').textContent.includes('Статистика'))) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Stats button clicked!');
        showStoryStats();
        return;
    }


// chat.html - замените существующую функцию makeCall на эту:

// Замените существующую функцию makeCall
function makeCall(callType) {
    if (!currentChat || currentChatType !== 'personal') {
        showToast('Выберите пользователя для звонка');
        return;
    }

    const targetId = currentChat.other_user_id || currentChat.id;

    if (targetId === currentUser.id) {
        showToast('Нельзя позвонить самому себе');
        return;
    }

    // Устанавливаем имя контакта
    document.getElementById('callContactName').textContent =
        currentChat.name || 'Пользователь';

    // Запускаем звонок
    callIntegration.startCall(targetId, callType);
}

function startGroupVideoCall() {
    if (!currentChat || currentChatType !== 'group') {
        showToast('Групповые звонки доступны только в группах');
        return;
    }

    // Открываем комнату для группового видео
    fetch('/api/video/create_room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_type: 'video' })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            window.open(
                `/video/${data.room_id}`,
                'SputnikGroupCall',
                'width=1024,height=768'
            );
        }
    });
}

function startGroupVideoCall() {
    if (!currentChat || currentChatType !== 'group') {
        alert('Групповые звонки доступны только в группах');
        return;
    }

    // Создаем комнату для группового звонка
    fetch('/api/video/create_room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_type: 'video' })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            window.open(
                `/video/${data.room_id}`,
                'SputnikGroupCall',
                'width=1024,height=768'
            );
        }
    });
}

function showIncomingCallModal(data) {
    const accept = confirm(
        `Входящий ${data.call_type === 'video' ? 'видеозвонок' : 'звонок'} от ${data.caller_name}\n\nПринять?`
    );

    if (accept) {
        // Открываем страницу звонка и принимаем
        window.open(
            `/call?action=accept&room=${data.room_id}&type=${data.call_type}`,
            'SputnikCall',
            'width=800,height=600'
        );
    } else {
        // Отклоняем звонок
        fetch('/api/update_call_status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                call_id: data.call_id,
                status: 'rejected'
            })
        });
    }
}


    // ===== ФИКС ДЛЯ ЛАЙКОВ И РЕАКЦИЙ В ИСТОРИЯХ =====
// ===== ПОЛНЫЙ ФИКС КНОПОК В ИСТОРИЯХ =====
(function() {
    // Ждем загрузки DOM
    function initStoryButtons() {
        const storyViewer = document.getElementById('storyViewerModal');
        if (!storyViewer) {
            setTimeout(initStoryButtons, 100);
            return;
        }

        // Удаляем старые обработчики
        const newStoryViewer = storyViewer.cloneNode(true);
        storyViewer.parentNode.replaceChild(newStoryViewer, storyViewer);

        // Добавляем новый обработчик
        newStoryViewer.addEventListener('click', function(e) {
            const target = e.target;

            // КНОПКА ЛАЙКА (СЕРДЕЧКО)
            if (target.closest('#storyLikeBtn') || target.closest('.fa-heart')?.closest('button')) {
                e.preventDefault();
                e.stopPropagation();

                const story = currentStories[currentStoryIndex];
                if (!story) return;

                console.log('❤️ Отправка лайка для истории:', story.id);

                const btn = target.closest('button');
                if (btn) {
                    btn.style.transform = 'scale(1.3)';
                    setTimeout(() => { if (btn) btn.style.transform = 'scale(1)'; }, 200);
                }

                // Анимация сердечек
                for (let i = 0; i < 7; i++) {
                    setTimeout(() => {
                        const heart = document.createElement('div');
                        heart.innerHTML = '❤️';
                        heart.style.cssText = `
                            position: fixed;
                            font-size: ${20 + Math.random() * 30}px;
                            pointer-events: none;
                            z-index: 10000;
                            left: ${40 + Math.random() * 60}%;
                            top: ${30 + Math.random() * 40}%;
                            animation: floatUp 1s ease-out forwards;
                        `;
                        document.body.appendChild(heart);
                        setTimeout(() => heart.remove(), 1000);
                    }, i * 80);
                }

                // Отправка на сервер
                fetch('/api/story_like', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ story_id: story.id })
                })
                .then(r => r.json())
                .then(d => {
                    if (d.success) {
                        console.log('✅ Лайк отправлен!');
                    }
                })
                .catch(err => console.error('❌ Ошибка лайка:', err));

                return;
            }

            // КНОПКА ОТВЕТА (КОММЕНТАРИЙ) - ОТКРЫВАЕТ МОДАЛКУ ОТВЕТА СО ОБЛОЖКОЙ ИСТОРИИ
            if (target.closest('#storyReplyBtn') || target.closest('.fa-comment')?.closest('button')) {
                e.preventDefault();
                e.stopPropagation();

                const story = currentStories[currentStoryIndex];
                if (!story) return;

                openStoryReplyModal(story);
                return;
            }

            // КНОПКИ АВТОРА ИСТОРИИ (статистика / заменить / поделиться / удалить)
            const ownerBtn = target.closest('.story-action-btn.owner-btn');
            if (ownerBtn) {
                e.preventDefault();
                e.stopPropagation();

                const action = ownerBtn.getAttribute('data-action');
                const story = currentStories[currentStoryIndex];
                if (!story) return;

                if (action === 'stats') {
                    showStoryStats();
                } else if (action === 'delete') {
                    deleteCurrentStory(story);
                } else if (action === 'replace') {
                    replaceCurrentStory(story);
                } else if (action === 'share') {
                    openShareStoryModal(story);
                }
                return;
            }

            // РЕАКЦИИ (❤️🔥👎👍)
            const reactionSpan = target.closest('.story-reaction');
            if (reactionSpan) {
                e.preventDefault();
                e.stopPropagation();

                const reaction = reactionSpan.textContent.trim();
                const story = currentStories[currentStoryIndex];

                if (!story || !reaction) return;

                console.log('😍 Отправка реакции:', reaction, 'для истории:', story.id);

                // Анимация
                reactionSpan.style.transform = 'scale(1.4)';
                reactionSpan.style.opacity = '0.6';
                setTimeout(() => {
                    reactionSpan.style.transform = 'scale(1)';
                    reactionSpan.style.opacity = '1';
                }, 250);

                // Отправка на сервер
                fetch('/api/story_reaction', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        story_id: story.id,
                        reaction: reaction
                    })
                })
                .then(r => r.json())
                .then(d => {
                    if (d.success) {
                        console.log('✅ Реакция отправлена!');
                        if (typeof showToast === 'function') {
                            showToast(`${reaction} Реакция отправлена автору!`);
                        }
                    }
                })
                .catch(err => console.error('❌ Ошибка реакции:', err));

                return;
            }
        }, true); // capture phase
    }

    // Запускаем после загрузки DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initStoryButtons);
    } else {
        initStoryButtons();
    }
})();

    // Навигация по историям (левая/правая сторона)
    if (target.closest('.story-nav-left') || target.closest('.story-nav-right')) {
        // Навигация уже обрабатывается в HTML
        return;
    }

    // Закрытие по кнопке
    if (target.closest('.story-close-btn')) {
        console.log('Close button clicked!');
        closeStoryViewer();
        return;
    }
}, true); // true = фаза перехвата (capture phase)


