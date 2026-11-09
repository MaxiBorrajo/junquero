from PIL import Image, ImageDraw

SCALE = 8
H = 44
SIZES = {"s": 96, "m": 120, "l": 140}
BRICK = (143, 47, 34, 255)
INK = (35, 24, 21, 255)
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)


def glyph(draw, kind, ox, oy, size, fill, hole):
    u = size / 48
    def p(x, y):
        return (ox + x * u * SCALE, oy + y * u * SCALE)
    def box(x0, y0, x1, y1):
        return (*p(x0, y0), *p(x1, y1))
    if kind == 0:
        draw.polygon([p(24, 7), p(6, 23), p(11, 23), p(11, 41), p(37, 41), p(37, 23), p(42, 23)], fill=fill)
        draw.rectangle(box(20, 29, 28, 41), fill=hole)
    elif kind == 1:
        draw.polygon([p(8, 26), p(26, 8), p(44, 8), p(44, 26), p(26, 44)], fill=fill)
        draw.line([p(8, 42), p(26, 24)], fill=hole, width=int(3 * u * SCALE))
    elif kind == 2:
        draw.rectangle(box(7, 14, 41, 40), fill=fill)
        draw.rectangle(box(21, 14, 27, 26), fill=hole)
    elif kind == 3:
        draw.polygon([p(24, 4), p(29, 19), p(44, 24), p(29, 29), p(24, 44), p(19, 29), p(4, 24), p(19, 19)], fill=fill)
    elif kind == 4:
        draw.line([p(14, 36), p(31, 19)], fill=fill, width=int(7 * u * SCALE))
        draw.ellipse(box(24, 6, 42, 24), fill=fill)
        draw.ellipse(box(31, 8, 37, 14), fill=hole)
        draw.ellipse(box(6, 30, 18, 42), fill=fill)
    elif kind == 5:
        draw.rounded_rectangle(box(5, 8, 43, 32), radius=int(3 * u * SCALE), fill=fill)
        draw.rectangle(box(10, 13, 38, 27), fill=hole)
        draw.rectangle(box(20, 32, 28, 38), fill=fill)
        draw.rectangle(box(13, 37, 35, 41), fill=fill)
    elif kind == 6:
        draw.ellipse(box(5, 7, 43, 41), fill=fill)
        for x, y in [(15, 20), (24, 13), (34, 20), (15, 31)]:
            draw.ellipse(box(x - 3, y - 3, x + 3, y + 3), fill=hole)
    elif kind == 7:
        draw.rounded_rectangle(box(5, 7, 43, 34), radius=int(8 * u * SCALE), fill=fill)
        draw.polygon([p(12, 32), p(12, 43), p(23, 33)], fill=fill)
    else:
        for x in (10, 24, 38):
            draw.ellipse(box(x - 5, 19, x + 5, 29), fill=fill)


def pill(path, body, kind, W):
    im = Image.new("RGBA", (W * SCALE, H * SCALE), CLEAR)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, W * SCALE - 1, H * SCALE - 1), radius=H * SCALE // 2, fill=WHITE)
    b = 3 * SCALE
    d.rounded_rectangle((b, b, W * SCALE - 1 - b, H * SCALE - 1 - b), radius=H * SCALE // 2 - b, fill=body)
    glyph(d, kind, 11 * SCALE, 12 * SCALE, 20, WHITE, body)
    im.resize((W, H), Image.LANCZOS).save(path)


names = []
for kind in range(9):
    for size, width in SIZES.items():
        pill(f"assets/images/pin-{kind}-{size}.png", BRICK, kind, width)
        pill(f"assets/images/pin-on-{kind}-{size}.png", INK, kind, width)
        names += [f"pin-{kind}-{size}", f"pin-on-{kind}-{size}"]

lines = ["export const PIN_IMAGES = {"]
lines += [f'  "{name}": require("../../assets/images/{name}.png"),' for name in names]
lines.append("};")
open("src/lib/pinImages.ts", "w").write("\n".join(lines) + "\n")
