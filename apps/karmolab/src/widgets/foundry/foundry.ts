/**
 * 선반 — 여기 도구로 만든 것이 쌓이는 자리 (TASK-KL-254)
 *
 * KarmoLab 에는 도구가 많은데 만든 결과가 안 남았다. 뽑으면 내려받기 폴더로 끝이라 다시 찾지도,
 * 남에게 보이지도 못한다. 참고한 곳(freegameui.net)의 알맹이는 에셋이 아니라
 * **툴 → 산출물 → 공개 → 산출물이 툴을 부른다**는 고리였다 — 이 화면이 그 고리의 마지막 칸이다.
 *
 * 규칙 둘:
 *  1. **종류로 나눈다.** 이미지·벡터·소리가 한 칸에 섞이면 잡동사니가 되고, 잡동사니는 아무도 안 본다.
 *  2. **어느 도구로 만들었는지 항상 보인다.** 그게 없으면 선반은 그냥 파일 창고다 —
 *     보다가 「나도 만들어 볼까」로 넘어가는 길이 카드 안에 있어야 한다.
 *
 * 서버가 죽어도 화면은 살아 있어야 한다. 못 읽으면 그 사실을 적고, 다시 시도할 자리를 준다.
 */

import { listFoundry, foundryBase, type FoundryItem } from '../../lib/foundry';

declare const Toolbox: {
  register(spec: unknown): void;
  getLazyWidgetPublicMeta?(id: string): unknown;
  onDispose?(fn: () => void): void;
};

const esc = (v: unknown): string =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** 도구 이름 → 사람이 읽는 이름. 모르는 도구는 이름 그대로 둔다(빈칸보다 낫다). */
const TOOL_NAME: Record<string, string> = { bon: '본', meok: '먹', imagegen: '그림 생성', heung: '흥' };

const KST = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
});

