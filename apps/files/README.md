# Files

개인 파일 시스템 화면. GitHub Pages에 올라가고, 노트북은 확장(목록 API)일 뿐이다.

- 주소(Pages): `https://blog.mascari4615.com/files/` (정적 앱의 배포 원본이자 웹 진입 주소). 이 주소를 `files.`로 강제 이동시키지 않는다.
- 제품 호스트: `https://files.mascari4615.com/`. Cloudflare Worker가 위 Pages 앱을 받아 `/blob/*`, `/pc-api/*`를 더한다. GH Pages 커스텀 도메인은 `blog.` 하나라 `files.`는 이 앱(`/files/`)을 Worker가 rewrite한다.
- Tauri: 머리띠 Files 버튼은 **현재 메인 창을** 제품 호스트로 바꾸는 `files_navigate`다. Files 화면의 `새 창`만 별도 창 명령 `files_window_open`을 쓴다. 따라서 Pages 주소의 존재 이유는 같은-창 전환이 아니다.
- 노트북 확장: `https://laptop.mascari4615.com/files/api/list`
- 클라우드 규격: `src/vault.mjs` (WebCrypto AES-GCM). 시험: `npm test`
- 클라우드 탭: `/blob/hdr` 가 있으면 그 암호문, 없으면 픽스처 `v/` (열쇠 `fixture`)

## 클라우드 v1

- 헤더 `hdr` 만 평문 (매직, KDF, salt). 목록은 `idx` 암호문
- 파일 이름, 경로는 저장 키에 안 넣음. 청크 키는 `c/<임의id>/<n>`
- 청크 = AES-256-GCM, IV 12B, AAD 에 파일 id+번호 (순서 바꿔치기 차단)
- 열쇠 = PBKDF2-SHA-256 (헤더의 반복 횟수). 운영 기본 600000
- 위젯 `crypto.ts`(CryptoJS CBC) 와 다른 물건

## PC 올리기

- 전송: rclone 원격 (`FILES_VAULT_REMOTE`, 기본 `gdrive:karm-files-vault`)
- 선택 열람 저장: `FILES_VAULT_R2` (rclone 원격). Worker `VAULT` R2 바인딩 → `/blob/`
- restic 저장소, 공개 `img.` 버킷과 섞지 않음
- `.env.template` 을 `.env` 로 복사. `npm run upload` 가 그 파일을 읽음
- `npm run upload -- --dry-run`. 목록만
- Drive 한 장 왕복 확인: `node scripts/probe-rclone.mjs` (끝나면 프로브 폴더 삭제)
- Worker live: `/blob/` → R2. 비면 Pages `v/` 픽스처를 채워 넣음 (데모)
- `wrangler.toml` 바인딩 이름 정본. 공개 `blog-img` 쓰지 마
