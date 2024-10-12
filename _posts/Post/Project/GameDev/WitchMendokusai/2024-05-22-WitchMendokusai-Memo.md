---
title: "🫐 WitchMendokusai Memo"
categories: [📀Post, 🫐Project, 🫐WitchMendokusai]
tags: [Project, Game-Dev, WitchMendokusai]

date: 2024-05-22. 20:50
# last_modified_at: 2024-05-29. 14:56
# last_modified_at: 2024-06-03. 21:47
# last_modified_at: 2024-06-05. 14:11
last_modified_at: 2024-06-19. 10:43
---

## 📀 마일스톤

---

## 📀 TODO

---

- 다듬어야 할 것들 (후추)
  - 아트/사운
  - 메인 화면
  - NPC 마커
  - NPC 대화
  - 전투 결과 화면
  - 전환/트랜지션 시 코루틴
    - 전투 진입 시 아이캐쳐
    - 블루 아카이브 스킬 같은
    - 로그라이크 죽음을 맵 별로 다른 엔딩이나 컷신 등으로?
      - 템플런
    - 포켓몬 게임 인트로
  - 지역 입장 UI (201번 도로)
  - 이펙트

- WIP
  - 행동트리 (에디터, ViewGraph)
  - 에디터
    - SO 정렬 기능
    - 에셋 선택창도 커스텀 할 수 있으려나?
    - 몬스터 스폰, 드롭 테이블?
    - 에셋 버퍼 관리
    - 그러면 에셋 생성할때 고유한 ID 테이블을 미리 정해둬야 편하겠네
    - 저장 데이터 관리 -시각화 수정, 세이브/로드
    - 맵 관리? 지도?
  - 상호작용
    - NPC
      - 떠상
        - 던전 떠상 (런 능력치?)
        - 떠상 (설계도?)
    - 제단
    - 채집 식물 : 나무, 열매, 꽃 (그 포켓몬 열매 같은)
    - 상자, 미믹
    - 동전
    - 유적 버튼
    - 해골
    - 제단
    - 폭발하는 오브젝트
    - 돌탑

- 고민해봐야 하는 것들
  - 아이템 드롭 , 자동 획득이 아니라 z 눌러서 먹게
  - 몬스터 마다 성격이 있다 Like 팩맨
  - 플라스크

- 던전
  - 로그라이크 (던그리드 형식? or 슬더슬 라이크나 위치 그거 처럼)
  - 보스 연출
  - 보스 행동패턴
  - 전투 시스템
  - 전체적인 던전 구조 (절차적?)
  - 던전 제약
  - DungeonLoop
  - 던전 보상
  - 몬스터
  - 인게임 재화로 리롤 (제한, 최대 등급 - 1 천장)

- Must
  - 어드레서블 서버로 해야겠는데, 플레이 가능하게 하려면
  - 데미지 연산
  - 아이템 강화 (강화 재화)
  - 마을 의뢰, 메인 퀘스트 (마법 책)
  - 대화 스크립트

- 업적
- 명령어 (테스트/디버깅)
- NPC Waypoint 이동 경로
- 크래프팅 시스템
- 정신집중
- 게임 시작할 때 동숲처럼 집에서 나오는 걸로 시작할까?
- 우체통 있으면 재밌겠다
- 시간 개념을 둘까?
- 식량 신앙 청결 이런거 대신 태엽 감아줘야 하는, 마나 같은거
- 조작키 방향키에 Ctrl Alt , Z?
- 대량 발생
- 전투 끝났을 때 데미지 받지 않도록
- 타임라인 이용한 연출?
- 길찾기? a*?
- 마을 건물 강화 / 그리드?
- Json, Playfab, Addressable
- LogViewer
- 의식체
- 데이터 저장 불러오기, 변수 이름 Replace
- 상태 변수 저장 관리
- 유니티 설계 경험 기록
- 싱크로니시티
- 지도, 지도 여러종류
- 집까지 길 없게
- 타입 상성
- 전투 전에 씨앗을 심는
- 태엽
- 인형 강화
- 메인 인형은 전직? 스타레일 개척자, 아닌 애들은 그냥 생 캐릭터
- 언령
- 자폭병
- 백팩
- Spine
- 웨이브 UI (팔라독 같은?)
- 카메라와 인형 사이, 디더링?
- 카드 등장 확률 (희귀 카드)
- 메인 화면
- 행렬 공부
  - 아이템 드롭 애니메이션에 빙글빙글 돌도록
