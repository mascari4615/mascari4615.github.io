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
  'checklist'
]);

/** 원장 id 목록에서 흡수된 것들을 걸러 낸다 */
export const withoutRetired = (ids) => ids.filter((id) => !RETIRED_OPERATION_IDS.has(id));
