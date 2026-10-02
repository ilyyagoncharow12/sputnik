# -*- coding: utf-8 -*-
"""Готовит данные для проверки корзины в UI: несколько удалённых сообщений
в личном чате, один скрытый «у меня» и один живой. Печатает chat_id."""
import main
import database
from database import get_db, dict_cursor

app = main.app
UID = 4
OTHER = 2
cid = database.get_or_create_chat(UID, OTHER)

conn = get_db()
cur = dict_cursor(conn)
ids = []
for txt in ['корзина: удалено у всех (1)', 'корзина: удалено у всех (2)', 'живое сообщение (не в корзине)']:
    cur.execute("INSERT INTO messages (chat_id, sender_id, content) VALUES (%s, %s, %s) RETURNING id",
                (cid, UID, txt))
    ids.append(cur.fetchone()['id'])
# одно скрыто «у меня»
cur.execute("INSERT INTO messages (chat_id, sender_id, content) VALUES (%s, %s, %s) RETURNING id",
            (cid, OTHER, 'корзина: скрыто у меня'))
hid = cur.fetchone()['id']
conn.commit()
conn.close()

database.delete_message(ids[0], UID, delete_for_all=True)
database.delete_message(ids[1], UID, delete_for_all=True)
database.delete_message(hid, UID, delete_for_all=False)

print('chat_id =', cid)
print('for_all =', ids[0], ids[1], ' hidden =', hid, ' live =', ids[2])
