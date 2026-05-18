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
        const menu = document.createElement('div');
        ctxMenu = menu;
        menu.className = 'tl-ctx';
        menu.addEventListener('pointerdown', (ev) => ev.stopPropagation());

        actions.forEach(a => {
            if (a === 'sep') { const s = document.createElement('div'); s.className = 'tl-ctx-sep'; menu.appendChild(s); return; }
            const btn = document.createElement('button');
            btn.className = 'tl-ctx-item' + (a.danger ? ' danger' : '');
            btn.textContent = a.label;
            btn.onpointerdown = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                hideContextMenu();
                a.action();
            };
            menu.appendChild(btn);
        });

        document.body.appendChild(menu);
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
        const api = { overlay, dialog, close: () => overlay.remove() };
        onMount?.(api);
        return api;
    }

    T.ui = { showContextMenu, hideContextMenu, openDialog };
})();

