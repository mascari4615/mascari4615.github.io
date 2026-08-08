/**
 * 나만의 첫 화면 (TASK-KL-196 H).
 *
 * 왜 있나: 첫 화면이 모두에게 똑같다. 매일 오는 사람과 처음 온 사람이 같은 화면을 보고,
 * 안 쓰는 줄도 늘 그 자리에 있다. **내 자리처럼 보이는 화면**은 다시 올 이유의 일부다.
 *
 * 무엇을 바꾸나: 첫 화면 블록의 **순서와 표시**, 그리고 부르는 이름. 새 화면을 만들지 않고
 * 이미 있는 블록(`data-block`)을 재배치한다 — 꾸밀 것이 늘 때마다 첫 화면을 새로 짜야 하면
 * 아무도 안 늘린다.
 *
 * 안 바꾸는 것: **찾는 칸과 제목**은 자리가 고정이다. 그 둘은 이 사이트가 무엇인지 말하는
 * 자리라, 감추거나 내리면 처음 온 사람이 길을 잃는다 — 내 화면을 꾸미는 것과 남의 첫인상을
 * 부수는 것은 다르다.
 *
 * 저장은 이 브라우저에만(`karmolab_home_prefs`). 테마·즐겨찾기와 같은 성질이다.
 */
declare const Toolbox: { showToast?: (msg: string) => void };

interface HomePrefs {
    order: string[];
    hidden: string[];
    name: string;
}

const KEY = 'karmolab_home_prefs';

/** 옮길 수 있는 블록 — 이름은 화면에 그대로 나온다. 여기 없는 블록은 손대지 않는다. */
const BLOCKS: Array<{ id: string; label: string }> = [
    { id: 'today', label: '오늘의 판' },
    { id: 'live', label: '실황' },
    { id: 'cta', label: '갈 곳 카드' },
    { id: 'pulse', label: '방문 수' }
];

function read(): HomePrefs {
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
        return {
            order: Array.isArray(raw.order) ? raw.order.filter((id: unknown) => typeof id === 'string') : [],
            hidden: Array.isArray(raw.hidden) ? raw.hidden.filter((id: unknown) => typeof id === 'string') : [],
            name: typeof raw.name === 'string' ? raw.name.slice(0, 20) : ''
        };
    } catch {
        return { order: [], hidden: [], name: '' };
    }
}

function write(prefs: HomePrefs): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
        /* 사생활 모드 — 이번 화면에만 적용된다 */
    }
}

/** 저장된 순서 + 아직 모르는 블록(나중에 생긴 것)은 뒤에 붙인다. 사라진 이름은 버린다. */
function orderOf(prefs: HomePrefs): string[] {
    const known = BLOCKS.map((block) => block.id);
    const kept = prefs.order.filter((id) => known.indexOf(id) >= 0);
    return [...kept, ...known.filter((id) => kept.indexOf(id) < 0)];
}

export function apply(landing: HTMLElement, prefs: HomePrefs = read()): void {
    const nodes = new Map<string, HTMLElement>();
    landing.querySelectorAll<HTMLElement>('[data-block]').forEach((el) => nodes.set(el.dataset.block!, el));
    let anchor: HTMLElement | null = null;
    for (const id of orderOf(prefs)) {
        const node = nodes.get(id);
        if (!node) continue;
        node.hidden = prefs.hidden.indexOf(id) >= 0;
        if (anchor) anchor.insertAdjacentElement('afterend', node);
        anchor = node;
    }

    /* 부르는 이름 — 지은 사람에게만 뜬다. 안 지었으면 그 줄이 아예 없다
       (「어서 와요, 」 같은 반쪽 문장이 뜨는 것보다 없는 편이 낫다). */
    const hero = landing.querySelector('.landing-hero');
    let hi = landing.querySelector<HTMLElement>('.landing-hi');
    if (prefs.name) {
        if (!hi) {
            hi = document.createElement('p');
            hi.className = 'landing-hi';
            hero?.appendChild(hi);
        }
        hi.textContent = `어서 와요, ${prefs.name}`;
    } else if (hi) {
        hi.remove();
    }
}

function panel(landing: HTMLElement): HTMLElement {
    const prefs = read();
    const box = document.createElement('div');
    box.className = 'hp-panel';
    box.innerHTML =
        '<h3>첫 화면 꾸미기</h3>' +
        '<label class="hp-name">부르는 이름<input type="text" maxlength="20" placeholder="비워 두면 안 뜸"></label>' +
        '<ul class="hp-list"></ul>' +
        '<p class="hp-note">찾는 칸과 제목은 자리가 고정입니다. 이 브라우저에만 저장돼요.</p>' +
        '<button type="button" class="hp-reset">처음 차림으로</button>';

    const input = box.querySelector<HTMLInputElement>('.hp-name input')!;
    input.value = prefs.name;
    input.addEventListener('input', () => {
        const next = read();
        next.name = input.value.trim().slice(0, 20);
        write(next);
        apply(landing, next);
    });

    const list = box.querySelector<HTMLUListElement>('.hp-list')!;
    const paint = (): void => {
        const now = read();
        list.innerHTML = orderOf(now)
            .map((id) => {
                const meta = BLOCKS.find((block) => block.id === id)!;
                const on = now.hidden.indexOf(id) < 0;
                return (
                    `<li data-id="${id}">` +
                    `<label><input type="checkbox" ${on ? 'checked' : ''}> ${meta.label}</label>` +
                    '<span class="hp-move"><button type="button" data-up aria-label="위로">↑</button>' +
                    '<button type="button" data-down aria-label="아래로">↓</button></span>' +
                    '</li>'
                );
            })
            .join('');
    };
    paint();

    list.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        const row = target.closest<HTMLElement>('li[data-id]');
        if (!row) return;
        const id = row.dataset.id!;
        const next = read();
        const order = orderOf(next);
        const at = order.indexOf(id);
        if (target.hasAttribute('data-up') && at > 0) {
            order.splice(at - 1, 0, order.splice(at, 1)[0]);
        } else if (target.hasAttribute('data-down') && at < order.length - 1) {
            order.splice(at + 1, 0, order.splice(at, 1)[0]);
        } else {
            return;
        }
        next.order = order;
        write(next);
        apply(landing, next);
        paint();
    });

    list.addEventListener('change', (event) => {
        const target = event.target as HTMLInputElement;
        const row = target.closest<HTMLElement>('li[data-id]');
        if (!row || target.type !== 'checkbox') return;
        const id = row.dataset.id!;
        const next = read();
        next.hidden = target.checked ? next.hidden.filter((x) => x !== id) : [...next.hidden, id];
        write(next);
        apply(landing, next);
    });

    box.querySelector('.hp-reset')!.addEventListener('click', () => {
        const empty: HomePrefs = { order: [], hidden: [], name: '' };
        write(empty);
        apply(landing, empty);
        input.value = '';
        paint();
        Toolbox.showToast?.('처음 차림으로 되돌렸어요');
    });

    return box;
}

export function install(landing: HTMLElement): void {
    if (landing.querySelector('.hp-open')) return;
    apply(landing);

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'hp-open';
    open.textContent = '꾸미기';
    open.setAttribute('aria-expanded', 'false');
    landing.appendChild(open);

    let box: HTMLElement | null = null;
    open.addEventListener('click', () => {
        if (box) {
            box.remove();
            box = null;
            open.setAttribute('aria-expanded', 'false');
            return;
        }
        box = panel(landing);
        open.insertAdjacentElement('afterend', box);
        open.setAttribute('aria-expanded', 'true');
    });
}

(window as any).KarmoHomePrefs = { install, apply, read, BLOCKS };
