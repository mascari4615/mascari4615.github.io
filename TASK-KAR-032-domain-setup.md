---
title: "TASK-KAR-032 — mascari4615.com 도메인 활용 (이메일 / apex 허브 / 정체성)"
status: in_progress
date: 2026-05-18
---

# TASK-KAR-032 — mascari4615.com 도메인 활용

[TASK 정본: karmoddrine/memo/tasks/TASK-KAR-032-도메인-놀이-이메일-apex허브-서브도메인.md]

## 확정 항목 (구현 중)

### 1. 커스텀 이메일 — Cloudflare Email Routing

**목표**: `*@mascari4615.com` → `mascari4615@gmail.com` 포워딩

#### 선행 조건 (BLOCKER)
- Cloudflare API 토큰 필요 (선택: 토큰 있으면 자동화, 없으면 수동)
- 최소 권한: Zone DNS (Edit), Email Routing Rules (Edit), Account Email Routing Addresses (Edit)
- 토큰 취급: **로그/커밋/메모리 저장 금지**, `.cf-token` 파일만 로컬 사용

#### 구현 단계

**A. 토큰 발급 (사용자)**
1. Cloudflare 대시보드 → 프로필 → API Tokens
2. "Create Token" → "Custom token"
3. 권한:
   - Zone → DNS → Edit
   - Zone → Email Routing Rules → Edit
   - Account → Email Routing Addresses → Edit
   - Zone → Zone → Read (읽기)
4. Zone Resources: `mascari4615.com` 만 선택
5. 토큰 복사 → `C:\Users\masca\repos\karmoddrine\.cf-token` 저장

**B. DNS 레코드 확인** (CF 자동 설정 예상)
필수 레코드 (mascari4615.com zone):
```
MX   10   route.cloudflare.net.
TXT  SPF "v=spf1 include:cloudflare.net ~all"
TXT  DMARC "v=DMARC1; p=quarantine; rua=mailto:mascari4615@gmail.com"
```

**C. Email Routing Rule 설정**
Cloudflare 대시보드 → Email Routing:
1. Catch-all rule: `*@mascari4615.com` → `mascari4615@gmail.com`
2. (선택) 별도 alias 규칙: `me@mascari4615.com`, `hello@mascari4615.com` 등

**D. Gmail 발신 설정** (사용자)
Gmail → Settings → Accounts and Import → "Send mail as":
1. 주소 추가: `me@mascari4615.com` (또는 선택한 alias)
2. SMTP 서버: Gmail 기본값 사용 (CF 이메일 라우팅은 수신만)
3. 인증: Gmail 계정으로 (별도 SMTP 설정 X)

#### 자동화 (토큰 있을 때)
스크립트: `scripts/cf-email-routing-setup.mjs` (미구현, 선택 항목)
```bash
node scripts/cf-email-routing-setup.mjs \
  --domain mascari4615.com \
  --catch-all mascari4615@gmail.com \
  --aliases me,hello,contact
```

#### 검증 단계
1. 임의의 주소로 메일 발송: `test@mascari4615.com`
2. `mascari4615@gmail.com` 수신 확인
3. Gmail에서 `me@mascari4615.com` 으로 발신 테스트
4. SPF/DKIM 인증 확인 (Gmail 메일 헤더)

---

### 2. Apex 허브 — `mascari4615.com` 포트폴리오 홈

**목표**: 블로그, KarmoLab, WM, GitHub 등을 모은 중앙 포트폴리오 사이트

**현재 상태**:
- `blog.mascari4615.com` — Chirpy 블로그 (GitHub Pages)
- `mascari4615.com` (apex) — **미배포** (의도적으로 보존)

#### 호스팅 옵션 (사용자 선택)

| 옵션 | 설명 | 장점 | 단점 | 추천도 |
|---|---|---|---|---|
| **GitHub Pages (2nd repo)** | 별 repo `mascari4615.com` with custom domain | 무료, 블로그와 분리, 관리 간단 | 2개 repo 유지 | ⭐⭐⭐ |
| **Cloudflare Pages** | CF 프로젝트, Git 연동 | CF 생태계, 무료, 애널리틱스 내장 | CF 의존, 새 학습곡선 | ⭐⭐⭐ |
| **Worker (리버스 프록시)** | CF Worker로 여러 origin 통합 | 유연함, 경로별 라우팅 | 코드 관리, 복잡 | ⭐ |

**추천**: GitHub Pages 2nd repo → 가장 간단, 기존 구조와 일관성

#### 디자인 톤 (사용자 결정 대기)
- 스펙: "비주얼 톤 = 사용자 영역 (process.md § 비주얼 톤 — 묘사·조사 받고 시작, 추측 X)"
- 현재: 사용자 발화 없음 → **다음 단계에서 사용자와 협의**

#### 예상 구조 (호스팅 선택 후)
```
mascari4615.com/
├── index.html          # 홈 페이지 (포트폴리오 hub)
├── about/             # 소개
├── works/             # 프로젝트 포트폴리오
├── links/             # 외부 링크 (blog, github, etc.)
└── contact/           # 연락처 (이메일, SNS)
```

---

## 후보 항목 (옵션, 추후 그릴 후)

### 3. KarmoLab 서브도메인 분리
- 목표: `karmolab.mascari4615.com`
- 방법: Cloudflare Worker 리버스 프록시 (기존 경로 변경 X)
- 상태: 미결정

### 4. Bluesky 핸들 `@mascari4615.com`
- 방법: DNS TXT 레코드 (`_atproto.mascari4615.com`)
- 상태: 미결정

### 5. Status Page (`status.mascari4615.com`)
- 목표: 요윤봇/서비스 헬스 공개
- 상태: 미결정

### 6. Cloudflare Web Analytics
- 목표: `mascari4615.com` 에 0-JS 프라이버시 분석
- 상태: 설정 값만 준비 필요

### 7. 단축 URL (`go.mascari4615.com`)
- 목표: Cloudflare Worker + 라우팅 테이블
- 상태: 미결정

---

## 완료 조건 (체크리스트)

### Phase 1: 확정 항목 (2026-05 목표)
- [ ] ①-A: CF 토큰 발급 + 로컬 검증
- [ ] ①-B: DNS MX/SPF/DMARC 레코드 확인
- [ ] ①-C: Email Routing Rule 설정 (CF 대시보드)
- [ ] ①-D: Gmail 발신 설정
- [ ] ①-검증: 테스트 메일 수신/발신
- [ ] ②: Apex 호스팅 옵션 선택 + 비주얼 톤 결정

### Phase 2: 선택 항목 (추후)
- [ ] 3-7: 각 그릴 후 순차 진행

---

## 관련 문서

- TASK 정본: `karmoddrine/memo/tasks/TASK-KAR-032-...`
- 선행: `TASK-KAR-028` (blog.mascari4615.com 구축, DONE)
- Cloudflare API: https://developers.cloudflare.com/api/
- Email Routing: https://developers.cloudflare.com/email-routing/
- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages
- CF Pages: https://developers.cloudflare.com/pages/

---

## Notes

- 토큰 완료 후 **폐기 필수**: `.cf-token` 삭제 + Cloudflare Revoke 실행
- 이메일 alias 선택: 사용자 의사 (me@, hello@, contact@ 등)
- Apex 호스팅은 이 TASK 스펙 내 구현 scope 밖음 (Phase 2 이후)
- "추측 금지" 원칙: 비주얼 톤은 사용자 발화 대기
