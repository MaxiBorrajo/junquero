from PIL import Image, ImageDraw

SCALE = 8
H = 44
SIZES = {"s": 96, "m": 120, "l": 140}
BRICK = (143, 47, 34, 255)
INK = (35, 24, 21, 255)
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)


JUNCO = Image.open("assets/images/junco.png").convert("RGBA")


def glyph(image, ox, oy, size):
    mark = JUNCO.resize((size * SCALE, size * SCALE), Image.LANCZOS)
    image.alpha_composite(mark, (ox, oy))


def pill(path, body, W):
    im = Image.new("RGBA", (W * SCALE, H * SCALE), CLEAR)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, W * SCALE - 1, H * SCALE - 1), radius=H * SCALE // 2, fill=WHITE)
    b = 3 * SCALE
    d.rounded_rectangle((b, b, W * SCALE - 1 - b, H * SCALE - 1 - b), radius=H * SCALE // 2 - b, fill=body)
    glyph(im, 12 * SCALE, 13 * SCALE, 18)
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
