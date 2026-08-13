/**
 * **굽고 커밋되는 파생물 한 표** (TASK-KL-312 · 2026-08-14 한 곳으로 모음)
 *
 * 커밋본이 곧 서비스본인 파일들이다 — 배포가 다시 굽지 않고, 저장소에 든 그대로 사람과
 * 봇에게 나간다. 그래서 소스가 바뀌면 **아무 데서도 안 걸린 채** 낡는다.
 *
 * 왜 표를 따로 뺐나: 같은 목록이 두 곳에 있었다 — `audit-generated.mjs` 의 표와
 * `refresh-generated.yml` 의 단계들. 그래서 「매일 밤 스스로 굽는다」고 **감사기가 약속하는데
 * 워크플로에는 그 생성기가 없는** 상태가 조용히 만들어질 수 있었다(감사기는 그걸 이유로
 * 막지 않으므로, 그 파일은 영원히 낡은 채 서비스된다). 이제 둘 다 이 표를 읽는다.
 *
 * 칸 뜻:
 *   · `npm`      — 굽는 명령 (`apps/karmolab` 에서)
 *   · `outputs`  — 굽는 것 (앱 폴더 기준 상대 경로)
 *   · `why`      — 낡으면 무엇이 잘못되나 (빨간 줄에 그대로 나간다)
 *   · `nightly`  — 매일 새벽 `refresh-generated.yml` 이 굽는다 = 감사기는 **막지 않고 말만** 한다
 *   · `못잼`     — 다시 구우면 늘 달라서(시각·최근 N일) 「낡았나」를 잴 수 없다.
 *                  감사기는 아예 안 굽는다 — 재면 영원히 빨갛다. 굽는 것은 밤이 한다.
 */
export const 파생물 = [
  {
    npm: 'build:devlog',
    outputs: ['data/devlog.json'],
    why: '「지금 뭘 만들고 있나」 자리 — 낡으면 며칠 전 소식이 걸린다',
    nightly: true,
    못잼: '최근 120일 커밋이라 다시 구우면 늘 다르다'
  },
  {
    npm: 'gen:worldcup-tools',
    outputs: ['data/worldcup-tools.json'],
    why: '봇이 뜰 때 씨앗 표로 심는다 — 낡으면 새 도구가 월드컵에 안 나온다',
    /* ★ **막지 않는다** (2026-08-13). 이 표는 **도구가 하나 늘 때마다** 낡는다 — 이 저장소는
       세션 여럿이 하루에도 여러 개를 만든다. 막는 게이트로 두면 도구를 만든 사람이 아니라
       그 뒤에 미는 **모든 세션**이 빨강을 맞고, 굽자면 빌드까지 새로 해야 한다(깨끗한 사본에서). */
    nightly: true
  },
  {
    npm: 'gen:arcade-catalog',
    outputs: ['src/widgets/arcade/catalog-meta.generated.ts', 'src/widgets/arcade/chunks.generated.json'],
    why: '로비가 읽는 명패 + 조각 표 — 낡으면 새 게임이 오락실에 안 뜨거나 눌러도 안 열린다'
  },
  {
    npm: 'gen:og',
    outputs: ['img/og'],
    why: '링크를 공유할 때 나가는 그림 — 낡으면 지금과 다른 문구가 붙는다',
    /* 굽는 데 그림 185장을 그린다(몇 분). 감사기가 매번 굽게 두면 아무도 안 돌린다 —
       대신 **전용 검사**가 있다: `audit:cards:fresh`(그리지 않고 문구만 견준다). */
    무거움: 'audit:cards:fresh 가 대신 본다'
  },
  {
    npm: 'gen:llms',
    outputs: ['../blog/assets/llms.txt', '../blog/assets/llms-full.txt'],
    why: '크롤러·모델이 읽는 소개 목록 — 낡으면 없는 도구를 알려 준다',
    무거움: '배포가 매번 다시 굽는다(build:artifacts)'
  },
  {
    npm: 'gen:play-roster',
    outputs: ['data/games.json'],
    why: '앱이 받아서 로비를 그리는 놀이 명부 — 낡으면 새 놀이가 로비에 안 뜬다'
  },
  {
    npm: 'gen:core-tools',
    outputs: ['data/core-tools.json', 'src/core/registry.generated.ts', 'src/core/registry-lazy.generated.ts'],
    why: '묶어 쓰기·MCP 가 부를 수 있는 도구 목록'
  }
];

/** 매일 밤 굽는 것들 — `refresh-generated.yml` 이 이걸로 단계를 만든다. */
export const 밤에굽는것 = 파생물.filter((x) => x.nightly);
