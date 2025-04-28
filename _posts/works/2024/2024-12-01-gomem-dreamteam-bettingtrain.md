---
title: "VRChat - 고멤 드림팀: 베팅트레인"
description: "우왁굳님의 '전략 카드 게임' 컨텐츠."
categories: [🍇Works]
tags: [Project, VRChat]
image: "/assets/img/post/works/gomem-dreamteam/bettingtrain/241130-230638.png"

date: 2024-01-01. 00:00
# last_modified_at: 2024-11-12. 10:06 # 1112 기획 추가 전달
last_modified_at: 2025-04-28. 18:12 # 데이터 모양
---

\[베팅트레인\] 룰영상 보고가세용!  
{% include embed/youtube.html id = "z4nIChsEnZk" %}

눈 내리는 열차 속에서 펼쳐지는 고멤들의 두뇌싸움 - 베팅 트레인  
{% include embed/youtube.html id = "gGnBvwrw5-A" %}

베팅트레인 합방 풀버전  
{% include embed/youtube.html id = "af1kawtyrv0" %}

## 📀 머리말

---

왁타버스 고멤 드림팀.  
왁타버스 고교꼬 멤버들끼리 팀을 구성하여 하나의 합방 컨텐츠를 만들어 경쟁하는 컨텐츠이다.  

미미짱짱세용님 팀의 컨텐츠 제작에 참여하였다.  

### 💿 참여 / 담당

### 💿 사용한 툴

