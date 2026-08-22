# Karmo Handheld Camera

폰을 **손카메라**로 쓴다. 앱 설치 없이 브라우저만 열면, 폰의 자세가 유니티 카메라를 몰고
그 카메라가 본 그림이 폰으로 되돌아온다. 원격 카메라맨을 전제로 만들었다.

## 넣는 법

`Packages/manifest.json` 에 한 줄:

```json
"com.karmo.handheld": "https://github.com/Mascari4615/Mascari4615.github.io.git?path=apps/handheld/unity/Packages/com.karmo.handheld"
```

또는 프로젝트의 `Packages/` 아래에 이 폴더째 두면 임베디드 패키지로 잡힌다.

## 쓰는 법

메뉴 **Handheld ▸ 조종석** 하나로 끝난다 — 씬이 없으면 코드로 짓고, 서버를 올리고,
터널(cloudflared)을 띄우고, 폰으로 열 QR 을 그린다.

## 무엇이 들어 있나

| 폴더 | 내용 |
| --- | --- |
| `Runtime/Core` | 엔진 상태에 안 기대는 순수 로직 (추적 안정기). 헤드리스로 시험한다 |
| `Runtime` | 카메라 리그 · 서버 · WebRTC · 기록 |
| `Runtime/Urp` | URP 가 있을 때만 컴파일되는 흐림(피사계 심도) |
| `Runtime/Web` | 폰이 여는 페이지 한 장 |
| `Editor` | 조종석 창 · 씬 빌더 · 심장(에디트 모드 틱) |
| `Tests` | 실기록으로 도는 회귀 시험 (EditMode) |
| `PlayTests` | 소켓을 실제로 열어 보는 시험 (PlayMode) |

## 문서

| 문서 | 내용 |
| --- | --- |
| [tracking.md](Documentation~/tracking.md) | **왜 튀고 왜 저 혼자 흐르나** — ARCore 재정위와 그 처방 |
| [lens.md](Documentation~/lens.md) | 줌 · 초점 · 흐림 (광학식 · 디옵터 램프 · URP) |
| [protocol.md](Documentation~/protocol.md) | 폰 ⇄ 유니티 전선 규약 |
| [framing.md](Documentation~/framing.md) | 화면 비율 — 보이는 것 = 나가는 것 |
| [transport.md](Documentation~/transport.md) | WebRTC 와 MJPEG |
| [embedding.md](Documentation~/embedding.md) | **그 앱 안에서 돌리기** — 외부 전송이 필요 없는 길 |
| [vmc.md](Documentation~/vmc.md) | 밖으로 내보내기 — VMC Protocol (프로세스가 갈릴 때만) |
| [axis-lock.md](Documentation~/axis-lock.md) | 축 잠금 — 삼각대 손잡이를 조이듯 |
| [measuring.md](Documentation~/measuring.md) | 튐·표류를 잴 때 (포즈 기록과 판정기) |

## 다른 앱에 꽂을 때

**대개 외부 전송이 필요 없다.** 그림을 그리는 앱이 유니티면 이 패키지를 **그 앱 안에**
넣어라 — 방송 카메라에 `HandheldRig` 를 붙이고 `keepScreenOutput` 을 켜면 한 프로세스에서
끝난다. → [embedding.md](Documentation~/embedding.md)

프로세스가 갈릴 때만 `VmcCameraSender` / `VmcCameraReceiver` 한 쌍으로 잇는다
(VMC Protocol · OSC/UDP). → [vmc.md](Documentation~/vmc.md)

## 아직 없는 것

- 인증 — 지금은 링크를 아는 사람이면 누구나 붙는다
- 실제 앱에 붙여 본 기록 — 컴파일과 단위 시험까지만 확인했다
