/**
 * 자체 우클릭 메뉴 — 데스크톱 앱이 브라우저 메뉴 대신 **자기 메뉴를 그린다**
 *
 * 왜 있나: WebView2 기본 우클릭 메뉴는 「복사·붙여넣기·뒤로·**Inspect**」가 한 덩어리라
 * 항목만 빼낼 수 없다. 그래서 오랫동안 devtools 자체를 release 에서 껐는데(KL-051),
 * 그 값이 너무 비쌌다 — 버그 하나 보려면 Rust 를 수 분 재컴파일해야 했다.
 *
 * 그래서 순서를 뒤집었다: **devtools 는 켜고, 기본 메뉴를 막고, 메뉴를 직접 그린다.**
 * Discord·Slack·VSCode 가 전부 이 길이다. 기본 메뉴 차단은 여기가 아니라 Rust 초기화
 * 스크립트가 한다 (`karmolab_desktop_init_script`) — 화면 코드가 깨져도 Inspect 는
 * 안 열려야 하므로, 앱 JS 보다 **먼저** 걸리는 자리여야 한다.
 *
 * 덤으로 얻은 것: 위젯이 자기 항목을 붙일 수 있다 (`registerContextMenu`).
 * 즐겨찾기 칸 우클릭 →「열기·주소 복사·삭제」처럼, 지금까지 작은 × 단추로 우겨넣던 것들이
 * 제자리를 찾는다.
 *
 * 웹(브라우저)에서는 **설치하지 않는다.** 브라우저 기본 메뉴는 그 브라우저의 것이고,
 * 그걸 앱 흉내로 덮으면 사용자가 자기 브라우저 기능을 잃는다 — 데스크톱 앱에서만 정당한 짓이다.
 */
import { t, loadNamespace } from './i18n';

/* 위젯이 아니라 라이브러리 — 아무도 말 묶음을 챙겨 주지 않으므로 스스로 받는다. */
if (typeof document !== 'undefined') void loadNamespace('ctxmenu');

export interface MenuItem {
    /** 사람이 읽을 글. 이미 번역된 상태로 넣는다. */
    label: string;
    /** 누르면 하는 일. 없으면 「지금은 못 함」으로 회색 처리된다. */
    onSelect?: () => void | Promise<void>;
    /** 지우기처럼 되돌리기 어려운 것 — 빨갛게. */
    danger?: boolean;
    /** 자리는 있지만 지금은 못 누르는 것. 없애지 않는 이유 = 자리가 흔들리면 다음에 못 찾는다. */
    disabled?: boolean;
}

/** 구분선. */
export type MenuSeparator = '-';
export type MenuEntry = MenuItem | MenuSeparator;

/**
 * 우클릭한 자리에 맞는 항목을 만들어 준다.
 * `null` 을 주면 「내 것 아님」 — 다음 등록자에게 넘어간다.
 */
export type MenuProvider = (el: HTMLElement, ev: MouseEvent) => MenuEntry[] | null;

interface Registration {
    selector: string;
    provider: MenuProvider;
}

const registry: Registration[] = [];
let installed = false;
let open: HTMLElement | null = null;

const isSeparator = (e: MenuEntry): e is MenuSeparator => e === '-';

/**
 * 이 선택자에 걸리는 자리를 우클릭하면 이 항목들을 띄운다.
 *
 * 위젯은 **다시 그릴 때마다 부르지 않는다** — 선택자로 잡으므로 한 번만 등록하면
 * 그 뒤에 새로 그려진 칸에도 그대로 붙는다. 그래서 등록은 모듈 최상단이 제자리다.
 */
export function registerContextMenu(selector: string, provider: MenuProvider): void {
    /* 같은 선택자를 두 번 등록하면 메뉴가 두 벌 뜬다. 위젯이 다시 로드될 수 있으므로 덮어쓴다. */
    const at = registry.findIndex((r) => r.selector === selector);
    if (at >= 0) registry[at] = { selector, provider };
    else registry.unshift({ selector, provider });
}

/** 열려 있는 메뉴를 닫는다. 이미 닫혔으면 아무 일도 안 한다. */
export function closeContextMenu(): void {
    open?.remove();
    open = null;
}

