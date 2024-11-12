---
title: "Surface Shader"
# description: ""
categories: [💫Computer,🌔Game-Engine]
tags: [Game-Engine, Computer-Graphics, CG, Cg]
image: "/assets/img/background/kururu-lab.jpg"
hidden: true

date: 2024-11-13. 07:20
last_modified_at: 2024-11-13. 07:20 # Init
---

## 💫 Surface Shader

---

 1. 설정 부분
전처리라고 할 수도 있고 스니핏(snippet)이라고 부르기도 합니다.
 이 부분은 말 그대로 쉐이더의 조명계산 설정이나, 기타 세부적이 분기를 정해주는 부분입니다.

 float의 1/2 크기가 half
half보다 더 작은 크기가 fixed

컬러나 벡터 길이는 fixed로 충분
범위나 정밀도가 필요한 것은 half
나머지는 float을 사용하는 것이 좋습니다.

실제로 Nvidia 쪽 GPU의 경우에는 half로 할 때 연산수가 2배로 빨라집니다. 그렇지만 그렇다고 float 정도로 정밀할 필요가 있는 데이터를 half로 바꾼다면 잘못된 결과가 나올 수 있겠죠?
 ★ Albedo는 빛을 받는다는 의미가 아닙니다. Diffuse와 동일하게 생각하면 곤란합니다.
 ★ 3ds Max에서 셀프 일루미네이션 (Self-illumination) 이라고 부르는 '자기 발광' 기능이 바로 Emission입니다
 ★ o.Albedo와 o.Emission의 값은 최종적으로 서로 더해집니다. 즉, 둘을 모두 쓰면 필연적으로 밝아집니다.
 Albedo > 조명 연산을 추가로 받게 되고, Emission 조명 연산을 받지 않아서
'조명과 상관없는 순수한 색상' 만이 출력 > 순수한 결과물을 보고 싶을 때는 Emission을 즐겨서 사용
 1보다 밝은 색이 있고, 0보다 어두운 색이 있어서 그것이 존재하고 계산되는 상태를 HDR (High Dynamic Range)
 float4.rgb => rgb만 쓰겠다, 자동 형변환 느낌인듯?
 float.rgb
float.grb
float.bgr
float.rrr
 1 = 1,1,1 / 0.5 = 0.5, 0.5, 0.5
 o.Albedo = test.b 라고 쓰면 0을 입력한 것과 같기 때문에 검정색이 출력
 ㄴ 이렇게 변수의 부분값을 자유자재로 바꾸는 것은 스위즐링 (Swizzling) 이라고 합니다
 예전에는 오류가 생기면 무조건 마젠타 색을 출력했지만,
유니티 5.5부터 계산할 수 있을 때 까지 계산하고 오류 메세지 출력
심각한 오류라면 여전히 마젠타 컬러를 보여줌
 float x
x.r 가능

float2 xx
float3(0, xx.rg)
float3(0, xx.gg)
 인터페이스 변수를 CG코드 내에서 사용하려면 똑같은 이름의 변수를 안에서 선언해주면 됨
 밝기를 조절하는 방법
-1 ~ 1 Range로 받아오고
o.Albedo = rgb~ + 변수 값
 struct 안에 아무것도 들어있지 않으면 안됨
 float4 color : COLOR
이 내용은 버텍스 컬러를 받아오는 마법의 주문, 현재로서는 어디에도 쓰진 않습니다. 단지 에러를 피하고자 쓴 것이지요.
 o.Alpha = 1 로 불투명함을 표시, 하지만 '아직은' 0.5 나 0 을 넣는다고 반투명해지거나 투명해지지 않습니다.
 LOD > 이 쉐이더의 환경 설정에 따른 옵션 값에 관련된 내용

<https://celestialbody.tistory.com/5>

텍스쳐는 UV 좌표와 함께 계산되어야 float4로 출력될 수 있기 때문에, 아직 UV와 계산되지 않은 텍스쳐는 색상 (float4)으로 나타낼 수 없다. 그래서 이때까지는 sampler라고 부른다.  

## 💫 _4

---

물리 기반 쉐이더에서 Metalic이 0이면 스페큘러 컬러가 흑백(흰 빛을 비추었을 때)이 되며, Metalic이 1이면 스페큘러 컬러가 Albedo에 넣은 색이 됩니다. 금속은 고유의 스페큘러 컬러를 가지고 있기 때문입니다. 가급적 Metalic에서 0과1 외의 값은 쓰지 않는 것이 정확한 물리 기반 쉐이더를 다루는 방법입니다.  

