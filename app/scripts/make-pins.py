from PIL import Image, ImageDraw

SCALE = 8
H = 44
SIZES = {"s": 96, "m": 120, "l": 140}
BRICK = (143, 47, 34, 255)
INK = (35, 24, 21, 255)
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)


def glyph(draw, ox, oy, size, fill):
    u = size / 48

    def p(x, y):
        return (ox + x * u * SCALE, oy + y * u * SCALE)

    def stem(points, width):
        draw.line([p(x, y) for x, y in points], fill=fill, width=int(width * u * SCALE), joint="curve")

    stem([(24, 46), (24, 16)], 4.2)
    draw.ellipse((*p(19.5, 1), *p(28.5, 22)), fill=fill)
    stem([(12, 46), (13, 36), (16, 27)], 4)
    draw.ellipse((*p(9.5, 15), *p(18.5, 31)), fill=fill)
    stem([(36, 46), (35, 36), (32, 27)], 4)
    draw.ellipse((*p(29.5, 15), *p(38.5, 31)), fill=fill)


def pill(path, body, W):
    im = Image.new("RGBA", (W * SCALE, H * SCALE), CLEAR)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, W * SCALE - 1, H * SCALE - 1), radius=H * SCALE // 2, fill=WHITE)
    b = 3 * SCALE
    d.rounded_rectangle((b, b, W * SCALE - 1 - b, H * SCALE - 1 - b), radius=H * SCALE // 2 - b, fill=body)
    glyph(d, 9 * SCALE, 8 * SCALE, 28, WHITE)
    im.resize((W, H), Image.LANCZOS).save(path)


names = []
for size, width in SIZES.items():
    pill(f"assets/images/pin-{size}.png", BRICK, width)
    pill(f"assets/images/pin-on-{size}.png", INK, width)
    names += [f"pin-{size}", f"pin-on-{size}"]

lines = ["export const PIN_IMAGES = {"]
lines += [f'  "{name}": require("../../assets/images/{name}.png"),' for name in names]
lines.append("};")
open("src/lib/pinImages.ts", "w").write("\n".join(lines) + "\n")
