---
title: "버종대 아프리카 TV 스튜디오"
# description: ""
categories: [📀Post, 🫐Project]
tags: [VRChat, ]
image: "/assets/project/AfreecaTV_Studio/240816_183313.png"

date: 2024-08-14. 00:00
last_modified_at: 2024-11-09. 08:35 # Init
---


_  
{% include embed/youtube.html id = "" %}

## 📀 머리말

---

### 💿 참여 / 담당

본 컨텐츠는 VRChat 게임 내에서 진행되었습니다.  

해당 컨텐츠에 사용된 VRChat World 내 기능 프로그래밍을 담당했습니다.  
또한 방송 진행을 위한 기능 조작을 담당했습니다.  

### 💿 사용한 툴

- Unity 2022.3.22f1
- [U# (C# + VRChat SDK)](https://udonsharp.docs.vrchat.com/)
- [Woodon](https://github.com/wrchat/Woodon)
- Discord

## 📀 시작

---

## 📀 과정

---

### 💿 _

## 📀 구현

---

## 📀 기록

---

![240521_213027](/assets/project/SOOP_Studio/240521_213027.png)
![240620_000000](/assets/project/SOOP_Studio/240620_000000.png)
![240620_162010](/assets/project/SOOP_Studio/240620_162010.png)
![240620_162110](/assets/project/SOOP_Studio/240620_162110.png)
![240623_222026](/assets/project/SOOP_Studio/240623_222026.png)
![240623_224340](/assets/project/SOOP_Studio/240623_224340.png)
![240623_224851](/assets/project/SOOP_Studio/240623_224851.png)
![240624_122834](/assets/project/SOOP_Studio/240624_122834.png)
![240625_073612](/assets/project/SOOP_Studio/240625_073612.png)
![240625_110117](/assets/project/SOOP_Studio/240625_110117.png)
![240701_164459](/assets/project/SOOP_Studio/240701_164459.png)
![240701_200810](/assets/project/SOOP_Studio/240701_200810.png)
![240702_000000](/assets/project/SOOP_Studio/240702_000000.png)
![240702_000001](/assets/project/SOOP_Studio/240702_000001.png)
![240702_000002](/assets/project/SOOP_Studio/240702_000002.png)
![240702_000003](/assets/project/SOOP_Studio/240702_000003.png)
![240702_000004](/assets/project/SOOP_Studio/240702_000004.png)
![240702_005024](/assets/project/SOOP_Studio/240702_005024.png)
![240730_174604](/assets/project/SOOP_Studio/240730_174604.png)
![240731_063004](/assets/project/SOOP_Studio/240731_063004.png)
![240808_173134](/assets/project/SOOP_Studio/240808_173134.png)
![240808_200933](/assets/project/SOOP_Studio/240808_200933.png)
![240808_221418](/assets/project/SOOP_Studio/240808_221418.png)
![240808_224050](/assets/project/SOOP_Studio/240808_224050.png)
![240814_183533](/assets/project/SOOP_Studio/240814_183533.png)
![240814_185806](/assets/project/SOOP_Studio/240814_185806.png)
![240815_150713](/assets/project/SOOP_Studio/240815_150713.png)
![240816_184343](/assets/project/SOOP_Studio/240816_184343.png)
![240816_203456](/assets/project/SOOP_Studio/240816_203456.png)
![240816_211711](/assets/project/SOOP_Studio/240816_211711.png)
![240816_212748](/assets/project/SOOP_Studio/240816_212748.png)
![240816_212803](/assets/project/SOOP_Studio/240816_212803.png)
![240816_212805](/assets/project/SOOP_Studio/240816_212805.png)
![240816_212905](/assets/project/SOOP_Studio/240816_212905.png)
![240816_212913](/assets/project/SOOP_Studio/240816_212913.png)
![240816_213141](/assets/project/SOOP_Studio/240816_213141.png)
![241023_000000](/assets/project/SOOP_Studio/241023_000000.png)
![241028_135933](/assets/project/SOOP_Studio/241028_135933.png)
![241028_135955](/assets/project/SOOP_Studio/241028_135955.png)
![241028_140011](/assets/project/SOOP_Studio/241028_140011.png)
![241028_140026](/assets/project/SOOP_Studio/241028_140026.png)
![241028_140049](/assets/project/SOOP_Studio/241028_140049.png)
![241028_140130](/assets/project/SOOP_Studio/241028_140130.png)

- 참가자 인터뷰 마이크 관련 개선 (콜라이더 공간 인식형 마이크 증폭으로 개선)
- 채점방식 (10점 단위 채점)
- 8강전
  - 8강전은 1대1로 진행
  - 8인 사진 돌아가는 룰렛 통해 랜덤으로 선수 선정해 선정된 선수가 상대를 지명해서 대결하는방식
    - (진행된 라운드 참가자들은 사진 룰렛에서 빠져야함)
  - 8강 승리자 표출 때는 1 대 1 vs 화면에서 번갈아가면서 어두워졌다가 밝아지는 긴장감 주는 연출이 가능한가요? (점수표출방식 유지)
- 결승라운드
  - 결승라운드는 4인으로 동시 진행
  - 순위 연출 방법(올림픽 메달처럼 단상 위로 올라가기 / 단상이 동시에 올라가다가 순위별로 멈춤)
  - 꽃가루

- 사진 룰렛 추상화
  - MData 이용해서
- 단상에 점수 표시하면 좋겠다

---

- 파티클 색 여러가지로 (단색 X)
- 8강 1 VS 1 대결, 상대 공개 시 연출 (UI 쿵 박히는 효과)
- 8강 1 VS 1 대결, 결과 공개 시 바닥 조명/스포트라이트 같이 켜지고 꺼지도록
- 4강(최종), 결과 공개와 단상 동시에 연출 (연출 길이 맞추면서 단상 올라가는 속도 느리게, 단상 높이 지금보다 낮게)
- 대기실 대기 모습을 비추는 캠 추가
- 대기실에 1번 2번 캠 나오는 스크린

- 바 이미션 토글