/** 좌표에 메뉴를 띄운다. 위젯이 직접 부를 일은 드물다 — 보통은 `registerContextMenu`. */
export function showContextMenu(x: number, y: number, entries: MenuEntry[]): void {
    closeContextMenu();
    const usable = trim(entries);
    if (!usable.length) return;

    const menu = document.createElement('div');
    menu.className = 'karmo-ctx';
    menu.setAttribute('role', 'menu');

    for (const entry of usable) {
        if (isSeparator(entry)) {
            const hr = document.createElement('div');
            hr.className = 'karmo-ctx-sep';
            menu.appendChild(hr);
            continue;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'karmo-ctx-item';
        btn.setAttribute('role', 'menuitem');
        if (entry.danger) btn.classList.add('danger');
        btn.textContent = entry.label;
        btn.disabled = !!entry.disabled || !entry.onSelect;
        btn.addEventListener('click', () => {
            /* 메뉴를 먼저 닫는다 — 하는 일이 확인창을 띄우거나 오래 걸려도 메뉴가 안 남는다. */
            closeContextMenu();
            void entry.onSelect?.();
        });
        menu.appendChild(btn);
    }

    /* 화면 밖으로 나가지 않게 뒤집는다. 크기를 재려면 먼저 붙여야 하므로, 안 보이게 붙였다 옮긴다. */
    menu.style.visibility = 'hidden';
    document.body.appendChild(menu);
    const box = menu.getBoundingClientRect();
    const pad = 8;
    const left = x + box.width + pad > window.innerWidth ? Math.max(pad, x - box.width) : x;
    const top = y + box.height + pad > window.innerHeight ? Math.max(pad, y - box.height) : y;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = '';
    open = menu;

    /* 첫 항목에 초점을 준다 — 키보드로도 쓸 수 있어야 하고, 초점이 있어야 창을 나갈 때 닫힌다. */
    menu.querySelector<HTMLButtonElement>('.karmo-ctx-item:not([disabled])')?.focus();
}

/**
 * 앞뒤·연속 구분선을 걷어낸다. 항목을 상황에 따라 빼다 보면 구분선만 남는 일이 잦은데,
 * 그게 보이면 「뭔가 사라졌다」처럼 읽힌다.
 */
function trim(entries: MenuEntry[]): MenuEntry[] {
    const out: MenuEntry[] = [];
    for (const e of entries) {
        if (isSeparator(e) && (!out.length || isSeparator(out[out.length - 1]!))) continue;
        out.push(e);
    }
    while (out.length && isSeparator(out[out.length - 1]!)) out.pop();
    return out;
}

/** 지금 우클릭한 자리에서 「글 복사·붙여넣기」가 말이 되나. */
function textEntries(el: HTMLElement): MenuEntry[] {
    const selection = String(window.getSelection?.() ?? '');
    const field = el.closest<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
    const editable = !!field && !field.readOnly && !field.disabled;
    const out: MenuEntry[] = [];

    if (selection) {
        out.push({
            label: t('ctxmenu.copy'),
            onSelect: () => void navigator.clipboard?.writeText(selection).catch(() => {})
        });
    }
    if (editable && field) {
        out.push({
            label: t('ctxmenu.paste'),
            /* 클립보드 읽기는 막힐 수 있다. 막히면 조용히 넘어간다 — Ctrl+V 는 그대로 된다. */
            onSelect: async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    if (text) insertIntoField(field, text);
                } catch (_) { /* 클립보드 권한 없음 */ }
            }
        });
        out.push({ label: t('ctxmenu.selectAll'), onSelect: () => field.select() });
    }
    return out;
}

