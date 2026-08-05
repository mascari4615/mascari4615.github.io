/**
 * 도구 위젯 스모크 (TASK-KL-088)
 *
 * 빌드 산출물(js/widgets/tools/*.js)을 실제로 실행해서
 *  ① 각 위젯이 Toolbox.register 를 호출하는지 (등록 자체가 죽으면 사이드바에서 통째로 사라진다)
 *  ② 메타(id/title/tabs)가 lazy-meta 와 어긋나지 않는지
 *  ③ 순수 로직(한영타 변환)이 기대값을 내는지
 * 를 확인한다. DOM 이 필요한 build() 는 호출하지 않는다 — 여기서 잡으려는 건 「로드조차 안 되는」 부류.
 *
 * 사용: node scripts/smoke-tools.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
};

/* lazy-meta (도구 목록의 단일 출처) */
const metaWindow = {};
new Function('window', fs.readFileSync(path.join(root, 'js/widgets-lazy-meta.js'), 'utf8'))(metaWindow);
const metaById = Object.fromEntries((metaWindow.KARMOLAB_LAZY_META || []).map((m) => [m.id, m]));

/* SEO 정본에 실린 도구 = 스모크 대상 */
const seo = JSON.parse(fs.readFileSync(path.join(root, 'data/tools-seo.json'), 'utf8')).tools;
const ids = Object.keys(seo);

const registered = {};
let hangul = null;

for (const id of ids) {
  const meta = metaById[id];
  check(meta, `${id}: widgets-lazy-meta 에 없음`);
  if (!meta) continue;

  const rel = (meta.lazyScriptPaths || [])[meta.lazyScriptPaths.length - 1];
  const file = path.join(root, 'js/widgets', rel + '.js');
  check(fs.existsSync(file), `${id}: 번들 없음 (${rel}.js) — npm run build 필요`);
  if (!fs.existsSync(file)) continue;

  const win = {};
  const sandbox = {
    window: win,
    Toolbox: {
      register: (cfg) => {
        registered[cfg.id] = cfg;
      },
      showToast: () => undefined,
      incrementProgress: () => 0
    },
    Mdd: { linePreset: () => true },
    document: { createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }) },
    navigator: { clipboard: {} },
    crypto: { getRandomValues: (a) => a, randomUUID: () => 'x' },
    location: { hash: '' }
  };
  try {
    new Function(...Object.keys(sandbox), fs.readFileSync(file, 'utf8'))(...Object.values(sandbox));
  } catch (e) {
    failures.push(`${id}: 번들 실행 실패 — ${e.message}`);
    continue;
  }

  const cfg = registered[id];
  check(cfg, `${id}: Toolbox.register 가 호출되지 않음`);
  if (!cfg) continue;
  check(cfg.title === meta.title, `${id}: title 불일치 (위젯 "${cfg.title}" vs 메타 "${meta.title}")`);
  check(cfg.category === meta.category, `${id}: category 불일치`);
  check(
    cfg.layout === meta.layout,
    `${id}: layout 불일치 (위젯 "${cfg.layout}" vs 메타 "${meta.layout}") — 두 곳을 함께 고쳐야 한다`
  );
  check(Array.isArray(cfg.tabs) && cfg.tabs.length > 0, `${id}: tabs 없음`);
  check(
    (cfg.tabs || []).every((t) => t.id && t.label && typeof t.build === 'function'),
    `${id}: tab 스펙 불완전 (id/label/build)`
  );
  if (id === 'hangulkey') hangul = win.KarmoHangulKey;
}

/* 한영타 변환 — 조합 오토마타가 도구의 존재 이유라 값으로 확인한다 */
if (!hangul) {
  failures.push('hangulkey: window.KarmoHangulKey 미노출');
} else {
  const cases = [
    ['dkssud', '안녕'],
    ['dkssudgktpdy', '안녕하세요'],
    ['rkskekfk', '가나다라'],
    ['dhkrpdy', '와게요'],
    ['gksrmf', '한글'],
    ['dlqfur', '입력'],
    ['djqtdj', '없어']
  ];
  for (const [eng, kor] of cases) {
    const got = hangul.engToKor(eng);
    check(got === kor, `hangulkey: engToKor("${eng}") = "${got}" (기대 "${kor}")`);
    const back = hangul.korToEng(kor);
    check(back === eng, `hangulkey: korToEng("${kor}") = "${back}" (기대 "${eng}")`);
  }
}

if (failures.length) {
  console.error('[smoke-tools] 실패 ' + failures.length + '건');
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log(`[smoke-tools] ${ids.length}개 도구 위젯 OK`);
