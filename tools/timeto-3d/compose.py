"""무대 합성 + 픽셀 확대. 렌더(192px) 위에 배경·바닥 원판·꽃잎을 같은 격자로 얹고 nearest 확대."""
import math
import os
import random

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, os.environ.get("STAGE_DIR", "out2"))
N = int(os.environ.get("STAGE_N", "192"))
SCALE = int(os.environ.get("STAGE_SCALE", "3"))

TOP = (150, 205, 255)
BOT = (252, 150, 205)


def lerp(a, b, t):
    return tuple(int(x + (y - x) * t) for x, y in zip(a, b))


def stage(seed=0):
    bg = Image.new("RGB", (N, N))
    d = ImageDraw.Draw(bg)
    for y in range(N):
        d.line([(0, y), (N, y)], fill=lerp(TOP, BOT, y / N))
    # 마름모 체커 — 밝은 칸만 살짝 덮어씀
    ov = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    do = ImageDraw.Draw(ov)
    cell = max(8, N // 5)
    for gy in range(-1, N // cell + 2):
        for gx in range(-1, N // cell + 2):
            if (gx + gy) % 2:
                continue
            cx, cy = gx * cell + cell / 2, gy * cell + cell / 2
            do.polygon([(cx, cy - cell * 0.62), (cx + cell * 0.62, cy),
                        (cx, cy + cell * 0.62), (cx - cell * 0.62, cy)],
                       fill=(255, 255, 255, 34))
    bg = Image.alpha_composite(bg.convert("RGBA"), ov)

    # 바닥 발광 원판
    disc = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    dd = ImageDraw.Draw(disc)
    cx, cy = N // 2, int(N * 0.80)
    for i, (rw, rh, al) in enumerate((( int(N*0.32), int(N*0.10), 70), (int(N*0.25), int(N*0.078), 90), (int(N*0.16), int(N*0.05), 110))):
        dd.ellipse([cx - rw, cy - rh, cx + rw, cy + rh], fill=(255, 190, 225, al))
    bg = Image.alpha_composite(bg, disc)

    # 꽃잎
    pet = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    dp = ImageDraw.Draw(pet)
    rnd = random.Random(seed)
    for _ in range(max(6, N // 13)):
        px, py = rnd.randrange(6, N - 6), rnd.randrange(6, int(N * 0.8))
        s = rnd.choice((1, 1, 2, 2))
        col = rnd.choice(((255, 190, 205, 235), (255, 214, 224, 235), (250, 160, 185, 235)))
        dp.rectangle([px, py, px + s, py + int(s * 0.8)], fill=col)
    return Image.alpha_composite(bg, pet)


def main():
    names = sorted(n for n in os.listdir(OUT) if n.startswith("turn_"))
    names.sort(key=lambda n: int(n.split("_")[1]))
    tiles = []
    for i, n in enumerate(names):
        ch = Image.open(os.path.join(OUT, n)).convert("RGBA")
        if ch.size != (N, N):
            ch = ch.resize((N, N), Image.NEAREST)
        comp = Image.alpha_composite(stage(i), ch)
        comp.save(os.path.join(OUT, f"staged_{i}.png"))
        tiles.append(comp.resize((N * SCALE, N * SCALE), Image.NEAREST))
    grid = Image.new("RGB", (N * SCALE * len(tiles), N * SCALE))
    for i, t in enumerate(tiles):
        grid.paste(t.convert("RGB"), (i * N * SCALE, 0))
    grid.save(os.path.join(OUT, "turnaround.png"))
    print("composed", len(tiles), "tiles ->", os.path.join(OUT, "turnaround.png"))


main()
