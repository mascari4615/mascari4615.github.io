/**
 * 도감 (TASK-KL-196 A) — 도구를 쓰면 칸이 채워진다.
 *
 * 왜 있나: 도구가 160개인데 **쓴 흔적이 아무 데도 안 남는다**. 어제 쓴 도구도, 처음 써 본
 * 도구도 화면에는 똑같이 생겼다. 그래서 160개가 「필요할 때 찾는 목록」이지 내 것이 되지 않는다.
 * 도감은 만들 것을 거의 안 더하고 그 160개를 그대로 채울 것으로 바꾼다.
 *
 * 새 판정은 안 만든다:
 *  - **로그인한 사람** — 서버는 이미 발자국(`footprint.tools`)에 어느 도구를 열었는지 갖고 있다.
 *    도감은 그것을 읽기만 한다(새 저장 0). 그래서 기기를 바꿔도 도감이 따라온다.
 *  - **로그인 안 한 사람** — 이 브라우저에 처음 쓴 날만 적는다(`karmolab_stamps`).
 *    도감이 로그인 뒤에만 보이면, 도감을 보려고 로그인하는 것이 아니라 로그인해야 도감이 있는
 *    셈이 된다 — 순서가 반대다.
 *  - 둘 다 있으면 **합친다.** 서버에 있는데 이 브라우저에 없는 것도 내가 쓴 것이다.
 *
 * 「몇 번 썼나」는 안 센다. 도감은 수집이지 성적표가 아니다 — 횟수를 보여 주는 순간 적게 쓴
 * 칸이 부끄러운 칸이 된다.
 */
import { stampsLocal, stampToday } from '../stamps';
import { onPageActive } from './pack-pick';
import { SECRETS, foundLocal, syncSecrets } from '../secrets';
import { t, loadNamespace } from '../lib/i18n';

interface ToolMeta {
    id: string;
    title: string;
    category?: string | null;
    icon?: string;
    group?: string | null;
}

