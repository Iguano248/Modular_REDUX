import sqlite3
conn = sqlite3.connect('usuarios.db')
cur = conn.cursor()
cur.execute("SELECT sql FROM sqlite_master WHERE type='table'")
for row in cur.fetchall():
    if row[0]:
        print(row[0])
        print('\n===\n')
conn.close()
