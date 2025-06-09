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
# last_modified_at: 2025-06-08. 20:18 # +메모
last_modified_at: 2025-06-09. 21:00 # +메모
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

- <https://youtu.be/LQPBRsgsoJ0>
- 색
  - <https://colorpalettes.net/>
  - <https://coolors.co/ef476f-ffd166-06d6a0-118ab2-073b4c>
  - <https://mycolor.space/?hex=%23845EC2&sub=1#AB372E&sub=1>
- TA
  - <https://blog.nexon.com/post/2321256>
- <https://blog.popekim.com/ko/tags/shader-book/>
- 린반, 에반 (언리언), 쿠파 (유니티)
- <https://gamefx.co.kr/bbs/board.php?bo_table=ik>
- <https://gamefx.co.kr/bbs/page.php?hid=Kupa_intro>
- 비리비리 중국 ASE (엠플리파이 셰이더)
- Book of Shader
  - 깊은 그래픽스보다는, 원하는 셰이더를 어떻게 만들것인가
  - 셰이더 잘한다 -> 셰이더를 어떻게 원하는 모양으로 만들까
  - 수학적 공식을 써서 패턴을 만드느냐는 이미 많은 사람들이 정리해뒀기때문에, 그 패턴을 알아야함
- 유니티 셰이더 생성 5가지 유형
  - StandardSurfaceShader: 기본 조명 모델을 포함하는 표면 셰이더 템플릿을 생성
  - UnlitShader: 조명 없이, 그러나 FOG를 포함하는 기본 버텍스,프래그먼트 셰이더를 생성함
  - ImageEffectShader: 이미지 이펙트 셰이더는 화면 후처리 효과용 셰이더
  - ComputeShader: 특수 셰이더인데, GPU 병렬성을 이용한 일반 렌더 파이프라인과 관련 없는 계산 수행함
  - RayTracingShader: 유니티 실시간 레이트레이싱에 쓰는 셰이더, 레이트레이빙은 장면의 개별 픽셀에 대한 레이(Ray,즉 빛)을 추적하여 현실에게서 얻는 빛 반사를 시뮬레이션 하는 기술,
