/**
 * 성능 계기판 (TASK-KL-201) — 개발용. 재는 곳은 `src/perf.ts`, 여기는 **보여 주기만** 한다.
 *
 * 왜 나눴나: 재는 자리가 화면 안에 있으면 그 화면을 열어야만 재진다. 그러면 「열기 전」 —
 * 부팅과 첫 위젯 — 이 영영 안 잡힌다. 정작 느린 건 거기다. 그래서 계측은 셸과 함께 늘 돌고,
 * 이 화면은 이미 쌓인 것을 읽어서 그린다.
 *
 * 이 화면이 답해야 하는 질문 넷:
 *   ① 부팅 어디서 시간이 갔나  ② 어느 위젯이 무겁나(받는 양·받는 시간·그리는 시간)
 *   ③ 지금 프레임이 도나       ④ 지난 판보다 빨라졌나
 *
 * **못 잰 자리는 못 쟀다고 적는다.** 서비스 워커가 준 응답은 크기가 안 오고, 크롬 밖에서는
 * 메모리와 긴 작업을 못 잰다. 그 자리에 0 을 적으면 「아주 좋다」로 읽혀서 고칠 것을 못 찾는다.
 */
import { t, loadNamespace, locale } from '../../lib/i18n';

(function (): void {
  const esc = (v: unknown): string =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const ID = 'perf';


  /** 못 잰 것은 「—」. 0 으로 적으면 아주 빠른 것으로 읽힌다. */
  function ms(value: unknown, digits = 0): string {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    return `${value.toFixed(digits)}ms`;
  }

  function kb(bytes: unknown): string {
    if (typeof bytes !== 'number' || !isFinite(bytes)) return '—';
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)}MB`;
    return `${(bytes / 1024).toFixed(1)}KB`;
  }

  function shortUrl(url: string): string {
    try {
      return new URL(url).pathname.replace('/apps/karmolab/', '');
    } catch {
      return url;
    }
  }

  /** 값이 클수록 나쁜 지표에 붙이는 색 — 눈으로 훑을 때 표를 다 읽지 않아도 걸린다. */
  function tone(value: number | null, warn: number, bad: number): string {
    if (value == null) return '';
    if (value >= bad) return ' data-tone="bad"';
    if (value >= warn) return ' data-tone="warn"';
    return ' data-tone="ok"';
  }

  interface Snap {
    takenAt: string;
    sinceOpenMs: number;
    build: { tag: string; commit: string };
    device: Record<string, unknown>;
    nav: Record<string, number | null>;
    paint: { fcp: number | null; lcp: number | null };
    memory: { usedMb: number; limitMb: number } | null;
    trust: { ok: boolean; why: string };
    verdict: Array<{
      key: string; label: string; value: number | null; limit: number; unit: string;
      state: 'pass' | 'fail' | 'unknown';
    }>;
    inp: number | null;
    interactions: Array<{
      name: string; at: number; ms: number; inputDelayMs: number;
      processingMs: number; presentationMs: number; target: string;
    }> | null;
    marks: Array<{ name: string; at: number }>;
    widgets: Array<{
      id: string; loadMs: number | null; firstBuildMs: number | null; lastBuildMs: number | null;
      builds: number; scripts: string[]; bytes: number | null; scriptMs: number | null;
    }>;
    presentationFloorMs: number | null;
    cls: number | null;
    shiftCulprits: Array<{ who: string; value: number; count: number }> | null;
    buildStats: Array<{
      build: string; commit: string; n: number;
      readyP50: number | null; readyP75: number | null; lcpP50: number | null; lastAt: string;
    }>;
    hosts: Array<{ host: string; count: number; bytes: number | null; ms: number; ours: boolean }>;
    unused: { bytes: number | null; rows: Array<{ id: string; bytes: number | null; atBoot: boolean }> };
    resources: Array<{
      url: string; kind: string; ms: number; bytes: number | null; transferred: number | null;
      dnsMs: number | null; connectMs: number | null; waitMs: number | null; downloadMs: number | null;
      blocking: string; delivery: string; from: string;
    }>;
    longTasks: Array<{ at: number; ms: number; from: string }> | null;
    slowFrames: Array<{
      at: number; ms: number; blockingMs: number; renderMs: number;
      scripts: Array<{ source: string; fn: string; invoker: string; ms: number; forcedLayoutMs: number }>;
    }> | null;
    culprits: Array<{ who: string; invoker: string; ms: number; forcedLayoutMs: number; frames: number }> | null;
    boots: Array<Record<string, unknown>>;
  }

  Mdd.injectCSS(
    'perf-page',
    `
        .pf-wrap { display:flex; flex-direction:column; gap:22px; }
        .pf-lead { margin:0; font-size:var(--font-size-sm); color:var(--text-secondary); line-height:1.6; }
        .pf-bar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
        .pf-btn { padding:6px 12px; border:1px solid var(--border); border-radius:var(--radius-md);
            background:var(--bg-secondary); color:var(--text-primary); font-size:var(--font-size-xs);
            cursor:pointer; font-family:inherit; }
        .pf-btn:hover { border-color:var(--accent); }
        .pf-stamp { margin-left:auto; font-size:11px; color:var(--text-tertiary);
            font-family:var(--font-mono); }
        .pf-cards { display:flex; flex-wrap:wrap; gap:12px; }
        .pf-card { flex:1 1 150px; min-width:140px; padding:12px 14px; border:1px solid var(--border);
            border-radius:var(--radius-lg); background:var(--bg-secondary); }
        .pf-card-name { font-size:11px; color:var(--text-tertiary); margin-bottom:5px; }
        .pf-card-value { font-size:18px; font-weight:700; color:var(--text-primary);
            font-variant-numeric:tabular-nums; }
        .pf-card-note { font-size:11px; color:var(--text-tertiary); margin-top:4px; }
        .pf-sec-title { margin:0 0 4px; font-size:var(--font-size-md); font-weight:700; color:var(--text-primary); }
        .pf-sec-note { margin:0 0 10px; font-size:11px; color:var(--text-tertiary); line-height:1.6; }
        .pf-scroll { overflow-x:auto; }
        .pf-table { width:100%; border-collapse:collapse; font-size:var(--font-size-xs);
            font-variant-numeric:tabular-nums; }
        .pf-table th { text-align:right; padding:6px 8px; color:var(--text-tertiary); font-weight:600;
            border-bottom:1px solid var(--border); white-space:nowrap; }
        .pf-table th:first-child, .pf-table td:first-child { text-align:left; }
        .pf-table td { text-align:right; padding:5px 8px; border-bottom:1px solid var(--border);
            color:var(--text-secondary); white-space:nowrap; }
        .pf-table td:first-child { color:var(--text-primary); font-family:var(--font-mono); }
        .pf-table tbody tr:hover { background:var(--bg-tertiary); }
        .pf-table td[data-tone="warn"] { color:#b45309; font-weight:600; }
        .pf-table td[data-tone="bad"] { color:#b91c1c; font-weight:700; }
        html[data-theme="dark"] .pf-table td[data-tone="warn"] { color:#fcd34d; }
        html[data-theme="dark"] .pf-table td[data-tone="bad"] { color:#fca5a5; }
        .pf-fall { display:flex; flex-direction:column; gap:4px; }
        .pf-fall-row { display:grid; grid-template-columns:130px 1fr 62px; gap:8px; align-items:center;
            font-size:11px; }
        .pf-fall-name { color:var(--text-secondary); font-family:var(--font-mono); }
        .pf-fall-track { height:12px; background:var(--bg-tertiary); border-radius:999px; position:relative;
            overflow:hidden; }
        .pf-fall-fill { position:absolute; top:0; bottom:0; background:var(--accent); opacity:.75;
            border-radius:999px; min-width:2px; }
        .pf-fall-val { text-align:right; color:var(--text-tertiary); font-variant-numeric:tabular-nums; }
        .pf-none { padding:12px 14px; border:1px dashed var(--border); border-radius:var(--radius-lg);
            font-size:var(--font-size-xs); color:var(--text-secondary); line-height:1.6; }
        .pf-sort { background:none; border:0; padding:0; font:inherit; font-size:11px;
            color:var(--text-tertiary); cursor:pointer; }
        .pf-sort[data-on="1"] { color:var(--accent); font-weight:700; }
    `
  );

  type WidgetSort = 'bytes' | 'loadMs' | 'firstBuildMs' | 'builds';

  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta(ID),
    tabs: [
      {
        id: 'app',
        label: t('perf.t106', undefined, "성능 계기판"),
        build(container: HTMLElement): void {
          void loadNamespace('perf').then(function () {

          const perf = window.KLPerf;

          /* 계측기가 안 실린 판이면 **표를 0 으로 채우지 않는다** — 「전부 0ms」는 아주 빠른
             것처럼 보여서, 없는 편보다 나쁘다. 왜 못 재는지를 적고 끝낸다. */
          if (!perf) {
            container.innerHTML = `
              <div class="pf-none">
                <strong>${esc(t('perf.t01'))}</strong><br>
                ${t('perf.noProbe', {
                  file: '<code>js/perf.js</code>',
                  shell: '<code>index.html</code>',
                  cmd: '<code>npm run build</code>',
                })}
              </div>`;
            return;
          }

          let widgetSort: WidgetSort = 'bytes';
          let frameLine = '';
          /**
           * 「안 열어도 아는」 전체 위젯 무게 (TASK-KL-201 ⑪).
           *
           * 브라우저는 **받은 것만** 안다 — 이 세션에서 안 연 위젯 200여 개는 계기판에 없다.
           * 빌드가 재 둔 기준선(`data/bundle-baseline.json`, gzip)을 읽어 그 빈자리를 메운다.
           * 못 읽으면 「없다」가 아니라 **못 읽었다**고 적는다(파일이 없는 판일 수 있다).
           */
          let allSizes: Record<string, number> | null = null;
          let allSizesState: 'loading' | 'ok' | 'fail' = 'loading';

          /**
           * 안 쓰는 스타일 지도 (TASK-KL-201 ㉒).
           *
           * 「이 줄이 실행됐나」는 브라우저가 페이지에 안 알려 준다 — 개발자 도구 전용 통로다.
           * 그래서 CI(`npm run audit:coverage`)가 재서 파일로 남기고, 이 화면은 그것을 읽는다.
           * **로그에만 있는 사실은 없는 것과 비슷하다** — 사람이 볼 자리가 있어야 고쳐진다.
           */
          interface CoverageBaseline {
            at?: string;
            totals?: { cssUnused: number | null; cssTotal: number | null };
            viewports?: string[];
            sections?: Array<{ title: string; total: number; per: Record<string, number> }> | null;
          }
          let coverage: CoverageBaseline | null = null;
          let coverageState: 'loading' | 'ok' | 'fail' = 'loading';

          /**
           * **진짜 사람들** 기기의 분포 (TASK-KL-201 후속).
           *
           * 이 화면의 다른 숫자는 전부 「지금 이 기기」다 — 만든 사람 기계에서 잰 값이라
           * 현실과 다를 수 있다. 서버가 사람들 판을 칸으로 모으고 있으니 그것을 나란히 놓는다.
           * 칸으로 센 값이라 정확한 ms 가 아니라 **칸의 위 경계**다. 그 사실을 적어 둔다.
           */
          interface RealWorld {
            samples?: number;
            metrics?: Record<string, { p50: number | null; p75: number | null; n: number }>;
          }
          let real: RealWorld | null = null;
          let realState: 'loading' | 'ok' | 'fail' = 'loading';

          container.innerHTML = `
            <div class="pf-wrap">
              <p class="pf-lead">
                ${t('perf.lead', {
                  where: '<code>src/perf.ts</code>',
                  measured: `<b>${esc(t('perf.t07'))}</b>`,
                  dash: '<b>—</b>',
                })}
              </p>
              <div class="pf-bar">
                <button type="button" class="pf-btn" data-act="refresh">${esc(t('perf.t10'))}</button>
                <button type="button" class="pf-btn" data-act="frame3">${esc(t('perf.t11'))}</button>
                <button type="button" class="pf-btn" data-act="frame10">${esc(t('perf.t12'))}</button>
                <button type="button" class="pf-btn" data-act="copy">${esc(t('perf.t13'))}</button>
                <button type="button" class="pf-btn" data-act="clear">${esc(t('perf.t14'))}</button>
                <span class="pf-stamp" id="pfStamp"></span>
              </div>
              <div id="pfBody"></div>
            </div>`;

          const body = container.querySelector('#pfBody') as HTMLElement;
          const stamp = container.querySelector('#pfStamp') as HTMLElement;

          function summary(snap: Snap): string {
            const ready = snap.marks.find((m) => m.name === 'shell:ready');
            const jsBytes = snap.resources
              .filter((r) => r.kind === 'widget' || r.kind === 'shell' || r.kind === 'vendor')
              .reduce((sum, r) => sum + (r.bytes || 0), 0);
            const jsUnknown = snap.resources.filter(
              (r) => (r.kind === 'widget' || r.kind === 'shell' || r.kind === 'vendor') && r.bytes == null
            ).length;
            const longSum = snap.longTasks ? snap.longTasks.reduce((s, t) => s + t.ms, 0) : null;
            const cards: Array<[string, string, string]> = [
              [t('perf.t107'), ms(ready?.at), t('perf.t108')],
              [t('perf.t109'), ms(snap.paint.fcp), t('perf.t110')],
              [t('perf.t111'), ms(snap.paint.lcp), t('perf.t112')],
              [
                t('perf.t113'),
                kb(jsBytes),
                jsUnknown ? t('perf.jsUnknown', { n: jsUnknown }) : t('perf.t114'),
              ],
              [
                t('perf.t115'),
                longSum == null ? t('perf.t116') : ms(longSum),
                longSum == null ? t('perf.t117') : t('perf.longTaskNote', { n: snap.longTasks!.length }),
              ],
              [
                /* 「만질 때 굼뜨나」 — 개발용 계기판에서 부팅만큼 중요한데 여태 없던 축.
                   200ms 를 넘으면 사람이 「눌렀는데 안 먹었나?」 하고 한 번 더 누른다. */
                t('perf.t118'),
                snap.inp == null ? (snap.interactions == null ? t('perf.t116') : t('perf.t119')) : ms(snap.inp),
                snap.interactions == null
                  ? t('perf.t117')
                  : t('perf.inpNote', { n: snap.interactions.length }),
              ],
              [
                t('perf.t120'),
                snap.cls == null ? t('perf.t116') : snap.cls.toFixed(3),
                snap.cls == null ? t('perf.t117') : t('perf.t121'),
              ],
              [
                t('perf.t122'),
                snap.memory ? `${snap.memory.usedMb.toFixed(0)}MB` : t('perf.t116'),
                snap.memory ? t('perf.memLimit', { mb: snap.memory.limitMb.toFixed(0) }) : t('perf.t123'),
              ],
            ];
            return `<div class="pf-cards">${cards
              .map(
                ([name, value, note]) => `
                  <div class="pf-card">
                    <div class="pf-card-name">${esc(name)}</div>
                    <div class="pf-card-value">${esc(value)}</div>
                    <div class="pf-card-note">${esc(note)}</div>
                  </div>`
              )
              .join('')}</div>`;
          }

          function waterfall(snap: Snap): string {
            const rows: Array<[string, number | null]> = [
              [t('perf.t124'), snap.nav.ttfb],
              [t('perf.t125'), snap.nav.domInteractive],
              [t('perf.t109'), snap.paint.fcp],
              ...snap.marks.map((m) => [m.name, m.at] as [string, number]),
              [t('perf.t111'), snap.paint.lcp],
              [t('perf.t126'), snap.nav.load],
            ];
            const known = rows.filter((r) => typeof r[1] === 'number') as Array<[string, number]>;
            known.sort((a, b) => a[1] - b[1]);
            const max = known.length ? known[known.length - 1][1] : 1;
            if (!known.length) return t('perf.t127');
            return `<div class="pf-fall">${known
              .map(
                ([name, at]) => `
                  <div class="pf-fall-row">
                    <span class="pf-fall-name">${esc(name)}</span>
                    <span class="pf-fall-track"><span class="pf-fall-fill" style="left:0;width:${
                      Math.max(1, (at / max) * 100)
                    }%"></span></span>
                    <span class="pf-fall-val">${ms(at)}</span>
                  </div>`
              )
              .join('')}</div>`;
          }

          function widgetTable(snap: Snap): string {
            const rows = snap.widgets.slice();
            rows.sort((a, b) => (Number(b[widgetSort] ?? -1) || -1) - (Number(a[widgetSort] ?? -1) || -1));
            if (!rows.length) {
              return `<div class="pf-none">${t('perf.noWidgets', {
                again: `<b>${esc(t('perf.t10'))}</b>`,
              })}</div>`;
            }
            const head = (key: WidgetSort, label: string): string =>
              `<th><button type="button" class="pf-sort" data-sort="${key}" data-on="${
                widgetSort === key ? '1' : '0'
              }">${esc(label)}</button></th>`;
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr>
                <th>${esc(t('perf.t17'))}</th>
                ${head('bytes', t('perf.t22'))}
                <th>${esc(t('perf.t18'))}</th>
                ${head('loadMs', t('perf.t128'))}
                ${head('firstBuildMs', t('perf.t129'))}
                <th>${esc(t('perf.t19'))}</th>
                ${head('builds', t('perf.t130'))}
              </tr></thead>
              <tbody>${rows
                .map(
                  (row) => `<tr>
                    <td>${esc(row.id)}</td>
                    <td${tone(row.bytes, 60000, 150000)}>${kb(row.bytes)}</td>
                    <td>${ms(row.scriptMs)}</td>
                    <td${tone(row.loadMs, 150, 400)}>${ms(row.loadMs)}</td>
                    <td${tone(row.firstBuildMs, 16, 50)}>${ms(row.firstBuildMs, 1)}</td>
                    <td>${ms(row.lastBuildMs, 1)}</td>
                    <td>${row.builds}</td>
                  </tr>`
                )
                .join('')}</tbody></table></div>`;
          }

          function heavyFiles(snap: Snap): string {
            const rows = snap.resources
              .filter((r) => r.bytes != null)
              .sort((a, b) => (b.bytes || 0) - (a.bytes || 0))
              .slice(0, 15);
            const cached = snap.resources.filter((r) => r.transferred === 0).length;
            if (!rows.length) return t('perf.t131');
            const blockers = snap.resources.filter((r) => r.blocking === 'blocking').length;
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>${esc(t('perf.t20'))}</th><th>${esc(t('perf.t21'))}</th><th>${esc(t('perf.t22'))}</th><th>${esc(t('perf.t23'))}</th><th>${esc(t('perf.t24'))}</th><th>${esc(t('perf.t25'))}</th><th>${esc(t('perf.t26'))}</th><th>${esc(t('perf.t27'))}</th><th>${esc(t('perf.t28'))}</th></tr></thead>
              <tbody>${rows
                .map(
                  (row) => `<tr>
                    <td>${esc(shortUrl(row.url))}</td>
                    <td>${esc(row.kind)}</td>
                    <td${tone(row.bytes, 60000, 150000)}>${kb(row.bytes)}</td>
                    <td>${ms(row.ms)}</td>
                    <td>${ms(row.dnsMs)}</td>
                    <td>${ms(row.connectMs)}</td>
                    <td${tone(row.waitMs, 100, 300)}>${ms(row.waitMs)}</td>
                    <td>${ms(row.downloadMs)}</td>
                    <td>${row.blocking === 'blocking' ? t('perf.t132') : row.transferred === 0 ? t('perf.t133') : ''}</td>
                  </tr>`
                )
                .join('')}</tbody></table></div>
              <p class="pf-sec-note">${t('perf.resNote', {
                total: snap.resources.length,
                cached,
                blockers,
              })}
                ${t('perf.resTaoNote', {
                  other: `<b>${esc(t('perf.t29'))}</b>`,
                  header: '<code>Timing-Allow-Origin</code>',
                })}</p>`;
          }

          /**
           * 조작 하나가 왜 굼떴나 — 셋 중 누구 탓인가 (TASK-KL-201 ②).
           * 대기가 크면 **다른 코드**가, 처리가 크면 **내 핸들러**가, 표시가 크면 **그리는 비용**이 범인.
           */
          function interactionTable(snap: Snap): string {
            if (snap.interactions == null) {
              return t('perf.t134');
            }
            if (!snap.interactions.length) {
              return t('perf.t135');
            }
            const rows = snap.interactions.slice(0, 12);
            /* 「표시 40ms = 느리다」는 틀린 판정이다 — 핸들러가 하나도 없는 빈 클릭도 이 환경에선
               24~48ms 가 걸렸다(실측, LoAF 0건). 그래서 **하한을 넘은 만큼**만 빨갛게 칠한다. */
            const floor = snap.presentationFloorMs;
            const overFloor = (value: number): number | null => (floor == null ? value : Math.max(0, value - floor));
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>${esc(t('perf.t32'))}</th><th>${esc(t('perf.t21'))}</th><th>${esc(t('perf.t33'))}</th><th>${esc(t('perf.t34'))}</th><th>${esc(t('perf.t35'))}</th><th>${esc(t('perf.t36'))}</th><th>${esc(t('perf.t37'))}</th></tr></thead>
              <tbody>${rows
                .map(
                  (row) => `<tr>
                    <td>${esc(row.target || t('perf.unknownValue'))}</td>
                    <td>${esc(row.name)}</td>
                    <td>${ms(row.at)}</td>
                    <td${tone(row.ms, 200, 500)}>${ms(row.ms)}</td>
                    <td${tone(row.inputDelayMs, 50, 150)}>${ms(row.inputDelayMs)}</td>
                    <td${tone(row.processingMs, 50, 150)}>${ms(row.processingMs)}</td>
                    <td${tone(overFloor(row.presentationMs), 50, 150)}>${ms(row.presentationMs)}</td>
                  </tr>`
                )
                .join('')}</tbody></table></div>
              <p class="pf-sec-note">${
                floor == null
                  ? t('perf.t136')
                  : t('perf.floorNote', { floor: `<b>${ms(floor)}</b>`, over: `<b>${esc(t('perf.t39'))}</b>` })
              }</p>`;
          }

          /**
           * 늦은 프레임의 **범인** (TASK-KL-201 ③ — LoAF).
           * 긴 작업 표는 「언제 얼마나」까지고, 이 표는 「어느 파일의 어느 함수가」다.
           */
          function culpritTable(snap: Snap): string {
            if (snap.culprits == null) {
              return t('perf.t137');
            }
            if (!snap.culprits.length) {
              return t('perf.t138');
            }
            const rows = snap.culprits.slice(0, 12);
            const frames = snap.slowFrames || [];
            const worst = frames.length ? frames[0] : null;
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>${esc(t('perf.t40'))}</th><th>${esc(t('perf.t41'))}</th><th>${esc(t('perf.t23'))}</th><th>${esc(t('perf.t42'))}</th><th>${esc(t('perf.t43'))}</th></tr></thead>
              <tbody>${rows
                .map(
                  (row) => `<tr>
                    <td>${esc(row.who)}</td>
                    <td>${esc(row.invoker || '—')}</td>
                    <td${tone(row.ms, 100, 300)}>${ms(row.ms)}</td>
                    <td${tone(row.forcedLayoutMs, 10, 40)}>${ms(row.forcedLayoutMs)}</td>
                    <td>${row.frames}</td>
                  </tr>`
                )
                .join('')}</tbody></table></div>
              ${
                worst
                  ? `<p class="pf-sec-note">${t('perf.worstFrame', {
                      worst: ms(worst.ms),
                      blocking: ms(worst.blockingMs),
                      render: ms(worst.renderMs),
                      n: frames.length,
                    })}
                       ${t('perf.forcedLayout', { what: `<b>${esc(t('perf.t42'))}</b>` })}</p>`
                  : ''
              }`;
          }

          /**
           * 받았는데 한 번도 안 그린 코드 (TASK-KL-201 ⑫ — DevTools 「Coverage」 자리).
           * 브라우저는 「이 줄이 실행됐나」를 페이지에 안 알려 준다 → 우리가 아는 것으로 근사한다.
           */
          function unusedTable(snap: Snap): string {
            const rows = snap.unused.rows;
            if (!rows.length) return t('perf.t139');
            const boot = rows.filter((r) => r.atBoot);
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>${esc(t('perf.t17'))}</th><th>${esc(t('perf.t45'))}</th><th>${esc(t('perf.t46'))}</th></tr></thead>
              <tbody>${rows
                .slice(0, 10)
                .map(
                  (row) => `<tr>
                    <td>${esc(row.id)}</td>
                    <td${row.atBoot ? tone(row.bytes, 5000, 20000) : ''}>${kb(row.bytes)}</td>
                    <td>${row.atBoot ? t('perf.t49') : t('perf.t140')}</td>
                  </tr>`
                )
                .join('')}</tbody></table></div>
              <p class="pf-sec-note">${t('perf.unusedNote', { n: rows.length, size: kb(snap.unused.bytes) })}
                ${t('perf.unusedWhy', {
                  onDemand: `<b>${esc(t('perf.t47'))}</b>`,
                  atBoot: `<b>${esc(t('perf.t49'))}</b>`,
                  count: boot.length ? t('perf.unusedBootCount', { n: boot.length }) : t('perf.t141'),
                })}</p>`;
          }

          /** 전체 위젯 무게 — 이 세션에서 안 연 것까지 (TASK-KL-201 ⑪). */
          function allWidgetTable(snap: Snap): string {
            if (allSizesState === 'loading') return t('perf.t142');
            if (allSizesState === 'fail' || !allSizes) {
              return t('perf.t143');
            }
            const opened = new Set(snap.widgets.map((w) => w.id));
            const rows = Object.entries(allSizes).sort((a, b) => b[1] - a[1]);
            const total = rows.reduce((sum, [, bytes]) => sum + bytes, 0);
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>${esc(t('perf.t50'))}</th><th>gzip</th><th>${esc(t('perf.t51'))}</th></tr></thead>
              <tbody>${rows
                .slice(0, 15)
                .map(([name, bytes]) => {
                  const id = name.replace(/\.js$/, '').split('/')[0];
                  return `<tr>
                    <td>${esc(name)}</td>
                    <td${tone(bytes, 24 * 1024, 48 * 1024)}>${kb(bytes)}</td>
                    <td>${opened.has(id) || opened.has(name.replace(/\.js$/, '')) ? t('perf.t144') : ''}</td>
                  </tr>`;
                })
                .join('')}</tbody></table></div>
              <p class="pf-sec-note">${t('perf.bundleTotal', {
                n: rows.length,
                size: `<b>${kb(total)}</b>`,
                cached: `<b>${esc(t('perf.t53'))}</b>`,
                cmd: '<code>npm run audit:bundles</code>',
              })}</p>`;
          }

          /** 진짜 사람들 분포 — 내 기계 옆에 현실을 놓는다. */
          function realWorldTable(snap: Snap): string {
            if (realState === 'loading') return t('perf.t145');
            if (realState === 'fail' || !real?.metrics) {
              return t('perf.t146');
            }
            if (!real.samples) {
              return t('perf.t147');
            }
            const NAMES: Array<[string, string]> = [
              ['ready', t('perf.t107')],
              ['fcp', t('perf.t89')],
              ['lcp', t('perf.t90')],
              ['inp', t('perf.t148')],
              ['ttfb', t('perf.t124')],
              ['cls', t('perf.t149')],
            ];
            const mine: Record<string, number | null> = {
              ready: snap.marks.find((m) => m.name === 'shell:ready')?.at ?? null,
              fcp: snap.paint.fcp,
              lcp: snap.paint.lcp,
              inp: snap.inp,
              ttfb: snap.nav.ttfb,
              cls: snap.cls,
            };
            const show = (key: string, value: number | null): string => {
              if (value == null) return '—';
              return key === 'cls' ? (value / 1000).toFixed(3) : ms(value);
            };
            const showMine = (key: string, value: number | null): string => {
              if (value == null) return '—';
              return key === 'cls' ? value.toFixed(3) : ms(value);
            };
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>${esc(t('perf.t56'))}</th><th>${esc(t('perf.t57'))}</th><th>${esc(t('perf.t58'))}</th><th>${esc(t('perf.t59'))}</th><th>${esc(t('perf.t60'))}</th></tr></thead>
              <tbody>${NAMES.map(([key, label]) => {
                const m = real!.metrics![key];
                if (!m) return '';
                return `<tr>
                  <td>${esc(label)}</td>
                  <td>${show(key, m.p50)}</td>
                  <td>${show(key, m.p75)}</td>
                  <td${m.n < 20 ? ' data-tone="warn"' : ''}>${m.n}${m.n < 20 ? t('perf.t150') : ''}</td>
                  <td>${showMine(key, mine[key])}</td>
                </tr>`;
              }).join('')}</tbody></table></div>
              <p class="pf-sec-note">${t('perf.realNote', { bound: `<b>${esc(t('perf.t62'))}</b>` })}</p>`;
          }

          /** 안 쓰는 스타일 — CI 가 재 둔 것을 읽어 보여 준다 (TASK-KL-201 ㉒). */
          function coverageTable(): string {
            if (coverageState === 'loading') return t('perf.t151');
            if (coverageState === 'fail' || !coverage?.sections) {
              return t('perf.t152');
            }
            const views = coverage.viewports || [];
            const totals = coverage.totals;
            const when = coverage.at ? new Date(coverage.at) : null;
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>${esc(t('perf.t64'))}</th>${views.map((v) => `<th>${esc(v)}</th>`).join('')}<th>${esc(t('perf.t65'))}</th></tr></thead>
              <tbody>${coverage.sections
                .slice(0, 10)
                .map(
                  (row) => `<tr>
                    <td>${esc(row.title)}</td>
                    ${views.map((v) => `<td${tone(row.per[v] ?? 0, 5000, 15000)}>${kb(row.per[v] ?? 0)}</td>`).join('')}
                    <td>${kb(row.total)}</td>
                  </tr>`
                )
                .join('')}</tbody></table></div>
              <p class="pf-sec-note">
                ${
                  totals?.cssUnused != null
                    ? t('perf.cssUnused', {
                        unused: `<b>${kb(totals.cssUnused)} / ${kb(totals.cssTotal)}</b>`,
                      }) + ' '
                    : ''
                }
                <b>${esc(t('perf.t66'))}</b> 뒤로 뺄 후보입니다 — 한쪽만이면 그 폭에서 쓰는 것입니다.
                ⚠ 이 숫자만 보고 빼면 안 됩니다: 쓰임 0%인데 자리를 잡는 구역이 있습니다(실측으로 밀림이 0.011→0.636 이 된 적이 있습니다).
                ${
                  when
                    ? t('perf.measuredAt', {
                        when: esc(when.toLocaleString(locale(), { hour12: false })),
                        what: `<b>${esc(t('perf.t67'))}</b>`,
                      })
                    : ''
                }
              </p>`;
          }

          /** 도메인별 — 「남의 것이 우리 것보다 무겁나」 (TASK-KL-201 ⑤). */
          function hostTable(snap: Snap): string {
            if (!snap.hosts.length) return t('perf.t153');
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>${esc(t('perf.t68'))}</th><th>${esc(t('perf.t69'))}</th><th>${esc(t('perf.t22'))}</th><th>${esc(t('perf.t70'))}</th></tr></thead>
              <tbody>${snap.hosts
                .slice(0, 10)
                .map(
                  (row) => `<tr>
                    <td>${esc(row.host)}${row.ours ? '' : t('perf.t154')}</td>
                    <td>${row.count}</td>
                    <td${tone(row.bytes, 300000, 800000)}>${kb(row.bytes)}</td>
                    <td>${ms(row.ms)}</td>
                  </tr>`
                )
                .join('')}</tbody></table></div>`;
          }

          function longTasks(snap: Snap): string {
            if (snap.longTasks == null) {
              return t('perf.t155');
            }
            if (!snap.longTasks.length) {
              return t('perf.t156');
            }
            const rows = snap.longTasks.slice().sort((a, b) => b.ms - a.ms).slice(0, 15);
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>${esc(t('perf.t71'))}</th><th>${esc(t('perf.t72'))}</th><th>${esc(t('perf.t68'))}</th></tr></thead>
              <tbody>${rows
                .map(
                  (row) => `<tr>
                    <td>${ms(row.at)}</td>
                    <td${tone(row.ms, 100, 250)}>${ms(row.ms)}</td>
                    <td>${esc(row.from || t('perf.unknownValue'))}</td>
                  </tr>`
                )
                .join('')}</tbody></table></div>`;
          }

          /** 무엇이 화면을 밀었나 (TASK-KL-201 ⑥). */
          function shiftTable(snap: Snap): string {
            if (snap.shiftCulprits == null) {
              return t('perf.t157');
            }
            if (!snap.shiftCulprits.length) {
              return t('perf.t158');
            }
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>${esc(t('perf.t73'))}</th><th>${esc(t('perf.t74'))}</th><th>${esc(t('perf.t75'))}</th></tr></thead>
              <tbody>${snap.shiftCulprits
                .slice(0, 10)
                .map(
                  (row) => `<tr>
                    <td>${esc(row.who)}</td>
                    <td${tone(row.value, 0.05, 0.1)}>${row.value.toFixed(4)}</td>
                    <td>${row.count}</td>
                  </tr>`
                )
                .join('')}</tbody></table></div>
              <p class="pf-sec-note">${t('perf.clsNote', { window: `<b>${esc(t('perf.t77'))}</b>` })}</p>`;
          }

          /** 판별 분포 — 한 번 재고 「빨라졌다」는 말은 못 한다 (TASK-KL-201 ⑦). */
          function buildStatsTable(snap: Snap): string {
            if (!snap.buildStats.length) {
              return t('perf.t159');
            }
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>${esc(t('perf.t79'))}</th><th>${esc(t('perf.t80'))}</th><th>${esc(t('perf.t81'))}</th><th>${esc(t('perf.t82'))}</th><th>${esc(t('perf.t83'))}</th><th>${esc(t('perf.t84'))}</th></tr></thead>
              <tbody>${snap.buildStats
                .slice(0, 8)
                .map(
                  (row) => `<tr>
                    <td>${esc(row.build.slice(0, 8))}</td>
                    <td>${esc(row.commit || '—')}</td>
                    <td${row.n < 3 ? ' data-tone="warn"' : ''}>${row.n}${row.n < 3 ? t('perf.t150') : ''}</td>
                    <td${tone(row.readyP50, 1200, 2500)}>${ms(row.readyP50)}</td>
                    <td${tone(row.readyP75, 1500, 3000)}>${ms(row.readyP75)}</td>
                    <td>${ms(row.lcpP50)}</td>
                  </tr>`
                )
                .join('')}</tbody></table></div>
              <p class="pf-sec-note">${t('perf.sampleNote', { trust: `<b>${esc(t('perf.t86'))}</b>` })}</p>`;
          }

          function boots(snap: Snap): string {
            const rows = snap.boots.slice().reverse().slice(0, 12);
            if (!rows.length) {
              return t('perf.t160');
            }
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>${esc(t('perf.t33'))}</th><th>${esc(t('perf.t79'))}</th><th>${esc(t('perf.t80'))}</th><th>${esc(t('perf.t88'))}</th><th>${esc(t('perf.t89'))}</th><th>${esc(t('perf.t90'))}</th><th>${esc(t('perf.t91'))}</th><th>${esc(t('perf.t92'))}</th></tr></thead>
              <tbody>${rows
                .map((row) => {
                  const at = new Date(String(row.at));
                  const pad = (n: number): string => String(n).padStart(2, '0');
                  /* `toLocaleString` 은 「8. 9. 13시 19분 31초」로 나온다 — 표에서 자리가 들쭉날쭉해
                     세로로 안 읽힌다. 여기선 줄끼리 비교하는 게 목적이라 고정폭으로 적는다. */
                  const when = isNaN(at.getTime())
                    ? '—'
                    : `${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
                  /* 못 믿을 줄에 표를 단다 — 지우지는 않는다. 사라지면 「왜 이 판만 기록이
                     없지」가 되고, 그 자체가 또 다른 오해가 된다. */
                  const flag = row.trusted === false ? ` ⚠` : '';
                  return `<tr title="${esc(row.untrustedWhy || '')}">
                    <td>${esc(when)}${flag}</td>
                    <td>${esc(String(row.build || '—').slice(0, 8))}</td>
                    <td>${esc(row.commit || '—')}</td>
                    <td>${ms(row.ttfb)}</td>
                    <td>${ms(row.fcp)}</td>
                    <td>${ms(row.lcp)}</td>
                    <td${tone(typeof row.ready === 'number' ? row.ready : null, 1200, 2500)}>${ms(row.ready)}</td>
                    <td>${row.longTaskMs == null ? t('perf.t116') : ms(row.longTaskMs)}</td>
                  </tr>`;
                })
                .join('')}</tbody></table></div>`;
          }

          function deviceTable(snap: Snap): string {
            const dev = snap.device;
            return `<div class="pf-scroll"><table class="pf-table"><tbody>
                  <tr><td>${esc(t('perf.t93'))}</td><td>${esc(dev.cores ?? t('perf.t161'))}</td></tr>
                  <tr><td>${esc(t('perf.t94'))}</td><td>${dev.memoryGb ? esc(dev.memoryGb) + 'GB+' : t('perf.t161')}</td></tr>
                  <tr><td>${esc(t('perf.t95'))}</td><td>${esc(dev.screen)} · 보이는 곳 ${esc(dev.viewport)} · ${esc(dev.dpr)}x</td></tr>
                  <tr><td>${esc(t('perf.t96'))}</td><td>${esc(dev.net ?? t('perf.t161'))}${
                    dev.downlinkMbps ? ` · ${esc(dev.downlinkMbps)}Mbps` : ''
                  }</td></tr>
                </tbody></table></div>`;
          }

          /**
           * 한 줄 판정 (TASK-KL-201 ⑧).
           *
           * 숫자만 늘어놓으면 볼 때마다 「이게 좋은 건가」를 사람이 다시 판단해야 한다.
           * **못 잰 것은 합격으로 안 센다** — 「합격」과 「검사 못 함」을 같은 칸에 넣으면
           * 계측이 조용히 죽은 날에도 화면이 초록으로 남는다. 그게 제일 나쁜 고장이다.
           */
          function verdictBanner(snap: Snap): string {
            const fails = snap.verdict.filter((v) => v.state === 'fail');
            const unknowns = snap.verdict.filter((v) => v.state === 'unknown');
            const passes = snap.verdict.filter((v) => v.state === 'pass');
            const fmt = (v: Snap['verdict'][number]): string =>
              v.unit === 'B' ? kb(v.value) : v.unit === 'ms' ? ms(v.value) : String((v.value ?? 0).toFixed(3));
            const limit = (v: Snap['verdict'][number]): string =>
              v.unit === 'B' ? kb(v.limit) : v.unit === 'ms' ? ms(v.limit) : String(v.limit);
            const color = fails.length ? '#b91c1c' : unknowns.length ? '#b45309' : '#15803d';
            const head = fails.length
              ? t('perf.budgetOver', { n: fails.length })
              : unknowns.length
                ? t('perf.budgetUnknown', { n: unknowns.length })
                : t('perf.budgetOk', { n: passes.length });
            return `<div class="pf-none" style="border-style:solid;border-color:${color};">
                <strong style="color:${color}">${esc(head)}</strong>
                ${
                  fails.length
                    ? `<br>${fails
                        .map(
                          (v) =>
                            `${esc(v.label)} <b>${fmt(v)}</b> ${t('perf.budgetOf', { limit: limit(v) })}`
                        )
                        .join(' · ')}`
                    : ''
                }
                ${
                  unknowns.length
                    ? `<br><span style="opacity:.75">${t('perf.budgetNotMeasured', {
                        list: unknowns.map((v) => esc(v.label)).join(' · '),
                      })}</span>`
                    : ''
                }
              </div>`;
          }

          function distrustBanner(snap: Snap): string {
            /* 이 판을 믿어도 되는지부터 말한다 — 안 보이는 탭·되살아난 판의 숫자를 그냥 두면
               「이번 배포가 두 배 느려졌다」 같은 거짓 회귀가 난다. */
            return snap.trust.ok
              ? ''
              : `<div class="pf-none" style="border-style:solid;border-color:#b45309;">
                   <strong>${esc(t('perf.t97'))}</strong> ${esc(snap.trust.why)}.
                   ${t('perf.trustNote', { mark: '<b>⚠</b>' })}
                 </div>`;
          }

          /**
           * 칸 목록 — 제목·설명은 **고정**이고 몸통만 바뀐다 (TASK-KL-201 ④).
           *
           * 예전에는 다시 잴 때마다 이 화면 전체를 새로 그렸다. 그 값이 계기판 자기 계측에
           * 잡혔다: 「다시 재기」의 **표시 지연 70ms**. 재는 도구가 재는 대상을 흔들면
           * 그 숫자는 못 믿는다. 그래서 칸마다 나눠 두고 **글자가 달라진 칸만** 갈아 끼운다.
           */
          const SECTIONS: Array<{ key: string; title: string; note: string; html: (s: Snap) => string }> = [
            { key: 'verdict', title: '', note: '', html: verdictBanner },
            { key: 'trust', title: '', note: '', html: distrustBanner },
            { key: 'cards', title: '', note: '', html: summary },
            { key: 'frame', title: '', note: '', html: () => frameLine },
            {
              key: 'real', title: t('perf.t162'),
              note: t('perf.t163'),
              html: realWorldTable,
            },
            {
              key: 'inp', title: t('perf.t164'),
              note: t('perf.t165'),
              html: interactionTable,
            },
            {
              key: 'culprit', title: t('perf.t166'),
              note: t('perf.t167'),
              html: culpritTable,
            },
            {
              key: 'boot', title: t('perf.t168'),
              note: t('perf.t169'),
              html: waterfall,
            },
            {
              key: 'widgets', title: t('perf.t170'),
              note: t('perf.t171'),
              html: widgetTable,
            },
            {
              key: 'unused', title: t('perf.t172'),
              note: t('perf.t173'),
              html: unusedTable,
            },
            {
              key: 'coverage', title: t('perf.t174'),
              note: t('perf.t175'),
              html: coverageTable,
            },
            {
              key: 'allwidgets', title: t('perf.t176'),
              note: t('perf.t177'),
              html: allWidgetTable,
            },
            {
              key: 'files', title: t('perf.t178'),
              note: t('perf.t179'),
              html: heavyFiles,
            },
            {
              key: 'hosts', title: t('perf.t180'),
              note: t('perf.t181'),
              html: hostTable,
            },
            {
              key: 'longtask', title: t('perf.t182'),
              note: t('perf.t183'),
              html: longTasks,
            },
            {
              key: 'shift', title: t('perf.t184'),
              note: t('perf.t185'),
              html: shiftTable,
            },
            {
              key: 'buildstats', title: t('perf.t186'),
              note: t('perf.t187'),
              html: buildStatsTable,
            },
            {
              key: 'boots', title: t('perf.t188'),
              note: t('perf.t189'),
              html: boots,
            },
            {
              key: 'device', title: t('perf.t190'),
              note: t('perf.t191'),
              html: deviceTable,
            },
          ];

          body.innerHTML = SECTIONS.map(
            (sec) => `<div${sec.title ? '' : ' data-bare="1"'}>
              ${sec.title ? `<h3 class="pf-sec-title">${sec.title}</h3>` : ''}
              ${sec.note ? `<p class="pf-sec-note">${sec.note}</p>` : ''}
              <div data-sec="${sec.key}"></div>
            </div>`
          ).join('');
          const slots = new Map<string, HTMLElement>();
          const painted = new Map<string, string>();
          for (const sec of SECTIONS) slots.set(sec.key, body.querySelector(`[data-sec="${sec.key}"]`) as HTMLElement);

          /* 정렬 단추는 **한 번만** 매단다 — 칸을 갈아 끼워도 이 대리인은 살아 있다.
             매번 다시 매달면 그 자체가 다시 그리기 비용이 된다. */
          body.addEventListener('click', (event) => {
            const btn = (event.target as HTMLElement).closest('.pf-sort') as HTMLElement | null;
            if (!btn) return;
            widgetSort = btn.dataset.sort as WidgetSort;
            render();
          });

          function render(): void {
            const snap = perf!.snapshot() as unknown as Snap;
            stamp.textContent = t('perf.stamp', {
              tag: snap.build.tag || '?',
              commit: snap.build.commit || '?',
              sec: (snap.sinceOpenMs / 1000).toFixed(1),
            });
            for (const sec of SECTIONS) {
              const html = sec.html(snap);
              // 글자가 같으면 손대지 않는다 — DOM 을 안 건드리면 레이아웃·페인트도 없다.
              if (painted.get(sec.key) === html) continue;
              painted.set(sec.key, html);
              const slot = slots.get(sec.key);
              if (slot) slot.innerHTML = html;
            }
          }

          async function measureFrames(seconds: number): Promise<void> {
            frameLine = `<div class="pf-none">${t('perf.frameMeasuring', {
              sec: seconds,
              front: `<b>${esc(t('perf.t99'))}</b>`,
            })}</div>`;
            render();
            const result = await perf!.frameProbe(seconds * 1000);
            frameLine = `<div class="pf-none">
                ${t('perf.frameResult', {
                  sec: (result.windowMs / 1000).toFixed(1),
                  fps: `<b>${result.fps.toFixed(1)}fps</b>`,
                  low: `<b>${result.fpsLow.toFixed(1)}fps</b>`,
                  janks: `<b>${result.janks}</b>`,
                  worst: ms(result.worstMs),
                  frames: result.frames,
                })}
                <br>${t('perf.frameIdleNote', { redraw: `<b>${esc(t('perf.t104'))}</b>` })}
              </div>`;
            render();
          }

          container.querySelectorAll('.pf-btn').forEach((btn) => {
            (btn as HTMLButtonElement).onclick = () => {
              const act = (btn as HTMLElement).dataset.act;
              if (act === 'refresh') render();
              else if (act === 'frame3') void measureFrames(3);
              else if (act === 'frame10') void measureFrames(10);
              else if (act === 'copy') {
                void Toolbox.copyText?.(JSON.stringify(perf.snapshot(), null, 2), {
                  message: t('perf.t192'),
                  toolId: ID,
                  action: 'perf-snapshot',
                });
              } else if (act === 'clear') {
                perf.clearBoots();
                render();
              }
            };
          });

          render();

          /* 전체 무게는 파일 하나를 더 받아야 안다 — 첫 그림을 막지 않게 **그린 뒤에** 받는다.
             실패해도 계기판은 그대로 돈다(그 칸만 「못 읽었다」로 남는다). */
          void fetch('https://yawnbot.mascari4615.com/kl/tools/stats', { credentials: 'include' })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
            .then((data: { perf?: RealWorld }) => {
              real = data?.perf || null;
              realState = real?.metrics ? 'ok' : 'fail';
            })
            .catch(() => {
              /* 서버가 자고 있어도 계기판은 그대로 돈다 — 그 칸만 「못 받았다」로 남는다. */
              realState = 'fail';
            })
            .then(() => render());

          void fetch('/apps/karmolab/data/coverage-baseline.json', { cache: 'no-cache' })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
            .then((data: CoverageBaseline) => {
              coverage = data;
              coverageState = data?.sections ? 'ok' : 'fail';
            })
            .catch(() => {
              coverageState = 'fail';
            })
            .then(() => render());

          void fetch('/apps/karmolab/data/bundle-baseline.json', { cache: 'no-cache' })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
            .then((data: { sizes?: Record<string, number> }) => {
              allSizes = data.sizes || null;
              allSizesState = allSizes ? 'ok' : 'fail';
            })
            .catch(() => {
              allSizesState = 'fail';
            })
            .then(() => render());

          /* 이 화면 **자기 줄**은 첫 그림 때 비어 있다 (TASK-KL-201).
             순서가 그렇다: 스크립트를 받는 도중에 등록·그리기가 일어나고, 「눌러서 준비까지」는
             그 받기가 다 끝난 뒤에야 적힌다. 그래서 자기 줄만 크기·받기가 「—」로 남는다 —
             사람이 「다시 재기」를 눌러야 채워지는 건 계기판으로서 부끄럽다. 한 박자 뒤 한 번만
             다시 그린다(폴링 아님 — 계속 돌면 재는 것 자체가 비용이 된다). */
          const settle = setTimeout(render, 400);
          Toolbox.onDispose?.(() => clearTimeout(settle));
                  });
        },
      },
    ],
  });
})();
