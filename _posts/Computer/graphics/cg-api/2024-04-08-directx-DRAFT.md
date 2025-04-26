---
title: "DirectX"
# description: ""
categories: [💫Computer, 🌕Graphics]
tags: []
image: "/assets/img/background/kururu-lab.jpg"
hidden: true

date: 2024-04-08. 07:59
# last_modified_at: 2024-08-29. 21:46
last_modified_at: 2024-11-13. 07:47 # Init
---

## 💫 Q

---

- `그래픽스 API`
- DirectX / OPENGL, 뭐든 "CG 이론을 알고 있다"를 어필할 수 있는
- [그래픽스 공부한사람들 어느정도 공부했음?](https://gall.dcinside.com/mgallery/board/view/?id=game_dev&no=89027)
- 파이프라인 쭉 훑고 텍스쳐링이랑 알파블렌딩 해보면 충분?
- <https://www.opengl-tutorial.org/> -> 렌더링 기초?

## 💫 _

---

### 🫧 _

- [Direct X 프로그래밍 학습에 대한 조언](https://megayuchi.com/2019/04/18/direct-x-프로그래밍-학습에-대한-조언/)

<https://www.youtube.com/live/NTvhVxSC_80?si=v6Buv00ygh2ETDdh&t=2997>

- 콘솔모드 테트리스 or 뱀 (뭐든 간에)
GDI로 헬로 월드

-> Device Context에 대한 학습
Direct Draw로 화면에 점 찍어보기
-> 필요없는데, 왜?

비트맵 제어를 배울 수 있음
포인터에 능숙해짐.
그래픽 하드웨어 다루는 기초
이미지 데이터 (텍스처) 에서의 Pitch의 개념?
Width * bytes in format과 Pitch 는 뭐가 다른가?

이미지 데이터에서 Padding이 고려된 한 row의 길이
왜 Padding이 왜 고려되어야 해?
-> 성능 - 그 메모리가 그래픽 하드웨어에 1:1 맵핑 되어야 하는 주소일 수도 있으므로...
그래픽스도 결국은 하드웨어 구조를 알아야함
픽셀도 Padding이 있을수도

Direct Draw로 간단한 게임 만들어보기
이미지 다루는 법
마우스와 키보드 이벤트 처리
COM 다루는 방법 = win32/ MS의 프로그래밍 스타일 이해하기
네트워크 프로그래밍 -> windock + 멀티스레드 + IOCP
게임 프로그래밍 -> D3D11 -> D3D12
괜찮은 dx11책 하나 사셔서 삼각형 그리기
그 다음에는 모델 파일들 로딩해서 보여주기 (FBX 라이브러리가 있으니 그걸 사용해도 될듯)
그리고 셰이더 이것저것 작성해보기 (어차피 dx11의 일부일듯..)
이정도가 되면 지원할 정도는 될 거 같아요.

말씀하신 것 처럼 dx11 공부하고 상용엔진 유니티, 언리얼도 공부했습니다
그래픽스로 가면 그래픽스 파이프라인을 얼마나 이해하고 있는지가 중요할 것 같고… 원하는 셰이더를 상용엔진에서 적용시킬 줄 알면 될 것 같습니다

그래픽 엔지니어라고 하면 TA로 보는 것 같은데
근데 일단 dx11만 해도 알아야할 좀 있으니
요거를 하시고 그릴때 최적화기법들도 적용시키면 지원할때 어필이 될 것 같슴돠
