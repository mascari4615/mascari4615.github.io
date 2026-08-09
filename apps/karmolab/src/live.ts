/**
 * 실황 (TASK-KL-196 G) — 지금 이 사이트에 사람이 있다는 것을 **보이게**.
 *
 * 왜 있나: 접속자 수도 커서도 이미 재고 있는데 아무 화면도 안 보여 준다. 첫 화면이 말하는
 * 것은 Today/Total 누적 두 칸뿐이라 「지금 살아 있는 곳」으로는 안 읽힌다.
 *
 * 지키는 것 셋:
 *  - **누구인지는 안 쓴다.** 「누가 무엇을 열었다」가 아니라 「무엇이 열렸다」다.
 *    도구 사이트에서 남이 뭘 여는지 이름과 함께 보이면 그건 재미가 아니라 감시다.
 *  - **없으면 안 그린다.** 아무도 없고 방금 열린 것도 없으면 이 줄은 통째로 사라진다 —
 *    「지금 0명」은 북적임이 아니라 죽은 화면이다.
 *  - **지어내지 않는다.** 숫자는 전부 서버 실측이고, 못 받아 오면 그냥 없다.
 */
/* 셸의 `Toolbox` 는 **전역 이름**이지 `window` 의 것이 아니다 — `window.Toolbox` 로 부르면
   조용히 아무 일도 안 일어난다(말로 부리기에서 이미 한 번 당했다). 이름 그대로 쓴다. */
declare const Toolbox: { switchPage: (id: string) => void; onDispose?: (fn: () => void) => void };

const REFRESH_MS = 30000;

interface LiveData {
    online: number;
    recent: Array<{ toolId: string; at: string }>;
}

/** 얼마 전인가 — 초 단위까지 쓰지 않는다(1초마다 바뀌는 글자는 읽는 것을 방해한다). */
function ago(iso: string, now = Date.now()): string {
    const diff = Math.max(0, now - Date.parse(iso));
    const min = Math.round(diff / 60000);
    if (min < 1) return '방금';
    if (min < 60) return `${min}분 전`;
    return `${Math.round(min / 60)}시간 전`;
}

function titleOf(toolId: string): string | null {
    const meta = (window as any).KARMOLAB_LAZY_META_BY_ID || {};
    return (meta[toolId] && meta[toolId].title) || null;
}

async function fetchLive(): Promise<LiveData | null> {
    const base = (window as any).KarmoAccount?.apiBase;
    if (!base) return null;
    try {
        const response = await fetch(base + '/kl/live');
        if (!response.ok) return null;
        const data = await response.json();
        return { online: Number(data.online) || 0, recent: Array.isArray(data.recent) ? data.recent : [] };
    } catch {
        return null;
    }
}

function paint(slot: HTMLElement, data: LiveData | null): void {
    if (!slot.isConnected) return;
    /* 이름을 못 찾는 도구는 뺀다 — 화면에 id 가 그대로 뜨면 내부 사정이 새어 나온 것처럼 보인다. */
    const rows = (data?.recent ?? []).map((row) => ({ ...row, title: titleOf(row.toolId) })).filter((row) => row.title);
    if (!data || (!data.online && !rows.length)) {
        slot.innerHTML = '';
        /* **아무도 없으면 자리도 없앤다** (TASK-KL-201, 2026-08-10).
           데려오는 동안은 자리를 잡아 두지만(`data-reserving`), 보여 줄 것이 없으면 그 표를 뗀다 —
           안 그러면 빈 상자가 129px 떠 있는다. 「지금 0명」은 북적임이 아니라 죽은 화면이다. */
        delete slot.dataset.reserving;
        return;
    }
    const head = data.online > 0 ? `<span class="lv-now"><i></i>지금 ${data.online}명</span>` : '';
    const chips = rows
        .slice(0, 5)
        .map(
            (row) =>
                `<button type="button" class="lv-chip" data-go="${row.toolId}">${row.title}` +
                `<span>${ago(row.at)}</span></button>`
        )
        .join('');
    slot.innerHTML =
        `<div class="lv-line">${head}` +
        (chips ? `<span class="lv-label">방금 열린 것</span><span class="lv-chips">${chips}</span>` : '') +
        '</div>';
    slot.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((chip) => {
        chip.addEventListener('click', () => Toolbox.switchPage(chip.dataset.go!));
    });
}

export function mount(slot: HTMLElement): void {
    const tick = async (): Promise<void> => {
        if (!slot.isConnected) return;
        paint(slot, await fetchLive());
    };
    void tick();
    const timer = setInterval(() => {
        // 탭이 뒤에 있으면 묻지 않는다 — 아무도 안 보는 화면을 위해 서버를 두들기지 않는다.
        if (document.visibilityState === 'visible') void tick();
    }, REFRESH_MS);
    Toolbox.onDispose?.(() => clearInterval(timer));
}

(window as any).KarmoLive = { mount, ago };
