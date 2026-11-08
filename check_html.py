import re

with open('templates/chat.html', 'r', encoding='utf-8') as f:
    content = f.read()

open_divs = len(re.findall(r'<div[^>]*>', content))
close_divs = len(re.findall(r'</div>', content))
print(f'Open div: {open_divs}, Close div: {close_divs}, Diff: {open_divs - close_divs}')

scripts = len(re.findall(r'<script[^>]*>', content))
close_scripts = len(re.findall(r'</script>', content))
print(f'Open script: {scripts}, Close script: {close_scripts}, Diff: {scripts - close_scripts}')

imgs = len(re.findall(r'<img[^>]*>', content))
print(f'Img tags: {imgs}')

svg_open = len(re.findall(r'<svg[^>]*>', content))
svg_close = len(re.findall(r'</svg>', content))
print(f'Open svg: {svg_open}, Close svg: {svg_close}, Diff: {svg_open - svg_close}')
