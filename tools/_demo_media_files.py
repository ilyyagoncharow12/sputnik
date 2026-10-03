# -*- coding: utf-8 -*-
"""Временные медиафайлы для проверки раздела «Медиа» в профиле (v0.62.4).

Создаёт несколько картинок, звук, «видео» и pdf в uploads/, чтобы
посмотреть галерею в браузере. Удаляется вместе с проверкой.
"""
import os
import math
import struct
import wave

from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'static')
PATHS = [
    ('uploads/photos/demo_1.png', 640, 640, (58, 132, 255, 255), 'ФОТО 1'),
    ('uploads/photos/demo_2.png', 640, 640, (52, 199, 89, 255), 'ФОТО 2'),
    ('uploads/photos/demo_3.png', 640, 640, (255, 149, 0, 255), 'ФОТО 3'),
    ('uploads/photos/demo_4.png', 640, 640, (255, 45, 85, 255), 'ФОТО 4'),
]


def make_photo(rel, w, h, color, label):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img = Image.new('RGBA', (w, h), color)
    d = ImageDraw.Draw(img)
    for y in range(h):
        k = y / h
        d.line([(0, y), (w, y)],
               fill=(int(color[0] * (1 - k * 0.55)), int(color[1] * (1 - k * 0.55)),
                     int(color[2] * (1 - k * 0.55)), 255))
    d.text((40, h // 2 - 10), label, fill=(255, 255, 255, 255))
    img.convert('RGB').save(path, 'PNG')
    return rel


def make_wav(rel, seconds=3, freq=440):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    rate = 22050
    with wave.open(path, 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(rate)
        frames = bytearray()
        for i in range(rate * seconds):
            v = int(12000 * math.sin(2 * math.pi * freq * i / rate))
            frames += struct.pack('<h', v)
        f.writeframes(bytes(frames))
    return rel


def make_pdf(rel):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    content = (b'BT /F1 24 Tf 60 700 Td (Demo PDF) Tj ET\n'
               b'0.2 0.4 0.9 rg 60 640 480 6 re f\n')
    objs = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] '
        b'/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
        b'<< /Length ' + str(len(content)).encode() + b' >>\nstream\n' + content + b'endstream',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ]
    out = bytearray(b'%PDF-1.4\n')
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += str(i).encode() + b' 0 obj\n' + body + b'\nendobj\n'
    xref = len(out)
    out += b'xref\n0 ' + str(len(objs) + 1).encode() + b'\n0000000000 65535 f \n'
    for off in offsets:
        out += ('%010d 00000 n \n' % off).encode()
    out += (b'trailer\n<< /Size ' + str(len(objs) + 1).encode() +
            b' /Root 1 0 R >>\nstartxref\n' + str(xref).encode() + b'\n%%EOF\n')
    with open(path, 'wb') as f:
        f.write(bytes(out))
    return rel


if __name__ == '__main__':
    made = [make_photo(*p) for p in PATHS]
    made.append(make_wav('uploads/audio/demo_tone.wav'))
    made.append(make_pdf('uploads/files/demo.pdf'))
    # mp4 негде сгенерировать без ffmpeg — кладём заглушку, карточка всё равно отрисуется
    video = 'uploads/videos/demo_clip.mp4'
    vpath = os.path.join(ROOT, video)
    os.makedirs(os.path.dirname(vpath), exist_ok=True)
    with open(vpath, 'wb') as f:
        f.write(b'\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom\x00\x00\x00\x08free')
    made.append(video)
    for rel in made:
        full = os.path.join(ROOT, rel)
        print('%s  %d Б' % (rel, os.path.getsize(full)))
