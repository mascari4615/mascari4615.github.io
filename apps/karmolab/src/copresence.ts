/**
 * 같이 쓰기. 남의 커서가 내 화면에 보인다 (TASK-KL-180).
 *
 * 이 사이트는 지금 N명이라는 숫자까지 와 있었다. 숫자는 사람이 있다는 **소문**이고,
 * 움직이는 커서는 **증거**다. 도구든 게임이든 화면을 옮기면 그 화면의 방으로 따라 들어간다.
 *
 * 규율:
 *  ① **아무것도 저장하지 않는다.** 좌표는 비율(0~1)로 보내고 서버는 흘려보내기만 한다.
 *  ② 내 커서는 **안 그린다**. 브라우저가 이미 그리고 있다. 두 개로 보이면 이상하다.
 *  ③ 끄면 내 좌표를 안 보내고 남의 커서도 안 그린다. 켜고 끄는 것은 이 브라우저에만 남는다.
 *     **관은 안 끈다**. 같이 보던 지구본이나 같이 쓰던 글까지 멈출 이유가 없다
 *     (change.copresence-hardening 1단계).
 *  ④ 창이 뒤에 있으면 안 보낸다. 안 보고 있는 화면의 커서는 소식이 아니라 소음이다.
 *
 * 방, 연결, 탭 대표 뽑기는 여기 없다. 전부 `room-channel.ts` 가 한다.
 */
import {
    onRoomEvent,
    onRoomOp,
    sendInactive,
    sendMove,
    sendRoomOp,
    type RoomMember,
} from './room-channel';
import { shareField } from './cotext-share';

/** 켜짐/꺼짐. 기본은 켜짐. 사람이 있다가 이 기능의 전부라 꺼 두면 없는 것과 같다. */
const PREF_KEY = 'karmolab_copresence';

let layer: HTMLElement | null = null;
const cursors = new Map<string, HTMLElement>();
/** 마지막으로 들은 남의 자리 — 내 화면이 움직이면(스크롤·크기) 이걸로 다시 앉힌다. */
const spots = new Map<string, { x: number; y: number; dx: number | null; dy: number | null }>();

/** 글이 화면보다 이만큼 넘게 길면 「같은 글을 보고 있다」로 안 친다 — 위젯이 열린 정도가 다르다. */
const DOC_MISMATCH = 1.6;

/**
 * 남의 자리를 내 화면의 픽셀로.
 *
 * 화면 기준 비율만 쓰면 **스크롤이 다른 사람끼리 서로 다른 문단을 가리킨다**. 글 기준 자리가
 * 같이 왔고 내 글이 그쪽과 비슷한 길이면 그걸 쓴다 — 그러면 둘 다 같은 문단을 본다.
 * 길이가 많이 다르면(위젯을 편 사람과 안 편 사람) 화면 기준으로 떨어진다. 화면 밖으로
 * 벗어나면 그리지 않는다(화면 끝에 눌러 붙은 유령보다 안 보이는 편이 정직하다).
 */
function place(node: HTMLElement, spot: { x: number; y: number; dx: number | null; dy: number | null }): void {
    const root = document.documentElement;
    let px = spot.x * window.innerWidth;
    let py = spot.y * window.innerHeight;
    let outside = false;
    if (spot.dx !== null && spot.dy !== null) {
        const width = Math.max(1, root.scrollWidth);
        const height = Math.max(1, root.scrollHeight);
        const ratio = height / Math.max(1, window.innerHeight);
        if (ratio < DOC_MISMATCH || height > window.innerHeight) {
            px = spot.dx * width - window.scrollX;
            py = spot.dy * height - window.scrollY;
            outside = py < -40 || py > window.innerHeight + 40 || px < -40 || px > window.innerWidth + 40;
        }
    }
    node.style.transform = `translate(${px}px, ${py}px)`;
    node.dataset.offscreen = outside ? '1' : '0';
}

