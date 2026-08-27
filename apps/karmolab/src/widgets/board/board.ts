/**
 * board — 목표 하나를 향한 진행 보드 (D-Day · 등급 · 마감 · 다음 한 수)
 *
 * **데이터는 이 레포에 없다.** 이 레포는 공개이고, 보드의 내용(이직 준비·학습 기록)은 비공개다.
 * 그래서 여기 있는 것은 *틀*뿐이다 — 마크다운 표를 읽어 화면으로 만드는 파서와 렌더러.
 * 실제 글자는 데스크톱 앱이 열릴 때마다 Rust 명령 `board_read` 가 `karmoddrine/memo` 에서
 * 직접 읽어 온다 (apps/karmolab-tauri/src-tauri/src/board.rs). 웹에서는 그 경로가 없으므로
 * 「데스크톱 전용」 안내만 뜬다. 선례 = quest-log (memo 정본을 런타임에 읽는 위젯).
 *
 * 구운 JSON 을 안 두는 이유: 보드는 사람과 AI 가 매일 고치는 문서다. 파생 파일을 두면
 * 하루만 안 구워도 화면이 **거짓말을 한다.** 읽는 값을 정본 하나로 둔다.
 *
 * 트랙은 늘릴 수 있다 — TRACKS 에 한 줄 추가하면 학습·자격증 같은 다른 목표도 같은 틀을 쓴다.
 * 표 모양(요구 · 증거 · 등급 · 다음 한 수 · 기한)만 지키면 파서는 그대로 먹는다.
 */
import { t, loadNamespace } from '../../lib/i18n';
import { isDesktop, invoke } from '../../tauri-bridge';

