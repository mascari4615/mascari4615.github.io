"""얼굴 데칼 (알파). 레퍼런스: 테두리·속눈썹 없는 부드러운 눈 블롭 + 거의 안 보이는 입."""
from PIL import Image, ImageDraw

W = 64
EYE = (86, 58, 76, 255)
EYE_T = (58, 38, 58, 255)      # 윗부분 짙게
IRIS = (140, 104, 205, 255)    # 아래 반사
HI = (255, 255, 255, 240)
BLUSH = (255, 170, 180, 110)
MOUTH = (172, 108, 118, 220)

img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(img)


def r(x0, y0, x1, y1, c):
    if x1 > x0 and y1 > y0:
        d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=c)


# 둥근 눈: 행마다 폭을 줘서 모서리를 깎는다 (10w x 13h)
ROWS = [
    (2, 1), (1, 1), (0, 1), (0, 1), (0, 1), (0, 1),
    (0, 1), (0, 1), (0, 1), (0, 1), (1, 1), (2, 1), (3, 1),
]
EW, EH = 11, len(ROWS)

for ex in (15, 38):
    for i, (inset, _) in enumerate(ROWS):
        y = 24 + i
        col = EYE_T if i < 3 else (IRIS if i >= EH - 5 else EYE)
        r(ex + inset, y, ex + EW - inset, y + 1, col)
    # 하이라이트
    r(ex + 2, 26, ex + 5, 30, HI)
    r(ex + 7, 33, ex + 9, 35, HI)

# 입 — 아주 작게
r(30, 44, 34, 46, MOUTH)

# 홍조
for bx in (7, 43):
    r(bx, 38, bx + 14, 42, BLUSH)

img.save("face.png")
print("face.png written", img.size)
