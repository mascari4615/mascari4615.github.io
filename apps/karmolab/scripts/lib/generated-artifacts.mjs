/**
 * **굽고 커밋되는 파생물 한 표** (TASK-KL-312, 2026-08-14 한 곳으로 모음)
 *
 * 커밋본이 곧 서비스본인 파일들이다. 배포가 다시 굽지 않고, 저장소에 든 그대로 사람과
 * 봇에게 나간다. 그래서 소스가 바뀌면 **아무 데서도 안 걸린 채** 낡는다.
 *
 * 왜 표를 따로 뺐나: 같은 목록이 두 곳에 있었다. `audit-generated.mjs` 의 표와
 * `refresh-generated.yml` 의 단계들. 그래서 매일 밤 스스로 굽는다고 **감사기가 약속하는데
 * 워크플로에는 그 생성기가 없는** 상태가 조용히 만들어질 수 있었다(감사기는 그걸 이유로
 * 막지 않으므로, 그 파일은 영원히 낡은 채 서비스된다). 이제 둘 다 이 표를 읽는다.
 *
 * 칸 뜻:
 *  , `npm`     . 굽는 명령 (`apps/karmolab` 에서)
 *  , `outputs` . 굽는 것 (앱 폴더 기준 상대 경로)
 *  , `why`     . 낡으면 무엇이 잘못되나 (빨간 줄에 그대로 나간다)
 *  , `nightly` . 매일 새벽 `refresh-generated.yml` 이 굽는다 = 감사기는 **막지 않고 말만** 한다
 *  , `못잼`    . 다시 구우면 늘 달라서(시각, 최근 N일) 낡았나를 잴 수 없다.
 *                  감사기는 아예 안 굽는다. 재면 영원히 빨갛다. 굽는 것은 밤이 한다.
 */