/** 입력칸의 커서 자리에 글을 끼워 넣는다. `value` 를 통째로 바꾸면 되돌리기(Ctrl+Z)가 죽는다. */
function insertIntoField(field: HTMLInputElement | HTMLTextAreaElement, text: string): void {
    field.focus();
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    field.setRangeText(text, start, end, 'end');
    /* 위젯 대부분이 `oninput` 으로 듣는다 — 사람이 친 것과 똑같이 보이게 알린다. */
    field.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * 데스크톱 앱에서 한 번 부른다 (`desktop-chrome`).
 * 두 번 불러도 안전하다 — 안 그러면 리스너가 겹쳐 메뉴가 두 벌 뜬다.
 */
export function installContextMenu(): void {
    if (installed || typeof document === 'undefined') return;
    installed = true;
    injectStyle();

    document.addEventListener('contextmenu', (ev: MouseEvent) => {
        /* 기본 메뉴 차단은 Rust 초기화 스크립트가 이미 했다. 여기서 또 부르는 이유 =
         * 그 스크립트가 없는 자리(웹·테스트)에서도 앞뒤가 맞게 하려고. */
        ev.preventDefault();

        const target = ev.target as HTMLElement | null;
        if (!target) return;

        let entries: MenuEntry[] = [];
        for (const { selector, provider } of registry) {
            const el = target.closest<HTMLElement>(selector);
            if (!el) continue;
            const got = provider(el, ev);
            if (got?.length) { entries = got; break; }
        }

        const text = textEntries(target);
        if (entries.length && text.length) entries = [...entries, '-', ...text];
        else if (!entries.length) entries = text;

        /* 아무 항목도 없으면 「새로고침」 하나뿐인 민망한 메뉴가 된다. 그래도 띄운다 —
         * 우클릭에 아무 반응이 없으면 앱이 멈춘 줄 안다. */
        entries = [...entries, '-', { label: t('ctxmenu.reload'), onSelect: () => location.reload() }];
        showContextMenu(ev.clientX, ev.clientY, entries);
    });

    /* 닫히는 길을 넉넉히 둔다. 하나라도 막히면 메뉴가 화면에 눌러앉는다. */
    document.addEventListener('pointerdown', (ev) => {
        if (open && !(ev.target as HTMLElement | null)?.closest('.karmo-ctx')) closeContextMenu();
    }, true);
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeContextMenu(); });
    window.addEventListener('blur', closeContextMenu);
    window.addEventListener('resize', closeContextMenu);
    /* 스크롤하면 메뉴만 제자리에 남아 엉뚱한 곳을 가리킨다 — 따라다니게 하는 것보다 닫는 게 낫다. */
    document.addEventListener('scroll', closeContextMenu, true);
}

function injectStyle(): void {
    if (document.getElementById('karmo-ctx-style')) return;
    const style = document.createElement('style');
    style.id = 'karmo-ctx-style';
    style.textContent = `
    .karmo-ctx {
        position:fixed; z-index:99999; min-width:180px; max-width:280px; padding:6px;
        background:var(--bg-secondary, #1b1b1f); border:1px solid var(--border, #33333a);
        border-radius:var(--radius-md, 10px); box-shadow:var(--shadow-float, 0 12px 32px rgba(0,0,0,.4));
        display:flex; flex-direction:column; gap:2px;
        animation:karmo-ctx-in 90ms ease-out;
    }
    @keyframes karmo-ctx-in { from { opacity:0; transform:scale(.97); } to { opacity:1; transform:none; } }
    @media (prefers-reduced-motion: reduce) { .karmo-ctx { animation:none; } }
    .karmo-ctx-item {
        appearance:none; border:none; background:none; cursor:pointer; text-align:left;
        padding:7px 10px; border-radius:6px; font-size:var(--font-size-xs, 13px);
        color:var(--text-primary, #e8e8ea); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .karmo-ctx-item:hover:not([disabled]), .karmo-ctx-item:focus-visible:not([disabled]) {
        background:var(--bg-hover, #2a2a31); outline:none;
    }
    .karmo-ctx-item[disabled] { color:var(--text-tertiary, #6b6b75); cursor:default; }
    .karmo-ctx-item.danger { color:var(--error, #e5484d); }
    .karmo-ctx-item.danger:hover:not([disabled]) { background:var(--error, #e5484d); color:#fff; }
    .karmo-ctx-sep { height:1px; margin:4px 2px; background:var(--border, #33333a); }
    `;
    document.head.appendChild(style);
}
