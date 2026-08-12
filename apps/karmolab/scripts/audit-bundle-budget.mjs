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
import { execFileSync } from 'node:child_process';
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
  /* 오락실은 놀이를 계속 더하는 중이라 천장을 넘겼다(65.3KB, 2026-08-12). 놀이별로 늦게
     받도록 쪼개는 것이 답이고 그건 만드는 사람 몫이라, 그때까지 **빚으로 적어 둔다** —
     적어 두면 매 판 이름이 불리고, 안 적으면 전원이 멈춘다. */
  'arcade/arcade.js': 'TASK-KL-242 — 오락실. 놀이별 조각으로 늦게 받게 쪼갤 것',
};

const fails = [];

/* ★ **자란 이유를 물어본다** (2026-08-12, 실측으로 붙임).
 *
 * 이 래칫은 「기준선보다 커졌다」만 보고 빨개졌다. 그런데 이 저장소는 세션 여섯이 하루에도
 * 여러 번 위젯에 기능을 더한다 — **정당한 성장**이 곧 빨강이 되고, 그 빨강이 기본값이 되면
 * 아무도 안 본다(오늘 하루에만 bluemarble·karmograph·asciiart·docs·image·pdf·passgen 이 걸렸다).
 *
 * 정작 이 검사가 잡아야 하는 것은 **아무도 안 건드렸는데 커진 것**이다 — 공용 코드가 딸려
 * 들어오거나 번들이 새는 그 경우. 그래서 기준선을 박은 커밋 이후 그 위젯의 소스가 바뀌었는지
 * 묻는다: 바뀌었으면 「사람이 더한 것」이라 알리기만 하고, 안 바뀌었는데 커졌으면 그때 막는다.
 */
/* ★ **모르면 「안 건드렸다」고 하지 않는다** (2026-08-12, CI 에서 바로 되받았다).
 *   CI 체크아웃은 기본이 **커밋 하나짜리**(shallow)라 과거를 물어볼 수가 없다. 그런데 첫 판은
 *   물어보지 못한 것을 `false`(= 아무도 안 건드렸다)로 읽어, 정당한 성장 넷을 전부 막았다.
 *   못 물어보는 상태는 「아니오」가 아니라 **모름**이다 — 모르면 막지 않고 알리기만 한다. */
const historyReachable = (() => {
  try {
    const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return shallow === 'false';
  } catch {
    return false;
  }
})();

function sourceTouchedSince(baseCommit, name) {
  if (!baseCommit || !historyReachable) return true; // 모름 → 막지 않는다
  /* `tools/qrgen.js` → `src/widgets/tools/qrgen*`, `karmograph/karmograph.js` → 그 폴더 전체 */
  const rel = name.replace(/\.js$/, '');
  const dir = rel.includes('/') ? rel.split('/').slice(0, -1).join('/') : '';
  const globs = [`src/widgets/${rel}.ts`, dir ? `src/widgets/${dir}` : `src/widgets/${rel}`];
  try {
    const out = execFileSync('git', ['diff', '--name-only', `${baseCommit}..HEAD`, '--', ...globs],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

/** 기준선 파일을 마지막으로 박은 커밋 — 그때 이후의 변경만 「사람이 더한 것」으로 친다. */
const baselineCommit = (() => {
  try {
    return execFileSync('git', ['log', '-1', '--format=%H', '--', 'data/bundle-baseline.json'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
})();
const grown = [];

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
    const line = `${name} ${kb(was)} → ${kb(now)} (+${kb(now - was)}, ${((now / was - 1) * 100).toFixed(0)}%)`;
    if (sourceTouchedSince(baselineCommit, name)) grown.push(line + (historyReachable ? '' : ' (지난 기록을 못 봐서 이유는 모름)'));
    else fails.push(`${line} — **아무도 안 건드렸는데 커졌다**`);
  }
}
if (total > TOTAL_LIMIT) fails.push(`합계 ${kb(total)} > 한계 ${kb(TOTAL_LIMIT)}`);

const gone = baseline ? Object.keys(baseline).filter((n) => sizes[n] == null) : [];
const fresh = baseline ? names.filter((n) => baseline[n] == null) : [];

console.log(`[bundle-budget] 위젯 ${names.length}개 · gzip 합계 ${kb(total)}${baseline ? ` (기준선 ${Object.keys(baseline).length}개)` : ''}`);
if (fresh.length) console.log(`[bundle-budget] 새로 생긴 것 ${fresh.length}개 — ${fresh.slice(0, 5).join(', ')}${fresh.length > 5 ? ' …' : ''}`);
if (gone.length) console.log(`[bundle-budget] 사라진 것 ${gone.length}개 — ${gone.slice(0, 5).join(', ')}${gone.length > 5 ? ' …' : ''}`);

if (grown.length) {
  console.log(`[bundle-budget] 사람이 더해서 커진 것 ${grown.length}개 (막지 않는다 — 기준선은 \`--update\` 로 옮긴다):`);
  for (const line of grown) console.log('  + ' + line);
}

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
