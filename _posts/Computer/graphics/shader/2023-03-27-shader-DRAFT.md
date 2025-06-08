---
title: "Shader"
# description: ""
categories: [컴퓨터, 그래픽]
tags: []
image: "/assets/img/background/kururu-lab.jpg"
hidden: true

date: 2023-03-27. 13:27
# last_modified_at: 2023-03-27. 14:10
# last_modified_at: 2023-10-26. 13:09
# last_modified_at: 2024-07-26. 13:29
# last_modified_at: 2024-07-30. 22:20
# last_modified_at: 2024-09-02. 11:15
# last_modified_at: 2024-09-27. 22:44
# last_modified_at: 2024-10-16. 08:14 # 메모
# last_modified_at: 2024-11-13. 07:19 # -Cg
# last_modified_at: 2025-03-14. 23:32 # 메모
# last_modified_at: 2025-05-28. 05:53 # +메모 from career-learning
# last_modified_at: 2025-05-28. 20:09 # +메모 from CG
last_modified_at: 2025-06-08. 20:18 # +메모
---

## Shader

---

기술적으로, `3D 컴퓨터 그래픽에서 최종적으로 화면에 출력하는 색을 정해주는 함수`  

- 픽셀의 색을 결정하는 함수.
- 상대적으로 쉬운 문법이라도 해도 엄연히 프로그래밍 언어 기반의 수학적 계산을 통해서 정해진 색상을 출력해주는 것을 목표

감성적으로, `그래픽 데이터의 음영과 색상을 계산하여 다양한 재질을 표현하는 방법`  

- 하지만 셰이더를 그렇게만 생각하기에는 뭔가 감성적인 다른 영역이 있다.
- 셰이더는 단지 기계적 영역의 설명뿐 아니라 감성적 영역까지 아우르는 멋진 공예품에 가깝다고 볼 수 있다.

- 자동차를 '이동을 위해 제작된, 금속과 다양한 재질들로 제작된 내연기관과 그 부속물' 이라고 말할 수도 있겠지만 다른 영역에서 바라면 자동차는 품위를 높여주거나 자신의 개성을 나타내며 유행을 선도하는 예술품으로 느껴지기도 한다.  

- 직역하면 음영, 이는 그림자와는 조금 다른 느낌을 주며, 오히려 그늘 이라고 말하는 것이 비슷
- 우리가 미술 학원에서 가장 처음 그림을 배울 때 빛이 들어오는 방향은 밝게 표현하고 빛이 들어오는 반대 방향은 어둡게 표현하였던 바로 그것 말입니다.
- 우리가 그렇게 그림을 그린 이유는, 평면인 종이에 입체감을 나타내기 위해서이며 사람의 눈은 이러한 음영을 통해서 공간감을 느낄 수 있기 때문입니다

