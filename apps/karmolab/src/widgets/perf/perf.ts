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
(function (): void {
  const ID = 'perf';

  function esc(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

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
        label: '성능 계기판',
        build(container: HTMLElement): void {
          const perf = window.KLPerf;

          /* 계측기가 안 실린 판이면 **표를 0 으로 채우지 않는다** — 「전부 0ms」는 아주 빠른
             것처럼 보여서, 없는 편보다 나쁘다. 왜 못 재는지를 적고 끝낸다. */
          if (!perf) {
            container.innerHTML = `
              <div class="pf-none">
                <strong>계측기가 이 판에 안 실렸습니다.</strong><br>
                <code>js/perf.js</code> 가 셸보다 먼저 실려야 합니다 (<code>index.html</code>).
                빌드를 다시 하거나(<code>npm run build</code>) 새로고침해 보세요.
                지금 숫자를 지어내 보여 주지는 않습니다.
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

          container.innerHTML = `
            <div class="pf-wrap">
              <p class="pf-lead">
                KarmoLab 자기 성능. 재는 곳은 셸 한 곳(<code>src/perf.ts</code>)이고 이 화면은 읽기만 합니다.
                숫자는 <b>이 브라우저·이 기기의 실측</b>이며, 못 잰 자리는 <b>—</b> 로 둡니다.
              </p>
              <div class="pf-bar">
                <button type="button" class="pf-btn" data-act="refresh">다시 재기</button>
                <button type="button" class="pf-btn" data-act="frame3">프레임 3초 재기</button>
                <button type="button" class="pf-btn" data-act="frame10">10초</button>
                <button type="button" class="pf-btn" data-act="copy">JSON 복사</button>
                <button type="button" class="pf-btn" data-act="clear">부팅 원장 비우기</button>
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
              ['셸 준비까지', ms(ready?.at), '테마 + 도구 목록이 선 시점'],
              ['첫 그림 (FCP)', ms(snap.paint.fcp), '뭐라도 그려진 순간'],
              ['큰 그림 (LCP)', ms(snap.paint.lcp), '제일 큰 것이 자리잡은 순간'],
              [
                '받은 자바스크립트',
                kb(jsBytes),
                jsUnknown ? `${jsUnknown}개는 크기 모름 (서비스 워커)` : '압축된 채로',
              ],
              [
                '긴 작업 총합',
                longSum == null ? '못 잼' : ms(longSum),
                longSum == null ? '이 브라우저는 안 알려 줌' : `${snap.longTasks!.length}건 · 50ms 넘긴 것`,
              ],
              [
                /* 「만질 때 굼뜨나」 — 개발용 계기판에서 부팅만큼 중요한데 여태 없던 축.
                   200ms 를 넘으면 사람이 「눌렀는데 안 먹었나?」 하고 한 번 더 누른다. */
                '제일 굼뜬 조작 (INP)',
                snap.inp == null ? (snap.interactions == null ? '못 잼' : '조작 없음') : ms(snap.inp),
                snap.interactions == null
                  ? '이 브라우저는 안 알려 줌'
                  : `${snap.interactions.length}번 만짐 · 200ms 넘으면 답답함`,
              ],
              [
                '화면 밀림 (CLS)',
                snap.cls == null ? '못 잼' : snap.cls.toFixed(3),
                snap.cls == null ? '이 브라우저는 안 알려 줌' : '0.1 넘으면 눌렀는데 딴 게 눌린다',
              ],
              [
                '자바스크립트 메모리',
                snap.memory ? `${snap.memory.usedMb.toFixed(0)}MB` : '못 잼',
                snap.memory ? `한도 ${snap.memory.limitMb.toFixed(0)}MB` : '크로미움에서만 알려 줌',
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
              ['서버 첫 응답', snap.nav.ttfb],
              ['문서 해석', snap.nav.domInteractive],
              ['첫 그림 (FCP)', snap.paint.fcp],
              ...snap.marks.map((m) => [m.name, m.at] as [string, number]),
              ['큰 그림 (LCP)', snap.paint.lcp],
              ['문서 다 뜸', snap.nav.load],
            ];
            const known = rows.filter((r) => typeof r[1] === 'number') as Array<[string, number]>;
            known.sort((a, b) => a[1] - b[1]);
            const max = known.length ? known[known.length - 1][1] : 1;
            if (!known.length) return '<div class="pf-none">부팅 기록이 없습니다.</div>';
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
              return `<div class="pf-none">아직 연 위젯이 없습니다. 도구를 몇 개 열고 <b>다시 재기</b>를 누르면 이 표가 찹니다.</div>`;
            }
            const head = (key: WidgetSort, label: string): string =>
              `<th><button type="button" class="pf-sort" data-sort="${key}" data-on="${
                widgetSort === key ? '1' : '0'
              }">${esc(label)}</button></th>`;
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr>
                <th>위젯</th>
                ${head('bytes', '크기')}
                <th>받기</th>
                ${head('loadMs', '눌러서 준비까지')}
                ${head('firstBuildMs', '첫 그리기')}
                <th>마지막 그리기</th>
                ${head('builds', '그린 횟수')}
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
            if (!rows.length) return '<div class="pf-none">받은 것의 크기를 못 읽었습니다.</div>';
            const blockers = snap.resources.filter((r) => r.blocking === 'blocking').length;
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>파일</th><th>종류</th><th>크기</th><th>합계</th><th>이름찾기</th><th>연결</th><th>서버 기다림</th><th>내려받기</th><th>첫그림 막음</th></tr></thead>
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
                    <td>${row.blocking === 'blocking' ? '⚠ 막음' : row.transferred === 0 ? '캐시' : ''}</td>
                  </tr>`
                )
                .join('')}</tbody></table></div>
              <p class="pf-sec-note">받은 것 ${snap.resources.length}개 중 ${cached}개는 회선을 안 탔습니다(캐시·서비스 워커) · 첫 그림을 막은 것 ${blockers}개.
                단계 칸이 전부 「—」면 <b>빠른 게 아니라 안 알려 준 것</b>입니다(남의 도메인 + <code>Timing-Allow-Origin</code> 없음).</p>`;
          }

          /**
           * 조작 하나가 왜 굼떴나 — 셋 중 누구 탓인가 (TASK-KL-201 ②).
           * 대기가 크면 **다른 코드**가, 처리가 크면 **내 핸들러**가, 표시가 크면 **그리는 비용**이 범인.
           */
          function interactionTable(snap: Snap): string {
            if (snap.interactions == null) {
              return '<div class="pf-none">이 브라우저는 조작 지연을 안 알려 줍니다. <b>0 이 아니라 못 잰 것</b>입니다.</div>';
            }
            if (!snap.interactions.length) {
              return '<div class="pf-none">아직 만진 것이 없습니다 — 도구를 눌러 보고 <b>다시 재기</b>를 누르세요. (한 프레임(16ms)을 넘긴 조작만 셉니다.)</div>';
            }
            const rows = snap.interactions.slice(0, 12);
            /* 「표시 40ms = 느리다」는 틀린 판정이다 — 핸들러가 하나도 없는 빈 클릭도 이 환경에선
               24~48ms 가 걸렸다(실측, LoAF 0건). 그래서 **하한을 넘은 만큼**만 빨갛게 칠한다. */
            const floor = snap.presentationFloorMs;
            const overFloor = (value: number): number | null => (floor == null ? value : Math.max(0, value - floor));
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>무엇을 눌렀나</th><th>종류</th><th>언제</th><th>총</th><th>대기</th><th>처리</th><th>표시</th></tr></thead>
              <tbody>${rows
                .map(
                  (row) => `<tr>
                    <td>${esc(row.target || '모름')}</td>
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
                  ? '이 환경의 <b>표시 하한</b>은 아직 모릅니다 — 아무 일도 안 하는 곳을 몇 번 더 눌러야 정해집니다.'
                  : `이 환경의 <b>표시 하한 ${ms(floor)}</b> (아무 일도 안 하는 클릭의 중앙값). 표시 칸은 <b>이 하한을 넘은 만큼</b>으로 색을 칠합니다 — 하한 자체는 우리 코드가 아니라 기기·브라우저가 쓰는 시간입니다.`
              }</p>`;
          }

          /**
           * 늦은 프레임의 **범인** (TASK-KL-201 ③ — LoAF).
           * 긴 작업 표는 「언제 얼마나」까지고, 이 표는 「어느 파일의 어느 함수가」다.
           */
          function culpritTable(snap: Snap): string {
            if (snap.culprits == null) {
              return '<div class="pf-none">이 브라우저는 프레임별 스크립트 귀속을 안 알려 줍니다(크로미움 123+ 전용). 아래 <b>긴 작업</b> 표만 보세요 — <b>0 이 아니라 못 잰 것</b>입니다.</div>';
            }
            if (!snap.culprits.length) {
              return '<div class="pf-none">50ms 넘게 걸린 프레임이 없습니다 — 잡을 범인이 없습니다.</div>';
            }
            const rows = snap.culprits.slice(0, 12);
            const frames = snap.slowFrames || [];
            const worst = frames.length ? frames[0] : null;
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>파일 # 함수</th><th>부른 것</th><th>합계</th><th>강제 레이아웃</th><th>프레임 수</th></tr></thead>
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
                  ? `<p class="pf-sec-note">제일 늦은 프레임: ${ms(worst.ms)} (손가락 막은 시간 ${ms(
                      worst.blockingMs
                    )} · 그리기 ${ms(worst.renderMs)}) — 늦은 프레임 ${frames.length}장.
                       <b>강제 레이아웃</b>이 붙은 줄은 읽고-쓰기를 번갈아 해서 브라우저에 계산을 두 번 시킨 코드입니다.</p>`
                  : ''
              }`;
          }

          /**
           * 받았는데 한 번도 안 그린 코드 (TASK-KL-201 ⑫ — DevTools 「Coverage」 자리).
           * 브라우저는 「이 줄이 실행됐나」를 페이지에 안 알려 준다 → 우리가 아는 것으로 근사한다.
           */
          function unusedTable(snap: Snap): string {
            const rows = snap.unused.rows;
            if (!rows.length) return '<div class="pf-none">받은 위젯은 전부 화면에 나왔습니다.</div>';
            const boot = rows.filter((r) => r.atBoot);
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>위젯</th><th>받은 양</th><th>부팅에 딸려왔나</th></tr></thead>
              <tbody>${rows
                .slice(0, 10)
                .map(
                  (row) => `<tr>
                    <td>${esc(row.id)}</td>
                    <td${row.atBoot ? tone(row.bytes, 5000, 20000) : ''}>${kb(row.bytes)}</td>
                    <td>${row.atBoot ? '⚠ 부팅' : '눌러서 받음'}</td>
                  </tr>`
                )
                .join('')}</tbody></table></div>
              <p class="pf-sec-note">받았는데 이번에 한 번도 안 그린 것 ${rows.length}개 (${kb(snap.unused.bytes)}).
                <b>「눌러서 받음」은 낭비가 아닙니다</b> — 곧 볼 화면일 수 있습니다. 문제는 <b>⚠ 부팅</b> 쪽입니다:
                누르지도 않았는데 받았고 쓰이지도 않았습니다${boot.length ? ` (지금 ${boot.length}개)` : ' (지금 없음)'}.</p>`;
          }

          /** 전체 위젯 무게 — 이 세션에서 안 연 것까지 (TASK-KL-201 ⑪). */
          function allWidgetTable(snap: Snap): string {
            if (allSizesState === 'loading') return '<div class="pf-none">전체 무게를 읽는 중…</div>';
            if (allSizesState === 'fail' || !allSizes) {
              return '<div class="pf-none">전체 무게를 <b>못 읽었습니다</b> — <code>data/bundle-baseline.json</code> 이 없는 판입니다(<code>npm run audit:bundles -- --update</code>). 아래 위젯 표는 <b>이 세션에서 연 것만</b>이라 전부가 아닙니다.</div>';
            }
            const opened = new Set(snap.widgets.map((w) => w.id));
            const rows = Object.entries(allSizes).sort((a, b) => b[1] - a[1]);
            const total = rows.reduce((sum, [, bytes]) => sum + bytes, 0);
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>위젯 묶음</th><th>gzip</th><th>이번에 열었나</th></tr></thead>
              <tbody>${rows
                .slice(0, 15)
                .map(([name, bytes]) => {
                  const id = name.replace(/\.js$/, '').split('/')[0];
                  return `<tr>
                    <td>${esc(name)}</td>
                    <td${tone(bytes, 24 * 1024, 48 * 1024)}>${kb(bytes)}</td>
                    <td>${opened.has(id) || opened.has(name.replace(/\.js$/, '')) ? '열었음' : ''}</td>
                  </tr>`;
                })
                .join('')}</tbody></table></div>
              <p class="pf-sec-note">전부 ${rows.length}개 · gzip 합계 <b>${kb(total)}</b> (한 사람이 다 받지는 않습니다 — 누른 것만 받습니다). 이 표는 <b>빌드가 재 둔 값</b>이라 안 열어 본 위젯도 보입니다. 한계 64KB·회귀 래칫은 <code>npm run audit:bundles</code> 가 CI 에서 봅니다.</p>`;
          }

          /** 도메인별 — 「남의 것이 우리 것보다 무겁나」 (TASK-KL-201 ⑤). */
          function hostTable(snap: Snap): string {
            if (!snap.hosts.length) return '<div class="pf-none">받은 것이 없습니다.</div>';
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>어디서</th><th>파일 수</th><th>크기</th><th>받는 데 합계</th></tr></thead>
              <tbody>${snap.hosts
                .slice(0, 10)
                .map(
                  (row) => `<tr>
                    <td>${esc(row.host)}${row.ours ? '' : ' <span style="opacity:.6">(남)</span>'}</td>
                    <td>${row.count}</td>
                    <td${tone(row.bytes, 300000, 800000)}>${kb(row.bytes)}</td>
                    <td>${ms(row.ms)}</td>
                  </tr>`
                )
                .join('')}</tbody></table></div>`;
          }

          function longTasks(snap: Snap): string {
            if (snap.longTasks == null) {
              return '<div class="pf-none">이 브라우저는 긴 작업을 안 알려 줍니다(사파리). <b>0건이 아니라 못 잰 것</b>입니다.</div>';
            }
            if (!snap.longTasks.length) {
              return '<div class="pf-none">50ms 넘게 주 스레드를 잡은 작업이 없습니다.</div>';
            }
            const rows = snap.longTasks.slice().sort((a, b) => b.ms - a.ms).slice(0, 15);
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>언제 (열린 뒤)</th><th>길이</th><th>어디서</th></tr></thead>
              <tbody>${rows
                .map(
                  (row) => `<tr>
                    <td>${ms(row.at)}</td>
                    <td${tone(row.ms, 100, 250)}>${ms(row.ms)}</td>
                    <td>${esc(row.from || '모름')}</td>
                  </tr>`
                )
                .join('')}</tbody></table></div>`;
          }

          /** 무엇이 화면을 밀었나 (TASK-KL-201 ⑥). */
          function shiftTable(snap: Snap): string {
            if (snap.shiftCulprits == null) {
              return '<div class="pf-none">이 브라우저는 화면 밀림을 안 알려 줍니다. <b>0 이 아니라 못 잰 것</b>입니다.</div>';
            }
            if (!snap.shiftCulprits.length) {
              return '<div class="pf-none">사용자 조작과 무관하게 밀린 곳이 없습니다.</div>';
            }
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>밀린 것</th><th>밀림 값</th><th>횟수</th></tr></thead>
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
              <p class="pf-sec-note">누른 직후의 이동(탭 펼치기 등)은 뺐습니다 — 그건 대개 의도한 것입니다. 총점은 <b>제일 나쁜 5초 구간</b>만 셉니다(다 더하면 오래 켜 둘수록 나쁜 점수가 나옵니다).</p>`;
          }

          /** 판별 분포 — 한 번 재고 「빨라졌다」는 말은 못 한다 (TASK-KL-201 ⑦). */
          function buildStatsTable(snap: Snap): string {
            if (!snap.buildStats.length) {
              return '<div class="pf-none">믿을 만한 부팅 기록이 아직 없습니다.</div>';
            }
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>판</th><th>커밋</th><th>표본</th><th>셸 준비 p50</th><th>나쁜 쪽 p75</th><th>큰 그림 p50</th></tr></thead>
              <tbody>${snap.buildStats
                .slice(0, 8)
                .map(
                  (row) => `<tr>
                    <td>${esc(row.build.slice(0, 8))}</td>
                    <td>${esc(row.commit || '—')}</td>
                    <td${row.n < 3 ? ' data-tone="warn"' : ''}>${row.n}${row.n < 3 ? ' (적음)' : ''}</td>
                    <td${tone(row.readyP50, 1200, 2500)}>${ms(row.readyP50)}</td>
                    <td${tone(row.readyP75, 1500, 3000)}>${ms(row.readyP75)}</td>
                    <td>${ms(row.lcpP50)}</td>
                  </tr>`
                )
                .join('')}</tbody></table></div>
              <p class="pf-sec-note">표본이 3회 미만인 줄은 <b>아직 못 믿습니다</b> — 같은 코드도 기계가 바쁘면 두 배가 납니다. 못 믿을 판(안 보이는 탭·되살아난 판)은 애초에 빠져 있습니다.</p>`;
          }

          function boots(snap: Snap): string {
            const rows = snap.boots.slice().reverse().slice(0, 12);
            if (!rows.length) {
              return '<div class="pf-none">부팅 기록이 아직 없습니다 — 한 번 더 열면 이 판이 한 줄로 남습니다. (이번 판은 이 화면을 연 뒤 몇 초 있다가 적힙니다.)</div>';
            }
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>언제</th><th>판</th><th>커밋</th><th>첫 응답</th><th>첫 그림</th><th>큰 그림</th><th>셸 준비</th><th>긴 작업</th></tr></thead>
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
                    <td>${row.longTaskMs == null ? '못 잼' : ms(row.longTaskMs)}</td>
                  </tr>`;
                })
                .join('')}</tbody></table></div>`;
          }

          function deviceTable(snap: Snap): string {
            const dev = snap.device;
            return `<div class="pf-scroll"><table class="pf-table"><tbody>
                  <tr><td>코어</td><td>${esc(dev.cores ?? '모름')}</td></tr>
                  <tr><td>메모리</td><td>${dev.memoryGb ? esc(dev.memoryGb) + 'GB+' : '모름'}</td></tr>
                  <tr><td>화면</td><td>${esc(dev.screen)} · 보이는 곳 ${esc(dev.viewport)} · ${esc(dev.dpr)}x</td></tr>
                  <tr><td>회선</td><td>${esc(dev.net ?? '모름')}${
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
              ? `예산 넘김 ${fails.length}개`
              : unknowns.length
                ? `넘긴 것 없음 — 다만 ${unknowns.length}개는 못 쟀다`
                : `예산 안쪽 ${passes.length}개 전부`;
            return `<div class="pf-none" style="border-style:solid;border-color:${color};">
                <strong style="color:${color}">${esc(head)}</strong>
                ${
                  fails.length
                    ? `<br>${fails.map((v) => `${esc(v.label)} <b>${fmt(v)}</b> (예산 ${limit(v)})`).join(' · ')}`
                    : ''
                }
                ${
                  unknowns.length
                    ? `<br><span style="opacity:.75">못 잼: ${unknowns.map((v) => esc(v.label)).join(' · ')} — 통과로 세지 않습니다.</span>`
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
                   <strong>이 판의 숫자는 비교에 쓰면 안 됩니다.</strong> ${esc(snap.trust.why)}.
                   판별 부팅 표에서도 이런 줄은 <b>⚠</b> 로 표시됩니다.
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
              key: 'inp', title: '만질 때 — 굼뜬 조작 순',
              note: '굼뜸은 셋 중 하나입니다. <b>대기</b>가 크면 다른 코드가 주 스레드를 잡고 있던 것이고, <b>처리</b>가 크면 그 핸들러가, <b>표시</b>가 크면 그리는 비용이 범인입니다. 총 200ms 를 넘으면 사람이 「안 먹었나?」 하고 다시 누릅니다.',
              html: interactionTable,
            },
            {
              key: 'culprit', title: '늦은 프레임 — 누가 잡고 있었나',
              note: '프레임이 50ms 를 넘길 때 <b>어느 파일의 어느 함수</b>가 몇 ms 를 썼는지. 한 번 40ms 보다 <b>매 프레임 8ms</b> 가 대개 더 나쁩니다 — 합계로 봅니다.',
              html: culpritTable,
            },
            {
              key: 'boot', title: '부팅 — 어디서 시간이 갔나',
              note: '페이지가 열린 순간부터의 시각. 막대는 「그때까지 걸린 시간」이라 오른쪽으로 갈수록 늦은 일입니다.',
              html: waterfall,
            },
            {
              key: 'widgets', title: '위젯 — 무거운 순',
              note: '이 세션에서 실제로 연 것만 나옵니다. 「눌러서 준비까지」는 딸린 스크립트와 대기까지 포함한 시간이고, 「첫 그리기」가 16ms 를 넘으면 그 순간 한 프레임을 놓칩니다.',
              html: widgetTable,
            },
            {
              key: 'unused', title: '받았는데 안 쓴 코드',
              note: '브라우저는 「이 줄이 실행됐나」를 알려 주지 않습니다(개발자 도구 전용 통로). 우리가 아는 것으로 근사합니다 — <b>받았는데 한 번도 안 그린</b> 위젯.',
              html: unusedTable,
            },
            {
              key: 'allwidgets', title: '전체 위젯 무게 — 안 열어도 아는 것',
              note: '위 표는 <b>이번에 연 것만</b>입니다. 여기는 빌드가 재 둔 전부 — 아무도 안 연 위젯이 뚱뚱해지는 것을 이 자리에서 봅니다.',
              html: allWidgetTable,
            },
            {
              key: 'files', title: '받은 것 — 무거운 15개',
              note: '서비스 워커가 답한 것은 브라우저가 크기를 안 알려 줍니다 — 그 줄은 「—」입니다.',
              html: heavyFiles,
            },
            {
              key: 'hosts', title: '어디서 받았나 — 도메인별',
              note: '남의 도메인이 우리 것보다 무거우면 파일 하나씩 봐서는 안 보입니다. 합쳐서 봅니다.',
              html: hostTable,
            },
            {
              key: 'longtask', title: '긴 작업 — 손가락이 막힌 구간',
              note: '주 스레드를 50ms 넘게 잡은 작업. 이 구간에 누른 것은 끝난 뒤에야 처리됩니다.',
              html: longTasks,
            },
            {
              key: 'shift', title: '화면 밀림 — 무엇이 밀었나',
              note: '「눌렀는데 딴 게 눌렸다」의 정체. 총점만으로는 못 고칩니다 — <b>무엇이</b> 밀었는지가 있어야 합니다.',
              html: shiftTable,
            },
            {
              key: 'buildstats', title: '판별 분포 — 진짜 빨라졌나',
              note: '한 번 재고 「빨라졌다」는 말은 못 합니다. 판마다 중앙값(p50)·나쁜 쪽(p75)을 <b>표본 수와 함께</b> 봅니다.',
              html: buildStatsTable,
            },
            {
              key: 'boots', title: '판별 부팅 — 매 회 기록',
              note: '이 브라우저에 남은 최근 부팅 40회. 판(build)이 바뀐 줄끼리 비교하면 그 배포가 부팅을 어떻게 바꿨는지 보입니다.',
              html: boots,
            },
            {
              key: 'device', title: '이 기기',
              note: '같은 코드도 기기가 다르면 다른 숫자가 납니다 — 비교할 때 같이 봅니다.',
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
            stamp.textContent = `판 ${snap.build.tag || '?'} · ${snap.build.commit || '?'} · 열린 지 ${(
              snap.sinceOpenMs / 1000
            ).toFixed(1)}s`;
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
            frameLine = `<div class="pf-none">프레임 재는 중… ${seconds}초. <b>이 창을 앞에 두세요</b> — 뒤로 넘기면 브라우저가 그리기를 멈춰서 숫자가 거짓말이 됩니다.</div>`;
            render();
            const result = await perf!.frameProbe(seconds * 1000);
            frameLine = `<div class="pf-none">
                최근 ${(result.windowMs / 1000).toFixed(1)}초 — 평균 <b>${result.fps.toFixed(1)}fps</b>
                · 나쁜 1% <b>${result.fpsLow.toFixed(1)}fps</b>
                · 33ms 넘긴 프레임 <b>${result.janks}</b>회 (제일 나쁜 프레임 ${ms(result.worstMs)})
                · 그린 프레임 ${result.frames}장.
                <br>가만히 둔 화면에서도 fps 가 60 근처면 <b>쉬지 않고 다시 그리고 있다</b>는 뜻입니다.
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
                  message: '성능 스냅샷을 복사했습니다',
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
        },
      },
    ],
  });
})();
