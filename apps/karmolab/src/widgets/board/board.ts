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
    milestones: Milestone[];     // D-Day 로 셀 날짜들
  }
  const TRACKS: Track[] = [
    {
      id: 'career',
      docKey: 'career-scoreboard',
      titleKey: 'board.track.career',
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
.board-wrap{display:flex;flex-direction:column;gap:16px;padding:4px 2px 24px}
.board-head{display:flex;flex-wrap:wrap;gap:12px;align-items:stretch}
.board-dday{flex:1 1 180px;min-width:160px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;padding:12px 14px}
.board-dday .lbl{font-size:var(--font-size-xs);color:var(--text-tertiary)}
.board-dday .num{font-size:32px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--accent);line-height:1.1}
.board-dday .sub{font-size:var(--font-size-xs);color:var(--text-secondary)}
.board-bar{display:flex;gap:8px;flex-wrap:wrap}
.board-chip{display:flex;align-items:center;gap:6px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:999px;padding:5px 12px;font-size:var(--font-size-sm)}
.board-chip b{font-variant-numeric:tabular-nums}
.board-table{width:100%;border-collapse:collapse;font-size:var(--font-size-sm)}
.board-table th{text-align:left;font-size:var(--font-size-xs);color:var(--text-tertiary);font-weight:600;padding:6px 8px;border-bottom:1px solid var(--border)}
.board-table td{padding:9px 8px;border-bottom:1px solid var(--border);vertical-align:top}
.board-table tr:hover td{background:var(--bg-secondary)}
.board-g{display:inline-block;min-width:22px;text-align:center;font-weight:800}
.board-g.g-done{color:#3fb950}.board-g.g-half{color:#d29922}.board-g.g-part{color:#58a6ff}
.board-g.g-none{color:#f85149}.board-g.g-unknown{color:var(--text-tertiary)}
.board-due{white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--text-secondary)}
.board-due.over{color:#f85149;font-weight:700}
.board-due.soon{color:#d29922;font-weight:600}
.board-next{color:var(--text-secondary)}
.board-foot{font-size:var(--font-size-xs);color:var(--text-tertiary);display:flex;gap:10px;flex-wrap:wrap}
.board-empty{padding:28px;text-align:center;color:var(--text-secondary);background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px}
`;

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

    const ddays = track.milestones.map((m) => {
      const ts = parseDue(m.date);
      const left = ts === null ? null : Math.round((ts - today) / MS_DAY);
      return `<div class="board-dday">
        <div class="lbl">${esc(t(m.label))}</div>
        <div class="num">${left === null ? '—' : 'D-' + left}</div>
        <div class="sub">${esc(m.date)}</div>
      </div>`;
    }).join('');

    const counts = GRADES.map((g) => ({ g, n: rows.filter((r) => r.grade === g).length }));
    const chips = counts.map((c) =>
      `<div class="board-chip"><span class="board-g ${GRADE_CLASS[c.g]}">${c.g}</span><b>${c.n}</b></div>`
    ).join('');

    /* 급한 것이 위로 — 날짜가 있는 것 먼저, 그중 가까운 것 먼저. */
    const sorted = rows.slice().sort((a, b) => {
      if (a.dueDays === null && b.dueDays === null) return 0;
      if (a.dueDays === null) return 1;
      if (b.dueDays === null) return -1;
      return a.dueDays - b.dueDays;
    });

    const body = sorted.map((r) => {
      const cls = r.dueDays === null ? '' : r.dueDays < 0 ? ' over' : r.dueDays <= 30 ? ' soon' : '';
      const dueText = r.dueDays === null ? r.due : `${r.due} · D${r.dueDays < 0 ? '+' + -r.dueDays : '-' + r.dueDays}`;
      return `<tr>
        <td><span class="board-g ${GRADE_CLASS[r.grade]}">${r.grade}</span></td>
        <td><b>${esc(r.need)}</b><br><span class="board-next">${esc(r.evidence)}</span></td>
        <td class="board-next">${esc(r.next)}</td>
        <td class="board-due${cls}">${esc(dueText)}</td>
      </tr>`;
    }).join('');

    const when = doc.modifiedMs ? new Date(doc.modifiedMs).toLocaleString() : '—';
    box.innerHTML = `
      <div class="board-head">${ddays}</div>
      <div class="board-bar">${chips}<div class="board-chip">${esc(t('board.t.total'))} <b>${rows.length}</b></div></div>
      ${rows.length === 0 ? `<div class="board-empty">${esc(t('board.t.norows'))}</div>` : `
      <table class="board-table">
        <thead><tr>
          <th>${esc(t('board.t.grade'))}</th>
          <th>${esc(t('board.t.need'))}</th>
          <th>${esc(t('board.t.next'))}</th>
          <th>${esc(t('board.t.due'))}</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>`}
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