export function isCopresenceOn(): boolean {
    try {
        return localStorage.getItem(PREF_KEY) !== 'off';
    } catch {
        return true;
    }
}

export function setCopresence(on: boolean): void {
    try {
        localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
    } catch {
        /* 저장이 안 돼도 이번 창에서는 동작한다 */
    }
    if (!on) clearAll();
}

function ensureLayer(): HTMLElement {
    if (layer && layer.isConnected) return layer;
    layer = document.createElement('div');
    layer.className = 'kl-cursors';
    /* ★ **화면낭독기에는 안 보이게 한다** (2026-08-17, axe 로 재서 잡았다). 이 층은 남의 마우스가
       어디 있는지 **눈으로** 보여 주는 장식이다. 접근성 나무에 남겨 두면 두 가지가 나쁘다:
       ① 이름표가 랜드마크 밖에 떠 있어 모든 내용은 랜드마크 안에 규칙을 어긴다(실측 5건, 세 장 전부)
       ② 커서가 움직일 때마다 낭독기가 이름을 읽는다. 도움이 아니라 소음이다.
       누가 와 있는지는 사람 목록이 따로 말한다. */
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    if (!document.getElementById('kl-cursor-style')) {
        const style = document.createElement('style');
        style.id = 'kl-cursor-style';
        style.textContent = [
            /* 남의 커서는 **위에 떠 있되 아무것도 막지 않는다**. 클릭이 이 층에 걸리면
               같이 쓰는 것이 아니라 방해하는 것이 된다. */
            '.kl-cursors { position:fixed; inset:0; pointer-events:none; z-index:70; overflow:hidden; }',
            '.kl-cursor { position:absolute; top:0; left:0; will-change:transform;',
            '  transition:transform .09s linear, opacity .2s ease; display:flex; align-items:flex-start; gap:4px; }',
            '.kl-cursor[data-active="0"], .kl-cursor[data-offscreen="1"] { opacity:0; }',
            '.kl-cursor svg { filter:drop-shadow(0 1px 2px rgba(0,0,0,.45)); flex:0 0 auto; }',
            '.kl-cursor-name { transform:translateY(14px); padding:2px 7px; border-radius:var(--radius-pill);',
            /* 12px 아래로 내리지 않는다. 폰에서 읽히는 최소선이고, 관문 검사가 그 선을 지킨다
               (실측 2026-08-12: 11px 이라 첫 화면, 도구 목록이 빨갰다). */
            '  font-size:var(--font-size-2xs); line-height:1.5; white-space:nowrap; color:#0f0f12; font-weight:600;',
            '  box-shadow:0 1px 3px rgba(0,0,0,.35); }',
        ].join('\n');
        document.head.appendChild(style);
    }
    return layer;
}

function drawMember(member: RoomMember): void {
    if (!isCopresenceOn()) return;
    const host = ensureLayer();
    let node = cursors.get(member.id);
    if (!node) {
        node = document.createElement('div');
        node.className = 'kl-cursor';
        node.innerHTML =
            '<svg width="16" height="20" viewBox="0 0 16 20" fill="none">' +
            `<path d="M1 1L14 8.5L8 10L11 17L8.5 18L5.5 11L1 14V1Z" fill="${member.color}" stroke="rgba(0,0,0,.35)" stroke-width="1"/></svg>` +
            `<span class="kl-cursor-name" style="background:${member.color}"></span>`;
        host.appendChild(node);
        cursors.set(member.id, node);
    }
    const label = node.querySelector('.kl-cursor-name');
    if (label) label.textContent = member.name;
    node.dataset.active = member.active ? '1' : '0';
    const spot = { x: member.x, y: member.y, dx: member.dx ?? null, dy: member.dy ?? null };
    spots.set(member.id, spot);
    place(node, spot);
}

