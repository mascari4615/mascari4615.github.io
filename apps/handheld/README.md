# Handheld. 폰이 유니티 카메라가 된다

이 폴더는 **패키지 하나와 그것을 시험하는 유니티 프로젝트**다.

| 자리 | 무엇 |
| --- | --- |
| `unity/Packages/com.karmo.handheld/` | **패키지 본체**. 다른 프로젝트에 이것만 넣으면 된다 |
| `unity/` | 그 패키지를 띄워 보는 시험용 프로젝트 |
| `pose-analyze.mjs` | 포즈 기록(CSV)을 읽어 튐, 표류, 망 지연을 판정한다 |
| `tunnel.ps1` | cloudflared 터널 |

읽을 것 = [패키지 README](unity/Packages/com.karmo.handheld/README.md) 와
그 아래 `Documentation~/`.
