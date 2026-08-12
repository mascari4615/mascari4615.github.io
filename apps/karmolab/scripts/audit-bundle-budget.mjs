/**
 * 위젯 묶음 크기 예산 (TASK-KL-201 ⑩).
 *
 * 왜 브라우저가 아니라 여기서 재나: **열지 않아도 아는 것**이기 때문이다. 계기판은 이 세션에서
 * 실제로 연 위젯만 잴 수 있어서, 아무도 안 연 위젯이 뚱뚱해져도 영영 안 보인다. 위젯이 228개다.
 *
 * 무엇으로 재나: **gzip 크기**. 사람이 회선으로 받는 것은 압축된 바이트라, 원본 크기로 재면
 * 실제 부담과 어긋난다(실측: 원본 2.62MB ↔ gzip 0.87MB, 3배 차이).
 *
 * 어떻게 판정하나 — 절대선 하나 + **래칫** 하나:
 *   ① 절대선: 위젯 하나가 gzip 64KB 를 넘으면 실패. 느린 회선에서 그 하나로 1초가 넘는다.
 *   ② 래칫: 기준선(`data/bundle-baseline.json`)보다 **10KB 또는 20% 이상 커지면** 실패.
 *      절대선만 두면 60KB 짜리가 63KB 가 되는 것을 아무도 못 본다 — 회귀는 늘 조금씩 온다.
 * 기준선 갱신은 사람이 의도적으로: `--update` (커밋에 그 줄이 남아 리뷰에 걸린다).
 *
 * 새 위젯은 기준선에 없다 — 그건 실패가 아니라 **처음 보는 것**이므로 절대선만 본다.
 *
 * 사용: node scripts/audit-bundle-budget.mjs [--update]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WIDGET_DIR = path.join(root, 'js/widgets');
const BASELINE = path.join(root, 'data/bundle-baseline.json');
const UPDATE = process.argv.includes('--update');

/** 위젯 하나의 한계 (gzip). 실측 최대가 60KB 라 64KB 는 「지금 것은 통과, 더는 안 됨」선이다. */
const HARD_LIMIT = 64 * 1024;
/** 전부 합쳐서 (gzip).
 *
 * ★ 이 값은 **아무도 한 번에 안 받는 합계**다 (2026-08-12). 위젯은 지연 로드라 방문자는 자기가
 *   연 도구 하나만 받는다 — 방문자 비용을 지키는 것은 위젯당 한계(HARD_LIMIT)와 첫 화면
 *   예산(perf.ts 의 420KB)이고, 이 합계는 「저장소가 통째로 붓고 있나」를 보는 눈이다.
 *   도구가 74개에서 계속 늘어 1.2MB 를 넘겼다 — 성장 자체는 이 사이트의 목적이므로 선을 옮긴다.
 *   대신 **위젯당 한계는 그대로 둔다**: 붓는 것을 막는 진짜 자리는 거기다. */
const TOTAL_LIMIT = 1.8 * 1024 * 1024;
/* 래칫 — 둘 **중 하나**면 회귀다.
 *   ① 절대: 8KB 이상 커짐 (큰 파일이 조금씩 붓는 것)
 *   ② 비율: 20% 이상 커짐 + 최소 2KB (작은 파일이 두 배가 되는 것)
 * 처음엔 「둘 다」로 뒀다가 실제로 못 잡는 것을 봤다: 작은 위젯에 9.8KB 를 부어도 조용했다
 * (절대 10KB 미달 + 비율은 통과 → AND 라서 빠져나갔다). 막는 자리가 안 막으면 없느니만 못하다. */
const GROW_BYTES = 8 * 1024;
const GROW_RATIO = 1.2;
const GROW_RATIO_MIN_BYTES = 2 * 1024;

if (!fs.existsSync(WIDGET_DIR)) {
  console.log('[bundle-budget] 못 돌림 — js/widgets 가 없다 (`node build.mjs` 먼저)');
  process.exit(0);
}

const sizes = {};
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) {
      const key = path.relative(WIDGET_DIR, full).split(path.sep).join('/');
      sizes[key] = zlib.gzipSync(fs.readFileSync(full)).length;
    }
  }
})(WIDGET_DIR);