(function (): void {
  const esc = (v: unknown): string =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ── 트랙 정의 — 목표 하나 = 트랙 하나 ────────────────────────────────
     여기 적히는 것은 **경로와 날짜**뿐이다. 내용은 안 적는다. */
  interface Milestone { date: string; label: string }
  interface Track {
    id: string;
    docKey: string;              // Rust 쪽 허용 목록의 열쇠
    titleKey: string;
    startedAt: string;           // 언제부터 — 「얼마나 왔나」의 왼쪽 끝
    milestones: Milestone[];     // D-Day 로 셀 날짜들. 마지막 것이 결승선이다
  }
  const TRACKS: Track[] = [
    {
      id: 'career',
      docKey: 'career-scoreboard',
      titleKey: 'board.track.career',
      startedAt: '2026-08-26',
      milestones: [
        { date: '2027-02-01', label: 'board.ms.discharge' },
        { date: '2027-08-01', label: 'board.ms.apply' }
      ]
    }
  ];

  /* ── 등급 — 표에 적힌 기호를 그대로 쓴다 ──────────────────────────── */
  const GRADES = ['✓', '◐', '△', '✗', '?'] as const;
  type Grade = (typeof GRADES)[number];
  const GRADE_CLASS: Record<Grade, string> = {
    '✓': 'g-done', '◐': 'g-half', '△': 'g-part', '✗': 'g-none', '?': 'g-unknown'
  };

  interface Row {
    no: string;
    need: string;
    evidence: string;
    grade: Grade;
    next: string;
    due: string;          // 원문 그대로 ("2026-09" · "즉시" · "2027-02")
    dueDays: number | null; // 셀 수 있으면 남은 날수
  }

  interface BoardDoc {
    key: string; relPath: string; text: string | null;
    modifiedMs: number | null; error: string | null;
  }

  const MS_DAY = 86400000;
  const todayUtc = (): number => {
    const d = new Date();
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };

  /** "2026-09" → 그 달 말일 / "2026-09-30" → 그날. 못 읽으면 null. */
  function parseDue(raw: string): number | null {
    const s = raw.replace(/\*/g, '').trim();
    /* 「즉시」는 날짜가 아니지만 **가장 급한 것**이다. 날짜 없음으로 밀어 두면 제일 급한 칸이
       화면 맨 끝에 가서 안 보인다(실측: 방어 꼬리질문이 그렇게 묻혔다). 오늘로 친다. */
    if (/^(즉시|now|今すぐ)$/i.test(s)) return todayUtc();
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    m = /^(\d{4})-(\d{2})$/.exec(s);
    if (m) return Date.UTC(+m[1], +m[2], 0);   // 그 달 마지막 날
    return null;
  }

  /** 마크다운 표에서 한 줄을 칸으로 가른다. 바깥 파이프는 버린다. */
  function cells(line: string): string[] {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split('|').map((c) => c.trim());
  }

  const stripMd = (s: string): string =>
    s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')   // 링크는 글자만
      .replace(/\*\*/g, '').replace(/`/g, '').trim();

  /**
   * 보드 문서에서 **등급 칸이 있는 표**를 찾아 줄로 만든다.
   * 헤더 이름에 기대지 않고 「등급 기호가 든 칸이 있는 표」를 고른다 — 헤더 글자가 바뀌어도 안 깨진다.
   */
  function parseRows(md: string): Row[] {
    const lines = md.split(/\r?\n/);
    const rows: Row[] = [];
    let header: string[] | null = null;
    let idx: { need: number; ev: number; grade: number; next: number; due: number } | null = null;

    for (const line of lines) {
      if (!line.trim().startsWith('|')) { header = null; idx = null; continue; }
      const c = cells(line);
      if (/^:?-{2,}/.test(c[0] ?? '')) continue;          // 구분선
      if (!header) {
        header = c.map(stripMd);
        const find = (...names: string[]): number =>
          header!.findIndex((h) => names.some((n) => h.includes(n)));
        const grade = find('등급', 'Grade', '評価');
        const next = find('다음', 'Next', '次');
        const due = find('기한', 'Due', '期限');
        /* 등급 칸만 보고 고르면 문서 앞머리의 **등급 정의 표**까지 먹는다 (실측: 12행이 17행이 됐다).
           보드 표에는 「다음 한 수」나 「기한」이 반드시 있으므로 그걸 함께 요구한다. */
        if (grade < 0 || (next < 0 && due < 0)) { header = null; continue; }
        idx = {
          need: Math.max(find('요구', '항목', 'Need'), 1),
          ev: find('증거', 'Evidence'),
          grade,
          next,
          due
        };
        continue;
      }
      if (!idx) continue;
      const cell = (i: number): string => (i >= 0 && i < c.length ? stripMd(c[i]) : '');
      const rawGrade = cell(idx.grade);
      const grade = (GRADES.find((g) => rawGrade.includes(g)) ?? '?') as Grade;
      const due = cell(idx.due);
      const dueTs = parseDue(due);
      rows.push({
        no: cell(0),
        need: cell(idx.need),
        evidence: cell(idx.ev),
        grade,
        next: cell(idx.next),
        due,
        dueDays: dueTs === null ? null : Math.round((dueTs - todayUtc()) / MS_DAY)
      });
    }
    return rows;
  }

  const CSS = `
/* layout:'full' 의 패널은 flex:1 · min-height:0 까지만 잡아 준다 — **스스로 안 구른다.**
   그래서 넘치는 만큼이 그냥 잘린다(2026-08-28 실측). 구르는 자리는 위젯이 갖는다. */
.board-wrap{display:flex;flex-direction:column;gap:28px;padding:8px 4px 32px;flex:1;min-height:0;overflow-y:auto;overflow-x:hidden}
.board-hero{display:flex;flex-direction:column;gap:10px}
.board-hero .row{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.board-hero .name{font-size:var(--font-size-lg);font-weight:700}
.board-hero .dday{font-size:44px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--accent);line-height:1}
.board-hero .sub{font-size:var(--font-size-xs);color:var(--text-tertiary)}
.board-time{position:relative;height:10px;border-radius:999px;background:var(--bg-secondary);border:1px solid var(--border);overflow:hidden}
.board-time i{position:absolute;inset:0 auto 0 0;background:var(--accent);opacity:.55}
.board-ends{display:flex;justify-content:space-between;font-size:var(--font-size-xs);color:var(--text-tertiary)}

.board-grades{display:flex;flex-direction:column;gap:7px;max-width:760px}
.board-grow{display:grid;grid-template-columns:104px auto 1fr;align-items:center;gap:12px}
.board-grow.empty{opacity:.45}
.board-blocks .n{font-size:var(--font-size-xs);color:var(--text-tertiary);font-variant-numeric:tabular-nums;align-self:center;margin-left:4px}
.board-grow .lbl{font-size:var(--font-size-sm);color:var(--text-secondary);text-align:right}
.board-blocks{display:flex;gap:5px;flex-wrap:wrap}
.board-blocks span{width:22px;height:22px;border-radius:5px;background:currentColor;opacity:.85}
.board-grow .note{font-size:var(--font-size-xs);color:var(--text-tertiary);white-space:nowrap}
.g-done{color:#3fb950}.g-half{color:#d29922}.g-part{color:#58a6ff}
.g-none{color:#f85149}.g-unknown{color:var(--text-tertiary)}

.board-months{display:flex;gap:22px;flex-wrap:wrap}
.board-month{display:flex;flex-direction:column;gap:6px;align-items:flex-start}
.board-month .m{font-size:var(--font-size-xs);color:var(--text-tertiary);font-variant-numeric:tabular-nums}
.board-dots{display:flex;gap:5px}
.board-dots i{width:11px;height:11px;border-radius:999px;border:1.5px solid currentColor;display:block}
.dot-todo{color:var(--text-tertiary)}
.dot-done{color:#3fb950;background:currentColor}
.dot-late{color:#f85149;background:currentColor}

.board-lead{background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:5px}
.board-lead .cap{font-size:var(--font-size-xs);color:var(--text-tertiary)}
.board-lead .what{font-size:var(--font-size-md);font-weight:700}
.board-lead .how{font-size:var(--font-size-sm);color:var(--text-secondary)}
.board-foot{font-size:var(--font-size-xs);color:var(--text-tertiary);display:flex;gap:10px;flex-wrap:wrap}
.board-empty{padding:28px;text-align:center;color:var(--text-secondary);background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px}
`;

  /** 등급별 이름·차례 — 왼쪽이 「다 된 것」, 오른쪽으로 갈수록 안 된 것. */
  const GRADE_ROWS: { g: Grade; cls: string; key: string }[] = [
    { g: '✓', cls: 'g-done', key: 'board.g.done' },
    { g: '◐', cls: 'g-half', key: 'board.g.half' },
    { g: '△', cls: 'g-part', key: 'board.g.part' },
    { g: '✗', cls: 'g-none', key: 'board.g.none' },
    { g: '?', cls: 'g-unknown', key: 'board.g.unknown' }
  ];

  function render(container: HTMLElement, track: Track, doc: BoardDoc | null, err: string | null): void {
    const box = document.createElement('div');
    box.className = 'board-wrap';

    if (err || !doc || doc.error || !doc.text) {
      box.innerHTML = `<div class="board-empty">${esc(err ?? doc?.error ?? t('board.t.nodata'))}</div>`;
      container.replaceChildren(box);
      return;
    }

    const rows = parseRows(doc.text);
    const today = todayUtc();

    /* ── 머리: 마지막 이정표까지 남은 날 + 시간이 얼마나 갔나 ────────────── */
    const startTs = parseDue(track.startedAt) ?? today;
    const endTs = parseDue(track.milestones[track.milestones.length - 1]?.date ?? '') ?? today;
    const goneRatio = endTs > startTs ? Math.min(1, Math.max(0, (today - startTs) / (endTs - startTs))) : 0;
    const daysLeft = Math.round((endTs - today) / MS_DAY);
    const others = track.milestones.slice(0, -1).map((m) => {
      const ts = parseDue(m.date);
      const d = ts === null ? null : Math.round((ts - today) / MS_DAY);
      return `${esc(t(m.label))} D-${d ?? '—'}`;
    }).join(' · ');

    /* ── 등급 막대: 12칸이 어디에 몰려 있나 ──────────────────────────── */
    const cheapest = rows.filter((r) => r.grade === '◐').length;
    const gradeRows = GRADE_ROWS.map(({ g, cls, key }) => {
      const mine = rows.filter((r) => r.grade === g);
      const blocks = mine.map((r) => `<span title="${esc(r.need)} · ${esc(r.due)}"></span>`).join('');
      const note = g === '◐' && cheapest > 0 ? t('board.t.cheapest') : '';
      return `<div class="board-grow ${cls}${mine.length === 0 ? ' empty' : ''}">
        <div class="lbl">${esc(t(key))}</div>
        <div class="board-blocks">${blocks}<b class="n">${mine.length}</b></div>
        <div class="note">${esc(note)}</div>
      </div>`;
    }).join('');

    /* ── 달별 점: 기한이 언제 몰려 있나. 채워진 점 = 끝난 것(✓) ───────── */
    const byMonth = new Map<string, Row[]>();
    for (const r of rows) {
      /* 글자를 자르면 「즉시」가 월이 되어 맨 끝으로 밀린다 — 제일 급한 칸이 화면 끝에 가서
         안 보였다(실측). 그래서 **읽어 낸 날짜**에서 월을 만든다. */
      const ts = parseDue(r.due);
      const key = ts === null ? '' : new Date(ts).toISOString().slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(r);
    }
    const months = Array.from(byMonth.entries())
      .sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0] < b[0] ? -1 : 1))
      .map(([m, list]) => {
        const dots = list.map((r) => {
          /* 점은 **상태 세 가지만** 말한다: 끝났나 · 아직인가 · 기한이 지났나.
             여기에 등급색까지 섞었더니 미래의 ✗ 항목이 빨갛게 떠서 「기한 지남」으로 읽혔다
             (2026-08-28 화면 실측). 색 하나에 뜻 하나. 이름은 마우스를 올리면 나온다. */
          const done = r.grade === '✓';
          const late = !done && r.dueDays !== null && r.dueDays < 0;
          const cls = done ? 'dot-done' : late ? 'dot-late' : 'dot-todo';
          return `<i class="${cls}" title="${esc(r.need)} · ${esc(r.grade)}"></i>`;
        }).join('');
        return `<div class="board-month">
          <div class="m">${esc(m || t('board.t.nodate'))}</div>
          <div class="board-dots">${dots}</div>
        </div>`;
      }).join('');

    /* ── 한 줄: 지금 제일 싼 것 = ◐ 중 기한이 가장 가까운 것 ─────────── */
    const pick = rows
      .filter((r) => r.grade === '◐' || r.grade === '?')
      .sort((a, b) => (a.dueDays ?? 9e9) - (b.dueDays ?? 9e9))[0]
      ?? rows.slice().sort((a, b) => (a.dueDays ?? 9e9) - (b.dueDays ?? 9e9))[0];

    const when = doc.modifiedMs ? new Date(doc.modifiedMs).toLocaleDateString() : '—';
    box.innerHTML = `
      <div class="board-hero">
        <div class="row">
          <span class="name">${esc(t(track.titleKey, undefined, 'Board'))}</span>
          <span class="dday">D-${daysLeft}</span>
          <span class="sub">${others}</span>
        </div>
        <div class="board-time"><i style="right:${((1 - goneRatio) * 100).toFixed(2)}%"></i></div>
        <div class="board-ends"><span>${esc(track.startedAt)}</span><span>${esc(track.milestones[track.milestones.length - 1]?.date ?? '')}</span></div>
      </div>

      <div class="board-grades">${gradeRows}</div>

      <div>
        <div class="board-months">${months}</div>
        <div class="board-ends" style="margin-top:10px"><span>${esc(t('board.t.dots'))}</span></div>
      </div>

      ${pick ? `<div class="board-lead">
        <div class="cap">${esc(t('board.t.pick'))}</div>
        <div class="what">${esc(pick.need)}</div>
        <div class="how">${esc(pick.next)}</div>
      </div>` : ''}

      <div class="board-foot"><span>${esc(doc.relPath)}</span><span>${esc(t('board.t.read'))} ${esc(when)}</span></div>
    `;
    container.replaceChildren(box);
  }


  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta('board'),
    tabs: TRACKS.map((track) => ({
      id: track.id,
      label: t(track.titleKey, undefined, 'Board'),
      build: function (container: HTMLElement): void {
        void loadNamespace('board').then(async function () {
          Mdd.injectCSS('board', CSS);
          const host = document.createElement('div');
          container.replaceChildren(host);
          host.innerHTML = `<div class="board-empty">${esc(t('board.t.loading'))}</div>`;

          if (!isDesktop()) {
            host.innerHTML = `<div class="board-empty">${esc(t('board.t.desktoponly'))}</div>`;
            return;
          }
          try {
            const docs = (await invoke('board_read', { keys: [track.docKey] })) as BoardDoc[];
            render(host, track, docs?.[0] ?? null, null);
          } catch (e) {
            render(host, track, null, String(e));
          }
        });
      }
    }))
  });
})();
