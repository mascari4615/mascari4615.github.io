# 이 폴더의 그림 — 출처와 라이선스

이 저장소는 **공개**다. 여기 있는 그림 파일은 우리가 만든 것이 아니라 받아서 다시 굽고
**같이 배포하는** 것이므로, 각각의 조건을 여기 적어 둔다. 생성기는
`apps/karmolab/scripts/gen-earth-textures.py` 이고, 거기 적힌 주소가 원본이다.

파일은 전부 크기를 줄이고 webp 로 다시 구웠다(`day.webp` 는 채도를 1.35배 올렸다).
내용을 바꾸지는 않았다.

| 파일 | 원본 | 저작자 / 출처 | 조건 |
| --- | --- | --- | --- |
| `day.webp` | `earth_atmos_2048.jpg` (three.js 예제 경유) | NASA — Blue Marble: Next Generation. NASA Goddard Space Flight Center / Reto Stockli, NASA Earth Observatory | NASA 자료에는 저작권이 없다(자유롭게 쓰고 다시 배포할 수 있다). NASA 는 **「NASA Earth Observatory」 표기**를 요청한다 |
| `night.webp` | `earth_lights_2048.png` (three.js 예제 경유) | NASA — 야간 조도(도시 불빛) | 위와 같음 |
| `moon.webp` | `moon_1024.jpg` (three.js 예제 경유) | NASA — 달 표면 지도 | 위와 같음 |
| `mars.webp` | `2k_mars.jpg` | **Solar System Scope** (https://www.solarsystemscope.com/textures/) — NASA 자료 기반으로 제작 | **CC BY 4.0 — 출처 표기 의무.** 상업 이용·재배포 가능하되 표기를 빼면 안 된다 |

## 화면에서의 표기

- 화성을 보고 있을 때 문장 줄에 `화성 지도: Solar System Scope (CC BY 4.0)` 이 뜬다
  (`i18n/*/bluemarble.json` 의 `bluemarble.credit.mars`).
- 지구·달은 표기가 **의무**는 아니지만, NASA 가 요청하는 형식이라 같은 자리에 함께 둔다.

## 늘릴 때

새 그림을 이 폴더에 넣으면 **이 표를 같이 늘린다.** 표기가 필요한 그림을 표기 없이 배포하는
것은 우리가 남의 것을 가져다 쓰는 방식이 아니고, 공개 저장소에서는 그 사실이 그대로 남는다.
