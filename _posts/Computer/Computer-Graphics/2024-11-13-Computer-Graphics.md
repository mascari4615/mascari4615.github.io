---
title: "CG"
# description: ""
categories: [💫Computer, 🌕Computer-Graphics]
tags: [Computer-Graphics, CG]
image: "/assets/img/background/kururu-lab.jpg"
hidden: true

date: 2024-11-13. 06:35
last_modified_at: 2024-11-13. 06:35 # Init
---

## 💫 CG

---

Computer Graphics.  

## 💫 메모

---

### 🫧 키워드

- 그래픽스
- 디더링
- 텍스처 압축 포맷
- 소프트마스크
- 스텐실
- 알파테스트, 알파블렌딩
- 스크린 스페이스 쉐이더
- sssShader
- Scene Depth : 카메라부터 연산을 시작하는 점까지의 깊이?
  - Transparent는 통과하는 듯..?

### 🫧 참고

- `렌더링 파이프라인 / 셰이더`

### 🫧 Link

- [The Unity Shaders Bible](https://learn.jettelly.com/unity-shader-bible/#buy-now)
- [CatLikeCoding](https://catlikecoding.com/)
- [Graph 그리기, Position에 따른 Color](https://catlikecoding.com/unity/tutorials/basics/building-a-graph/)
- [Surface Shader (눈)](https://blog.naver.com/PostView.naver?blogId=plasticbag0&logNo=221439156276&parentCategoryNo=&categoryNo=45&viewDate=&isShowPopularPosts=false&from=postView)
- [Shadertoy](https://www.shadertoy.com/)
- [가짜 투명도, 디더링](https://gall.dcinside.com/mgallery/board/view/?id=game_dev&no=117790&page=1)
- [쉐이더와 머테리얼](https://gall.dcinside.com/mgallery/board/view/?id=game_dev&no=117952&exception_mode=recommend&page=1)
- [알베도, 이미션, 디퓨즈](https://m.blog.naver.com/sorang226/222940558803)
- [2D→3D](https://twitter.com/asidys230/status/1635799802100482049?s=20)
- [Post-processing outlines](https://twitter.com/TheMirzaBeig/status/1658643110409261056?s=20)
- [light scrolling](https://twitter.com/cmzw_/status/1655536784485527552?s=20)
- [Tiling Vs Hex Tiling](https://twitter.com/_kzr/status/1621052638723993600?s=20)
- [일반적인 2Pass 방식일 때 노말 방향 보정 공부](https://x.com/longlong_stone/status/1664844118491553793)
- [darkcatgame](https://darkcatgame.tistory.com/79)
- [펭귄 게임 개발일지 - 툰 쉐이더](https://gall.dcinside.com/mgallery/board/view?id=game_dev&no=126408)

- 피직님
  - [1](https://x.com/kimphysik/status/1781326314118754771)

- 키바님
  - [숫자 타일](https://x.com/kjh030529/status/1754052982621274570)
  - [버튼](https://x.com/kjh030529/status/1757252520051888242)
  - [홀로그램 쉐이더](https://twitter.com/kjh030529/status/1631561982842396677?s=20)

- 경섭님
  - [1](https://x.com/ryurud_n5/status/1822665541909434376)
  - [2](https://x.com/ryurud_n5/status/1820451843941745102)
    - 명조 스타일 만들기 #1 명조는 Grass가 카메라와 가까워지면 아래로 숨겨짐 Dithering을 활용하는 경우는 봤어도 이렇게 아래로 숨는 경우는 처음 봤음 원래 툰게임들은 이렇게 구현하나? 비슷하게 따라해본 결과 Distance Field 맵과 Pixel Depth를 활용하는 방향이 쉽겠다 싶었는데, 뭔가 명조는 더 딱딱한걸 보면 단순 메쉬의 월드 포지션을 조절하는건가 싶다
  - [3](https://x.com/ryurud_n5/status/1756354222159994889)
  - [4](https://x.com/ryurud_n5/status/1747572879464833498)
  - [5](https://x.com/ryurud_n5/status/1746504485915246713)
  - [6](https://x.com/ryurud_n5/status/1845474453024895215)
  - [7](https://x.com/ryurud_n5/status/1831341519913255228)

- [하람쥐님 블로그 - Missing](https://blog.naver.com/hram01/221489477514)

### 🫧 무슨 말인지 이해하고 싶다

- DC
  - 이펙터는 웬만한 쉐이더를 반투명으로만 사용한다. Translucent 아니면 Additive 즉 최적화를 크게 신경쓰지 않는. 반면 모델러들은 양면 렌더도 제대로 못 쓰게 한다 최적화에서 가장 크게 잡아먹는 Shadowdepth도 이펙터들은 크게 신경쓰지 않는다
  - 모델러들은 라이트 베이킹부터 VRAM 때문에 라이트맵 해상도부터 줄여나가고 Batching과 Instancing도 해야하는 작업을 가진다. 이쁜 gi를 쓰고싶어도 forwardrender 쓰는 모바일에선 라이트베이킹만 써야하고. 하다못해 그것도 안써서 페이크 라이팅 쓰는곳도 많음. 특히 커스텀 셰이딩 모델은 대부분 캐릭터에서 나오지 이펙트에서 나오지 않는다.
  - TA들 나이가 많은 이유는 모델러 출신에서 점점 올라운더로 바뀌며 다해봐서 그런거임. 이펙터 출신 Ta들이 왜 모바일과 소형 프젝만 있는가 하면 이런 최적화 경험을 해볼수가 없이 연출과 쉐이더만 짜고 가끔 후디니로 파괴까지만 구현해서 나 TA요 거들먹거리는거지. 실제 기술과 현장에서 써먹는건 모델러 출신이 더 정확하다. 물리 기반 렌더도 전부 모델링에 맞춰져있지 이펙트가 겪어볼 일이 많을까? 그리고 이펙터 출신이든 모델러 출신이든 이펙트도 모델링도 두가지 모두 지식 없으면 TA가 아니라 잡부임.