(function (): void {
  const esc = (v: unknown): string =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    /* 도감 스타일은 **이 화면이 열릴 때만** 온다 (TASK-KL-196).
       공용 시트(`css/tools.css`)에 넣었더니 도구 화면 130장이 도감 스타일을 같이 받아
       그쪽 CSS 천장(68KB gz)에 붙었다 — 한 화면에서만 쓰는 것을 모두에게 지우지 않는다. */
    function injectStyles(): void {
        if (document.getElementById('collection-widget-styles')) return;
        const style = document.createElement('style');
        style.id = 'collection-widget-styles';
        style.textContent = `/* 도감 (TASK-KL-196) — 써 본 도구에 도장. 빈 칸도 **보여야** 한다:
   안 써 본 것이 안 보이면 채울 것이 없는 도감이 된다(그건 그냥 최근 목록이다). */
.cl-lead { color: var(--text-secondary); font-size: var(--font-size-sm); margin: 0 0 14px; }
.cl-head { margin-bottom: 16px; }
.cl-count { font-size: var(--font-size-lg); color: var(--text-secondary); display: flex; align-items: baseline; gap: 8px; }
.cl-count b { font-size: 32px; color: var(--accent); font-variant-numeric: tabular-nums; }
.cl-pct { margin-left: auto; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--text-tertiary); }
.cl-bar { height: 6px; border-radius: 999px; background: var(--bg-secondary); border: 1px solid var(--border);
    overflow: hidden; margin-top: 8px; }
.cl-bar i { display: block; height: 100%; background: var(--accent); transition: width 240ms ease; }
.cl-note { margin: 10px 0 0; font-size: var(--font-size-xs); color: var(--text-tertiary); }
.cl-grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); }
.cl-cell { display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 12px 6px;
    background: transparent; border: 1px dashed var(--border); border-radius: var(--radius-sm);
    color: var(--text-tertiary); font: inherit; cursor: pointer; text-align: center;
    transition: border-color var(--transition), color var(--transition), background var(--transition); }
.cl-cell:hover { border-color: var(--text-tertiary); color: var(--text-secondary); }
/* 찍힌 칸 = 실선 + 색. 점선/실선까지 같이 바꾸는 이유 = 색만으로 가르면 못 보는 사람이 있다. */
.cl-cell.is-on { border-style: solid; border-color: var(--border); background: var(--bg-secondary); color: var(--text-primary); }
.cl-cell.is-on .cl-ico { color: var(--accent); opacity: 1; }
.cl-ico { width: 26px; height: 26px; opacity: 0.45; }
.cl-ico svg { width: 100%; height: 100%; }
.cl-name { font-size: var(--font-size-xs); line-height: 1.3; word-break: keep-all; }

/* 숨긴 것 (TASK-KL-196 D) — 못 찾은 칸은 「?」 하나. 이름을 적으면 숨긴 것이 아니게 된다. */
.cl-secrets { margin-top: 28px; padding-top: 18px; border-top: 1px solid var(--border); }
.cl-sec-title { margin: 0 0 10px; font-size: var(--font-size-sm); color: var(--text-secondary); font-weight: 700; }
.cl-sec-title b { color: var(--accent); font-variant-numeric: tabular-nums; }
.cl-sec-row { display: flex; flex-wrap: wrap; gap: 6px; }
.cl-sec { display: inline-flex; align-items: center; justify-content: center; min-width: 34px; padding: 5px 10px;
    border: 1px dashed var(--border); border-radius: var(--radius-sm);
    font-size: var(--font-size-xs); color: var(--text-tertiary); font-family: var(--font-mono); }
.cl-sec.is-on { border-style: solid; border-color: var(--accent); color: var(--accent); font-family: inherit; }`;
        document.head.appendChild(style);
    }

    /** 도감이 세는 것 = 사람이 열 수 있는 도구. 놀이·문서 같은 화면은 도구가 아니다. */
    const isTool = (meta: ToolMeta): boolean => meta.category === 'tool';

    function allTools(): ToolMeta[] {
        const lazy = ((window as any).KARMOLAB_LAZY_META || []) as ToolMeta[];
        const seen = new Set<string>();
        const out: ToolMeta[] = [];
        for (const meta of lazy) {
            if (!meta || !meta.id || seen.has(meta.id) || !isTool(meta)) continue;
            seen.add(meta.id);
            out.push(meta);
        }
        return out.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
    }

    /** 서버가 아는 내 도장 (발자국). 못 받으면 빈 집합 — 도감은 로컬만으로도 뜬다. */
    async function stampsFromServer(): Promise<{ ids: Set<string>; signedIn: boolean }> {
        const base = (window as any).KarmoAccount?.apiBase;
        if (!base) return { ids: new Set(), signedIn: false };
        try {
            const response = await fetch(base + '/kl/me/collection', { credentials: 'include' });
            if (!response.ok) return { ids: new Set(), signedIn: false };
            const data = await response.json();
            return { ids: new Set<string>(data.tools || []), signedIn: !!data.signedIn };
        } catch {
            return { ids: new Set(), signedIn: false };
        }
    }

    Toolbox.register({
        id: 'collection',
        title: t('widgets.collection.title', undefined, "도감"),
        category: 'tool',
        desc: t('widgets-desc.collection.desc', undefined, "써 본 도구에 도장이 찍힌다 — 몇 칸이나 채웠나"),
        layout: 'wide',
        noHero: true,
        icon:
            '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M8 4v16" stroke="currentColor" stroke-width="1.7"/><path d="M12 9.5l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z" fill="currentColor"/>',
        tabs: [
            {
                id: 'app',
                label: t('collection.t03', undefined, "도감"),
                build: function (container: HTMLElement): void {
                  void loadNamespace('collection').then(function () {

                    injectStyles();
                    container.innerHTML = `
                      <p class="cl-lead">${esc(t('collection.t01'))}</p>
                      <div class="cl-head" id="clHead"></div>
                      <div class="cl-grid" id="clGrid"></div>
                      <section class="cl-secrets" id="clSecrets"></section>
                    `;
                    const head = container.querySelector<HTMLElement>('#clHead')!;
                    const grid = container.querySelector<HTMLElement>('#clGrid')!;
                    const secretSlot = container.querySelector<HTMLElement>('#clSecrets')!;

                    /* 숨긴 것 (TASK-KL-196 D). **개수는 보여 주고 이름은 안 보여 준다** —
                       못 찾은 것의 이름까지 적어 두면 그건 숨긴 것이 아니라 목록이다.
                       그렇다고 통째로 감추면 찾을 것이 있는 줄도 모른다. */
                    const paintSecrets = (): void => {
                        const found = new Set(foundLocal());
                        secretSlot.innerHTML =
                            `<h3 class="cl-sec-title">${esc(t('collection.t02'))} <b>${found.size}</b> / ${SECRETS.length}</h3>` +
                            '<div class="cl-sec-row">' +
                            SECRETS.map((secret) =>
                                found.has(secret.id)
                                    ? `<span class="cl-sec is-on" title="${secret.how}">${secret.title}</span>`
                                    : '<span class="cl-sec">?</span>'
                            ).join('') +
                            '</div>' +
                            (found.size === SECRETS.length
                                ? t('collection.t05')
                                : t('collection.t06'));
                    };

                    const paint = (stamped: Set<string>, signedIn: boolean): void => {
                        if (!container.isConnected) return;
                        const tools = allTools();
                        const local = stampsLocal();
                        const mine = tools.filter((tool) => stamped.has(tool.id));
                        const percent = tools.length ? Math.round((mine.length / tools.length) * 100) : 0;

                        /* 로그인 안 한 사람에게 「이 브라우저에만 남습니다」를 말해 준다.
                           안 말하면 기록을 지운 날 도감이 사라진 것을 고장으로 읽는다. */
                        head.innerHTML =
                            `<div class="cl-count"><b>${mine.length}</b> / ${tools.length}` +
                            `<span class="cl-pct">${percent}%</span></div>` +
                            `<div class="cl-bar"><i style="width:${percent}%"></i></div>` +
                            (signedIn
                                ? ''
                                : t('collection.t07'));

                        grid.innerHTML = tools
                            .map((tool) => {
                                const has = stamped.has(tool.id);
                                const day = local[tool.id];
                                const when = has && day ? ` · ${day}` : '';
                                return (
                                    `<button type="button" class="cl-cell${has ? ' is-on' : ''}" data-tool="${tool.id}" ` +
                                    `title="${tool.title}${when}">` +
                                    `<span class="cl-ico"><svg viewBox="0 0 24 24" fill="none">${tool.icon || ''}</svg></span>` +
                                    `<span class="cl-name">${tool.title}</span>` +
                                    `</button>`
                                );
                            })
                            .join('');

                        grid.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((cell) => {
                            cell.addEventListener('click', () => Toolbox.switchPage(cell.dataset.tool!));
                        });
                    };

                    /* 앱은 한 번 그린 화면을 그대로 다시 보여 준다 — 도구를 쓰고 도감으로
                       돌아와도 **아까 그 숫자**가 그대로였다(실측: 0칸인 채였다).
                       도감은 「방금 쓴 것이 찍혔나」를 보러 오는 화면이라 이게 곧 고장이다.
                       다시 보이는 그 순간에 한 번 더 그린다(놀이 셋이 쓰는 길과 같은 것). */
                    let known = new Set<string>();
                    let signed = false;

                    const draw = (): void => {
                        const ids = new Set(known);
                        for (const id of Object.keys(stampsLocal())) ids.add(id);
                        paint(ids, signed);
                        paintSecrets();
                    };

                    draw(); // 로컬 먼저 — 서버를 기다리는 동안 빈 화면을 두지 않는다
                    void stampsFromServer().then(({ ids, signedIn }) => {
                        known = ids;
                        signed = signedIn;
                        draw();
                    });
                    /* 다른 기기에서 찾아 둔 것도 여기 보여야 한다 — 받아 오면 다시 그린다. */
                    void syncSecrets().then(() => {
                        if (container.isConnected) paintSecrets();
                    });
                    onPageActive(container, draw);
                                  });
                }
            }
        ]
    });

    /* 이 화면 자체도 도구다 — 열었으면 도장이 찍힌다(예외를 두면 「왜 이건 안 찍히지」가 된다). */
    stampToday('collection');
})();
