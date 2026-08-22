# 그 앱 안에서 돌리기 — 외부 전송이 필요 없는 길

> 코드: `Runtime/HandheldRig.cs` (`keepScreenOutput`) · 시험 `Tests/MirrorCameraTests.cs`

## 먼저: 정말 외부가 필요한가

**대개 아니다.** 이건 유니티 패키지다 — 그림을 그리는 앱이 유니티면 **그 앱 안에** 넣으면
된다. 그러면 한 프로세스 안에서 전부 끝난다:

```
폰 ──WebRTC/WS──▶ HandheldServer ──▶ 그 앱의 카메라 ──▶ 그 카메라 그림 ──▶ 폰
                  (그 앱 안에서 돈다)
```

VMC 도 Spout 도 NDI 도 **프로세스가 갈릴 때만** 필요하다. 안 갈리면 쓰지 마라 —
전선을 하나 늘릴 때마다 지연·포맷·끊김이 하나씩 는다.

| 배치 | 포즈 | 그림 |
| --- | --- | --- |
| **같은 앱 안** ★ | 직결 (리그가 카메라를 직접 몬다) | 직결 (`keepScreenOutput`) |
| 다른 프로세스 · 같은 PC | VMC/OSC | Spout2 (`SpoutViewfinderSource`) |
| 다른 PC | VMC/OSC | NDI (`NdiViewfinderSource`) |

프로세스가 갈렸을 때 그림을 되받는 법은 아래 § 를 봐라.

## 붙이는 법 — 두 걸음

1. 방송 카메라에 `HandheldRig` 를 붙이고 **`keepScreenOutput` 을 켠다**
2. 아무 오브젝트에 `HandheldServer` 를 붙인다 (조종석이 QR·터널까지 봐 준다)

## 왜 `keepScreenOutput` 이 필요한가

리그는 뷰파인더를 만들려고 카메라의 `targetTexture` 를 가져간다. 그러면 **그 카메라가
화면에서 사라진다** — 이미 돌고 있는 앱에서는 그게 사고다. 예외도 안 나고 화면만 검어지는,
조용히 깨지는 종류다.

켜면 원본은 건드리지 않고 **사본을 하나 만들어 그쪽만 RT 에 그린다**. 사본은 꺼 둔 채
우리가 직접 `Render()` 를 부르므로 파이프라인이 알아서 두 번 그리는 일은 없다.
사본은 `HideFlags.DontSave` 라 씬에 안 남는다.

**값**: 뷰파인더 해상도(기본 720p)로 한 번 더 그린다. 외부 패키지 없이 한 프로세스에서
끝내는 값이다 — 방송 해상도가 1080p 여도 폰으로 가는 건 720p 뿐이라 비용이 비례하지 않는다.

**한계**: `Camera.CopyFrom` 은 URP 의 추가 카메라 설정(`UniversalAdditionalCameraData`)까지는
안 옮긴다. 사본의 후처리 설정이 원본과 다르게 보이면 그쪽을 손으로 맞춰야 한다.
붙여서 재 보기 전엔 「똑같이 보인다」고 적지 말 것.

## 프로세스가 갈렸을 때 — 그림 되받기

리그에 `externalViewfinder`(RenderTexture)를 물리면 **이 카메라는 안 그리고** 그 텍스처를
폰으로 보낸다. 자세는 그대로 나가므로 「포즈는 VMC 로 내보내고 그림만 되받는」 배치가 된다.

그 텍스처를 채워 주는 어댑터가 둘 있다:

| 컴포넌트 | 길 | 조건 |
| --- | --- | --- |
| `SpoutViewfinderSource` | Spout2 (GPU 공유) | **같은 PC**. CPU 부하 사실상 0 · D3D11/12 만 |
| `NdiViewfinderSource` | NDI | 네트워크를 넘어간다. CPU·메모리·대역을 쓴다 |

**둘 다 옵션이다.** 각각 제 어셈블리에 갇혀 있고(`Karmo.Handheld.Spout` /
`Karmo.Handheld.Ndi`), KlakSpout·KlakNDI 가 설치돼 있을 때만 컴파일된다. 없으면 어셈블리째
빠지고 나머지는 그대로 돈다 — URP 흐림과 같은 방식이다. **이 패키지는 그 둘에 의존하지
않는다** (시험용 프로젝트가 컴파일을 확인하려고 받아 둘 뿐이다).

넣는 법:

```json
"scopedRegistries": [{ "name": "Keijiro", "url": "https://registry.npmjs.com", "scopes": ["jp.keijiro"] }],
"dependencies": { "jp.keijiro.klak.spout": "2.0.4", "jp.keijiro.klak.ndi": "2.1.4" }
```

**확인한 데까지만**: 두 어댑터는 컴파일과 배선(받은 텍스처를 리그에 물리는 것)까지만
확인했다. 실제로 다른 프로세스와 그림을 주고받아 본 적은 없다.
