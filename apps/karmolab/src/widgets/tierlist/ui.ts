interface TlCtxAction {
    label: string;
    danger?: boolean;
    action: () => void;
}
interface TlDialogApi {
    overlay: HTMLDivElement;
    dialog: HTMLDivElement;
    close: () => void;
}

(function () {
    const T = window.Tierlist = window.Tierlist || {};

    let ctxMenu: HTMLDivElement | null = null;

    function hideContextMenu() {
        if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; }
    }

    function showContextMenu(x: number, y: number, actions: Array<TlCtxAction | 'sep'>) {
        hideContextMenu();
        /* 자판으로 고른 항목이 무엇이었는지, 그리고 메뉴를 연 자리가 어디였는지 —
           닫은 뒤 초점을 원래 자리로 돌려놔야 자판 사용자가 길을 잃지 않는다. */
        const pick = new Map<HTMLButtonElement, () => void>();
        const opener = document.activeElement as HTMLElement | null;
        const menu = document.createElement('div');
        ctxMenu = menu;
        menu.className = 'tl-ctx';
        /* 자판만 쓰는 사람도 여기를 지나갈 수 있어야 한다 (2026-08-17). 전에는 단추들이
           pointerdown 에만 반응해 Enter·Space 가 아무 일도 안 했고, Esc 로 닫히지도 않았다. */
        menu.setAttribute('role', 'menu');
        menu.addEventListener('pointerdown', (ev) => ev.stopPropagation());

        actions.forEach(a => {
            if (a === 'sep') { const s = document.createElement('div'); s.className = 'tl-ctx-sep'; menu.appendChild(s); return; }
            const btn = document.createElement('button');
            btn.className = 'tl-ctx-item' + (a.danger ? ' danger' : '');
            btn.setAttribute('role', 'menuitem');
            btn.type = 'button';
            btn.textContent = a.label;
            /* 마우스는 예전처럼 pointerdown 에 곧바로 (바깥 pointerdown 이 메뉴를 걷어가기 전에)
               움직이고, 자판은 아래 keydown 이 맡는다. 둘을 click 하나로 합치면 마우스 쪽이 죽는다. */
            btn.onpointerdown = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                hideContextMenu();
                a.action();
            };
            pick.set(btn, a.action);
            menu.appendChild(btn);
        });

        /* Esc = 닫기 · 위아래 = 항목 옮기기 · Enter/Space = 고르기. 열 때 첫 항목에 초점을 준다. */
        menu.addEventListener('keydown', (ev: KeyboardEvent) => {
            const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('.tl-ctx-item'));
            const at = items.indexOf(document.activeElement as HTMLButtonElement);
            if (ev.key === 'Escape') { ev.preventDefault(); hideContextMenu(); opener?.focus(); return; }
            if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
                ev.preventDefault();
                if (!items.length) return;
                const step = ev.key === 'ArrowDown' ? 1 : -1;
                items[(at + step + items.length) % items.length].focus();
                return;
            }
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                const btn = items[at];
                if (!btn) return;
                const act = pick.get(btn);
                hideContextMenu();
                opener?.focus();
                act?.();
            }
        });

        document.body.appendChild(menu);
        menu.querySelector<HTMLButtonElement>('.tl-ctx-item')?.focus();
        const rect = menu.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
        if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        setTimeout(() => document.addEventListener('pointerdown', hideContextMenu, { once: true }), 0);
    }

    function openDialog({ title, bodyHtml, wide, onMount }: {
        title: string;
        bodyHtml?: string;
        wide?: boolean;
        onMount?: (api: TlDialogApi) => void;
    }) {
        const overlay = document.createElement('div');
        overlay.className = 'tl-dialog-overlay';
        const dialog = document.createElement('div');
        dialog.className = 'tl-dialog' + (wide ? ' tl-dialog-wide' : '');
        const esc = Toolbox.escapeHtml ?? ((s: string) => s);
        dialog.innerHTML = `<h3>${esc(title)}</h3>${bodyHtml || ''}`;
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
        /* 바깥을 「눌러서」만 닫히면 자판 사용자는 갇힌다 — Esc 로도 닫고, 열 때 안으로 초점을 넣는다. */
        const opener = document.activeElement as HTMLElement | null;
        overlay.tabIndex = -1;
        overlay.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            overlay.remove();
            opener?.focus();
        });
        (dialog.querySelector<HTMLElement>('input, select, textarea, button') ?? overlay).focus();
        const api = { overlay, dialog, close: () => overlay.remove() };
        onMount?.(api);
        return api;
    }

    T.ui = { showContextMenu, hideContextMenu, openDialog };
})();