const names = Object.keys(sizes).sort();
const total = names.reduce((sum, name) => sum + sizes[name], 0);
const kb = (n) => `${(n / 1024).toFixed(1)}KB`;

if (UPDATE) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(
    BASELINE,
    JSON.stringify({ note: 'gzip 바이트. audit-bundle-budget.mjs --update 로만 갱신한다.', at: new Date().toISOString(), sizes }, null, 1) + '\n',
    'utf8'
  );
  console.log(`[bundle-budget] 기준선 갱신 — ${names.length}개 · 합계 ${kb(total)}`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')).sizes || {} : null;
if (!baseline) {
  /* 기준선이 없으면 래칫은 「통과」가 아니라 **못 돌림**이다. 절대선만 본 결과를 그렇게 적는다. */
  console.log('[bundle-budget] 기준선 없음 — 래칫은 못 돌린다 (`--update` 로 한 번 박아라). 절대선만 본다.');
}

/* 위젯당 한계를 넘은 채 **이름이 적힌** 것들 — 조용한 면제가 아니라 갚을 빚으로 둔다.
 * 여기 없는 위젯이 한계를 넘으면 그 즉시 빨개진다(새 빚 유입 차단). 쪼개고 나면 줄을 지운다. */
const OVER_LIMIT_DEBT = {
  'tools/chain.js': 'TASK-KL-205 — 도구 사슬. 단계별 조각으로 쪼갤 것',
  'karmograph/karmograph.js': 'TASK-KL-202 — 캔버스. 그리기/편집 조각 분리할 것',
};

const fails = [];
for (const name of names) {
  const now = sizes[name];
  if (now > HARD_LIMIT && OVER_LIMIT_DEBT[name] === undefined) {
    fails.push(`${name} ${kb(now)} > 한계 ${kb(HARD_LIMIT)}`);
  }
  if (!baseline) continue;
  const was = baseline[name];
  if (was == null) continue; // 처음 보는 위젯 — 절대선만
  const grew = now - was;
  if (grew >= GROW_BYTES || (now >= was * GROW_RATIO && grew >= GROW_RATIO_MIN_BYTES)) {
    fails.push(`${name} ${kb(was)} → ${kb(now)} (+${kb(now - was)}, ${((now / was - 1) * 100).toFixed(0)}%)`);
  }
}
if (total > TOTAL_LIMIT) fails.push(`합계 ${kb(total)} > 한계 ${kb(TOTAL_LIMIT)}`);

const gone = baseline ? Object.keys(baseline).filter((n) => sizes[n] == null) : [];
const fresh = baseline ? names.filter((n) => baseline[n] == null) : [];

console.log(`[bundle-budget] 위젯 ${names.length}개 · gzip 합계 ${kb(total)}${baseline ? ` (기준선 ${Object.keys(baseline).length}개)` : ''}`);
if (fresh.length) console.log(`[bundle-budget] 새로 생긴 것 ${fresh.length}개 — ${fresh.slice(0, 5).join(', ')}${fresh.length > 5 ? ' …' : ''}`);
if (gone.length) console.log(`[bundle-budget] 사라진 것 ${gone.length}개 — ${gone.slice(0, 5).join(', ')}${gone.length > 5 ? ' …' : ''}`);

if (fails.length) {
  console.error('[bundle-budget] FAIL');
  for (const line of fails) console.error('  - ' + line);
  console.error('  고치거나, 의도한 증가면 `npm run audit:bundles -- --update` 로 기준선을 옮겨라(커밋에 남는다).');
  process.exit(1);
}
for (const [name, why] of Object.entries(OVER_LIMIT_DEBT)) {
  if (sizes[name] != null && sizes[name] > HARD_LIMIT) {
    console.log(`[bundle-budget] 갚을 빚 — ${name} ${kb(sizes[name])} (한계 ${kb(HARD_LIMIT)}): ${why}`);
  }
}
console.log('[bundle-budget] OK — 한계 넘은 것 없음(빚으로 적힌 것 제외), 기준선 대비 회귀 없음');
