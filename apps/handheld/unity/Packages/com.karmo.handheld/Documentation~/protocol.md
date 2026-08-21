# 전선 규약 — 폰 ⇄ 유니티

> 코드: `HandheldServer.OnPhoneMessage` (파서 한 곳) · 폰 = `StreamingAssets/handheld/index.html`

## 구조

| 파일 | 역할 |
| --- | --- |
| `Assets/Handheld/WsConnection.cs` | HTTP 101 핸드셰이크 + `WebSocket.CreateFromStream` 으로 프레이밍 위임 |
| `Assets/Handheld/HandheldServer.cs` | 폰 페이지 서빙 + WS + 포즈/스틱 파싱 + **좌표 변환(규약 단일 지점)** |
| `Assets/Handheld/HandheldRig.cs` | 포즈→카메라, 보간, 조이스틱, RT 캡처→JPEG(워커)→송신, 통계 |
| `Assets/Handheld/QrCode.cs` | 의존성 0 QR 인코더 (바이트 모드, ECC L/M) |
| `Assets/Handheld/Urp/` | **URP 가 있을 때만 컴파일되는 어셈블리** — 심도 전달자 + 배선 |
| `Assets/Handheld/Editor/HandheldUrpInstaller.cs` | URP 설치 버튼 (URP 타입을 안 쓴다 — 없을 때도 컴파일돼야 하므로) |
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
| 폰 → 유니티 | `z\|배율` (줌, 미는 동안 30Hz) · `f\|u\|v` (탭 포커스, 뷰포트 0..1·아래가 0) |
| 유니티 → 폰 | JPEG 바이너리 (뷰파인더) |
| 유니티 ↔ 폰 | `k\|눈금` (왕복 재기 — 폰은 받은 것을 **그대로** 되돌린다) |
| 폰 ↔ 유니티 | `w\|offer\|sdp` · `w\|answer\|sdp` · `w\|ice\|…` · `w\|bye` (WebRTC 시그널링) |
| 유니티 → 폰 | `s\|x\|y\|z\|yaw\|fps\|kb\|틱Hz\|캡처Hz\|배율\|mm\|초점m\|초점잡힘` (1Hz) |

상태 줄의 **칸은 뒤에만 붙인다** — 옛 폰 페이지는 앞 칸만 읽고 나머지를 무시하므로 안 깨진다.

네 곳의 큐가 전부 얕다(1~2장). 밀리면 **오래된 것을 버린다** — 실시간에서 밀린 프레임은
정보가 아니라 지연이다.
