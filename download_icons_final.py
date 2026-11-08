import urllib.request
import os

os.makedirs('static/icons/tgciosicons', exist_ok=True)

icons = {
    'contacts': 7,
    'calls': 29,
    'favorites': 13,
    'folders': 46,
    'blocked': 2,
    'discover': 34,
    'create_group': 42,
    'create_channel': 20,
    'settings': 6,
    'appearance': 45,
    'privacy': 28,
    'sessions': 79,
    'support': 39,
    'night_theme': 44,
    'logout': 25,
    'premium': 13,
}

for name, num in icons.items():
    url = f'https://data.chpic.su/stickers/t/tgciosicons/tgciosicons_{num:03d}.webp?v=1694532003'
    path = f'static/icons/tgciosicons/{name}.webp'
    try:
        urllib.request.urlretrieve(url, path)
        print(f'OK: {name} ({num})')
    except Exception as e:
        print(f'ERROR: {name} ({num}): {e}')

print('Done!')
