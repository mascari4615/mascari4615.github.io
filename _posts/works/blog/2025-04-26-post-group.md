---
title: "Post Group | 글 분류"
description: "이 블로그에서 사용하는 글 분류 규칙"
categories: [🍇Works]
tags: [Blog]
image: "/assets/img/background/20230112-151539.jpg"

date: 2025-04-26. 14:57 # Init (Blog.md에서 분리)
last_modified_at: 2025-04-26. 23:35 # 중복 카테고리 수정
---

## 📀 머리말

---

이 블로그에서 사용하는 글 분류 규칙  

## 📀 카테고리

---

최대 2단계까지 설정  
Chirpy Theme의 Category tab에서 표현하는 카테고리 최대 깊이는 2라서.  

### 💫Computer | 🌑🌒🌓🌔🌕🌖🌗🌘🌚-💫🫧

💫Computer: 위 카테고리에 포함되지 않은, 컴퓨터와 관련된  

💫Computer, 🌑Algorithm: algorithm, ai  
💫Computer, 🌒Coding: convention, 언어 문법 (C++, C#)  
💫Computer, 🌓Data-Structure:  
💫Computer, 🌔Computer-General: 컴퓨터와 관련된 잡다한 것  
💫Computer, 🌕Graphics: 2D, 3D  
💫Computer, 🌖Program: software, tools  
💫Computer, 🌗Programming: code pattern/template, paradigm, workflow, ...  
💫Computer, 🌘System: computer system  
💫Computer, 🌚web: internet, web, networking  

### 🪨Stone | 🌱🪴🌴🏝️-🗿🪨

🪨Stone: 일기/생각/기록  

🪨Stone, 🌱DayStone: 하룻돌, 일 단위의 일기/생각/기록  
🪨Stone, 🪴MonthStone: 달돌, 월 단위의 회상/생각/기록  
🪨Stone, 🏝️LifeStone: 삶돌, 삶 단위의 회상/생각/기록  

Milestone에서 따옴  

### 🫐WitchMendokusai | 🍉🍊🍍🍌🍋🍐🥑🍋‍🟩🍈🥥🫐🍇-📀💿

🫐WitchMendokusai: 내 세상  

🫐WitchMendokusai, 🍉  
🫐WitchMendokusai, 🍊  
🫐WitchMendokusai, 🍍  
🫐WitchMendokusai, 🍌  
🫐WitchMendokusai, 🍋Dev-Log  
🫐WitchMendokusai, 🍐  
🫐WitchMendokusai, 🥑Game-Design  
🫐WitchMendokusai, 🍋‍🟩  
🫐WitchMendokusai, 🥥The-World  

### 🍇Works | 🫐-📀💿

🍇Works: 프로젝트, 작업물  

### 📀World | 📀-📀💿

📀World: 위 카테고리에 포함되지 않은 모든 포스트  

## 📀 태그

---

지엽적인 태그는 추가하지 않기, 최소 두 곳 이상에서 쓰이는 것  
나보다는 블로그를 보는 사람을 위한  

## 📀 메모

---

### 💿 주의사항

- 블로그 빌드 시
  - 카테고리 이모티콘 빠진채로 설정되는데, 이때 중복된 카테고리 없도록 주의

### 💿 Regex

- `categories: \[.*?\]`
- `_posts/computer/algorithm/**/*.md`
- `(\d{6})_(\d{6})`
- `$1-$2`

## 📀 역사

---

- 250222
  - `Figma` 공부를 시작, 메모 글을 작성하기 위해 새로운 카테고리 `Design`을 만듦.
  - 근데 `Game-Engine` - `CG`랑 범위가 조금 겹치는 것 같아, `Game-Engine`으로부터 `Computer-Graphics`를 분리하고, `Computer` 카테고리의 주 카테고리로 승격.
  - `Computer-Graphics`에 `Design` 카테고리를 포함시키는 것으로.

- 250315
  - `Game-Engine`을 `Programming`에 병합

- 250423
  - `Memo`를 `LifeStone`에 병합
    - `Word.md`의 경우, 나에게 있어 특별한 의미가 있거나, 그런 의미를 가지고 싶은 단어들로 구성하도록 수정

- 250426
  - 대규모 정리
