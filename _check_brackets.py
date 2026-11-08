f = open('cdn/css/mobile.css','r',encoding='utf-8')
c = f.read()
f.close()
print('mobile.css: открывающих {', c.count('{'), 'закрывающих }', c.count('}'), 'Баланс:', 'OK' if c.count('{')==c.count('}') else 'ОШИБКА')

f = open('cdn/js/settings.js','r',encoding='utf-8')
c = f.read()
f.close()
# Простая проверка скобок
print('settings.js: {', c.count('{'), '}', c.count('}'), '(', c.count('('), ')', c.count(')'))
print('settings.js баланс {}:', 'OK' if c.count('{')==c.count('}') else 'ОШИБКА')
print('settings.js баланс ():', 'OK' if c.count('(')==c.count(')') else 'ОШИБКА')
