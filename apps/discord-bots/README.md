# Discord Bots Workspace

이 디렉터리는 디스코드 봇들을 위한 독립 워크스페이스입니다.

## 앱 목록

- `apps/yawnbot`: 게임/슬래시/음성/AI/Unity 무료 에셋·긱뉴스 알림 통합 봇 — 앱별 요약은 [`apps/yawnbot/README.md`](apps/yawnbot/README.md)

> 이전 `apps/atkup-bot` (Unity 무료·긱뉴스 알림 별도 봇) 은 TASK-YB-003 (2026-05) 에서 yawnbot 안 `services/notifiers/` + `/atkup` 슬래시로 흡수 폐기. 봇 1개 / 토큰 1개 / `.env` 1개로 운영 통합.

## 설치

```bash
cd apps/discord-bots
npm install
```

## 실행

```bash
npm run start             # = npm run start:yawnbot
npm run start:yawnbot
```

### 앱 단위(직접 `-w`)

```bash
npm -w apps/yawnbot run build
npm -w apps/yawnbot run start
```

## 커맨드 배포

```bash
npm run deploy            # = npm run deploy:yawnbot
npm run deploy:yawnbot

# 또는 앱 단위
npm -w apps/yawnbot run deploy
```

## 레거시 `apps/yawnbot-server`

이 폴더의 `npm run start` / `build` / `deploy` 는 위 `apps/discord-bots` 워크스페이스로 **위임**됩니다. 최초 1회는 `apps/discord-bots`에서 `npm install`이 필요합니다.
