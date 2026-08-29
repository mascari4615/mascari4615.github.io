# 전송. WebRTC 가 더 좋은 길, MJPEG 이 늘 있는 길

> 코드: `HandheldWebRtc.cs`, 폴백 = `HandheldServer` 의 MJPEG 경로

## 전송. WebRTC 가 더 좋은 길, MJPEG 이 늘 있는 길

| | 영상 | 포즈, 스틱, 렌즈 |
| --- | --- | --- |
| **WebRTC** (Play 모드) | H.264 트랙 (하드웨어 인코딩) | DataChannel `ordered:false, maxRetransmits:0` |
| **MJPEG** (Edit 모드, 폴백) | WS 바이너리 JPEG | WS 텍스트 |

**왜 바꿨나**. 근거 둘 (측정 없이도 참):

1. **업링크 경쟁.** 뷰파인더 MJPEG 이 862KB/s ≈ 7Mbps 의 PC **업링크**를 먹는데, OBS 송출이
   같은 회선을 쓴다. H.264 델타 압축이면 1/8 로 준다. 조종석의 **영상 상한(kbps)** 이
   방송 회선을 얼마나 내줄지를 정하는 손잡이다.
2. **폰 CPU.** 폰이 초당 30~60장을 JPEG 디코드하느라 WebXR rAF 와 CPU 를 나눠 쓴다 =
   **포즈 생성 자체가 늦어진다.** 하드웨어 H.264 디코드는 그 비용이 거의 0 이다.

> ⚠ 예전 이 문서에 있던 영상이 포즈를 막는다(같은 줄에 선다)는 **틀렸다.**
> TCP 는 전이중이고 영상(PC→폰)과 포즈(폰→PC)는 방향이 반대다. 그 문장에 기대지 마라.

**영상 트랙은 Play 모드를 요구한다.** `WebRTC.Update()` 가 `WaitForEndOfFrame` 을 기다리는데
Edit 모드엔 그 신호가 없다. 그 루프 본문은 **영상 텍스처 제출 전용**이라, 데이터채널은
`ExecutePendingTasks` 로 Edit 모드에서도 돈다. 그래서:

- Edit 모드 = 포즈는 DataChannel, 영상은 MJPEG (화면이 안 끊긴다)
- Play 모드 = 둘 다 WebRTC

시그널링은 **이미 있는 WS** 를 탄다. 서버를 하나 더 세우지 않는다. WebRTC 영상이 붙으면
폰은 들어오는 JPEG 을 **안 그린다**(디코드 비용이 그대로 폰 CPU 다). 끊기면 그리로 돌아간다.

캡처 경로는 **하나뿐**이다. 영상 트랙이 리그의 뷰파인더 RT 를 그대로 싣는다. 16:9 고정, 
해상도 손잡이, 게이트 핏이 전부 그대로 산다.
