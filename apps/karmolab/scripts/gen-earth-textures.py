"""지구 표면 그림 만들기 — 「블루마블」 위젯이 구면에 입히는 두 장 (TASK-KL-206)

왜 필요한가: 처음엔 해안선 윤곽만 들고 와서 초록으로 칠했다. 그런데 지구는 초록 한 색이
아니다 — 사하라는 모래색이고, 극지는 희고, 시베리아와 아마존은 같은 초록이 아니다.
윤곽선(폴리곤)으로는 이걸 못 그린다. 그래서 **그림을 입힌다**.

두 장을 쓴다:
  day.webp   = NASA Blue Marble. 구름 없는 맨 지구 — 사막·숲·얼음·바다 색이 그대로 있다.
  night.webp = 도시 불빛(Black Marble 계열). 밤이 된 쪽에 켜진다.
               예전엔 큰 도시 75개를 손으로 적어 점을 찍었다. 이건 진짜 지도다.

원본은 NASA 가 만든 퍼블릭 도메인 자료이고, three.js 예제 저장소가 오래 두고 쓰는 판을
그대로 받는다(같은 원본을 이미 정리해 둔 것이라 우리가 다시 자를 이유가 없다).

받아서 **webp 로 다시 굽는다** — jpg/png 그대로면 920KB 다. 회선으로 나가는 건 우리 몫이라
품질을 눈으로 확인한 선(구면에 입히면 원본 픽셀이 반 이하로 줄어든다)까지 낮춘다.

사용: python scripts/gen-earth-textures.py   (결과는 커밋한다 — 빌드는 網 없이 돈다)
"""
import io
import os
import urllib.request

from PIL import Image, ImageEnhance

BASE = "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/"
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "earth")

# (원본 파일, 내보낼 이름, 크기, 화질, 채도 배수)
# 낮 그림은 확대해서 볼 일이 있으니 2048 을 지키고, 불빛은 번져 보이는 것이 자연스러워 절반이면 된다.
#
# 채도를 올리는 이유: 원본은 위성이 잰 값에 충실해서 **화면에서 보면 칙칙하다**. 특히 바다가
# 거의 검게 보여 「블루마블」이 파랗지 않았다(실측). 사실을 왜곡하지 않는 선에서 한 번만 올려
# 굽는다 — 매 프레임 색을 만지면 그만큼 팬이 돈다.
JOBS = [
    ("earth_atmos_2048.jpg", "day.webp", (2048, 1024), 74, 1.35),
    ("earth_lights_2048.png", "night.webp", (1024, 512), 68, 1.0),
]


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for src, out, size, quality, sat in JOBS:
        with urllib.request.urlopen(BASE + src, timeout=120) as res:
            raw = res.read()
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        if im.size != size:
            im = im.resize(size, Image.LANCZOS)
        if sat != 1.0:
            im = ImageEnhance.Color(im).enhance(sat)
        path = os.path.join(OUT_DIR, out)
        im.save(path, "WEBP", quality=quality, method=6)
        print(f"[earth-tex] {src} {len(raw) / 1024:.0f}KB → {out} {size[0]}x{size[1]} "
              f"{os.path.getsize(path) / 1024:.0f}KB")


if __name__ == "__main__":
    main()
