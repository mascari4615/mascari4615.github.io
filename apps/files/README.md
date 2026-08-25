# Files

개인 파일 시스템 화면. GitHub Pages에 올라가고, 노트북은 확장(목록 API)일 뿐이다.

- 주소(Pages): `/files/`
- 제품 호스트: `files.mascari4615.com` — Cloudflare가 붙인다. 노트북 터널 금지. GH Pages 커스텀 도메인은 `blog.` 하나라 `files.` → 이 앱(`/files/`) rewrite.
- 노트북 확장: `https://laptop.mascari4615.com/files/api/list`
- 금고 규격: `src/vault.mjs` (WebCrypto AES-GCM). 시험: `npm test`
- 금고 탭: 픽스처 암호문(`v/`). 열쇠 `fixture`. 사적 파일 아님. 미리보기는 메모리 blob

## 금고 v1

- 헤더 `hdr` 만 평문 (매직·KDF·salt). 목록은 `idx` 암호문
- 파일 이름·경로는 저장 키에 안 넣음. 청크 키는 `c/<임의id>/<n>`
- 청크 = AES-256-GCM · IV 12B · AAD 에 파일 id+번호 (순서 바꿔치기 차단)
- 열쇠 = PBKDF2-SHA-256 (헤더의 반복 횟수). 운영 기본 600000
- 위젯 `crypto.ts`(CryptoJS CBC) 와 다른 물건

## PC 올리기

- 전송: rclone 원격 (`FILES_VAULT_REMOTE`, 기본 `gdrive:karm-files-vault`)
- restic 저장소와 섞지 않음
- `.env.template` 을 `.env` 로 복사. 원본 절대경로는 env 만
- `npm run upload` — 청크 암호 후 `rclone rcat`. 로그는 상대 경로만
- `npm run upload -- --dry-run` — 목록만
- Drive 한 장 왕복 확인: `node scripts/probe-rclone.mjs` (끝나면 프로브 폴더 삭제)
