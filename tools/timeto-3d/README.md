# timeto-3d — KarmoLab 마스코트 3D 파이프라인

티메토를 **브라우저에서 도는 3D 캐릭터**로 만드는 도구 모음. 스크린샷이 목적이 아니라
`viewer/index.html` 에서 실제로 돌아가는 게 목적이다.

## 두 갈래

### A. 손으로 짜는 로우폴리 (Blender 헤드리스)

| 파일 | 하는 일 |
| --- | --- |
| `tex.py` / `tex3.py` / `face_tex.py` | 픽셀 아틀라스 텍스처 생성 (Pillow) |
| `build.py` | v0 — 큐브 조립 (마인크래프트풍. 사용자 반려) |
| `build2.py` | v1 — 구/원뿔 + 3점 조명 (물빠짐. 반려) |
| `build3.py` | v2 — 모서리 깎은 상자 + 90px 렌더 |
| `build5.py` | v3 — 구·캡슐 2등신 (블록감 제거) |
| `compose.py` | 무대 합성(마름모 배경·바닥 원판·꽃잎) + nearest 확대 |

실행 = `"C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe" -b -P build3.py`
(Blender 는 Steam 판이라 PATH 에 없다.)

### B. AI 이미지→3D (현재 진행 중인 본선)

1. `gen_chibi.py` — 로컬 SDXL(animagine-xl-4.0)로 치비 티메토 후보 생성.
   **평면 셀화는 금지** — 이미지→3D 가 부피를 못 읽어 100% 실패한다 (실측 6/6 실패,
   음영 있는 그림 2/2 성공). 받침대·소품도 네거티브로 뺀다 (메시에 그대로 굳는다).
2. `gen3d_all.py` — Hunyuan3D-2 API(`127.0.0.1:8081`)에 그림을 던져 glb 회수.
3. `render_ai.py` — 후보 glb 들 비교 렌더 시트.
4. `finish_ai.py` — 감축 + UV + 텍스처 → `viewer/timeto.glb`.
   **현재 정면 투영이라 뒤통수가 늘어난다 = 미완.** 진짜 텍스처는 Hunyuan 텍스처
   파이프라인(custom_rasterizer 컴파일, CUDA 필요) 또는 ComfyUI 노드로 간다.

## 뷰어

`viewer/index.html` — three.js(로컬 vendoring). 드래그 회전 / 휠 확대 / 자동 스핀 /
숨쉬기 / 꽃잎 / 바닥 원판. **화면 픽셀 필터는 쓰지 않는다** — 픽셀감은 텍스처가 낸다.

띄우기: `cd viewer && python -m http.server 8777` → http://localhost:8777

`vendor/`(three.js)·`*.glb`·렌더 산출물은 커밋하지 않는다 (`.gitignore`).

## 레퍼런스 실측 (caelestisart 치비 사쿠라 GIF)

- 렌더 캔버스 **90×90px**, 캐릭터 **58px**, 머리 폭 30px, **눈 4×5px**
- 픽셀은 텍스처가 아니라 화면에 있다 — 배경·꽃잎·바닥이 전부 같은 격자
- 형태 = 둥근 다면체 + 조각된 머리카락 셸, 실제 조명으로 면마다 밝기가 다름

## 환경 셋업 (이 기계에서 실제로 밟은 순서)

1. **Blender** = Steam 판 (`C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe`, PATH 에 없음)
2. **Hunyuan3D-2 WinPortable** = `C:\AI\Hunyuan3D2_WinPortable` (3.5GB 다운 → 11.6GB 해제).
   API = `python_standalone\python.exe -s api_server.py --host 127.0.0.1 --port 8081`
3. **텍스처 생성 의존성** (`diso` / `custom_rasterizer` / `differentiable_renderer`) 은 컴파일이 필요하고
   순서대로 이런 벽이 나온다:
   - `CUDA_HOME not set` → CUDA Toolkit 12.9 설치 (`winget install Nvidia.CUDA --version 12.9`)
   - `Unable to find a compatible Visual Studio installation` → VS 2022 Build Tools + VCTools 워크로드
   - `cl.exe failed` → pip 을 `vcvars64.bat` 환경 **안에서** 실행해야 한다
   - 그 다음 `nvcc failed exit code 2` (진행 중 — 아키텍처 플래그 / MSVC 버전 조합 의심)
4. **ComfyUI Portable** = `C:\AI\ComfyUI_windows_portable` (컴파일 회피 경로 — prebuilt wheel 사용)

## GPU 경합 주의

이미지 생성과 3D 서버를 **동시에 띄우면 안 된다**. 8GB 카드에서 둘이 물면 SDXL 이
0.8초/스텝 → 70초/스텝으로 **90배** 느려진다 (실측). 반드시 직렬로.
