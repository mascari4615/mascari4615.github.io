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
    marks: Array<{ name: string; at: number }>;
    widgets: Array<{
      id: string; loadMs: number | null; firstBuildMs: number | null; lastBuildMs: number | null;
      builds: number; scripts: string[]; bytes: number | null; scriptMs: number | null;
    }>;
    resources: Array<{ url: string; kind: string; ms: number; bytes: number | null; transferred: number | null }>;
    longTasks: Array<{ at: number; ms: number; from: string }> | null;
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
            return `<div class="pf-scroll"><table class="pf-table">
              <thead><tr><th>파일</th><th>종류</th><th>크기</th><th>받는 데</th><th>회선</th></tr></thead>
              <tbody>${rows
                .map(
                  (row) => `<tr>
                    <td>${esc(shortUrl(row.url))}</td>
                    <td>${esc(row.kind)}</td>
                    <td${tone(row.bytes, 60000, 150000)}>${kb(row.bytes)}</td>
                    <td>${ms(row.ms)}</td>
                    <td>${row.transferred === 0 ? '캐시' : kb(row.transferred)}</td>
                  </tr>`
                )
                .join('')}</tbody></table></div>
              <p class="pf-sec-note">받은 것 ${snap.resources.length}개 중 ${cached}개는 회선을 안 탔습니다(캐시·서비스 워커).</p>`;
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
                  return `<tr>
                    <td>${esc(when)}</td>
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

          function render(): void {
            const snap = perf!.snapshot() as unknown as Snap;
            stamp.textContent = `판 ${snap.build.tag || '?'} · ${snap.build.commit || '?'} · 열린 지 ${(
              snap.sinceOpenMs / 1000
            ).toFixed(1)}s`;
            const dev = snap.device;
            body.innerHTML = `
              ${summary(snap)}
              ${frameLine}
              <div>
                <h3 class="pf-sec-title">부팅 — 어디서 시간이 갔나</h3>
                <p class="pf-sec-note">페이지가 열린 순간부터의 시각. 막대는 「그때까지 걸린 시간」이라 오른쪽으로 갈수록 늦은 일입니다.</p>
                ${waterfall(snap)}
              </div>
              <div>
                <h3 class="pf-sec-title">위젯 — 무거운 순</h3>
                <p class="pf-sec-note">이 세션에서 실제로 연 것만 나옵니다. 「눌러서 준비까지」는 딸린 스크립트와 대기까지 포함한 시간이고, 「첫 그리기」가 16ms 를 넘으면 그 순간 한 프레임을 놓칩니다.</p>
                ${widgetTable(snap)}
              </div>
              <div>
                <h3 class="pf-sec-title">받은 것 — 무거운 15개</h3>
                <p class="pf-sec-note">서비스 워커가 답한 것은 브라우저가 크기를 안 알려 줍니다 — 그 줄은 「—」입니다.</p>
                ${heavyFiles(snap)}
              </div>
              <div>
                <h3 class="pf-sec-title">긴 작업 — 손가락이 막힌 구간</h3>
                <p class="pf-sec-note">주 스레드를 50ms 넘게 잡은 작업. 이 구간에 누른 것은 끝난 뒤에야 처리됩니다.</p>
                ${longTasks(snap)}
              </div>
              <div>
                <h3 class="pf-sec-title">판별 부팅 — 고친 게 진짜 빨라졌나</h3>
                <p class="pf-sec-note">이 브라우저에 남은 최근 부팅 40회. 판(build)이 바뀐 줄끼리 비교하면 그 배포가 부팅을 어떻게 바꿨는지 보입니다.</p>
                ${boots(snap)}
              </div>
              <div>
                <h3 class="pf-sec-title">이 기기</h3>
                <p class="pf-sec-note">같은 코드도 기기가 다르면 다른 숫자가 납니다 — 비교할 때 같이 봅니다.</p>
                <div class="pf-scroll"><table class="pf-table"><tbody>
                  <tr><td>코어</td><td>${esc(dev.cores ?? '모름')}</td></tr>
                  <tr><td>메모리</td><td>${dev.memoryGb ? esc(dev.memoryGb) + 'GB+' : '모름'}</td></tr>
                  <tr><td>화면</td><td>${esc(dev.screen)} · 보이는 곳 ${esc(dev.viewport)} · ${esc(dev.dpr)}x</td></tr>
                  <tr><td>회선</td><td>${esc(dev.net ?? '모름')}${
                    dev.downlinkMbps ? ` · ${esc(dev.downlinkMbps)}Mbps` : ''
                  }</td></tr>
                </tbody></table></div>
              </div>`;

            body.querySelectorAll('.pf-sort').forEach((btn) => {
              (btn as HTMLButtonElement).onclick = () => {
                widgetSort = (btn as HTMLElement).dataset.sort as WidgetSort;
                render();
              };
            });
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