Smoothness는 재질이 매끄러운지 거친지를 결정하는 부분.  
0이면 완벽히 거칠어서 난반사만 일어나고, 1이면 완벽히 매끄러워서 정반사만 일어나게 됩니다.  

난반사가 일어나는 이유는 '거친 표면' 때문이며, 특히 겉으로는 부드러워 보이더라도 미세한 표면 단계에서의 거칠기 때문에 (거의 분자 단위로) 피부나 천의 경우에는 스페큘러가 적게 나타나는 것입니다.  

즉, 재질이 매끈하면 난반사(Diffuse) 연산보다 정반사(Specular) 연산이 늘어나며, 이것을 조절할 수 있는게 Smoothness 인자 입니다.  

벤타 블랙 같은 특수한 물질을 제외하고는 대부분 어느 정도의 스페큘러를 가지고 있다.  
우리가 질감을 느끼게 되는 요소는 거의 스페큘러, 그래서 스페큘러가 없으면 거의 질감을 느끼기가 힘든 것.  

유니티에서 Standard Shader라는 '물리 기반 렌더링' 의 기본 개념은 '에너지 보존 법칙'으로 '나가는 빛의 양은 들어온 빛의 양을 넘을 수 없다'라고 간단하게 설명할 수 있습니다.  

[](https://docs.unity3d.com/Manual/StandardShaderMaterialCharts.html)  

일반 텍스쳐를 노말맵으로 만들 수 있음.  
Create from Grayscale 옵션을 체크하고, Bumpniss나 Filtering을 적절히 조절  

NormalMap은 일반적인 텍스쳐가 아니다.  
NormalMap은 일반적인 게임용 텍스쳐 포맷인 DXT1 혹은 DXT5가 아니라 DXTnm이라는 파일 포맷이다.  
(플랫폼에 따라 다를 수 있다. 예를 들어 안드로이드에서는 ETC 파일 포맷을 쓰기도 한다. 여기서는 PC 기준으로 설명하겠다.)  

이 파일 포맷은 일반적인 텍스쳐의 압축에 의한 NormalMap 품질의 저하를 막기 위해 만든 AG 파일 포맷이다.  
이 포맷은 NormalMap의 R과 G의 퀄리티를 최대한 보전하여 A와 G에 넣어 저장한다. (B는 가지고 있지 않다)  
이렇게 보전된 R과 G는 NormalMap의 X와 Y로 계산되며, Z는 삼각함수를 이용하여 수학적으로 추출이 된다.  

그러므로 이 텍스쳐를 이용해서 NormalMap으로 온전하게 생성해내려면 앞에 설멍혀나 공식이 적용되어 있는 함수를 이용하면 간편한다.  
`float3 y = UnpackNormal ( float4 x );`  
`o.Normal = UnpackNormal ( tex2D (_BumpMap, IN.uv_bumpMap) );`  

or  

`fixed3 n = UnpackNormal(tex2D(_BumpMap, IN.uv_bumpMap));`  
`o.Normal = float3(n.x * 2, n.y * 2, n.z);`  
강도 조절 (Z축은 거의 영향을 끼치지 않기 때문에 연산해줄 필요가 없다, 물론 1이상을 곱한 후 내부적으로 normalize를 한다면 약하게 만들어 줄 수 있겠습니다만 이 단계에서는 적절치 않으므로 설명을 생략하겠습니다.)  

Occlusion (Ambient Occlusion)은 구석진 부분의 추가적인 음영을 표현하는 기능  
일반적으로 환경광 (Ambient Color)로 가득 차 있느 세상에서 그림자가 드리워진 부분도 사방에서 오는 환경광 정도를 받고 있는 것이 일반적입니다.  
하지만 매우 구석져 있거나 복잡한 물체들로 가려져서 환경광도 닿지 못하는 부분은 더욱 더 어두워지는데 이 부분을 Ambient Occlustion (환경 차폐)라고 부릅니다.  

특이하게도 Occlusion 맵은 독립된 UV를 받으면 에러가 납니다. 반드시 _MainTex같은 UV를 사용해야 정상적으로 작동.  
o.Occlusion이 float을 받기 때문에, RGB를 모두 사용하는 텍스쳐 한 장을 단지 Occlusion 기능을 위해 추가하는 것은 낭비.  
_MainTex의 알파 채널을 Occlusion으로 사용한다던지  

지금까지 유니티에 내장된 PBS 쉐이더인 Standard Shader의 Metail Pass의 기본 조작접에 대해 알오보았다.  

[https://unity.com/kr/releases/editor/archive](https://unity.com/kr/releases/editor/archive)  
다운로드 아카이브에서 내장 쉐이더를 다운 받을 수 있다.  
