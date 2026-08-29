interface TlDnDDropPayload {
    itemId: string;
    tierId: string | undefined;
    insertIdx: number;
}

interface TlDnDOptions {
    onDrop?: (payload: TlDnDDropPayload) => void;
    shouldBlockDragStart?: (e: PointerEvent) => boolean;
}

(function () {
    const T = (window.Tierlist = window.Tierlist || {}) as { dnd?: { initDnD: (root: HTMLElement, opts: TlDnDOptions) => void } } & Record<string, unknown>;

    const DRAG_THRESHOLD = 5;
    const ROW_ALIGN_TOL = 10;

    function initDnD(root: HTMLElement, { onDrop, shouldBlockDragStart }: TlDnDOptions) {
        function getDropTarget(x: number, y: number): HTMLElement | null {
            const zones = root.querySelectorAll<HTMLElement>('.tl-dropzone, .tl-pool');
            let best: HTMLElement | null = null;
            let bestArea = Infinity;
            for (const zone of Array.from(zones)) {
                const rect = zone.getBoundingClientRect();
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                    const area = rect.width * rect.height;
                    if (area < bestArea) {
                        bestArea = area;
                        best = zone;
                    }
                }
            }
            return best;
        }

        function slotAnchor(cards: Element[], k: number, zoneRect: DOMRect): { x: number; y: number } {
            if (k === 0) {
                if (!cards.length) {
                    return { x: zoneRect.left + 36, y: zoneRect.top + 36 };
                }
                const r0 = cards[0].getBoundingClientRect();
                return { x: r0.left - 6, y: r0.top + r0.height / 2 };
            }
            if (k === cards.length) {
                const r = cards[cards.length - 1].getBoundingClientRect();
                return { x: r.right + 6, y: r.top + r.height / 2 };
            }
            const rL = cards[k - 1].getBoundingClientRect();
            const rR = cards[k].getBoundingClientRect();
            const sameRow = Math.abs(rL.top - rR.top) < ROW_ALIGN_TOL;
            if (sameRow) {
                return {
                    x: (rL.right + rR.left) / 2,
                    y: (rL.top + rL.bottom + rR.top + rR.bottom) / 4,
                };
            }
            return { x: rR.left - 6, y: rR.top + rR.height / 2 };
        }

        function getInsertIndex(zone: HTMLElement, x: number, y: number): number {
            if (zone.dataset.tocDrop === '1') return 999999;
            const cards = Array.from(zone.querySelectorAll<HTMLElement>('.tl-item:not(.dragging)'));
            if (cards.length === 0) return 0;

            const pad = 3;
            for (let i = 0; i < cards.length; i++) {
                const r = cards[i].getBoundingClientRect();
                if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) {
                    const before = x < r.left + r.width * 0.5;
                    return before ? i : i + 1;
                }
            }

            const zr = zone.getBoundingClientRect();
            let bestK = 0;
            let bestD = Infinity;
            for (let k = 0; k <= cards.length; k++) {
                const p = slotAnchor(cards, k, zr);
                const d = Math.hypot(x - p.x, y - p.y);
                if (d < bestD) {
                    bestD = d;
                    bestK = k;
                }
            }
            return bestK;
        }

        function placeholderAlreadyAt(zone: HTMLElement, placeholder: HTMLElement, idx: number): boolean {
            const cards = Array.from(zone.querySelectorAll<HTMLElement>('.tl-item:not(.dragging)'));
            const refChild = cards[idx] ?? null;
            if (placeholder.parentNode !== zone) return false;
            if (refChild === null) {
                const last = cards[cards.length - 1];
                if (!last) return zone.lastElementChild === placeholder;
                return placeholder.previousElementSibling === last && !placeholder.nextElementSibling;
            }
            return placeholder.nextElementSibling === refChild;
        }

        function onPointerDown(e: PointerEvent) {
            const itemEl = (e.target as HTMLElement | null)?.closest<HTMLElement>('.tl-item');
            if (!itemEl || e.button === 2) return;
            const itemId = itemEl.dataset.itemId;
            if (!itemId) return;
            if (shouldBlockDragStart?.(e)) return;

            e.preventDefault();
            itemEl.setPointerCapture(e.pointerId);

            const rect = itemEl.getBoundingClientRect();
            const offsetX = e.clientX - rect.left;
            const offsetY = e.clientY - rect.top;

            let moved = false;
            let dragDone = false;
            let ghost: HTMLElement | null = null;
            let placeholder: HTMLElement | null = null;
            let currentZone: HTMLElement | null = null;
            let lastX = e.clientX;
            let lastY = e.clientY;

            function endDragVisuals() {
                ghost?.remove();
                ghost = null;
                placeholder?.remove();
                placeholder = null;
                itemEl!.classList.remove('dragging');
                currentZone?.classList.remove('drag-over');
                currentZone = null;
            }

            function applyDropAt(clientX: number, clientY: number) {
                const zone = getDropTarget(clientX, clientY);
                if (zone) {
                    const tierId = zone.dataset.tierId;
                    const idx = getInsertIndex(zone, clientX, clientY);
                    onDrop?.({ itemId: itemId!, tierId, insertIdx: idx });
                }
            }

            function finishOnce(evClientX: number, evClientY: number) {
                if (dragDone) return;
                dragDone = true;
                document.removeEventListener('pointermove', onDocMove, true);
                document.removeEventListener('pointerup', onDocUp, true);
                document.removeEventListener('pointercancel', onDocUp, true);
                itemEl!.removeEventListener('lostpointercapture', onLostCapture);
                try {
                    itemEl!.releasePointerCapture(e.pointerId);
                } catch {
                    /* noop */
                }

                if (!moved) return;

                endDragVisuals();
                applyDropAt(evClientX, evClientY);
            }

            function onLostCapture() {
                if (!moved || dragDone) return;
                endDragVisuals();
                dragDone = true;
                document.removeEventListener('pointermove', onDocMove, true);
                document.removeEventListener('pointerup', onDocUp, true);
                document.removeEventListener('pointercancel', onDocUp, true);
                applyDropAt(lastX, lastY);
            }

            function applyHover(clientX: number, clientY: number) {
                const zone = getDropTarget(clientX, clientY);
                if (currentZone && currentZone !== zone) currentZone.classList.remove('drag-over');
                if (zone) {
                    zone.classList.add('drag-over');
                    currentZone = zone;
                    if (zone.dataset.tocDrop === '1') {
                        if (placeholder?.parentNode) placeholder.remove();
                        return;
                    }
                    const idx = getInsertIndex(zone, clientX, clientY);
                    if (placeholder && placeholderAlreadyAt(zone, placeholder, idx)) return;
                    if (placeholder?.parentNode) placeholder.remove();
                    const cards = zone.querySelectorAll<HTMLElement>('.tl-item:not(.dragging)');
                    const refChild = cards[idx] ?? null;
                    if (placeholder) zone.insertBefore(placeholder, refChild);
                } else if (currentZone) {
                    currentZone.classList.remove('drag-over');
                    currentZone = null;
                    if (placeholder?.parentNode) placeholder.remove();
                }
            }

            function onDocMove(ev: PointerEvent) {
                lastX = ev.clientX;
                lastY = ev.clientY;

                if (!moved) {
                    if (
                        Math.abs(ev.clientX - e.clientX) < DRAG_THRESHOLD &&
                        Math.abs(ev.clientY - e.clientY) < DRAG_THRESHOLD
                    ) {
                        return;
                    }
                    moved = true;
                    ghost = itemEl!.cloneNode(true) as HTMLElement;
                    ghost.className = 'tl-drag-ghost';
                    ghost.style.width = rect.width + 'px';
                    ghost.style.height = rect.height + 'px';
                    document.body.appendChild(ghost);

                    placeholder = document.createElement('div');
                    placeholder.className = 'tl-placeholder';
                    itemEl!.classList.add('dragging');
                }

                ev.preventDefault();
                ghost!.style.left = ev.clientX - offsetX + 'px';
                ghost!.style.top = ev.clientY - offsetY + 'px';
                applyHover(ev.clientX, ev.clientY);
            }

            function onDocUp(ev: PointerEvent) {
                finishOnce(ev.clientX, ev.clientY);
            }

            document.addEventListener('pointermove', onDocMove, true);
            document.addEventListener('pointerup', onDocUp, true);
            document.addEventListener('pointercancel', onDocUp, true);
            itemEl.addEventListener('lostpointercapture', onLostCapture);
        }


        /* ★ **자판만으로도 카드를 옮긴다** (2026-08-17). 여기는 끌기 말고는 길이 없어서
           마우스가 없으면 순위를 아예 못 매겼다(접근성 감사가 이름으로 짚은 자리).
           ← → = 같은 줄에서 앞뒤, ↑ ↓ = 위/아래 줄로 옮기기.
           끌기와 **같은 onDrop** 을 부른다. 두 길이 갈라지면 한쪽만 고쳐진다. */
        function lines(): HTMLElement[] {
            return Array.from(root.querySelectorAll<HTMLElement>('.tl-dropzone:not([data-toc-drop]), .tl-pool'));
        }
        root.addEventListener('keydown', (e: KeyboardEvent) => {
            const key2 = e.key;
            if (key2 !== 'ArrowLeft' && key2 !== 'ArrowRight' && key2 !== 'ArrowUp' && key2 !== 'ArrowDown') return;
            const itemEl = (e.target as HTMLElement | null)?.closest<HTMLElement>('.tl-item');
            const itemId = itemEl?.dataset.itemId;
            if (!itemEl || !itemId) return;
            const currentLine = itemEl.closest<HTMLElement>('.tl-dropzone, .tl-pool');
            if (!currentLine) return;
            const line = lines();
            const linePos = line.indexOf(currentLine);
            const cards2 = Array.from(currentLine.querySelectorAll<HTMLElement>('.tl-item'));
            const slot = cards2.indexOf(itemEl);
            if (slot < 0) return;
            e.preventDefault();

            if (key2 === 'ArrowLeft' || key2 === 'ArrowRight') {
                /* 제자리에서 한 칸. 오른쪽으로 갈 때 자기 자신이 빠진 뒤 자리라 +2 다. */
                const destination = key2 === 'ArrowLeft' ? slot - 1 : slot + 2;
                if (destination < 0 || destination > cards2.length) return;
                onDrop?.({ itemId, tierId: currentLine.dataset.tierId, insertIdx: destination });
            } else {
                const next = key2 === 'ArrowUp' ? linePos - 1 : linePos + 1;
                if (next < 0 || next >= line.length) return;
                const end = line[next].querySelectorAll('.tl-item').length;
                onDrop?.({ itemId, tierId: line[next].dataset.tierId, insertIdx: end });
            }
            /* 옮기고 나면 화면이 다시 그려진다. 같은 카드에 초점을 도로 준다(안 그러면 길을 잃는다). */
            requestAnimationFrame(() => {
                root.querySelector<HTMLElement>(`.tl-item[data-item-id="${itemId}"]`)?.focus();
            });
        });

        root.addEventListener('pointerdown', onPointerDown);
    }

    T.dnd = { initDnD };
})();
