import urllib.request
import os

os.makedirs('static/icons/tgciosicons', exist_ok=True)

icons = {
    'sessions': 79,      # активные сессии
    'appearance': 45,    # оформление
    'folders': 46,       # папки с чатами
    'support': 39,       # техподдержка
    'night_theme': 44,   # день/ночь тема
}

for name, num in icons.items():
    url = f'https://data.chpic.su/stickers/t/tgciosicons/tgciosicons_{num:03d}.webp?v=1694532003'
    path = f'static/icons/tgciosicons/{name}.webp'
    try:
        urllib.request.urlretrieve(url, path)
        print(f'Downloaded: {name} ({num}) -> {path}')
    except Exception as e:
        print(f'Error downloading {name} ({num}): {e}')

print('Done!')
