/**
 * **작업대로 흡수한 옛 도구 이름 — 한 곳** (2026-08-13)
 *
 * 글 도구 열여섯을 「글 작업대」의 조작(operation)으로 합치면서, 낱개 위젯 파일과 명부 등록이
 * 사라졌다. 그런데 SEO 원장(`data/tools-seo.json`)에는 아직 그 이름들이 남아 있다 —
 * 주소를 죽이지 않으려면 그게 맞다. 문제는 **그 사실을 아는 곳이 한 군데뿐**이었다는 것:
 * 페이지 생성기만 걸러 냈고, 검사(`smoke-tools`)는 몰라서 「명부에 없다」 열여섯 건으로
 * master 를 세웠다(2026-08-13, 한 시간 넘게 전 세션이 막혔다).
 *
 * 같은 목록이 두 곳이면 반드시 갈라진다 — 그래서 여기 하나만 둔다.
 * 원장에서 이름을 실제로 지우는 날, 이 목록도 같이 빈다.
 */
export const RETIRED_OPERATION_IDS = new Set([
  /* ★ **다른 도구 안의 조작** (2026-08-16). 위 목록이 「글 작업대로 흡수」였다면 아래는
     「그 도구 안의 한 기능」이다 — 알맹이 파일(`src/core/<id>.ts`)만 있고 **자기 화면이 없다**.
     실측으로 확인했다: 같은 이름의 위젯 파일이 없고, 기능은 괄호 안 도구 화면에서 돈다.
     이런 것에 주소를 만들면 같은 기능이 두 자리로 갈라진다 — 페이지가 없는 게 맞다.
     (`unicodex` 는 이걸 모르고 소개글까지 썼다가 게이트가 잡아 줬다.) */
  'apidiff',      // API 시험 안 (widgets/tools/apitest.ts)
  'certview',     // 인증서·키 도구 안 (widgets/crypto.ts)
  'pem',          // 인증서·키 도구 안 (widgets/crypto.ts)
  'encdetective', // 글 작업대 안 (widgets/tools/text-operations.ts)
  'exif',         // 사진 정보 지우기 안 (widgets/tools/exifclean.ts)
  'gitundo',      // git 명령 찾기 안 (widgets/ref/gitcmd.ts)
  'regexplain',   // 정규식 시험 안 (widgets/tools/regextest.ts)

  'slug',
  'caseconv',
  'linebreak',
  'textclean',
  'hangulkey',
  'jamo',
  'replace',
  'listdiff',
  'charcount',
  'wordfreq',
  'textdiff',
  'textredact',
  'text2pdf',
  'text2img',
  'lorem',
  'checklist',
  /* 개발 도구 작업대로 흡수 (2026-08-16, TASK-KL-257) — 여기 안 적으면 검사가
     「명부에 없다」로 master 를 세운다. 글 열여섯이 그랬던 그 자리다. */
  'json2ts',
  /* 「안 보이는 글자 찾기」 — 글 작업대 안의 조작이다(2026-08-16 확인: 자기 register 를 안 부른다).
     알맹이(core/unicodex.ts)만 남아 있어 「페이지가 없다」로 잡히길래 여기 적는다. */
  'unicodex',
  'sqlfmt',
  'xmlfmt',
  'configconv',
  'prettyall',
  'jqplay'
]);

/** 원장 id 목록에서 흡수된 것들을 걸러 낸다 */
export const withoutRetired = (ids) => ids.filter((id) => !RETIRED_OPERATION_IDS.has(id));
