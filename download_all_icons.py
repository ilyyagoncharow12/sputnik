import urllib.request
import os

os.makedirs('static/icons/tgciosicons', exist_ok=True)

# Все нужные иконки из пакета Telegram Colored iOS Icons
icons = {
    'contacts': 7,      # 👥 люди
    'calls': 29,        # 📞 телефон
    'favorites': 13,    # 🔥 огонь (избранное/премиум)
    'folders': 46,      # 📂 папка
    'blocked': 2,       # 🚫 запрет
    'discover': 34,     # 🌎 земля (поиск)
    'create_group': 42, # 👥 люди (группа)
    'create_channel': 20, # 📣 мегафон (канал)
    'settings': 6,      # 🔋 батарея (настройки)
    'appearance': 45,   # 🪩 диско-шар (оформление)
    'privacy': 28,      # 🛡 щит (конфиденциальность)
    'sessions': 79,     # ? (сессии)
    'support': 39,      # 🛡 щит (техподдержка)
    'night_theme': 44,  # 🪄 волшебная палочка (тема)
    'logout': 25,       # 🗑 корзина (выход)
    'premium': 13,      # 🔥 огонь (премиум)
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