const sizeText = (bytes: number): string =>
  bytes < 1024 ? `${bytes}B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;

function injectStyles(): void {
  if (document.getElementById('foundry-style')) return;
  const style = document.createElement('style');
  style.id = 'foundry-style';
  style.textContent = `
    .fd-wrap { display:flex; flex-direction:column; gap:12px; min-height:420px; font-size:12px; }
    .fd-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .fd-head h3 { margin:0; font-size:15px; }
    .fd-head .fd-note { color:var(--text-secondary); font-size:11px; }
    .fd-head .fd-spacer { flex:1; }
    .fd-tabs { display:flex; gap:6px; flex-wrap:wrap; }
    .fd-tabs button { border:1px solid var(--border); background:var(--bg-tertiary);
      color:var(--text-primary); border-radius:999px; padding:4px 12px; cursor:pointer; font-size:12px; }
    .fd-tabs button.active { border-color:var(--accent); background:var(--bg-hover, var(--bg-secondary)); }
    .fd-tabs button small { color:var(--text-secondary); margin-left:5px; font-variant-numeric:tabular-nums; }
    .fd-grid { display:grid; gap:12px; grid-template-columns:repeat(auto-fill, minmax(168px, 1fr)); }
    .fd-card { margin:0; border:1px solid var(--border); border-radius:10px; overflow:hidden;
      background:var(--bg-secondary); display:flex; flex-direction:column; }
    .fd-thumb { height:120px; display:block; width:100%; object-fit:contain; padding:8px;
      background-color:#fff;
      background-image:linear-gradient(45deg,#e4e4e4 25%,transparent 25%,transparent 75%,#e4e4e4 75%),
                       linear-gradient(45deg,#e4e4e4 25%,transparent 25%,transparent 75%,#e4e4e4 75%);
      background-size:14px 14px; background-position:0 0,7px 7px; }
    .fd-body { padding:8px 10px 10px; display:flex; flex-direction:column; gap:5px; }
    .fd-title { font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .fd-meta { display:flex; align-items:center; gap:6px; color:var(--text-secondary); font-size:11px; }
    .fd-tool { border:1px solid var(--border); border-radius:5px; padding:1px 6px; }
    .fd-acts { display:flex; gap:6px; margin-top:2px; }
    .fd-acts a, .fd-acts button { flex:1; text-align:center; border:1px solid var(--border);
      background:var(--bg-tertiary); color:var(--text-primary); border-radius:6px; padding:4px 6px;
      cursor:pointer; font-size:11px; text-decoration:none; }
    .fd-acts a:hover, .fd-acts button:hover { border-color:var(--accent); }
    .fd-empty, .fd-error { padding:28px 12px; text-align:center; color:var(--text-secondary); }
    .fd-error { color:#ff6b6b; }
    .fd-error button { margin-left:8px; }
  `;
  document.head.append(style);
}

function buildFoundry(container: HTMLElement): void {
  injectStyles();
  let all: FoundryItem[] = [];
  let tools: Record<string, number> = {};
  let picked = '';   // 빈 값 = 전부

  container.innerHTML =
    '<div class="fd-wrap">' +
      '<div class="fd-head">' +
        '<h3>선반</h3>' +
        '<span class="fd-note">여기 도구로 만든 것. 전부 CC0 — 아무나 가져다 쓴다.</span>' +
        '<span class="fd-spacer"></span>' +
        '<button data-act="reload">새로 읽기</button>' +
      '</div>' +
      '<div class="fd-tabs" data-tabs></div>' +
      '<div data-body></div>' +
    '</div>';

  const tabs = container.querySelector('[data-tabs]') as HTMLElement;
  const body = container.querySelector('[data-body]') as HTMLElement;

  function drawTabs(): void {
    const names = Object.keys(tools).sort();
    const total = Object.values(tools).reduce((sum, n) => sum + n, 0);
    tabs.innerHTML =
      '<button data-tool="" class="' + (picked === '' ? 'active' : '') + '">전부<small>' + total + '</small></button>' +
      names.map((name) =>
        '<button data-tool="' + esc(name) + '" class="' + (picked === name ? 'active' : '') + '">' +
        esc(TOOL_NAME[name] ?? name) + '<small>' + tools[name] + '</small></button>').join('');
  }

  function drawItems(): void {
    const items = picked ? all.filter((x) => x.tool === picked) : all;
    if (items.length === 0) {
      body.innerHTML = '<div class="fd-empty">아직 아무것도 없다. 도구에서 만든 것을 올려 보라.</div>';
      return;
    }
    body.innerHTML = '<div class="fd-grid">' + items.map((item) =>
      '<figure class="fd-card">' +
        '<img class="fd-thumb" src="' + esc(item.url) + '" alt="' + esc(item.title) + '" loading="lazy">' +
        '<div class="fd-body">' +
          '<span class="fd-title">' + esc(item.title) + '</span>' +
          '<span class="fd-meta">' +
            '<span class="fd-tool">' + esc(TOOL_NAME[item.tool] ?? item.tool) + '</span>' +
            esc(sizeText(item.bytes)) + ' · ' + esc(KST.format(new Date(item.createdAt))) +
          '</span>' +
          '<span class="fd-acts">' +
            '<a href="' + esc(item.url) + '" download>내려받기</a>' +
            // 만든 도구로 되돌려보내는 고리 — 이게 없으면 선반은 그냥 파일 창고다.
            (item.recipe ? '<a href="#' + esc(item.tool) + '">' + esc(TOOL_NAME[item.tool] ?? item.tool) + '에서 열기</a>' : '') +
          '</span>' +
        '</div>' +
      '</figure>').join('') + '</div>';
  }

  async function load(): Promise<void> {
    body.innerHTML = '<div class="fd-empty">선반을 읽는 중…</div>';
    try {
      const result = await listFoundry({ limit: 120 });
      all = result.items;
      tools = result.tools;
      drawTabs();
      drawItems();
    } catch (error) {
      // 서버가 죽어도 화면은 살아 있어야 한다 — 무슨 일인지 적고, 다시 할 자리를 준다.
      tabs.innerHTML = '';
      body.innerHTML = '<div class="fd-error">선반을 못 읽었다 — ' +
        esc(error instanceof Error ? error.message : String(error)) +
        '<br><small>' + esc(foundryBase()) + '</small>' +
        '<button data-act="reload">다시</button></div>';
    }
  }

  container.addEventListener('click', (event) => {
    const el = event.target as HTMLElement;
    const tab = el.closest<HTMLElement>('[data-tool]');
    if (tab) {
      picked = tab.dataset.tool ?? '';
      drawTabs();
      drawItems();
      return;
    }
    if (el.closest('[data-act="reload"]')) void load();
  });

  void load();
}

(function register(): void {
  Toolbox.register({
    ...(Toolbox.getLazyWidgetPublicMeta ? Toolbox.getLazyWidgetPublicMeta('foundry') || {} : {}),
    id: 'foundry',
    category: 'tool',
    layout: 'full',
    icon: '<path d="M3 8h18M3 14h18" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="7" cy="11" r="1.2" fill="currentColor"/><circle cx="7" cy="17" r="1.2" fill="currentColor"/>',
    tabs: [{ id: 'foundry-main', label: '선반', build: buildFoundry }]
  });
})();