function moveMember(data: { id: string; x: number; y: number; dx?: number | null; dy?: number | null; active: boolean }): void {
    const node = cursors.get(data.id);
    if (!node) return; // 아직 못 본 사람의 움직임은 버린다. join 이 오면 그때 그린다.
    node.dataset.active = data.active ? '1' : '0';
    const spot = { x: data.x, y: data.y, dx: data.dx ?? null, dy: data.dy ?? null };
    spots.set(data.id, spot);
    place(node, spot);
}

/** 내 화면이 움직였다 — 남이 가만히 있어도 그 커서는 다른 픽셀에 있어야 한다. */
function replaceAll(): void {
    cursors.forEach((node, id) => {
        const spot = spots.get(id);
        if (spot) place(node, spot);
    });
}

function removeMember(id: string): void {
    const node = cursors.get(id);
    if (!node) return;
    node.remove();
    cursors.delete(id);
}

function clearAll(): void {
    cursors.forEach((node) => node.remove());
    cursors.clear();
    spots.clear();
    layer?.remove();
    layer = null;
}

onRoomEvent((kind, data) => {
    if (kind === 'reset') {
        clearAll();
        return;
    }
    if (!isCopresenceOn()) return;
    if (kind === 'hello') (data as { members: RoomMember[] }).members.forEach(drawMember);
    else if (kind === 'join') drawMember((data as { member: RoomMember }).member);
    else if (kind === 'move') moveMember(data as { id: string; x: number; y: number; active: boolean });
    else if (kind === 'leave') removeMember((data as { id: string }).id);
});

function watchPointer(): void {
    const note = (x: number, y: number, active: boolean): void => {
        if (!isCopresenceOn()) return;
        // 안 보고 있는 창의 커서는 소식이 아니라 소음이다.
        if (document.visibilityState !== 'visible') return;
        /* 화면 기준 비율 + **글 기준 비율**을 같이 보낸다 (change.copresence-hardening 4단계).
           화면 기준만 보내면 스크롤이 다른 사람끼리 다른 문단을 가리킨다. */
        const root = document.documentElement;
        const width = Math.max(1, root.scrollWidth);
        const height = Math.max(1, root.scrollHeight);
        sendMove(x / window.innerWidth, y / window.innerHeight, active, {
            dx: (window.scrollX + x) / width,
            dy: (window.scrollY + y) / height,
        });
    };
    window.addEventListener('pointermove', (event) => note(event.clientX, event.clientY, true), { passive: true });
    // 손가락도 커서다. 폰에서 같이 쓰는 사람이 안 보이면 그건 반쪽이다.
    window.addEventListener('touchmove', (event) => {
        const touch = event.touches[0];
        if (touch) note(touch.clientX, touch.clientY, true);
    }, { passive: true });
    // 직전에 보내 버려 보낼 것이 비어 있어도 나갔다는 나가야 한다. 안 그러면 남의 화면에
    // 30초 동안 멈춘 커서가 남았다(2026-08-29 정독).
    window.addEventListener('pointerleave', () => sendInactive());
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') sendInactive();
    });
    /* 내 화면이 움직이면 남의 커서도 다시 앉힌다 — 예전엔 그 사람이 마우스를 움직일 때까지
       옛 자리에 멈춰 있었다. */
    window.addEventListener('scroll', replaceAll, { passive: true });
    window.addEventListener('resize', replaceAll);
}

if (document.readyState === 'complete') watchPointer();
else window.addEventListener('load', watchPointer);

declare global {
    interface Window {
        KarmoCopresence: {
            isOn: typeof isCopresenceOn;
            set: typeof setCopresence;
            share: typeof shareField;
            /** 뜻을 서버가 안 정하는 관. 위젯이 자기 규칙으로 쓴다 (TASK-KL-206) */
            sendOp: typeof sendRoomOp;
            onOp: typeof onRoomOp;
        };
    }
}

window.KarmoCopresence = { isOn: isCopresenceOn, set: setCopresence, share: shareField, sendOp: sendRoomOp, onOp: onRoomOp };

export {};
