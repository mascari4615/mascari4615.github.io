---
title: "Career-Learning"
# description: ""
categories: [수필, 생각]
tags: []
image: "/assets/img/background/backtop.gif"

date: 2024-02-17. 01:40
# last_modified_at: 2024-02-21. 05:58
# last_modified_at: 2024-02-24. 03:49
# last_modified_at: 2024-03-05. 16:29
# last_modified_at: 2024-03-06. 05:18
# last_modified_at: 2024-03-12. 14:20
# last_modified_at: 2024-03-20. 06:01
# last_modified_at: 2024-03-27. 17:58
# last_modified_at: 2024-04-03. 13:30
# last_modified_at: 2024-04-18. 20:13
# last_modified_at: 2024-04-27. 13:53
# last_modified_at: 2024-07-11. 21:45
# last_modified_at: 2024-08-06. 23:09
# last_modified_at: 2024-08-12. 11:21
# last_modified_at: 2024-08-19. 16:30
# last_modified_at: 2024-08-26. 11:39
# last_modified_at: 2024-08-27. 22:06
# last_modified_at: 2024-09-14. 16:57
# last_modified_at: 2024-09-14. 21:06
# last_modified_at: 2024-10-21. 12:14 # Job, Career, Interview 정리
# last_modified_at: 2024-11-13. 03:33 # -PS
# last_modified_at: 2024-11-13. 07:44 # -CG
# last_modified_at: 2025-03-15. 07:00 # Learning -> Career Learning, '배움'에 내한 내용은 Learning으로
# last_modified_at: 2025-04-28. 17:40 # 메모
# last_modified_at: 2025-05-06. 15:43 # +메모 from memo.md
# last_modified_at: 2025-05-18. 22:53 # +메모 form 노트 정리
last_modified_at: 2025-05-19. 23:48 #
---

## 리마인드

---

- PS - 코딩 테스트/알고리듬
- 면접에서 답할 정도의 그래픽스

- CS/면접
- 유데미 언리얼 강의
- 게임 수학, 물리, 영어
  - 기본적인 행렬, 벡터의 내적과 외적
  - 기본 뉴턴 역학정도는 -> 선형대수 개념 없이 벡터와 스칼라를 크기와 방향, 크기만 있는 물리량으로만 이해 X

## 프로젝트

---

- 면접, 포폴 관련 질문 준비
- "이 기능은 어떻게 구현하셨나요?", 단순 열거 보다는 경험과 함께 설명. "~를 몰랐는데 공부하게 됐습니다"
- 어떤 최적화 기법을 적용했는지

- 하나의 기승전결 완성작보다는 효율적 로직, 기능구현에 포커싱
- 게임 엔진 경험은 프로젝트의 핵심이 아니다. 프로젝트에서 강조할 점은 프로젝트를 통해 전반적인 게임 제작 프로세스와 타 파트가 하는 업무를 이해, 다양한 문제를 슬기롭게 대처한 경험.
- -> 문제 해결자로서 팀에 기여한 내용들을 잘 기록.
  - 콘텐츠 제작/엔진 활용보다 프로그래머로서 프로젝트에 기여할 수 있는 꼼꼼한 관리, 효율성 추구에 대한 마인드가 중요
  - i.e. 커뮤니케이션을 위해 노트 정리를 꼼꼼하게 하고 공유한 경험, 실수에 의한 발생한 문제를 감지하는 이중 시스템 개발
  - 확장성, 기획자가 있다는 가정하에 만든, 프로그래밍을 거의 모르는 사람이 모든 값을 조정 가능한, 에디터/엑셀 파싱
- 깃, 다른 사람 코드 분석
- 게임 엔진 활용 능력
  - 엔진 능력은 어차피 다시 배운다. 회사 프로젝트에 따라서 재조립된다. -> 기본에 충실하자
  - 기술적으로 어필할 수 있는. 프로젝트를 진행하면서 포폴 정리, 계속 자그만한 시스템들을 만들어나가야 한다.
  - 게임 엔진 활용 기술을 어필하고 싶다면, 에디터 툴 확장. 툴을 활용해 생산성 개선 고민해보는 경험.