- 3D 그래픽에서도 이러한 음영으로 물체의 존재를 표현하게 되는데, 이것을 기본으로 각종 색과 농담을 추가하여 화면에 출력하면 물체의 존재를 더욱더 확실하게 표현할 수 있게 됩니다.
- 이 음역과 색상으로 각종 재질을 나타내고 이 방법을 창의적으로 바꾸어 보면 자신만의 예술적인 개성이 넘치는 드로잉 스타일도 가능하게 되는 것입니다. 마치 자기만의 색역필이나 물감을 만드는 것처럼 말입니다.
- (좀 더 그래픽 아티스트 친화적으로 말하면, '메터리얼(Matetial) 이라는 용어입니다. 언리얼 엔진: 메터리얼 용어 사용)

## 수학적 모양

---

## 공부

---

- 14:44 Gusdnd_UI
  - RETR0 강의 (쉐이더 & 렌더링 에센스)
- 14:45 RenderingPipleline 그래픽스 API
  - kblog.popekim/포프의 세이더 입문 강좌
  - 아르카도 -> 이펙트 공부 순서
- 14:47 shader
  - 그래픽 기초이론
  - 컬러 - 숫자
  - 비트
  - 텍스처와 rgb채널
  - 상수-변수
  - 리니어-감마
  - 사칙연산-항등원
  - 컬러 -> 값 변형
  - UV
  - 밉맵
  - 벡터
  - 벡터 연산
  - 선형보간 lerp
  - 분기
  - 라이팅 모델
  - 디퓨즈(램버트?)
- 14:47 프레넬
  - 스펙큘러(퐁)
  - 스펙큘러(블린-퐁)
  - 디퓨즈(오렌-네이어)
  - 라이팅심화
  - 탄젠트 노멀 매핑
  - 큐브맵 리플렉션
  - 실시간 그림자
  - 에디셔널 라이트
- 14:48 fake PBR
  - PBR 물리기반렌더링
  - fakePBR (디퓨즈)
- 14:48 fakePBR(스펙큘러)
- 14:48 GGX 스펙큘러
- 14:50 NPR (Non-Photorealistic)
  - NPR
  - NPR-Floor
  - " step/comparison
  - " smoothStep
  - "ramp
  - " Matcap
  - " 그림자 커스텀
  - " 외곽선
  - 렌더링 파이프라인
  - 포워드 파이프라인
  - 디퍼드 "
  - 컴퓨트 쉐이더, 버퍼
  - 그외
  - Distortion
  - GLSL -> ?
  - random 함수 있음
  - The Book of shaders

## 메모

---

- [배포를 목적으로 경량화 버전의 툰 셰이더를 만들려고 하는데, 어차피 배포하는 김에 공부겸 모든 내용을 전부 주석을 달아가며 만드는 중\n\n지금까지 이해를 안하고 그냥 '선언해줘야 해서', '원래 넣는거라' 하며 작성하던 것들이 많았는데 이참에 걍 다 알아봐야 할듯\n#Shader](https://x.com/ryurud_n5/status/1852003762585636984)
  - 주석 훔쳐보기
- [@jungu_nanbang 셰이더는 사용 중인 RP 버전에 따라 전처리 지시어의 사용 방법이나 라이트 루프 처리 방식이 기존과 다를 수 있습니다. 가장 확실한 방법은 사용 중인 RP의 ShaderLibrary/RealtimeLights.hlsl 파일을 확인하여 추가 조명 계산 및 처리 방식을 살펴보는 게 좋습니다. 도움이 되셨길!!](https://x.com/onestar_1337/status/1892932995520364749)
- 단점
  - 기능마다 셰이더 만들어야 함. 컴포넌트처럼 조립할 수 없음.
  - 로그 못 찍음
  - 값(인스턴스) 차이를 주려면 각 머테리얼 파일을 만들거나, 스크립트에서 수정하거나 (디버깅 어려움). 컴포넌트처럼 씬 오브젝트 단위로 구분하고 저장할 수 없음.
- 장점
  - 에디터 타임 동작. 보면서 수정 가능. 비교적 컴파일 빠름.
- 특이
  - 플레이 모드 수정 저장됨.
  - 중간 과정 디버깅 어려움. -> 셰이더 그래프는 가능.
- shader. cpu와 다르게 if 문에서 쓰지 않을 내용도 모두 계산
- 이를 해결하기 위해 shader variant
- 빌드 용령, 속도 늘어남. 메모리도 영향 줌.

### 키워드

- ShaderGraph Tutorial and ShaderCode
- Shader Compile
- UIObject -> Canvas가 주심. Shader에서 움직이기 어려움
- UIEffectV5
- UIOutline
- 횡스크롤 강 셰이더 만들기
- [\[최적화\] Shader Variants와 효율적인 사용](https://asatala.tistory.com/171)
- Unity Manual - Rendering 추가 리소스 및 예제
  - 20가지 고급 2D 셰이더 효과
- 유니티 공식 UI 셰이더
  - UGUI 캔버스 셰이더
  - 2023 업?
  - 트랜지션?
- Shade Graph in Built-in Pipeline. Unity 2021.2
  - Youtube
- UnitySHadersIntroPart2: HLSL/CG EdgeDistortion~
- Image.material.setColor('_Color', ~);
  - 이때, shared material x, 임의로 만들어 넣어줘야 함
  - \_Color에 1 넘게 넣은 수 있음 (\_Emission, PP Bloom)
- unity, 3dMax uv 좌표계 좌우 하상
- RGB, XYZ, UVW
- 디더링
- 그래픽스
- 디더링
- 텍스처 압축 포맷
- 소프트마스크
- 스텐실
- 알파테스트, 알파블렌딩
- 스크린 스페이스 셰이더
  - sssShader
- Scene Depth: 카메라부터 연산을 시작하는 점까지의 깊이?
  - Transparent는 통과하는 듯..?
- [The Unity Shaders Bible](https://learn.jettelly.com/unity-shader-bible/#buy-now)
- [CatLikeCoding](https://catlikecoding.com/)
- [Graph 그리기, Position에 따른 Color](https://catlikecoding.com/unity/tutorials/basics/building-a-graph/)
- [Surface Shader (눈)](https://blog.naver.com/PostView.naver?blogId=plasticbag0&logNo=221439156276&parentCategoryNo=&categoryNo=45&viewDate=&isShowPopularPosts=false&from=postView)
- [Shadertoy](https://www.shadertoy.com/)
- [가짜 투명도, 디더링](https://gall.dcinside.com/mgallery/board/view/?id=game_dev&no=117790&page=1)
- [셰이더와 머테리얼](https://gall.dcinside.com/mgallery/board/view/?id=game_dev&no=117952&exception_mode=recommend&page=1)
- [알베도, 이미션, 디퓨즈](https://m.blog.naver.com/sorang226/222940558803)
- [2D→3D](https://x.com/asidys230/status/1635799802100482049?s=20)
- [Post-processing outlines](https://x.com/TheMirzaBeig/status/1658643110409261056?s=20)
- [light scrolling](https://x.com/cmzw_/status/1655536784485527552?s=20)
- [Tiling Vs Hex Tiling](https://x.com/_kzr/status/1621052638723993600?s=20)
- [일반적인 2Pass 방식일 때 노말 방향 보정 공부](https://x.com/longlong_stone/status/1664844118491553793)
- [darkcatgame](https://darkcatgame.tistory.com/79)
- [펭귄 게임 개발일지 - 툰 셰이더](https://gall.dcinside.com/mgallery/board/view?id=game_dev&no=126408)
- 피직님
  - [1](https://x.com/kimphysik/status/1781326314118754771)
- 키바님
  - [숫자 타일](https://x.com/kjh030529/status/1754052982621274570)
  - [버튼](https://x.com/kjh030529/status/1757252520051888242)
  - [홀로그램 셰이더](https://x.com/kjh030529/status/1631561982842396677?s=20)
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
- 3D
  - [World  : Principal Wells' Office - Life is Strange\nAuthor: SoftServeNeo\n\n#VRChat #VRChatPhotography #VRChatワールド紹介\n#VRChat_world #VRChat_world紹介](https://x.com/CupitanVR/status/1865716497563427186)
  - [i bought a tesseract.](https://x.com/hamptonism/status/1891263459557281802)
  - [](https://x.com/TatsuyaBot/status/1894225734375555257)
  - <https://x.com/Seoran0715/status/1845077714279202891>
- 무슨 말인지 이해하고 싶다
  - 이펙터는 웬만한 셰이더를 반투명으로만 사용한다. Translucent 아니면 Additive 즉 최적화를 크게 신경쓰지 않는. 반면 모델러들은 양면 렌더도 제대로 못 쓰게 한다 최적화에서 가장 크게 잡아먹는 Shadowdepth도 이펙터들은 크게 신경쓰지 않는다
  - 모델러들은 라이트 베이킹부터 VRAM 때문에 라이트맵 해상도부터 줄여나가고 Batching과 Instancing도 해야하는 작업을 가진다. 이쁜 gi를 쓰고싶어도 forwardrender 쓰는 모바일에선 라이트베이킹만 써야하고. 하다못해 그것도 안써서 페이크 라이팅 쓰는곳도 많음. 특히 커스텀 셰이딩 모델은 대부분 캐릭터에서 나오지 이펙트에서 나오지 않는다.
- \[ColorUsage(true,true)\] HDR Color
- High Dynamic Range
- Graphic material materialForRendering baseMaterial sharedMaterial?
- material -> 사설 가능, 렌더링 사용 여부 X, 수정 가능 여부  O
- base -> 원본, X, X
- materialForRendering -> 렌더링에 쓰는, O, X
- 렌더링 영향 주려면
- Material mat = new Mat(renderMat)
- mat.SetColor (~)
- tmp.fontMaterial = mat
- TMP fontMaterial fontSharedMaterial

### 역사

```yml
# CG
date: 2024-11-13. 06:35 # Init
last_modified_at: 2025-03-24. 00:03 # 메모
```

2025-05-28. 글 병합,  
`2024-11-13-computer-graphics-DRAFT: CG`.
