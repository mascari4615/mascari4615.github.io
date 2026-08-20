# Handheld — 폰이 유니티 카메라가 된다

폰을 들고 움직이면 유니티 카메라가 **그대로** 따라오고, 폰 화면에는 유니티가 본 그림이 뜬다.
버추얼 스트리머 컨텐츠용 손카메라. TASK-KAR-230.

```
폰 Chrome ──(wss: 포즈 60Hz + 스틱 30Hz)──▶ 유니티 WS 서버 ──▶ 카메라 포즈
    ▲                                                            │
    └──(wss: JPEG 뷰파인더 + 상태 1Hz)──── RT 렌더 ◀────────────┘
```

## 쓰는 법 — 조종석 하나로 끝난다

1. **유니티 열기** — `apps/handheld/unity` (Unity 6000.5.6f1)
2. 메뉴 **Handheld / 조종석** (`Ctrl+Shift+H`) — 씬이 없으면 알아서 짓는다
3. **「웹서버」 체크** → 포트 8842 가 열린다
4. **「공개 주소」 체크** → cloudflared 가 https 주소를 물어오고, 그 자리에 **QR** 이 뜬다
5. 폰 Chrome 으로 QR 을 찍고 **「시작 (6DoF)」** → ARCore 권한 허용
6. 폰을 들고 움직여라. 화면 아래 왼쪽 = 이동, 오른쪽 = 회전·높이

**Play 를 누르지 않아도 된다.** 서버·리그가 `[ExecuteAlways]` 라 씬을 여는 순간 살아나고,
조종석 창이 `EditorApplication.update` 로 리그를 돌린다(실측 틱 700~850 Hz). 손카메라는 유니티
창을 안 보면서 쓰는 물건이라 이게 기본값이다.

**리센터** = 지금 폰 자리를 씬의 `HandheldRoot` 자리로 맞춘다 (폰 하단 버튼 · 조종석 버튼 · `R`).
**원점으로** = 조이스틱으로 옮겨 다닌 `HandheldRoot` 를 처음 자리로 되돌린다. 편집 모드에서는
씬이 실제로 바뀌므로(Play 처럼 원복되지 않는다) 이 버튼이 되돌리는 손이다.

## 왜 WebXR 인가

「움직임을 **그대로**」의 벽은 **위치**다.

- `DeviceOrientationEvent` = 회전(3DoF)만. 가속도를 두 번 적분해 위치를 만들면 오차도 같이
  두 번 적분돼 몇 초 만에 무너진다 — 원리적으로 안 된다.
- **WebXR `immersive-ar`(ARCore)** 는 카메라로 특징점을 추적해 IMU 와 융합한다(VIO).
  세상이 기준자라 오차가 안 쌓인다. 앱 설치 0, https 만 있으면 된다.

그래서 6DoF = WebXR 이 본선, 자이로 3DoF 는 ARCore 가 없을 때의 폴백이다.
https 가 필수라 로컬 서버를 `cloudflared` 로 터널한다.

## 손잡이 (조종석 · HandheldRig 인스펙터)

| 항목 | 뜻 |
| --- | --- |
| `worldScale` | 폰 1m 이동 = 유니티 몇 m. 거대 로봇 시점 = 0.1, 미니어처 = 5 |
| `smoothing` / `smoothingHalfLife` | 보간. 반감기가 클수록 부드럽고 그만큼 늦다 (기본 45ms) |
| `streamHeight` / `streamFps` / `jpegQuality` | 뷰파인더 화질 ↔ 지연 저울 (기본 720p / 60fps) |
| `moveSpeed` / `turnSpeed` / `riseSpeed` | 조이스틱 속도 (1.6 m/s · 90 °/s · 1.0 m/s) |
| `rigRoot` | 폰이 움직이는 공간의 원점. 조이스틱이 미는 대상 |
| `streamEnabled` | 끄면 폰은 컨트롤러만 (대역폭 0) |

## 구조

| 파일 | 역할 |
| --- | --- |
| `Assets/Handheld/WsConnection.cs` | HTTP 101 핸드셰이크 + `WebSocket.CreateFromStream` 으로 프레이밍 위임 |
| `Assets/Handheld/HandheldServer.cs` | 폰 페이지 서빙 + WS + 포즈/스틱 파싱 + **좌표 변환(규약 단일 지점)** |
| `Assets/Handheld/HandheldRig.cs` | 포즈→카메라, 보간, 조이스틱, RT 캡처→JPEG(워커)→송신, 통계 |
| `Assets/Handheld/QrCode.cs` | 의존성 0 QR 인코더 (바이트 모드, ECC L/M) |
| `Assets/Handheld/Editor/HandheldWindow.cs` | 조종석 — 서버·터널 토글, QR, 손잡이 |
| `Assets/Handheld/Editor/HandheldSetup.cs` | 테스트 씬을 코드로 짓는다 (씬 파일은 커밋 안 한다) |
| `Assets/StreamingAssets/handheld/index.html` | 폰 페이지 (WebXR · 자이로 폴백 · 뷰파인더 · 조이스틱) |

**좌표계 변환은 `HandheldServer` 한 곳에서만** 한다 — 폰은 WebXR 원본을 그대로 보낸다.
WebXR(오른손·−Z 앞) → Unity(왼손·+Z 앞): `pos = (x, y, -z)` · `rot = (-x, -y, z, w)`.
축 하나를 뒤집으면 손잡이가 바뀌어 회전 방향도 반대가 되므로 쿼터니언의 `x·y` 도 같이 뒤집는다.

### 전선 위의 규약

| 방향 | 메시지 |
| --- | --- |
| 폰 → 유니티 | `p\|t\|px\|py\|pz\|qx\|qy\|qz\|qw\|fov\|aspect\|dof` (포즈, 화면 주사율) |
| 폰 → 유니티 | `j\|lx\|ly\|rx\|ry` (스틱, 30Hz) · `c\|recenter` |
| 유니티 → 폰 | JPEG 바이너리 (뷰파인더) · `s\|x\|y\|z\|yaw\|fps\|kb\|틱Hz\|캡처Hz` (1Hz) |

네 곳의 큐가 전부 얕다(1~2장). 밀리면 **오래된 것을 버린다** — 실시간에서 밀린 프레임은
정보가 아니라 지연이다.

## 검증 (2026-08-20 실측)

- **폰 실기 6DoF 연결 확인** (Android Chrome + ARCore)
- 뷰파인더 **57~59 fps @720p** · 9 KB/장 · 첫 장 **26ms** (로컬), 터널 너머 34.6 fps · 254 KB/s
- 조이스틱: 이동 2.36m(예상 2.4) · 회전 87°(90) · 승강 0.96m(1.0) · 놓으면 표류 0
- 보간: 계단 +2m → 오차 **8mm** 수렴 · 정지 시 떨림 0
- QR: 버전 1·2·4·5 × ECC L/M 을 `qrcode-generator` 와 대조해 **코드워드 100% 일치**
- 좌표계 부호: 뷰파인더 캡처로 4방향 눈으로 확인 · 경로 탈출 404

## 아직 안 한 것

- **좌우 회전이 가끔 튄다** (2026-08-20 폰 실기에서 관측, 원인 미확인)
- 인증 0 — 주소를 아는 사람은 누구나 붙는다. 토큰 게이트 필요
- 포스트FX 계열(흔들림·탭 포커스/DOF·핀치 줌·셔터·폰카 룩) = 1차 범위 밖
- 전송은 MJPEG. 화질·해외 지연이 걸리면 WebRTC (H.264 델타 압축으로 대역폭 1/5~1/10)