- 마도서
- 의뢰
- 낚시
  - 자동 효율 낮게

## 📀 레퍼런스

---

- 게임
  - 스타레일 : 전투 트리거, 박물관 - (가디언 테일즈)등급에 따른 효율, 약점
    - [턴제분석](https://asecurity.dev/entry/%EB%B6%95%EA%B4%B4-%EC%8A%A4%ED%83%80%EB%A0%88%EC%9D%BC-%ED%84%B4%EC%A0%9C-%EC%86%8D%EB%8F%84%EC%99%80-%EC%95%BD%EC%A0%90-%EB%A9%94%EC%B9%B4%EB%8B%88%EC%A6%98-%EC%86%8D%EC%9D%98-%ED%96%89%EB%8F%99-%EA%B2%8C%EC%9D%B4%EC%A7%80)
  - 옥토패스 트레블러 : 약점 (약점이 룰렛 랜덤?)
  - 포켓몬 : 전투 UI, 배지 (박박닦는), 도구, 맵?
  - PostKnight
  - OuterPlane
  - 쿠키런 : 쿠키 강화, 보유 효과, 스테이지, 보물, 이벤트
  - 삼국지 디펜스 2
  - 던전 공주
  - 던전 스쿼드
  - 프론티어
  - 룬테라
  - 그리모어
  - 포션마스터 : 포션대회
  - 슬라임랜처 : 농장?
  - 메이플스토리 : 스킬 처럼 스킬쓰면 말풍선 뜨는거
  - 마인크래프트 - 사움크래프트
    - [나무위키](https://namu.wiki/w/Thaumcraft%206)
    - [블로그1](https://kgworld.tistory.com/593)
    - [블로그2](https://digestivo.tistory.com/21)
  - 뒷산에서 보석캐기
  - Nimble Quest
  - 마녀와 백기병
  - 깨어난 마녀
  - 크퀘
  - 소울나이트 프리퀄
  - 용과 같이 8, 당구 알까기
  - [POE](https://bbs.ruliweb.com/etcs/board/300780/read/49509489)

- 레퍼런스 (X)
  - [책](https://x.com/creyynolds/status/1792275971892031730)
  - [대검](https://x.com/Einheadt_/status/1792486050830692666)
  - [이펙트](https://x.com/MrB_Jensen/status/1792479223866589670)
  - [이펙트](https://x.com/GabrielAguiarFX/status/1781339488679075911)
  - [쓰다듬기](https://x.com/roymustangyuri/status/1791901293843247330)
  - [포션](https://x.com/Indiedev_Hub/status/1790896334339272891)
  - [포션](https://x.com/OwO54777991/status/1771538513466397134)
  - [동전](https://x.com/freerdan/status/1789452138231505041)
  - [버섯](https://x.com/Rappenem/status/1771590884108214574)
  - [HD-2D](https://x.com/QZLgames/status/1789924769879450050)
  - [HD-2D](https://x.com/_eggerton/status/1783505758057087173)
  - [HD-2D](https://x.com/ShinraiXenophy/status/1782133941513662817)
  - [HD-2D](https://x.com/PkmnBrainrot/status/1782110809482817722)
  - [HD-2D](https://x.com/acheronti/status/1779218755794751566)
  - [HD-2D](https://x.com/HardBone01/status/1776948491279024227)
  - [HD-2D](https://x.com/w11shes/status/1771839549913567385)
  - [HD-2D](https://x.com/WanderingSwordG/status/1771522453254062274)
  - [마법사](https://x.com/SpookyStirfry/status/1786892552337019304)
  - [푸키먼](https://x.com/7Cube_Ori/status/1786677428313895378)
  - [푸키먼](https://x.com/miyaulait/status/1786495846046920709)
  - [푸키먼](https://x.com/7Cube_Ori/status/1771866906145734936)
  - [서부마녀](https://x.com/PT_CROW/status/1783423425756996021)
  - [PixelArt](https://x.com/PixelArtJourney/status/1787791652733485536)
  - [PixelArt](https://x.com/Vryell/status/1787422302516163050)
  - [PixelArt](https://x.com/Uknowleo/status/1786489248004157605)
  - [PixelArt](https://x.com/BanannerToast/status/1786287637596135474)
  - [PixelArt](https://x.com/PracticalNPC/status/1782450950893973941)
  - [PixelArt](https://x.com/QZLgames/status/1782066637405143269)
  - [PixelArt](https://x.com/Wonpuri/status/1782401168981049622)
  - [PixelArt](https://x.com/Andero7Charlie/status/1780990910895128847)
  - [PixelArt](https://x.com/BanFanpxl/status/1780896894186877053)
  - [PixelArt](https://x.com/UndergroundL0RD/status/1779835147044429998)
  - [PixelArt](https://x.com/ichol98067313/status/1779986975606333466)
  - [PixelArt](https://x.com/Pixel_Lancaster/status/1776962044623040868)
  - [PixelArt](https://x.com/vested/status/1775260998649446496)
  - [PixelArt](https://x.com/BanFanpxl/status/1774775029588525270)
  - [PixelArt](https://x.com/Anokolisa/status/1771883104497487974)
  - [PixelArt](https://x.com/Fractur9d_Luna/status/1771452383630909842)
  - [Game](https://x.com/G_P_Art/status/1782718284724629843)
  - [Game](https://x.com/Wonpuri/status/1782771195827355704)
  - [Game](https://x.com/Gagonfe/status/1782079066046120243)
  - [Game](https://x.com/MadNukin/status/1781669150529581159)
  - [Game](https://x.com/KatanaDragon_/status/1781281503361564981)
  - [Game](https://x.com/asistersjourney/status/1781009955841036587)
  - [Game](https://x.com/Maytch/status/1773811174842224933)
  - [Game](https://x.com/arare_gc/status/1779905436118036841)
  - [Game](https://x.com/octo_rain_game/status/1771854474182611190)
  - [Game](https://x.com/TeamConcode/status/1771688655934857535)
  - [Game](https://x.com/SomethingClassc/status/1771617405459972537)
  - [Game](https://x.com/morikawa_satoru/status/1771372956473754022)
  - [Game](https://x.com/syake_3560/status/1771552734635831350)
  - [Game, 대쉬 무기](https://x.com/FriendlyFoeDev/status/1771585988688519362)
  - [Game, 대쉬 무기](https://x.com/YakobSoup/status/1771535638619111921)
  - [Game](https://x.com/FeatureKreep/status/1771508859024159046)
  - [Game](https://x.com/RunaRPG/status/1771576389793161328)
  - [Game](https://twitter.com/loopixelart/status/1633846358514991105?s=20)
  - [페르소나UI](https://x.com/pollomuerto/status/1782682597509755362)
  - [아기자기](https://x.com/coffinooo/status/1784424131364278371)
  - [아기자기](https://x.com/coffinooo/status/1784067010093343121)
  - [아기자기](https://x.com/SamuelLundsten/status/1782343364391719260)
  - [아기자기](https://x.com/Joosh7889/status/1778144335034216713)
  - [에디터](https://x.com/artofsully/status/1782059478185128354)
  - [에디터](https://x.com/_kzr/status/1781256444987519189)
  - [grid growth](https://x.com/spacefillerart/status/1782610867340910829)
  - [땅바닥 글씨](https://x.com/psergiomr/status/1782386535263772958)
  - [회전](https://x.com/Rainmaker1973/status/1782332199922008127)
  - [타입](https://x.com/Light_88_/status/1781657335754109380)
  - [스크류](https://x.com/FeverDevJohnny/status/1781469390640230632)
  - [](https://x.com/Rrrrrrice0303/status/1655190503007354882)
  - [](https://x.com/Ghost773748999/status/1706548743909331200)
  - [](https://x.com/iquilezles/status/1566938395653263360)
  - [](https://x.com/KSUWABE/status/1715349124239999465)
  - [](https://x.com/CandlMix/status/1608648754319740928)
  - [](https://x.com/hanbok_ssul_bot/status/691694620393107462)
  - [](https://x.com/DetFantasia/status/1731003909647348023)
  - [](https://x.com/_kzr/status/1730201736646922464)
  - [](https://x.com/so_lovely_31/status/1732049779025437074)
  - [](https://x.com/tumblbug/status/1731875949564862929)
  - [](https://x.com/Wonpuri/status/1701270385998823648)
  - [](https://x.com/CK21_JH/status/1702173473928532252)
  - [](https://x.com/instant_onion/status/1691849142790951369)
  - [](https://x.com/DoSMGoChi_/status/1741076503071506492)
  - [](https://x.com/functiontales/status/1750779547719795026)
  - [](https://x.com/gunsnrosesgirl3/status/1751862063465464257)
  - [](https://x.com/lifuelgames/status/1752013740059640137)
  - [](https://x.com/cmzw_/status/1752717586947883231)
  - [](https://x.com/OrangeTrip2/status/1739631873322889521)
  - [](https://x.com/moi_rai_/status/1752678671037411786)
  - [](https://x.com/angryMonsterHam/status/1754207246290964553)
  - [](https://x.com/abhisundu/status/1754178521927135361)
  - [](https://x.com/ms_frogrammer/status/1754237281903264225)
  - [](https://x.com/Flatline_Studio/status/1740047016468926724)
  - [](https://x.com/atokmakchiev/status/1754150061112528960)
  - [](https://x.com/smaex_official/status/1754965804993466797)
  - [](https://x.com/MantisFRK/status/1755621517247795274)
  - [](https://x.com/drattzy/status/1757404260453450215)
  - [](https://x.com/clemmygames/status/1757430590008135821)
  - [](https://x.com/landarcana_game/status/1752333998335107242)
  - [](https://x.com/HoldimProvae/status/1765684627468140627)
  - [](https://x.com/RSHoelMoor/status/1771345644797501528)
  - [](https://x.com/RegalPigeon/status/1771541660825960513)
  - [젤다](https://twitter.com/WonSoRang/status/1658023932820357120?s=20)
  - [포션? 칵테일?](https://twitter.com/i/status/1674689276112687105)
  - [](https://x.com/NerkinPixel/status/1690418750237839360?s=20)
  - [이런거](https://twitter.com/336111/status/1631973583470882816?s=20)
  - [모델로 만든다면](https://twitter.com/artofsully/status/1630299422281150465?s=20)
  - [](https://twitter.com/violxiv/status/1621154673238609922?s=20)
  - [](https://twitter.com/mischiefanimals/status/1642199905534980100?s=20)
  - [](https://twitter.com/mischiefanimals/status/1627686200096980994?s=20)
  - [](https://twitter.com/mischiefanimals/status/1637202361260167169?s=20)
  - [](https://twitter.com/mischiefanimals/status/1624094025547493381?s=20)
  - [](https://twitter.com/mischiefanimals/status/1634992387947896832?s=20)
  - [](https://twitter.com/mischiefanimals/status/1636740736153444354?s=20)
  - [](https://twitter.com/mischiefanimals/status/1638925789742727169?s=20)
  - [](https://twitter.com/memesbreakcore/status/1554691889307291648?s=20)
  - [](https://twitter.com/memesbreakcore/status/1632520920932704256?s=20)
  - _
  - [](https://twitter.com/RevitaGame/status/1670904476729856001?s=20)
  - [](https://twitter.com/eiken3kyuboy/status/1679986765959168001?s=20)
  - [](https://twitter.com/grynmoor/status/1641268043228540933?s=20)
  - [](https://twitter.com/NoContextHumans/status/1656723211587813395?s=20)
  - _
  - [](https://twitter.com/kindanicegames/status/1625041703081058304?s=20)
  - [](https://twitter.com/AlexandreKadri/status/1642439900631793665?s=20)
  - [](https://twitter.com/aniwarsofficial/status/1622718146942537728?s=20)
  - [](https://twitter.com/andre_mc/status/1641822004520026114?s=20)
  - [얼건 그웬](https://x.com/monakan_japan/status/1639639372621574144?s=20)
  - _
  - [설산](https://x.com/ToolTravle/status/1621794441643319299?s=20)

- MDD
  - [모아](https://youtu.be/vDHfv7J8sew?t=377)
  - [화면](https://youtu.be/45bzoIfNlwo?t=1894)

## 📀 문장

---

- Behind the scene
- 나의 세계에 입문한 것인가
- 레슨 원
- 깊은 숲 속
- 상대가 가장 두려워하는 것을 파악하라
- 단맛이 쥬시해
- 두둥탁

## 📀 기획

---

스타듀밸리/컬트오브렘 - 기지건설 + 리오레 - 로그라이크/뱀서류  
(대충 내가 좋아하는 거 다 짬뽕)  

### 💿 _

- 도전과제 (마도서 페이지)
  - 공통 : 기술/테크/연구
  - 캐릭터 별

오디세이 맹공모드  
탄막, 핵엔슬래시, 턴제(언더테일 같은?) 짬봉  
쫄몹들은 던그리드,위자드 같은 스테이지 느낌  
핵앤슬래시 느낌도  
보스는 턴제, 탄막?  
  
진행도에 따른 차이 (등장인물 실루엣 이라던지)  
진행도에 따른 테마 차이  

[포켓몬스터 블랙/화이트 BGM 레파토리](https://m.blog.naver.com/PostView.naver?isHttpsRedirect=true&blogId=riomedevon&logNo=110106228406)  
[포켓몬스터 블랙/화이트 빌리지 브리지](https://pokemon.fandom.com/ko/wiki/%EB%B9%8C%EB%A6%AC%EC%A7%80_%EB%B8%8C%EB%A6%AC%EC%A7%80)  
[포켓몬스터 블랙/화이트 빌리지 브리지](https://namu.wiki/w/%EB%B9%8C%EB%A6%AC%EC%A7%80%EB%B8%8C%EB%A6%AC%EC%A7%80)

- 카드
  - 강화/변화/충전/리필
  - 덱에 카드 추가하는 Effect

최종 스탯을 계산하는 스크립터블 오브젝트를 만들고 (MaxHp 라던지)  
접근할때 계산하는 식으로  

최종 스탯을 변경하는 게 아니라, Mastery증감수치 스탯을 변경  

SkillObject에서는 최종 스탯을 가지고 계산  

단순 스탯은 그렇게  
그렇다면 버프형은? 가동율 50%의 깜빡깜빡 버프?  

시너지?  

포탈 있는 맵 (푸키먼, 메이플 같은)  
던전 or 필드 몹 (원신, 스타레일, 푸키먼 소드실드 같은)  

자석 (천사 깃털 → 드링크)  

퀘스트 유니온 - 마을바다 있는 잡 퀘 클리어 수에 따라 스탯 증가?  
지역 코인  

- 사실과 변수
  - 개념적
  - 골드, 마나 계속 변동하고

[Playables0](https://youtu.be/12bfRIvqLW4)  
[Playables1](https://youtu.be/nn3SnfNNEmk)  

## 📀 아이템

---

스타듀벨리 같은 별/등급? (제작품에 한하여)  

### 💿 아이템_

- 물병

### 💿 포션

원신 음식?  

- 물
- 체력 회복 (한 번에 차는 게 아니라, 재생 능력 향상)
- 마나 회복 (한 번에 가기도, 재생 능력 향상도)
- 위상별
- 감정별
- 예방
- 상태 이상
- 단기 증강
- 영구 증강

## 📀 책장

---

고유명사  
공격을 보관하고(블랙홀, 포탈), 다시 방출(화이트홀?ㅡ 포탈)  

몹을 존나쌔게 만들어서 아이템을 반강제적으로 사용하도록?  

[플레이어 닉네임에 따른 테마 변화](https://twitter.com/METALBUTTER/status/1175020978960658432?ref_src=twsrc%5Etfw)  
갓오곡 닉네임 능력치 변화  

:/ ← 귀여움  
[벽돌깨기 ← 재밌음](https://www.youtube.com/shorts/M3nVHQ3feT4)  
덱빌딩?  
페글릿?  

[](https://youtu.be/gPyC_1Eknmg)  
[](https://youtu.be/z_4M36LILEA)  
[](https://youtu.be/je3phVcW1uQ)  

이걸 만화로 배워?  

[](https://youtu.be/r2tEXjZRLfk)  

What's Stopping you  
Fishing Mini Game  

카메라 회전  
공격 조이스틱  
카메라 시점 변경 스크롤 (롤, 이리 휠 스크롤)  

시계 초침 분침 시침 훌라후프  
Exp Orb 숙성  
점령  

조합 - 제작 - 아이템/위상 - 상점  
골드 수요 - 세금, 타이쿤류 Like 쿠키런 킹덤  

[](https://www.jdwasabi.com/store/8-bit-16-bit-sound-effects-x25-pack)  

원하는 경우, 능력을 선택하는 대신 ~ (재화 교환, ...)  
원하는 경우, 능력을 기존 능력과 교환 (능력 수가 제한 될 경우)  
원하는 경우, 능력을 원하는 시점에 선택 (조건 충족 시 강제적으로 선택하는 것이 아니라)  
원하는 경우, 능력을 선택하는 기회를 중첩으로 가질 수 있고, 이를 리롤, 재화 교환 등에 사용할 수 있음  
원하는 경우, 능력을 잠금/고정  

할아버지 귀신 (나체에 흰 머리에 작대기)  
걸리버 여행기, 장인, 장인국, 바다 건너 어떤 대지에는  

스파인  

- 뱀서 몹은 맵 밖으로 나가면 디스폰이 아니라 반대쪽에서 나온다?
- Animator, Anitation Cull Mode를 Cull Completely로 바꾸면 화면 밖에서 애니메이션이 멈춘다.
- Physics2D 설정에 Use Multithreading
- 군중스폰
- 군중스폰의 최적화 -> 위치를 클러스터로 묶어서 단계저긍로 거리측정?
- 일정 수 넘어가면 화면 밖에 빨간 보석이 생기고, 그 보석에 넘치는 경험치 다 쌓여두게
- <https://docs.unity3d.com/2019.3/Documentation/Manual/BestPracticeGuides.html>
- <https://learn.unity.com/tutorial/flocking>
- <https://www.youtube.com/watch?v=lS_qeBy3aQI>
  - 원형충돌체 물리 구현?
    - 제약 : 충돌체끼리 반지름 차이가 매우 크지 않게.
    - 충돌체 제곱만큼 계산되는 것을 방지하려고 (?)
    - 맵을 청크로 나누는데 필요한 제약

- 개천고
- 스타일리쉬리벤지
- 먼지 몬스터

- 장식
  - 꽃
  - 나무 그루터기
  - 돌
  - 표지판
  - 연못
    - 수련잎
  - 나무집 계단

- 경험치 획득 SFX 연속적으로 획득하면 피치 올라가게
- 레벨업, 아이템 선택창 이펙트 (효과, 사운드)
- 리롤
- 몬스터 스폰 서클

- 포켓 로그

- 뱃지

- 등급
- 가챠
- 채집
- 스테이지ㅡ공간 분리
- 농사

- 마법과 휴대폰, 와이파이
- 몬스터 죽을 떄 으앙으앙
