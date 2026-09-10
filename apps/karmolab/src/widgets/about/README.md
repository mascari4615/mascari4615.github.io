# About

- `/about/`와 앱의 소개 위젯에서 같은 화면 사용
- 본문은 `content/about.md`, 생성 데이터는 `data/about.json`. 생성 데이터를 직접 수정하지 않음
- 프로젝트는 각 글의 `work:` frontmatter와 `apps/blog/_data/works.yml`. 생성 데이터는 `data/works.json`
- 대표작과 그림, 아이콘, 프로필 링크는 `data/about-presentation.json`

## 수정

- 대표작: `featured`에 프로젝트 slug 또는 외부 프로젝트 URL을 원하는 순서로 지정. 개수는 `featuredLimit`
- 지정한 프로젝트가 없으면 목록의 다른 항목으로 보충. 전체 개수가 적으면 있는 만큼 표시
- 이력: Markdown 목록 항목의 `data-record`와 `records`의 ID를 연결. 목록 순서나 제목을 바꿔도 연결 유지
- 아이콘: `image`는 원본 색 이미지, `symbol`은 단색 SVG. 연결이 없으면 항목의 첫 글자로 표시
- 프로필: `profiles`에 제목, 주소, 계정명, 아이콘, 선택 이미지와 강조색 지정. 빈 계정명은 프로필 보기 표시
- 이미지가 없거나 로딩에 실패한 프로젝트는 제목과 이미지 없음 표시

## 검증

- `npm run typecheck`
- `npm run build`
- `npm run smoke:about`, 실제 배포는 `npm run smoke:about -- https://blog.mascari4615.com`
- `ABOUT_OUTPUT` 환경변수로 화면과 결과 JSON 저장 위치 지정
- `--mutation`은 프로젝트 응답에서 1개 제거. 정본 목록과의 불일치 검출용, exit 1이 기대 결과
