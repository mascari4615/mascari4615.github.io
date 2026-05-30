/**
 * cards-tab.ts — 에이전트 카드 피드 (Cockpit 탭, TASK-KL-082 병합).
 * agent-team.ts buildCanvas() 로직 이식. Toolbox.register X.
 */
import { invoke as tauriInvoke } from '../../tauri-bridge';

type CardInfo = {
  ts: string;
  source: string;
  session?: string;
  kind?: string;
  topic?: string;
  summary: string;
  task_ids: string[];
};

const REFRESH_MS = 5000;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  );
}

function kindColor(k: string | undefined): string {
  switch ((k || '').toLowerCase()) {
    case 'fix': return '#e85';
    case 'decision': return '#39c';
    case 'finding': case 'discovery': return '#3a8';
    case 'incident': return '#c44';
    case 'note': return '#888';
    default: return '#777';
  }
}

function formatTs(ts: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts.slice(0, 16);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

export function buildCardsTab(container: HTMLElement): void {
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:.75rem;padding:1rem;font-size:.9rem;height:100%;overflow-y:auto;box-sizing:border-box">
      <header style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap">
        <h2 style="margin:0;font-size:1.05rem">🎴 에이전트 카드 피드</h2>
        <span class="ac-meta" style="opacity:.6;font-size:.78rem;flex:1"></span>
        <input class="ac-search" type="search" placeholder="검색 (토픽·본문)" style="padding:.25rem .5rem;min-width:10rem" />
        <select class="ac-filter" style="padding:.25rem .4rem">
          <option value="all">전체</option>
          <option value="decision">결정</option>
          <option value="fix">수정</option>
          <option value="finding">발견</option>
          <option value="incident">사고</option>
          <option value="note">노트</option>
        </select>
        <button class="ac-refresh" type="button" style="padding:.3rem .7rem">새로고침</button>
      </header>
      <div class="ac-list" style="display:flex;flex-direction:column;gap:.4rem"></div>
      <div class="ac-err" style="display:none;color:#e66;padding:.5rem;border:1px solid #e66;border-radius:.3rem;white-space:pre-wrap"></div>
    </div>
  `;

  const meta        = container.querySelector<HTMLSpanElement>('.ac-meta')!;
  const filterSel   = container.querySelector<HTMLSelectElement>('.ac-filter')!;
  const searchInput = container.querySelector<HTMLInputElement>('.ac-search')!;
  const refreshBtn  = container.querySelector<HTMLButtonElement>('.ac-refresh')!;
  const list        = container.querySelector<HTMLDivElement>('.ac-list')!;
  const errBox      = container.querySelector<HTMLDivElement>('.ac-err')!;

  let allCards: CardInfo[] = [];

  function render(): void {
    const filter = filterSel.value;
    const sq = searchInput.value.trim().toLowerCase();
    let rows = filter === 'all' ? allCards : allCards.filter((c) => (c.kind || '').toLowerCase() === filter);
    if (sq) rows = rows.filter((c) => `${c.topic ?? ''} ${c.summary} ${c.session ?? ''} ${c.source}`.toLowerCase().includes(sq));
    meta.textContent = sq || filter !== 'all' ? `${rows.length} / ${allCards.length} (필터)` : `${allCards.length}건 (최근)`;
    if (rows.length === 0) { list.innerHTML = '<div style="opacity:.5;padding:1rem;text-align:center">표시할 카드 없음</div>'; return; }
    list.innerHTML = rows.map((c) => {
      const k = c.kind || '?';
      const badge = `<span style="display:inline-block;padding:.05rem .35rem;border-radius:.25rem;font-size:.68rem;background:${kindColor(c.kind)};color:#fff;font-family:monospace">${esc(k)}</span>`;
      const topic = c.topic ? `<span style="font-size:.74rem;opacity:.7;font-family:monospace;margin-left:.4rem">${esc(c.topic)}</span>` : '';
      const session = c.session ? `<span style="font-size:.7rem;opacity:.55;margin-left:.4rem">@${esc(c.session)}</span>` : '';
      return `<div style="padding:.45rem .6rem;border:1px solid rgba(127,127,127,.2);border-radius:.3rem">
        <div style="display:flex;align-items:center;gap:.3rem">
          ${badge}${topic}${session}
          <span style="margin-left:auto;font-size:.7rem;opacity:.55;font-family:monospace">${esc(formatTs(c.ts))}</span>
        </div>
        <div style="margin-top:.25rem;line-height:1.5;font-size:.85rem">${esc(c.summary)}</div>
        <div style="font-size:.66rem;opacity:.4;margin-top:.2rem;font-family:monospace">${esc(c.source)}</div>
      </div>`;
    }).join('');
  }

  async function load(): Promise<void> {
    errBox.style.display = 'none';
    meta.textContent = '로딩 중...';
    try {
      const repoRoot = (await tauriInvoke('localdev_get_repo_root')) as string | null;
      if (!repoRoot) {
        errBox.style.display = 'block';
        errBox.textContent = 'repo_root 미설정 — Server Monitor 에서 저장소 루트 선택해주세요.';
        meta.textContent = '';
        return;
      }
      allCards = (await tauriInvoke('agent_team_list_cards', { repoRoot, limit: 240 })) as CardInfo[];
      render();
    } catch (e) {
      errBox.style.display = 'block';
      errBox.textContent = `로드 실패: ${String(e)}`;
      meta.textContent = '';
    }
  }

  filterSel.addEventListener('change', render);
  searchInput.addEventListener('input', render);
  refreshBtn.addEventListener('click', () => void load());
  void load();
  window.setInterval(() => void load(), REFRESH_MS);
}
