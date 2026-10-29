# -*- coding: utf-8 -*-
"""Generate brickcal extension icons as PNG."""
from __future__ import print_function

import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "extension", "icons")

ORANGE = (255, 138, 43, 255)
ORANGE_DEEP = (232, 88, 28, 255)
CREAM = (255, 250, 241, 255)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
]


def load_font(size):
    for path in FONT_CANDIDATES:
        if os.path.isfile(path):
            try:
                return ImageFont.truetype(path, size=size, index=0)
            except Exception:
                continue
    return ImageFont.load_default()


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return m


def draw_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    radius = max(3, int(size * 0.22))
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=ORANGE)
    # subtle bottom shade
    shade = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    sd.rounded_rectangle(
        (0, int(size * 0.55), size - 1, size - 1),
        radius=radius,
        fill=(ORANGE_DEEP[0], ORANGE_DEEP[1], ORANGE_DEEP[2], 90),
    )
    layer = Image.alpha_composite(layer, shade)
    font_size = int(size * (0.62 if size >= 32 else 0.72))
    font = load_font(font_size)
    text = "砖"
    draw = ImageDraw.Draw(layer)
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) / 2.0 - bbox[0]
    y = (size - th) / 2.0 - bbox[1] - size * 0.03
    draw.text((x, y), text, font=font, fill=CREAM)
    mask = rounded_mask(size, radius)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(layer, (0, 0))
    out.putalpha(mask)
    return out


def main():
    if not os.path.isdir(OUT):
        os.makedirs(OUT)
    for size in (16, 32, 48, 128):
        path = os.path.join(OUT, "icon%d.png" % size)
        draw_icon(size).save(path, "PNG")
        print("[OK]", path)


if __name__ == "__main__":
    main()