- 유니티의 셰이더의 기초
  - HLSL,GLSL도 아닌 셰이더 랩(ShaderLab)이라는 고급 렌더링 추상화 레이어
  - 머티리얼 표시하는 모든 것을 정의
  - 유니티 셰이더의 기본 구조
    - Shader "셰이더 이름"
    - 속성(Properties)
    - 서브 셰이더(SubShader)
    - 서브 셰이더(SubShader)
    - Fallback
  - 머티리얼과 유니티 셰이더간의 연결을 일반적으로 프로퍼티라고 하고
  - 인스펙터, 즉 머티리얼 패널에서 일반적으로 보이게 정의할 수 있음
  - 머티리얼 속성Properties
    - 숫자 유형인 Int, Float, Range와 같은 프로퍼티의 기본값은 단일 숫자이고,
    - Color, Vector와 같은 프로퍼티의 기본값은 괄호로 둘러싸인 4차원 벡터이며,
    - 2D, Cube, 3D의 세 가지 텍스처 유형의 기본값은 약간 더 복잡하며 문자열 뒤에 괄호로 묶인 한 쌍으로 지정됨.
    - 여기서 문자열은 비어 있거나 "흰색", "검은색", "회색" 또는"Bump".로 되어있음
    - 괄호의 목적은 원래 일부 텍스처 속성을 지정하는 것.
    - 고정 파이프라인의 텍스처 좌표 생성을 제어해야 하는 경우,
    - 버텍스 셰이더에서 해당 텍스처 좌표를 계산하는 코드를 작성해야함
  - 서브 셰이더(SubShader)는 여러개 있어도 되지만, 무조건 하나이상은 존재해야함
    - 유니티에서는 셰이더를 로드해야할까, 서브 셰이더 블록을 스캔한 다음 플랫폼에서 실행할 첫번째 서브 셰이더를 선택함.
    - 만약, 그 어떤 서브 셰이더라도 없을 경우 FallBack으로 지정된 셰이더를 사용함.
    - 유니티에서 Fallback을 사용하는 이유는 기본적으로 그래픽카드마다 기능이 다르기때문에.
  - SubShader블록에 정의된 것은 일반적으로 다음과 같은데
    - Tags
    - RenderSetup
    - Pass{}
  - _
    - 서브 셰이더는 기본적으로 일련의 패스와 렌더 셋업 태그 설정을 함
    - 각패스는 완전한 랜더링 프로세스를 정의하지만, 패스가 너무 많으면 랜더링 성능이 저하됨. 따라서 가능한 최소한의 패스를 사용해야함
    - 서브셰이더의 경우 상태 및 태그도 패스에서 선언할 수 있음.
  - 셰이더 랩은 이런 일련의 랜더링 상태 설정 명령을 제공하여, 블렌딩/뎁스 여부등의 다양한 상태를 설정할 수 있음
    - Cull 컬링 모드 설정
    - ZTest 심도 테스트 설정 시 사용되는 기능(그림자 그릴때 씀 그에 대해서 내가 쓴 글 링크)
    - ZWrite 딥 라이팅 켜기/끄기
    - Blend 블렝딩 모드 켜기 및 설정
  - 위의 랜더링 상태가 서브셰이더 블록에 설정되면 나머지 모든 패스에 일괄적용됨. 이를 원하지 않을 경우, 패스 시멘틱 블록에서 별도로 설정가능함
  - 서브셰이더는 기본적으로 태그는
    - Key/Value Piar 로 이루어진 키와 문자열 유형임.
    - 이러한 키와 밸류 페이너는 랜더링 엔진간의 일종의 통신 브리지임
    - 태그의 기본 구조는 이러함
    - Tags{"TagName1" = "Value1" "TagName'2" = "Value2"}
    - 유니티가 지원하는 서브셰이더 태그 유형
      - Queue -랜더링 순서 제어, 객체가 속하는 렌더링 대기열 지정
      - RenderType - 셰이더 종류 분류
      - DisableBatching - 일부 서브 셰이더에서 버텍스 애니메이션을 위해 공간 좌표 쓸때, 유니티의 일괄 처리기능 여부를 키고 끌수있음.
      - ForceNoShadowCasting - 객체가 그림자를 투사할지
      - IgnoreProjector -서브 셰이더를 사용하는 객체의 반투명 여부
      - CanUseSpriteAtlas -서브 셰이더가 스프라이트에 사용되는 경우 False
      - PreviewType - 패널에서 미리보기
    - 패스 태그 유형
      - LightMode Unity의 랜더링 파이프에서 이 패스 역할 정의
      - RequireOptions 특정 조건 충족시 패스가 랜더링되도록 지정
  - Fallback
    - 모든 서브 셰이더가 이 그래픽 카드에서 실행되지 않을 경우 최하수준으로 실행되는 셰이더를 폴백이라고함
    - 실제로 폴백은 그림자 투사에도 영향을 끼치고, 기본적으로 유니티 범용 패스가 포함되어있기때문에 직접 모든 패스를 구현할 필요가 없음.
  - 셰이더 유형
    - 기본적으로 표면 셰이더(SurfaceShader)는 서브 셰이더의 CGPROGRAM과 ENDCG사이에 정의됨
    - 그 이유는 표면 셰이더를 사용할 때, 개발자가 사용할 패스 수, 각 패스가 랜더링 되는 방식에 대해서 생각할 필요가 없고, 이 작업을 유니티 엔진 차원에서 해줌
    - CGPROGRAM과 ENDCG사이의 코드는 CG/HLSL을 사용하여 작성되는데, Cg/HLSL 언어는 셰이더 언어와 중복되서 쓸 수가 있음
  - _
    - Shader "Custom/Simple Surface Shader"{
    - SubSHader{
    - Tags{"RenderType"="Opaque"}
    - CGPROGAM
    - #pragma surface surf Lambert
    - struct Input{
    - float4 color : COLOR;
    - };
    - void surf(Input IN,inout SurfaceOutput o){
    - o.Albedo = 1;
    - }
    - ENDCG
    - }
    - Fallback "Diffuse"
    - }
  - _
    - Shader "Custom/Simple VertexFragment Shader"{
    - SubShader{
    - Pass{
    - CGPROGRAM
    - #progama vetex vert
    - #pragma fragment frag
    - float4 vert(float4 v : POSITION) : SV_POSITON{
    - return mul(UNITY_MATRIX_MVP,v);
    - }
    - fixed4 frag() : SV_Target{
    - return fixed4(1.0,0.0,0.0,1.0);
    - }
    - ENDCG
    - }
    - }
    - }
    - 버텍스/ 프래그먼트 셰이더 또한 CGPROGRAM과 ENDCG사이에 정의되야함
    - 표면 셰이더와 차이점은 SubShader가 아닌 Pass 블록에서 작성된다는거
  - 따라서 유니티 셰이더는 실제 셰이더가 아님.
  - 전통적인 셰이더에서는 입력 출력을 하기 위해서 출력 위치 대응을 해야했지만, 유니티 셰이더에서는 특정 블록만 활성화하면됨.
  - 유니티 셰이더는 모델에 제공되는 버텍스 위치, 텍스쳐 좌표, 노멀에 직접 접근할 수 있으므로 개발자는 셰이더에 데이터를 전달하기위한 추가 코딩이 필요 없음
- 프로테제 효과
- 셰이더 프로그래밍만 할거라면 굳이 유니티를 쓸 필요 없고 webgl 이나 shadertoy 사이트에서 공부하는 게 더 낫다? 네이티브 그래픽스 api 다루는 게 낫다?
- 유니티 기본 lit 뜯어보기?
- Learn to Write Unity Compute Shaders 유데미
- ['캐니':](https://blog.naver.com/canny708/221547308831)
- 아트 감성을 배워야 -> 단순 암기로 되는게 아님, 꾸준히 몇 년씩 그림그리고 해야
- Game Feel, Juice
- 14:44 Gusdnd_UI
  - RETR0 강의 (셰이더 & 렌더링 에센스)
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
  - 컴퓨트 셰이더, 버퍼
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
