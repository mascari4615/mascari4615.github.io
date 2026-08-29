# KarmoWebExtension (Chrome MV3)

로컬 앱(`chat-overlay` 등)과 브라우저 방송, 시청 페이지를 잇는 **KarmoWebExtension**입니다.

## 개발용 로드

1. Chrome `chrome://extensions` → **개발자 모드**
2. **압축해제된 확장 프로그램을 로드합니다** → 이 폴더(`karmo-web-extension`) 선택

기존에 `stream-overlay-extension` 등으로 로드했다면 제거 후 이 폴더를 다시 로드하세요.

## 옵션 (ingest URL)

- 확장 아이콘 **클릭** → **설정(옵션) 열기** 버튼 (가장 쉬움)
- 또는 아이콘 **우클릭** → **옵션** / `chrome://extensions` → 세부정보 → **확장 프로그램 옵션**
- `http://127.0.0.1:<포트>/ingest` 입력 후 저장. **기본 주소로 저장** 버튼이면 17376으로 한 번에 맞춤.

## 즐겨찾기 정리 (v0.2)

확장 아이콘 → **즐겨찾기 정리 열기**. `chrome.bookmarks` API 로 읽고 지운다.

- **내보내기**: TSV / Markdown / JSON 클립보드 복사 (문서화용)
- **붙여넣기 일괄 삭제**: id, URL 을 줄 단위로 붙여넣기 → 미리보기 → 삭제
- **목록에서 고르기**: 검색 + 체크 선택 삭제

`Bookmarks` JSON 파일을 직접 고치는 방법은 **동기화가 되살린다** (2026-08-28 실측: 3건 삭제 → 새 id 로 부활).
확장 API 삭제는 동기화에도 그대로 전파되므로 이 경로를 써라.

## 원격 호출 (externally_connectable)

허용 도메인(`blog`, `127.0.0.1`, `localhost`) 페이지에서:

```js
chrome.runtime.sendMessage("<확장ID>", { type: "bookmarks.list" }, console.log);
// bookmarks.listAll / bookmarks.remove {ids} / bookmarks.removeTree {ids}
// bookmarks.pruneEmptyFolders / ext.version / ext.reload
```

`ext.reload` = 언팩 확장을 디스크에서 다시 읽는다 → **코드 고친 뒤 수동 새로고침 불필요**.
(단 그 핸들러가 없던 버전에서 올릴 때는 `edge://extensions` 새로고침 1회가 필요하다.)

## 다음 작업 예시

1. 치지직 라이브 시청 페이지에서 채팅 DOM 구조 확인
2. `content.js`의 `extractChatRows` 구현
3. **chat-overlay(Tauri)** 가 떠 있으면 `127.0.0.1:17376` 에서 `POST /ingest` 를 받고 오버레이로 표시함

## 설정

- 기본: `http://127.0.0.1:17376/ingest` (`content.js`의 `DEFAULT_INGEST_URL`)
- **옵션 페이지**에서 저장하면 그 값이 우선 (`chrome.storage.sync.ingestUrl`)

## 주의

각 방송 플랫폼 약관, 정책은 직접 확인하세요.