export const generated = [
  {
    /* ★ 목록 감사(`audit:generated-registry`)가 찾아낸 넷 중 셋 (2026-08-17). 나머지 하나(글꼴)는
       파이썬으로 굽고 원본 글꼴 파일이 있어야 해서 이 자리에서 재현이 안 된다. 그 검사의 «빼는 것» 에 적었다. */
    npm: 'build:i18n',
    outputs: ['src/lib/i18n-registry.ts', 'src/lib/region-registry.ts'],
    why: '말 판, 지역 표를 코드로 찍은 것. 낡으면 새 언어, 지역이 화면에 안 뜬다'
  },
  {
    npm: 'gen:studymap-lessons',
    outputs: ['data/lessons/search-index.ko.json'],
    why: '강의, 장 통합 검색 색인. 낡으면 새 강의가 검색에 안 잡힌다'
  },
  {
    /* ★ 자동 생성이라 적혀 있는데 목록에 없던 둘 (2026-08-17 훑기). 스타일 두 벌과 같은 부류다 . 
       적어 두지 않으면 손 고침도 낡음도 아무 말이 없다. */
    npm: 'gen:doc-search-index',
    outputs: ['data/docs-search-index.ko.json'],
    why: '문서 위젯의 통합 검색 색인. 낡으면 새 문서가 검색에 안 뜬다'
  },
  {
    npm: 'gen:studymap-lessons',
    outputs: ['data/lessons/index.json'],
    why: '공부 지도가 이 칸에 강의가 있나를 읽는 표. 낡으면 새 강의가 지도에 표시 안 된다'
  },
  {
    /* ★ **손으로 고쳐도 아무 말이 없었다** (2026-08-17 실측, 내가 당했다). 이 두 벌은
       `css/toolbox.css` 에서 뽑아 만드는데 목록에 없어서 감사가 안 봤다. 첫 줄에 손으로
       고치지 마라가 적혀 있어도, 가운데를 찾아 고치는 사람은 그 줄을 안 본다.
       그래서 폰 단추 고침을 생성물에 적었다가 다음 빌드에 **조용히 지워졌다**.
       적어 두면 감사가 다시 구워 견준다. 손 고침은 그 자리에서 빨강이 된다. */
    npm: 'build:css',
    outputs: ['css/shell-critical.css', 'css/shell-deferred.css'],
    why: '첫 그림에 필요한 스타일과 나중에 오는 스타일. 손으로 고치면 다음 빌드에 지워지고, 낡으면 화면이 옛 모양으로 나간다'
  },
  {
    npm: 'build:devlog',
    outputs: ['data/devlog.json'],
    why: '지금 뭘 만들고 있나 자리. 낡으면 며칠 전 소식이 걸린다',
    nightly: true,
    couldNotMeasure: '최근 120일 커밋이라 다시 구우면 늘 다르다'
  },
  {
    npm: 'gen:arcade-catalog',
    outputs: ['src/widgets/arcade/catalog-meta.generated.ts', 'src/widgets/arcade/chunks.generated.json'],
    why: '로비가 읽는 명패 + 조각 표. 낡으면 새 게임이 오락실에 안 뜨거나 눌러도 안 열린다'
  },
  {
    npm: 'gen:og',
    outputs: ['img/og'],
    why: '링크를 공유할 때 나가는 그림. 낡으면 지금과 다른 문구가 붙는다',
    /* 굽는 데 그림 185장을 그린다(몇 분). 감사기가 매번 굽게 두면 아무도 안 돌린다 . 
       대신 **전용 검사**가 있다: `audit:cards:fresh`(그리지 않고 문구만 견준다). */
    weight: 'audit:cards:fresh 가 대신 본다'
  },
  {
    npm: 'gen:llms',
    outputs: ['../blog/assets/llms.txt', '../blog/assets/llms-full.txt'],
    why: '크롤러, 모델이 읽는 소개 목록. 낡으면 없는 도구를 알려 준다',
    weight: '배포가 매번 다시 굽는다(build:artifacts)'
  },
  {
    npm: 'gen:play-roster',
    outputs: ['data/games.json'],
    why: '앱이 받아서 로비를 그리는 놀이 명부. 낡으면 새 놀이가 로비에 안 뜬다'
  },
  {
    npm: 'gen:type-pool',
    outputs: ['src/core/type-pool.generated.ts'],
    why: '타자 연습이 치는 글월. 낡으면 없어진 도구 설명을 사람이 따라 친다',
    /* ★ **사람을 굽는 사람으로 두면 안 굽는다** (2026-08-16, 실측). 이 둘은 `data/tools-seo.json`
       에서 나온다. 그런데 그 파일은 도구 상세 설명을 채울 때마다 바뀜다(오늘만 여러 섬션이
       13개를 채웠다). 그래서 설명을 고친 사람이 아니라 **그 뒤에 미는 모든 섬션**이 빨강을
       맞았고, 실제로 verify 가 세 판 연속 빨갔다. 생성기 머릿말은 이미 build 사슬에서
       자동이라 적어 있었는데 그게 **거짓말**이었다. 사슬에 넣어 참으로 만들었다.
       다른 자리: 밤에 굽는 것(worldcup)보다 낛다. 배포마다 굽으니 서비스본은 항상 새것이다. */
    weight: '배포가 매번 다시 굽는다(build:artifacts)'
  },
  {
    npm: 'gen:word-pool',
    outputs: ['src/core/word-pool.generated.ts'],
    why: '낱말 놀이의 낱말. 위와 같은 이유',
    weight: '배포가 매번 다시 굽는다(build:artifacts)'
  },
  {
    npm: 'gen:han-table',
    outputs: ['src/core/han-table.generated.ts'],
    why: '한자 표. 소스가 바뀌면 같이 바뀌어야 한다',
    /* 사람이 받아서 푼 자료 폴더를 인자로 줘야 돈다. 감사기가 혼자서는 못 굽는다.
       그래서 여기서는 안 굽고, 사실만 적어 둔다(안 보는 것과 구분되게). */
    weight: '사람이 받아 푼 자료 폴더가 있어야 돈다 (node scripts/gen-han-table.mjs <폴더>)'
  },
  {
    npm: 'gen:core-tools',
    outputs: ['data/core-tools.json', 'src/core/registry.generated.ts', 'src/core/registry-lazy.generated.ts'],
    why: '묶어 쓰기, MCP 가 부를 수 있는 도구 목록'
  }
];

/** 매일 밤 굽는 것들. `refresh-generated.yml` 이 이걸로 단계를 만든다. */
export const nightlyBuilds = generated.filter((x) => x.nightly);