## CS / 면접

---

- 대답은 알고있는 선에서, 모르는건 모른다고

- Effective C++
- C와 C++의 차이?
- 코테 알고리듬 질문, 게임 특화 알고리듬 종종 (A*, QuadTree, BSP)
- 코드에 대한 힙과 스택의 레이아웃이 그려져야. 생성자 소멸자 호출 순서, 컴파일 타임과 런타임 관점을 명확하게 파악.

- [질문 리스트](https://github.com/Romanticism-GameDeveloper/GameDeveloper-Client-Interview?tab=readme-ov-file)  

- 배열과 리스트(벡터)의 차이, 본인이 알고있는 게임 최적화 방법
- @ 면접 마지막에 궁금한거 있냐고 물어볼때는 이론은 좋은데 실제로 적용하기 어려운 걸 어떻게하고 있는지 물어본다면
  - 클라이언트에서 유닛테스트 어떻게 적용하고 있는지, A/B 테스트라든지, 유니티 씬 충돌나면 어떻게 처리하는지

## _

---

- 코테
  - 문제 이해하기
  - 데이터와 문제에 맞는 알고리듬 찾기
  - 알고리듬 적용하고 디버깅하기
    - DFS 쓸 때는 스택쓰기
    - DFX 쓸 때 시작지점 stack에 미리 넣기

### 시스템 프로그래밍

- 멀티플랫폼 대응을 게임 엔진이 다 해주다보니..
- 서비스를 운영하기 위해서는 시스템에 대한 지식이 필수적이라 중요

- '뇌를 자극하는 윈도우즈 시스템 프로그래밍', 'Advenced! 리눅스 시스템 네트워크 프로그래밍', 'OS, 컴퓨터 구조론'

### 멀티 쓰레드 프로그래밍, 비동기 프로그래밍

- 이건 뭘로 공부하지..?

### 네트워크

- 서버에서 여러 개의 요청을 동시에 처리하기 위한 방법
  - Thread
    - Lock
    - DeadLock
  - Microthred (Coroutine, Fiber)
    - 장단점을 아아야 겠죠

- 서버에서 여러 연결을 효율적으로 처리하는 방법
  - IOCP
  - epoll

- TCP, UDP
  - 어떻게 동기화를 할 것인가
  - 메시지를 어떤 방식으로 보낼것인가 (Serialization)
- 네트워크를 아는 것과 서버 프로그래머로의 능력을 갖추는 것과는 결이 다른 이야기
- 서비스 관점에서 네트워크/DB 어떻게 동작하는지 이해 필요. i.e. AWS 기반 DB 연동 가벼운 웹사이트 및 관리도구
- TCP소켓 기반의 실시간 게임

- 소켓 (윈도우즈 기반)
  - 기본 소켓 프로그래밍, IOCP
  - boost::asio?
- 웹

### DB

- Transaction
- SQL
- Stored Procedure
- NoSQL
  - Redis

- 주요 데이터베이스 기술 두 가지
  - ㅡ 관계형 데이터베이스 Relational
  - ㅡ 문서 " Document

- 최소한의 항목
  - 관계형을 익숙하게 다를 능력
  - 문서에 대한 기초적인 이해 정도는
  - _
    - ㅡ 데이터베이스 작동 방법
    - ㅡ 데이터를 얻기 위해 단순한 쿼리를 수행하는 방법
    - ㅡ 데이터 삽입, 업데이트, 삭제하는 방법
    - ㅡ 데이터 세트 조인하는 방법
    - ㅡ 자신이 선택한 플랫폼이나 프레임워크에서 코드를 사용해 데이터를 가져오거나 저장하는 방법 ㅡ 데이터베이스와 연동되는 코드

관계형 DB에 대해 배우면 SELECT 문 작성이 그 20%에 해당한다는 걸 곧바로 깨닫는다.  
또한 테이블 Table을 조인 Join하는 방법을 배워야 한다는 것도 곧 깨닫게 된다.  
관계형 DB의 모든 기능을 배워야 한다는 거도 곧 깨닫게 된다.  
관계형 DB의 모든 기능을 배우려고 시간을 낭비하기보다 SELECT 문을 쓰는 법, 테이블을 조인하는 법 등 핵심적인 20%를 배우는 데 집중하라.  

### __

- 데이터 베이스
  - SQL 문
  - Index에 대한 기본상식
  - Redis?

- 헤테로지니어스
- DApp
- DTO
- 고포류

- 채팅 서버 - 실시간? C++
- 로그인 - API 서버? 웹서버? 비실시간 통신? ASP.Net Core Web API

- Win32 API 기본은 아는
- 네트워크 라이브러리를 사용하는 프로그램은 간단한 것 (채팅 프로그램)

- 온라인 보드 게임 (오목, 장기등)
- 온라인 액션 캐주얼 게임

- IOCP를 핵심 포폴로 하고 싶다면
  - 만든 라이브러리를 사용한 게임 서버를 만들어야됨
  - 더미 테스트 필요
  - 벤치마크 수치 제시

- 멀티스레드 프로그래밍 Lock-Free
  - 이미 락 프리 알고리듬을 사용한 컨테이너는 여러 개 나와 있음, 직접 만들 필요 없고, 만들면 겁남

- 오픈 소스 참고

- pure virtual function, smart pointer
- 힙메모리는 어떤 경우에 사용되며 어떠한 특징을 가지고 있는지
- 쓰레드의 장점과 단점

- win32 api는 메시지 루프 작성할 수 있고 마우스 키보드 메시지 처리할 수 있을 정도면 됩니다
- 일반적으로 게임 클라이언트 개발에 필요한 win32지식은 링크하신 강좌 정도면 충분합니다. 더 필요하면 찾아보고 학습하면 됩니다.
  - <https://youtu.be/V9nwIepvPWc?list=PLXvgR_grOs1CyJDnWeUTqbmKG1VFQM72e>
  - <https://youtu.be/8DkgVJOBzhs?list=PLXvgR_grOs1CyJDnWeUTqbmKG1VFQM72e>

- 엔진에서 쓰인 C++에 대한 지식
  - OOP 개념
    - 상속
    - 다형성
    - 가상함수
  - 템플릿
  - STL

- 메모리 관련 지식
  - 스택
  - 힙
  - 메모리 풀
  - 스마트 포인터

- <https://www.inflearn.com/course/시스템-프로그래밍>
- Async/Await과 코루틴의 차이는?
- c# 참조 스마트포인터
- C#의 특징(특히 가비지컬렉터), 배열과 리스트(벡터)의 차이, 본인이 알고있는 게임 최적화 방법
- partical 클래스
- 가비지 컬렉터
- 포폴에 어떤 최적화 기법을 적용했는지
- a/b 테스트, 유닛 테스트
- 멀티쓰레드, 파일입출력

- 왜 OOP
- 왜 Functional
- 왜 쓰레드
- 왜 비동기
- 정도의 이야기는 딱 한 문장으로 설명이 가능하고, 업계인들끼리도 모두가 납득하는 한마디가 있어야 할 것 같은데,

- 데디서버와 그래픽스에 대한 요구 능력
- 데디서버 (Dedicated Server)
- 데디서버는 특정 게임이나 애플리케이션의 서버 측 기능을 처리하는 전용 서버

- 서버 관리 및 운영: 서버의 설치, 설정, 유지 보수 능력.
- 네트워크 이해: 네트워크 프로토콜, TCP/IP, UDP 등에 대한 이해.
- 프로그래밍 언어: C++, C#, Python 등 서버 개발에 사용되는 언어에 능숙.
- 성능 최적화: 서버의 성능을 분석하고 최적화하는 능력.
- 보안: 서버의 보안 문제를 식별하고 해결하는 능력.
- 데이터베이스 관리: SQL, NoSQL 데이터베이스의 운영 및 관리 능력

- 함수형 프로그래밍
- 데이터 지향 프로그래밍
- CBD 개발 방법론
- CI/CD: Github Actions
- Jenkins, Jira와 유사한 환경을 다뤄본 경험이 있습니다. (Github Action, Github Project)
- OOP
  - OOP의 개념
  - OOP의 요소
  - SOLID

- CS
  - 자료구조
  - 디자인패턴
    - 공통적으로 발생할 수 있는 문제에 대한 재사용가능한 솔루션/해결책
    - 옵저버 패턴
    - 싱글턴 패턴
    - 오브젝트 풀
    - FSM
    - BT
- 유니티
  - 에셋번들
    - 무엇인지
    - 어떻게 사용하는지
    - 왜 사용하는지
  - 에디터 프로그래밍
    - 사용해보셨는지
    - 그게 무엇인지 설명해주세요
  - 쉐이더 기술
  - 최적화 기술
  - ScriptableObject
    - SOHelper, SOManager
  - 코루틴의 과정
    - 시작
    - yield를 만나면 원래 함수로 돌아감
    - 종료

- C#
  - IEnumerable
  - 리플렉션
  - GC

- 프로젝트
- 플레이팹
- 이펙트 쓸 수 있는지

- Gpgs 인앱결제 광고 등 외부플러그인 같은 기능
- 내외적 짐벌락 사원수
- 유니티 설계 경험 기록
- Dotween
- 클로저
- 앱 출시 경험 Relay적용 경험
- Dx
- 개발 문서화?
- 리드미 파일, 코드 주석, 릴리스 파일

## 메모

---

- 공부할 것 찾을 때:
  - Github Star, 혹은 `개발자`, `프로그래머`, `면접`, `컴공` 같은 키워드로 리포지토리 검색
  - CookApps Story 등 개발자 블로그 like 넥슨
  - unity square
  - <https://velog.io/@suhan0304/posts>
  - 유니티 설계 경험 기록
  - unity document
  - midium
    - 트라플라
  - unity 6 graphics
    - learning resources
  - MSDC CPU 인사이트
    - Enum ToString이 Reflection을 쓴다?
  - visual studio document - cpu insight, 성능 insight, enum.toString()~
  - 강연 like gdc, unite
- RectTransform.anchorPosition이 정확함
- android log cat
- state, step (flow가 있다면)
- cors 브라우저 통신 시 강요되는 보안정책
- 최적화, refactoring 경험
- 특정 class에서만 쓰이면 const, 두 class 이상에서 쓰이면 define
- unity web-gl build 시 localhost simple-web-server
- initialize-on-load, post-process-build-attribute
- editor-application.application-path: project path
- 목표 프레임 꽉꽉보다는 여유있게
- 2022.3 built-in -> 6 urp
  - standalone.input-system, camera, lighting stuff
- 전처리기지시문, 전처리상수
- error: ~google.ios-resolver.dll
  - -> ios build-support module 설치
- gpu/cpu bound
- unity profiling
- gfx-marker
- camera.all-camera: scene에 활성화된 모든 camera
- data-bind: 코드 없이 데이터 런타임에 변화
- instruments time profiler
  - unity profiler보다 더 깊게 볼 수 있음
- SceneManager.MoveGameObjectToScene
- 내외적 짐벌락 사원수
- 주사 방식
- 키보드 스캔 코드
- 프로세스-프로그램
- 콜스택
- 디펜던시 인젝션 \| Dependency Injection == 문어발 콘센트, Like MVC
  - 스탯/스킬트리, 프리셋 비유법
- MAUI, WinForm
- 조합형, 완성형 한글 코드, 가상키코드, [유니티 - 가상키보드](https://github.com/YeongJoo-Kim/UnityHangulKeybord/tree/master/VirtualKeyboard/Assets)
- Cellular Automata 세포 자동자
- Lint, Lint Roller
- 정보 = Bit + Context
- mono, il2cpp
- 파일이름제한
- 포터블 모니터
- EGPU
- 선조건 후조건
- Quaternion
- 언리얼 Double, 유니티 Float
- A*, QuadTree, BSP
- rule of thumb
- UPROPERTY
- 웹 어셈블리
- 폴리싱
- 암달의 법칙
- Amortized 복잡도
  - <https://medium.com/@satorusasozaki/amortized-time-in-the-time-complexity-of-an-algorithm-6dd9a5d38045#:~:text=Amortized%20time%20is%20the%20way,array%20and%20can%20be%20extended>
- Random Access
- Unity AnimationCurve curve.Evaluate
- three d pose tracker
- Null safety
- InverseTransformDirection, InverseTransformPoint
  - 복사생성자 v1 = v2 , v1(v2) , v1 {v2}
- 객체 비교 시에도 복사가 일어난다
- CISC RISC
- 명령어가 다르면, 다시말해 여러가지를 쓸 수 있어서 편의성
- 복잡해서 느림
- RISC는 다 똑같아서 좀 불편해도 빠름
- 진공관, 트랜지스터, IC, VLSI, SoC, 멀티코어
- Multi Booting
- Solaris/SUN, Linux/x86
- 정규분포 활용
- Quaternion.LookRotation
- Best Practice
- Flocking Algorithm
- Tradeoff
- Swagger
- 도커라이징
- 보일러 플레이트
- 영상 처리 라이브러리: OpenCV By Intel
- 드래그 길이: GetMouseButtonDown, "Up, Input.mousePosition
- threshold
- ParticleSystem: Rate/지속적, Burst/간헐적
- ENUM
  - 첫 번째, -1, NONE
  - 마지막, NUM
- Mathf.Repeat
- Devil May Cry
- OnBecomeVisible
- OnBecomeInvisible
- OnWillRenderObject
- 프러스텀
- 가변개수파라메터
- TL;DR:
- ShiftJIS 0x5c
- LTE 본딩 장비
- VMC Virtual Motion Capture
- VRM
- 밸리데이션
- DTO
- SLI: NVIDIA의 Scalable Link Interface, 그래픽 카드 여러 개 같이 쓰는, 성능이 그대로 증가하지는 않음
- MSA: MiroService Architecture
- GDI: Graphics Device Interface
- GetMessage, PeekMessage
  - GetMessage: 메시지가 있을 때까지 기다림
  - PeekMessage: 메시지가 있든 없든 바로 리턴
- 레퍼런스 카운트: 레퍼런스가 0이 되면 메모리 해제
  - 메모리가 소멸되는 방법은 두 가지
    - 가비지 컬렉터: .NET, 자동으로 메모리 해제
    - 레퍼런스 카운트: C++, 레퍼런스가 0이 되면 메모리 해제
- 롱포인터, 숏포인터: 32비트, 16비트
- 시스템 메모리: RAM
- 비디오 메모리: VRAM
- 메모리 얼라인: 메모리 주소가 4의 배수로 정렬
- 비트맵: 픽셀 데이터를 담는 메모리
- 칼라키: 색상 키, 투명도, 알파
- WinDbg: 윈도우 디버거 도구
  - 개요: 프로세스, 스레드, 메모리, CPU 등의 정보를 제공
- 섭스 언리얼 4 Packed
- LitJSON
- c# 확장메소드
- 블렌드 트리
- c# 인터페이스 프로퍼티
- usb키
- OPS
- vsf 닐로툰
- <https://wlsdn629.tistory.com/entry/유니티-Folder-Structure-체계적인-폴더-구조-규칙>
- P-Shooters
- GIGDC
- 포스트모뎀
- WDK (Windows Driver Kit)
- MFC (Microsoft Foundation Classes) \| GUI UI 라이브러리
- PoC (Proof of Concept) \| 새로운 기술/개념 도입 전 검증 과정
- ROS (Robot Operating system) \| 로봇 운영체제
- cloudflare
- 컨퍼런스 VRChat ?
- MUD Multi User Dungeon
  - 그래픽이 없고 텍스트만 있는 WOW
  - 모뎀을 통해 통화선으로 BBS 에 연결하던 시절
- 애자일 소프트웨어 개발 | Agile
- 테스트 주도 개발 | Test Driven Development
- 폭포수 개발
- 체크인 ㅡ 수정이 끝난 파일 사본을 저장소에 저장하여 버전을 갱신하는 작업
- 지속적 통합 | Continous Integration
- 파레토 법칙
- 카우보이 코더: 혼자서 일하는 프로그래머 (체계 없이 독선적으로 일하는 코더를 일컫는 부정적 함의가 담긴 표현)
- 테스트베드 :
- [어드레서블 에셋 시스템으로 메모리 최적화하기](https://unitysquare.co.kr/growwith/unityblog/webinarView?id=272)
- OneSignal: 메시징 노티
- static event
- Resource 폴더 위치 자유롭다, 여러 개 있어도 되고
- Enum 파일 하나로 합치기
- 주석 신경쓰기 -> Class 주석
- Screen.Orientation바뀌면 Screen.Width Hight도 바뀜
- Singleton
  - DontDestroy
  - Scene마다 -> 씬 별로 다른 처리가 가능
- Pwd DelDDa - Discord Bot" date: 2024-10-16. 07:24
- [](https://namu.wiki/w/VA-11%20HALL-A:%20Cyberpunk%20Bartender%20Action#s-3.1)
- [](https://discord.com/developers/applications)
- [](https://docs.discordnet.dev/guides/getting_started/terminology.html)
- 디커플링: 양쪽 코드 중에서 한쪽이 없으면 코드를 이해할 수 없을 때, 둘이 커플링되어 있다고 본다
  - 작업에 관련된 코드가 두 코드 중에서 하나에만 연관되어 있다면, 한쪽 코드만 머리에 집어넣으면 된다
- 작업에 들어가기 전에 알아야 할 지식의 양을 줄이는 것
- 혼자서 작업하는 거면, 나만 보면 되는 코드라면 구조는 상관없다
- 하지만 "변경"해야하는, 변경이 필요하다면, 디커플링은 중요하다
- 너무 과도해도
  - 추상화된 계층도가 머리 용량을 더 차지하는 경우가
- 결국 배보다 배꼽이 더 커지면 안되는
  - 엔진은 **게임을 만들기위해** 만들어졌다는것
- 성능과 속도
  - 성능과는 다른 방향을 바라보는
  - 구조는 코드를 더 유연하고 쉽게 변경할 수 있도록 -> 어떤 것이 와도 문제없이 동작하기 위해
  - 하지만 성능은 전부 **가정**에 기반한다.
    - 최적화 기법은 구체적인 제한을 선호한다
    - 적이 256개이하일거라고 확신한다면? ID를 1바이트로 압축할 수 있다.
- 그렇지만 유연성은 필요하다
  - 유연성이 좋아야 게임을 쉽게 변경할 수 있다
  - **개발** 속도는 게임 재미를 찾는게 꼭 필요하다
  - 기획서만으로는 게임 밸런스를 맞출 수 없고, 반복 개발과 실험을 같이 해야한다
  - Idea를 빠르게 시험해보고 느낌을 빨리 확인하면, 더 많이 시도해볼 수 있고 멋진 걸 찾을 가능성이 높아진다
- 쉬운답은 없다
  - 프로토타이핑을 빠르게 하기 위해 유연하게 만들면 성능상 비용이 발생
  - 반대로 코드를 최적화하면 유연성이 떨어진다
- 저자의 경험 상
  - 재미있는 게임을 최적화하는 것이
  - 최적화된 게임을 재미있게 만드는 것보다 훨씬 쉽다
  - 오..
- 깔끔하고
- 최적화되고
- 빠르게 구현하고 싶다
- version 뜻
- `unity.com/how.to`
- C#에서 C/C++ 실행
- ThreadSafeTypes
- Polyglot
- WebAssembly -> VRChat에서 쓰는 것 같은데
- LLVM 저수준 가상 머신?
- Emscription
- C++/C -> Emscription -> Wasm
- Emscription 에서 LLVM을 컴파일에 이용
- 모든 브라우저는 Wasm을 JS와 함께 실행 가능?
- Wasm은 거의 네이티브 같은 속도로 실행된다?
- Unity Web
- HTTP Preload 태그를 이용
- 첫 번째 씬에 필요한 에셋 로드
- 코드 추출
- Tree
- WebGL vs WebGPU
- Feel Update Note/Release Note -> 이쁨
- .asmdef define
- Camera MSAA
- DofVFX Samples
- Mono 호환성 -> IL2CPP 속도, 보안
- BuildReportTool
- EasyMobilePro
- AntiCheat Toolkit
- EasySave
- 커서 AI
- prefare 블로그 보기
- apk 압축파일, 그냥 반디집으로도 풀어지네
- Asset Studio 후속
- Dnspy 후속
- IL2CPP-Dumper
- 한글화/에셋 수정에 사용되는 툴
- ffmpeg
- CodeRabbit: '코파일럿'같은 개발자를 위한 코드 리뷰 도구
- Switch When
- 인하우스, 아웃소싱
- Bar Cmd Exe 확장자 차이
- 로렘 입숨 lorem ipsum;
- aa ASCII ART
- #pragma
  - 사전적 의미로 만능
  - VS C++에서 컴파일러에게 그 뒤에 오는 내용을 따라 어떤 일을 하라는 전처리 명령어로 사용
  - 컴파일러에게 직접 명령을 내리는 지시자
- 곱셈이 나눗셈보다 빠르다
  - 곱셈은 한 번에 처리
  - 나눗셈은 뺄셈을 계속해서 처리
  - [참고](https://blog.naver.com/PostView.nhn?blogId=fah204&logNo=221573584390)
- 동기 비동기
  - 병원 들어갔어, 접수처에서 순서기다리세요 부를게요~ 하는거랑
  - 들어가자마자 아무것도 안하고 기다리는 것 차이
  - 페이지에서 조금씩 조금씩 나오는 거
- Setter보단 의미있는 메소드를
- 이건 할 줄 알아야 한다
  - <https://en.wikipedia.org/wiki/XOR_swap_algorithm>
  - 해쉬 맵 링크드 리스트 트리=바이너리 서치=순서대로 출력 이건 할 줄 알아야
- .NET 프레임워크 Old vs .NET Core New
  - 코어는 윈도우 리눅수 맥 모두 실행가능
  - 거의 똑같음
- var let const
  - JavaScript에 대하여,
  - 중복 선언이 가능하다는 var의 특징 때문에, let이 나온 이후로는 변수 선언 시 let과 const를 주로 사용
  - 호이스팅,스코프 관련해서도 다른 점이 있다고는데, 패스
  - var: Variable
  - let: Let
  - const: Constant
  - | var | 중복 선언 가능 | |
  - | let | 중복 선언 불가능 | 값 변경 가능 |
  - | const | 중복 선언 불가능 | 값 변경 불가능 |
- 헤더 파일이 없어도 실행이 되는 이유
  - → 특정 컴파일러나 다른 헤더가, 해당 헤더를 포함하고 있는 경우
  - → I.E. iostream → string.h, C++ 표준 라이브러리 컴파일러 → string
- Leading 0
  - → [0 Padding](https://stackoverflow.com/questions/3122677/add-zero-padding-to-a-string)
  - → string.PadLeft(4, '0')
  - → int.ToString("D4")
- malloc 리턴이 void *, 포인터인 이유?
  - → Heap에 메모리 할당, 이렇게 할당한 주소를 가리켜야함
  - → malloc으로 어떤 타입을 할당한 지 모름, 정할 수 없음, 그래서 void
- 예전엔 C 변수 전방 선언
  - → 과거 적은 메모리, 부족할 수 있어서 사용할 변수 미리 선언해두고 유지보수 쉽게??
  - → 최신 버전에서는 고쳐지기도 했고, 컴파일러 따라 다르기도
- 연결리스트 current (end)
  - → 이게 없으면 삽입 O(n), 끝부분을 찾아야 하니까
  - → 삭제는 어차피 찾는 거라서 크게 상관없음
- Windows에서 돌아가는 모든 프로그램은 WinAPI 사용
  - → Java가 느린 이유, WinAPI에 직접 접근하지 못함, JVM 한 단계 거쳐서
  - → @ Minecraft Java에서 C++로 바뀐
- 변수명 작성 스타일
  - 케밥 케이스, 스네이크 케이스, 카멜 케이스, 파스칼 케이스
- 섭스 앵커포인트: 뱅큐님 강의
- a practical tutorial to hack and protect unity games  
- 달리기 애니메이션 만들기: atdlfeKgBV8
- Flush 물 내리 듯, 영속성 컨텍스트의 변경 내용을 반영? (로얄플러쉬도 그 플러쉬인가?
- Postmodern
- `Alt + Shift + 5`: 구글 워크스페이스 취소선
- Hilbert ← Linear (raster)
- Anomalous Cancellation 이상한 약분
- Play By Mail Game  
- 네크로 포스팅
- Plogging = Plockaupp (줍다 in 스페인) + Jogging
- Brachistochrone curve 최단시간곡선 → 배틀그라운드 낙하
- Unity Release Note
- 6.1
  - LightMapping
  - GetLightingDataAssetForScene
- 어댑티프 퍼포먼스
- UNITY_6000_0_OR_NEWER
- VSCode compare
- cocoPod, ruby 사용
- os x (맥북) 기본 ruby 사용 가능
- Android 그냥 apk 글땅하면 분석
  - 이것이 apk Analyzer가 맞나?
- vInspector Building
- unity.com/campaign/unity-6-resources
- Skinning
- Build Report
- Shader, Particle System, Anim, Image, DOTWeen, Spine
- IDA, Gridna
- Shader Graph, Graph Target
  - Build-In 있긴 함
  - 근데 소개는 대부분 SRP
  - 대부분의 피처는 SRP 위주일듯
- Shade Graph in Built-in Pipeline. Unity 2021.2
  - Youtube
- 어드레서블. 종속성 문제
- Simple Profiler? or Advanced FPS 뭐시기
  - 아마 Feel Asset에 포함된
- 유니티 공식 UI 쉐이더
  - UGUI 캔버스 쉐이더
  - 2023 업?
  - 트랜지션?
- UI Effect Github
- VFX GPU, Particle CPU
- Windows 우클릭 Context Menu 커스텀?
- Diagnostics
  - JS Memory
  - Performance.Memory API
    - Only Chrome, Edge
    - No Safari, Firefox, iOS
- UnityWebMobile WASM
  - Safari 15 16.4
  - Chrome 58 91
  - Firefox _ 89
  - Edge _ 91
- [\[최적화\] Shader Variants와 효율적인 사용](https://asatala.tistory.com/171)
- Shader 키워드
- Unity Manual - Rendering 추가 리소스 및 예제
  - 20가지 고급 2D 쉐이더 효과
- Unity Roadmap 사이트
- 솔직히 경험 기간은 많은 것 같은데, 그에 비해 실력이 부족하다. 신입이라 생각하고 기본기 차근차근 다지자. 일단 조사, 정리, 문서 작성 방법부터.
- 문서 이해도 높여야. 대충 일고 넘어가는 습관이 있다. 하나 할 때 확실히 이해, 소화, 정리
- 적게 자주
- 잠 확실히 자야. 이거 언젠간 일 한 번 만든다
- Shader 정리
  - 언어
    - Cg Old built-in Only
    - HLSL new SRP
      - 둘이 유사함. NVIDIA x Microsoft
    - GLSL x 안씀. 쓸수는 있는데 안씀. Cg/HLSL은 OpenGL/webGl 쓰는 플랫폼 빌드시 GLSL로 변환됨
  - 방식
    - ShaderLab: 예쩐 방식. 권장 x, 이미 만들어진 틀. 호환성은 좋음
    - surface: Built-In only. 아티스트 단계
    - verteex & fragment: 자주쓰이는 건 HLsl x vertex&fragment 조합
    - compute:gpu 연산. 지식 필요
  - Shader tool - Amplify

```cs
Plane[] planes = GeometryUtillity.CalculateFrustumPlanes(Camera);
GeometryUtillity.TestPlanesAABB(planes, Renderer.bounds);

// 한 점
Bounds B = new Bounds(Position: Vector3, Size: Vector3.zero);
```
