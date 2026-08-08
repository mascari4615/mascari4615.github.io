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

interface ToolMeta {
    id: string;
    title: string;
    category?: string | null;
    icon?: string;
    group?: string | null;
}

(function (): void {
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
        title: '도감',
        category: 'tool',
        desc: '써 본 도구에 도장이 찍힌다 — 몇 칸이나 채웠나',
        layout: 'wide',
        noHero: true,
        icon:
            '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M8 4v16" stroke="currentColor" stroke-width="1.7"/><path d="M12 9.5l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z" fill="currentColor"/>',
        tabs: [
            {
                id: 'app',
                label: '도감',
                build: function (container: HTMLElement): void {
                    container.innerHTML = `
                      <p class="cl-lead">써 본 도구에 도장이 찍힙니다. 지운 적 없으면 예전에 쓴 것도 들어 있어요.</p>
                      <div class="cl-head" id="clHead"></div>
                      <div class="cl-grid" id="clGrid"></div>
                    `;
                    const head = container.querySelector<HTMLElement>('#clHead')!;
                    const grid = container.querySelector<HTMLElement>('#clGrid')!;

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
                                : '<p class="cl-note">로그인하면 도감이 기기를 따라옵니다 — 지금은 이 브라우저에만 남아요.</p>');

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
                    };

                    draw(); // 로컬 먼저 — 서버를 기다리는 동안 빈 화면을 두지 않는다
                    void stampsFromServer().then(({ ids, signedIn }) => {
                        known = ids;
                        signed = signedIn;
                        draw();
                    });
                    onPageActive(container, draw);
                }
            }
        ]
    });

    /* 이 화면 자체도 도구다 — 열었으면 도장이 찍힌다(예외를 두면 「왜 이건 안 찍히지」가 된다). */
    stampToday('collection');
})();
