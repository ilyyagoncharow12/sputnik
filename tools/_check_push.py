import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import database  # noqa: E402
import push  # noqa: E402

database.init_db()
c = sqlite3.connect('sputnik.db')
print('таблица push_subscriptions:',
      bool(c.execute("SELECT 1 FROM sqlite_master WHERE type='table' "
                     "AND name='push_subscriptions'").fetchone()))
print('колонки:', [r[1] for r in c.execute('PRAGMA table_info(push_subscriptions)')])
print('строк:', c.execute('SELECT COUNT(*) FROM push_subscriptions').fetchone()[0])
c.close()
st = push.status()
print('push status:', {k: (v[:12] + '...' if k == 'public_key' and v else v)
                       for k, v in st.items()})