- Unity 2022.3.22f1
- [U# (C# + VRChat SDK)](https://udonsharp.docs.vrchat.com/)
- [Woodon](https://github.com/wrchat/Woodon)

Unity Package를 통해 팀원과 파일을 공유했습니다. (파일 공유 수가 적었습니다.)  
Discord를 통해 팀원/클라이언트와 소통했습니다.  

## 📀 시작

---

신청 글을 올렸고,  

에 진행된 맵 제작자 두 번째 드래프트에서  
미미짱짱세용님 팀의 두 번째 맵 제작자 멤버로 뽑혔다.  

## 📀 과정

---

## 📀 결과

---

## 📀 후기

---

## 📀 기록

---

![241116-124901](/assets/img/post/works/gomem-dreamteam/bettingtrain/241116-124901.png)
![241125-194949](/assets/img/post/works/gomem-dreamteam/bettingtrain/241125-194949.png)
![241128-194431](/assets/img/post/works/gomem-dreamteam/bettingtrain/241128-194431.png)
![241128-194440](/assets/img/post/works/gomem-dreamteam/bettingtrain/241128-194440.png)
![241128-195131](/assets/img/post/works/gomem-dreamteam/bettingtrain/241128-195131.png)
![241128-195524](/assets/img/post/works/gomem-dreamteam/bettingtrain/241128-195524.png)
![241128-220018](/assets/img/post/works/gomem-dreamteam/bettingtrain/241128-220018.png)
![241128-223757](/assets/img/post/works/gomem-dreamteam/bettingtrain/241128-223757.png)
![241130-182914](/assets/img/post/works/gomem-dreamteam/bettingtrain/241130-182914.png)
![241130-193118](/assets/img/post/works/gomem-dreamteam/bettingtrain/241130-193118.png)
![241130-211439](/assets/img/post/works/gomem-dreamteam/bettingtrain/241130-211439.png)
![241130-212211](/assets/img/post/works/gomem-dreamteam/bettingtrain/241130-212211.png)
![241130-215108](/assets/img/post/works/gomem-dreamteam/bettingtrain/241130-215108.png)
![241130-221320](/assets/img/post/works/gomem-dreamteam/bettingtrain/241130-221320.png)
![241130-230638](/assets/img/post/works/gomem-dreamteam/bettingtrain/241130-230638.png)
![241130-233130](/assets/img/post/works/gomem-dreamteam/bettingtrain/241130-233130.png)
![241130-235335](/assets/img/post/works/gomem-dreamteam/bettingtrain/241130-235335.png)
![241130-235336](/assets/img/post/works/gomem-dreamteam/bettingtrain/241130-235336.png)
![241130-235339](/assets/img/post/works/gomem-dreamteam/bettingtrain/241130-235339.png)
![241130-235343](/assets/img/post/works/gomem-dreamteam/bettingtrain/241130-235343.png)
![241130-235401](/assets/img/post/works/gomem-dreamteam/bettingtrain/241130-235401.png)
![241130-235419](/assets/img/post/works/gomem-dreamteam/bettingtrain/241130-235419.png)
![241130-235926](/assets/img/post/works/gomem-dreamteam/bettingtrain/241130-235926.png)
![241201-000236](/assets/img/post/works/gomem-dreamteam/bettingtrain/241201-000236.png)
![gomem-dreamteam-bettingtrain-banner](/assets/img/post/works/gomem-dreamteam/bettingtrain/gomem-dreamteam-bettingtrain-banner.jpg)
![gomem-dreamteam-bettingtrain-credit](/assets/img/post/works/gomem-dreamteam/bettingtrain/gomem-dreamteam-bettingtrain-credit.jpg)
![gomem-dreamteam-bettingtrain-teamlist](/assets/img/post/works/gomem-dreamteam/bettingtrain/gomem-dreamteam-bettingtrain-teamlist.png)

241108 2300 2차 회의  
기획 보완  

241109 1900 기획 전달 (기능 구현 위주 정리)  
더 타임 호텔.  

1. 각 플레이어는 라운드 마다 새롭게 주어지는 카드를 테이블에 베팅하여 점수를 획득
2. 카드는 [-5 -4 -3 -2 -1 2 3 4 5] 이렇게 총 9장 존재 (-1이 분탕용)
3. 테이블은 총 4개로 각 테이블은 베팅 할 수 있는 인원수가 정해져 있습니다. 4/3/2/2
4. 테이블에 베팅된 카드들의 곱만큼이 해당 테이블에 베팅 한 플레이어에게 점수로 지급됩니다.
5. 총 n라운드 진행되며 라운드가 종료 된 후 가장 높은 점수를 가진 플레이어가 우승합니다.
6. 총 8명. 7 + 등수 경쟁에 포함되지 않는 차장이 존재합니다. (세용님, 기획 의도에 맞게 게임 밸런스를 조정하는 역할)
   - 차장도 다른 플레이어와 같은 플레이를 합니다.

그래서  

1. 9종의 카드를 8명에게 분배 (5초)
2. 서로 소통하면서 각자 전략 짜고 시간 내에 테이블에 배팅 하기 (10분)
   - 각 테이블에 누가, 어떤 카드를 베팅 했는지
   - 베팅 결과 계산 -> 스크린으로
   - 베팅 중간에 바꿀 수 있음
3. 테이블 별로 결과 공개 (어떤 테이블 부터 깔지는 스탭 ro 세용님 재량) (2분?)

이게 한 라운드  
최종 결과 공개? 발표? 하고 끝.  

아직 세부룰은 정해지지 않았지만, 1대1 매치가 되는 시간이 있다.  
시점은 어떤 라운드가 끝나고, 새로운 라운드가 시작되기 전.  
아직 정해지지는 않았지만 변수가 없으면 가위바위보 하나빼기가 될 듯?  

241112 0000 기획 추가 전달  

배팅 테이블 -> LookAt or 빌보드로 배팅한 플레이어 사진 표시  
돚거 게임 같은 현황판  
발표용 단상/기타게임용 공간은 WIP  

자유존  
테이블 체크 현황 판 -> 배팅 테이블 현황을 UI로 볼 수 있게 (왔다갔다 불편하니까)  
마찬가지로 프로필 사진으로 띄워주는  

게임 타이머 (시간)  

독대용  
물리적인 공간 분리 (문 애니메이션)  
돚거게임처럼 누구나 열고 들어올 수 있는  
텔포로 해도 되고  
어쨌거나 들어왔다 나갔다 피드백을 확인할 수 있는 (소리 등)  

241120  
스크린 테이블 별로 결과 공개할 수 있게.  

1. 테이블마다 점수를 오픈 할 때 하이라이트가 들어간 배경에 각자 획득한 점수가
2. 다음 테이블 차례가 되면 그 전 차례였던 전광판 점수들은 어두운 배경으로 변경
3. 점수 오픈 중 분탕 당한 테이블이 있을 시 하이라이트 색상과 대비되는 색상으로 분탕친 사람 표시(분탕 당한사람은 -일것이고, 친 사람은 +일 것)
4. 점수 오픈 될 때 마다 각 테이블 위에도 점수 표시, 이 경우에 분탕 당한 테이블은 -점수만 표시

- 배팅 쿨타임
  - UI

- 단계 넘어갈 때 효과
  - UI (VR, PC), SFX
- 배팅할 때 효과
  - 파티클, SFX
- 배팅 안한 나머지 전부 공개하는 기능 (베팅 안해서 자동으로 가장 낮은 점수 획득한 사람들)
- 베팅 어떤 테이블이 공개되는건지
- 카드 얻기 전에 Tab 못 누르게
- 카드 재분배 전에 UI 강제 Off
- 카드 뒷면
- 카드 PC 애니메이션
- 우승 연출
  - 배팅하기 UI On/Off
- 룰북 SFX
- 혼자 먹어서 50점일때 SFX 올라가게
- 대기로 넘어갈 때 공개안된거 있으면 공개하도록

### 💿 데이터 모양

```json
{
    "0": {
        "0": {
            "Score": 12,
            "CardType": -4,
            "TableType": 0,
            "TableSeatIndex": 0,
            "IsBuntang": false
        },
        "1": {
            "Score": 40,
            "CardType": 4,
            "TableType": 3,
            "TableSeatIndex": 0,
            "IsBuntang": false
        },
        "2": {
            "Score": 12,
            "CardType": -3,
            "TableType": 0,
            "TableSeatIndex": 1,
            "IsBuntang": false
        },
        "3": {
            "Score": 18,
            "CardType": 6,
            "TableType": 1,
            "TableSeatIndex": 0,
            "IsBuntang": false
        },
        "4": {
            "Score": 18,
            "CardType": 3,
            "TableType": 1,
            "TableSeatIndex": 1,
            "IsBuntang": false
        },
        "5": {
            "Score": 50,
            "CardType": -1,
            "TableType": 2,
            "TableSeatIndex": 0,
            "IsBuntang": false
        },
        "6": {
            "Score": 40,
            "CardType": -2,
            "TableType": 3,
            "TableSeatIndex": 1,
            "IsBuntang": false
        },
        "7": {
            "Score": 40,
            "CardType": -5,
            "TableType": 3,
            "TableSeatIndex": 2,
            "IsBuntang": false
        }
    }
}
```

```json
{
    "0": {
        "0": {
            "TableType": 3,
            "CardType": 3,
            "Score": -24,
            "IsBuntang": false,
            "TableSeatIndex": 0
        },
        "1": {
            "TableType": 1,
            "CardType": 5,
            "Score": 50,
            "IsBuntang": false,
            "TableSeatIndex": 0
        },
        "2": {
            "TableType": 0,
            "CardType": -1,
            "Score": 4,
            "IsBuntang": false,
            "TableSeatIndex": 0
        },
        "3": {
            "TableType": 0,
            "CardType": -4,
            "Score": 4,
            "IsBuntang": false,
            "TableSeatIndex": 1
        },
        "4": {
            "TableType": 3,
            "CardType": 4,
            "Score": -24,
            "IsBuntang": false,
            "TableSeatIndex": 1
        },
        "5": {
            "TableType": 2,
            "CardType": -5,
            "Score": -30,
            "IsBuntang": false,
            "TableSeatIndex": 0
        },
        "6": {
            "TableType": 2,
            "CardType": 6,
            "Score": -30,
            "IsBuntang": false,
            "TableSeatIndex": 1
        },
        "7": {
            "TableType": 3,
            "CardType": -2,
            "Score": 24,
            "IsBuntang": true,
            "TableSeatIndex": 2
        }
    },
    "1": {
        "0": {
            "Score": 30,
            "CardType": 3,
            "TableType": 2,
            "TableSeatIndex": 0,
            "IsBuntang": false
        },
        "1": {
            "Score": 30,
            "CardType": -2,
            "TableType": 2,
            "TableSeatIndex": 1,
            "IsBuntang": false
        },
        "2": {
            "Score": 30,
            "CardType": -5,
            "TableType": 2,
            "TableSeatIndex": 2,
            "IsBuntang": false
        },
        "3": {
            "Score": -4,
            "CardType": 4,
            "TableType": 0,
            "TableSeatIndex": 0,
            "IsBuntang": false
        },
        "4": {
            "Score": 30,
            "CardType": 6,
            "TableType": 1,
            "TableSeatIndex": 0,
            "IsBuntang": false
        },
        "5": {
            "Score": 50,
            "CardType": -3,
            "TableType": 3,
            "TableSeatIndex": 0,
            "IsBuntang": false
        },
        "6": {
            "Score": 30,
            "CardType": 5,
            "TableType": 1,
            "TableSeatIndex": 1,
            "IsBuntang": false
        },
        "7": {
            "Score": -4,
            "CardType": -1,
            "TableType": 0,
            "TableSeatIndex": 1,
            "IsBuntang": false
        }
    }
}
```

```json
{
    "0": {
        "0": {
            "Score": 50,
            "CardType": -5,
            "TableType": 3,
            "TableSeatIndex": 0,
            "IsBuntang": false
        },
        "1": {
            "Score": -5,
            "CardType": -4,
            "TableType": -1,
            "TableSeatIndex": -1,
            "IsBuntang": false
        },
        "2": {
            "Score": -5,
            "CardType": 3,
            "TableType": -1,
            "TableSeatIndex": -1,
            "IsBuntang": false
        },
        "3": {
            "Score": -5,
            "CardType": -1,
            "TableType": -1,
            "TableSeatIndex": -1,
            "IsBuntang": false
        },
        "4": {
            "Score": -5,
            "CardType": -3,
            "TableType": -1,
            "TableSeatIndex": -1,
            "IsBuntang": false
        },
        "5": {
            "Score": -5,
            "CardType": -2,
            "TableType": -1,
            "TableSeatIndex": -1,
            "IsBuntang": false
        },
        "6": {
            "Score": -5,
            "CardType": 5,
            "TableType": -1,
            "TableSeatIndex": -1,
            "IsBuntang": false
        },
        "7": {
            "Score": -5,
            "CardType": 6,
            "TableType": -1,
            "TableSeatIndex": -1,
            "IsBuntang": false
        }
    }
}
```
