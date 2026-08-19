/**
 * 즐겨찾기 「덱」 보기 — 스트림덱을 닮은 세 번째 보기 (TASK-KL-327).
 *
 * 아이콘/카드 보기가 **흐르는 목록**이라면, 덱은 **고정 격자**다: 6칸 줄, 빈 칸도
 * 자리로 보이고, 그룹은 세로로 쌓이는 대신 위쪽 **페이지 탭**으로 갈린다.
 *
 * 키 한 장의 구조는 실물을 따른다 — **LCD 가 기기 안으로 파여 있고, 그 위를 투명한
 * 유리 캡이 솟아 덮는다.** 그래서 겹이 여럿이다:
 *   밑동 · 우물 벽 4 → 얼굴(그림·LCD 결·이름) → 유리 옆면 4 → 유리 윗면
 *
 * 여기서 배운 함정 셋(2026-08-19, 샘플 페이지에서 하나씩 밟았다):
 *   ① `filter` 를 키에 걸면 `preserve-3d` 가 평면으로 접혀 옆면이 통째로 사라진다.
 *   ② 화면을 Z 음수로 내리면 **부모(덱)의 배경판**이 Z=0 평면에서 그 앞을 가린다.
 *      → 화면을 바닥(0)에 두고 베젤을 올려 파인 것처럼 만든다.
 *   ③ 커서 판정을 키 상자(Z=0)가 맡으면, 눈에 보이는 유리 윗면(Z=+34)과 10px 넘게
 *      어긋나 「인식이 됐다 안 됐다」 한다. → 판정은 유리 윗면이 맡는다.
 */
import { checkInstalled } from './favorites-apps';
import { isDesktop } from '../tauri-bridge';
import type { FavoriteGroup, FavoriteItem } from './favorites-defaults';

/** 한 페이지에 채우는 칸 수 (6열 × 2줄). 모자라면 빈 슬롯으로 채운다. */
const SLOTS = 12;

/**
 * 세 축은 **서로 독립**이다 (사용자 결정 2026-08-19):
 *   레이아웃 2 — 목록(흐르는 그룹) · 덱(고정 격자 + 페이지)
 *   살결   4 — 기존 · 납작 · 발광 · 스트림덱
 *   크기   슬라이더 — 어느 조합에서도 그대로 유지
 * 예전엔 이 셋이 「보기 3개」로 뭉쳐 있어서, 크게 보려면 살결까지 따라 바뀌었다.
 */
export type FavSkin = 'plain' | 'glow' | 'glass';
export type FavLayout = 'list' | 'deck';
const SKIN_KEY = 'toolbox_fav_skin';
const LAYOUT_KEY = 'toolbox_fav_layout';
/** 옛 열쇠 — 「보기 3개」 시절. 한 번 옮기고 지운다. */
const LEGACY_VIEW_KEY = 'toolbox_fav_view';

/* 「납작」은 뺐다 — 덱 배치에서 「기존」과 눈에 띄는 차이가 없었다(둘 다 카드 얼굴).
   축이 하나 줄어 고르는 비용도 준다 (사용자 결정 2026-08-19). */
export const SKINS: FavSkin[] = ['plain', 'glow', 'glass'];

/** 옛 설정(icon/card/deck)을 새 세 축으로 한 번 옮긴다. */
function migrate(): void {
    try {
        const old = localStorage.getItem(LEGACY_VIEW_KEY);
        if (!old) return;
        if (!localStorage.getItem(LAYOUT_KEY)) {
            localStorage.setItem(LAYOUT_KEY, old === 'deck' ? 'deck' : 'list');
        }
        if (!localStorage.getItem(SKIN_KEY)) {
            localStorage.setItem(SKIN_KEY, old === 'deck' ? 'glass' : 'plain');
        }
        if (!localStorage.getItem(SIZE_KEY)) {
            localStorage.setItem(SIZE_KEY, old === 'card' ? '110' : old === 'deck' ? '92' : '76');
        }
        localStorage.removeItem(LEGACY_VIEW_KEY);
    } catch (_) {}
}

export function getSkin(): FavSkin {
    migrate();
    try {
        const v = localStorage.getItem(SKIN_KEY);
        if (v === 'flat') return 'plain';          /* 없앤 살결 → 가장 가까운 것으로 */
        if (v && SKINS.includes(v as FavSkin)) return v as FavSkin;
    } catch (_) {}
    return 'plain';
}

export function getLayout(): FavLayout {
    migrate();
    try {
        return localStorage.getItem(LAYOUT_KEY) === 'deck' ? 'deck' : 'list';
    } catch (_) { return 'list'; }
}
export function setLayout(v: FavLayout): void {
    try { localStorage.setItem(LAYOUT_KEY, v); } catch (_) {}
}
export function setSkin(skin: FavSkin): void {
    try { localStorage.setItem(SKIN_KEY, skin); } catch (_) {}
}

/** 키 한 변(px). **살결·레이아웃과 다른 축**이다 — 무엇을 갈아도 크기는 그대로 남는다. */
const SIZE_KEY = 'toolbox_fav_size';
export const SIZE_MIN = 64, SIZE_MAX = 168, SIZE_DEFAULT = 92;

export function getKeySize(): number {
    migrate();
    try {
        const n = Number(localStorage.getItem(SIZE_KEY));
        if (Number.isFinite(n) && n >= SIZE_MIN && n <= SIZE_MAX) return n;
    } catch (_) {}
    return SIZE_DEFAULT;
}
/**
 * **자리는 덱 기준으로 적는다.** 덱은 빈 칸이 자리로 보이는 배치라 「3번 칸이 비었다」가
 * 뜻을 가진다. 목록 배치는 같은 자리표를 읽어 **빈 칸만 걷어내고 순서대로** 늘어놓는다
 * (사용자 결정 2026-08-19). 자리표가 없으면 지금 순서 그대로.
 *
 * 모양: `{ "그룹이름": ["열쇠", null, "열쇠", ...] }` — null 이 빈 칸.
 */
const SLOTS_KEY = 'toolbox_fav_slots';
export type SlotMap = Record<string, (string | null)[]>;

export function loadSlots(): SlotMap {
    try {
        const raw = localStorage.getItem(SLOTS_KEY);
        if (raw) {
            const v = JSON.parse(raw);
            if (v && typeof v === 'object') return v as SlotMap;
        }
    } catch (_) {}
    return {};
}
export function saveSlots(map: SlotMap): void {
    try { localStorage.setItem(SLOTS_KEY, JSON.stringify(map)); } catch (_) {}
}

/** 항목을 자리표에서 가리키는 열쇠. 도구·앱·사이트가 서로 안 겹치게 갈래를 붙인다. */
export function itemKey(it: FavoriteItem): string {
    if (it.type === 'tool') return 'tool:' + (it.toolId || '');
    if (it.type === 'app') return 'app:' + (it.scheme || it.exec || '').toLowerCase();
    return 'site:' + (it.url || '');
}

/**
 * 한 그룹의 항목을 **자리표 순서**로 편다. 자리표에 없는 새 항목은 앞에서부터 빈 칸에
 * 채우고, 자리표에만 있고 사라진 항목은 그대로 빈 칸이 된다.
 * @param pad 빈 칸을 몇 칸까지 채울지 (덱은 12칸, 목록은 0 — 빈 칸을 안 그린다)
 */
export function arrange(items: FavoriteItem[], group: string, slots: SlotMap, pad: number): (FavoriteItem | null)[] {
    const order = slots[group];
    const left = new Map(items.map((it) => [itemKey(it), it]));
    const out: (FavoriteItem | null)[] = [];
    if (Array.isArray(order)) {
        order.forEach((k) => {
            if (k && left.has(k)) { out.push(left.get(k)!); left.delete(k); }
            else out.push(null);
        });
    }
    /* 자리표에 없던 것 — 앞쪽 빈 칸부터 메우고, 없으면 뒤에 붙인다. */
    left.forEach((it) => {
        const hole = out.indexOf(null);
        if (hole >= 0) out[hole] = it;
        else out.push(it);
    });
    while (out.length < pad) out.push(null);
    /* 꼬리의 빈 칸은 덱에서만 남긴다 (목록은 pad=0 이라 잘려 나간다). */
    while (out.length > pad && out[out.length - 1] === null) out.pop();
    return out;
}

export function setKeySize(px: number): void {
    try { localStorage.setItem(SIZE_KEY, String(px)); } catch (_) {}
}

export const DECK_CSS = `
    /* ── 덱 무대 ───────────────────────────────────────────── */
        /* 기울면 판이 좌우로 삐져나온다 — 옆 여백이 없으면 그 자리에서 잘린다. */
    .fav-deck-stage { perspective:900px; perspective-origin:50% 30%; padding:34px 34px 46px; overflow-x:auto; }
    /* 껍데기는 스트림덱 살결에서만 어둡다 — 나머지는 KarmoLab 표면 그대로. */
    .skin-glow .fav-deck, .skin-plain .fav-deck{
        background:var(--bg-secondary); border:1px solid var(--border); box-shadow:none; color:var(--text-primary);
    }
    /* 납작 살결이라도 **덱 배치에서는 판이 있어야 한다** — 배경을 통째로 지우면
       격자가 허공에 뜬다 (2026-08-19 제보). 목록 배치에서는 판이 없다. */
    .fav-deck {
        /* --fk-size 를 여기서 다시 정하면 **뿌리(.fav-layout)에 얹은 슬라이더 값이 덮인다** —
           크기 조절이 통째로 안 먹던 원인 (2026-08-19 제보). 기본값은 쓰는 자리에서 준다. */
        width:fit-content; margin:0 auto;
        padding:20px;
        border-radius:20px;
        background:
            radial-gradient(120% 140% at 50% -20%, #262735 0%, transparent 60%),
            linear-gradient(178deg, #1d1e28 0%, #131420 100%);
        box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.07),
            0 1px 0 rgba(0,0,0,0.6),
            0 30px 60px -20px rgba(0,0,0,0.75);
        color:#f2f2ee;
        transform-style:preserve-3d;
        /* 기울기는 즉시 반영한다 — 전이를 걸면 커서 밑에서 판이 뒤늦게 따라와
           올렸다 내렸다가 떨린다. */
        transform:rotateX(var(--fk-rx, 8deg)) rotateY(var(--fk-ry, 0deg));
        will-change:transform;
    }
    .fav-deck-tabs { display:flex; align-items:center; gap:8px; margin-bottom:16px; }

    /* 탭 줄은 껍데기에 **파 놓은 홈**이다 — 안쪽 그림자로 한 단 내려앉고, 그 안에서
       탭이 솟아 있다. 양끝을 흐리게 지워 두면 잘린 탭이 보여서 「옆으로 더 있다」가
       설명 없이 읽힌다 (사용자 결정 2026-08-19). */
    .fav-deck-tablist {
        display:flex; align-items:center; gap:6px; flex:1; min-width:0;
        overflow-x:auto; overflow-y:hidden;
        padding:7px 14px;
        border-radius:999px;
        background:linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.22) 100%);
        box-shadow:
            inset 0 2px 5px rgba(0,0,0,0.6),
            inset 0 -1px 0 rgba(255,255,255,0.06);
        scrollbar-width:thin; scrollbar-color:rgba(255,255,255,0.18) transparent;
        -webkit-mask-image:linear-gradient(90deg, transparent 0, #000 18px, #000 calc(100% - 18px), transparent 100%);
        mask-image:linear-gradient(90deg, transparent 0, #000 18px, #000 calc(100% - 18px), transparent 100%);
    }
    .fav-deck-tablist::-webkit-scrollbar { height:4px; }
    .fav-deck-tablist::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.18); border-radius:2px; }
    .fav-deck-tablist::-webkit-scrollbar-track { background:transparent; }

    /* 탭 = 홈 안에서 솟은 작은 키. 위 모서리는 빛을 받고 아래는 그림자가 앉는다. */
    .fav-deck-tab {
        flex:none;
        font:inherit; font-size:var(--font-size-xs); line-height:1.5;
        padding:5px 12px; border-radius:999px; cursor:pointer;
        color:#c9cad6; border:1px solid rgba(255,255,255,0.10);
        background:linear-gradient(180deg, #33344312 0%, #0000001a 100%), #23242f;
        box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.16),
            0 1px 0 rgba(0,0,0,0.55),
            0 2px 4px rgba(0,0,0,0.45);
        transition:transform 90ms ease, box-shadow 90ms ease, color 90ms ease, background 90ms ease;
    }
    .fav-deck-tab:hover { color:#f2f2ee; transform:translateY(-1px); }
    /* 고른 탭은 **눌린** 모양 — 솟은 것들 사이에서 하나만 내려앉아 있으면 눈이 바로 찾는다. */
    .fav-deck-tab.on {
        color:var(--accent); border-color:color-mix(in srgb, var(--accent) 55%, transparent);
        background:#1a1b26;
        transform:translateY(1px);
        box-shadow:
            inset 0 2px 4px rgba(0,0,0,0.65),
            0 0 10px -4px var(--accent);
    }
    .fav-deck-tab:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }

    /* 밝은 살결에서는 홈도 밝게 (어두운 껍데기가 없으니 같은 값을 쓰면 시커멓다) */
    .skin-plain .fav-deck-tablist, .skin-glow .fav-deck-tablist {
        background:var(--bg-tertiary);
        box-shadow:inset 0 2px 4px rgba(0,0,0,0.18), inset 0 -1px 0 rgba(255,255,255,0.05);
    }
    .skin-plain .fav-deck-tab, .skin-glow .fav-deck-tab {
        color:var(--text-secondary); border-color:var(--border);
        background:var(--bg-secondary);
        box-shadow:inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 2px rgba(0,0,0,0.18);
    }
    .skin-plain .fav-deck-tab.on, .skin-glow .fav-deck-tab.on {
        color:var(--accent); background:var(--accent-subtle); border-color:var(--accent);
        box-shadow:inset 0 2px 3px rgba(0,0,0,0.12);
    }

    .fav-deck-grid {
        display:grid; grid-template-columns:repeat(auto-fit, var(--fk-size, 92px));
        justify-content:center; gap:15px; transform-style:preserve-3d;
        /* 한 줄 6칸까지 — 안 막으면 넓은 화면에서 한 줄로 길게 늘어져 덱이 아니라 띠가 된다. */
        max-width:calc(var(--fk-size, 92px) * 6 + 15px * 5);
        margin:0 auto;
    }
    .fav-deck-grid[hidden] { display:none; }

    /* ── 키 한 장 ──────────────────────────────────────────── */
    .fav-key {
        /* 폭을 못 박는다 — 빈 칸은 <button> 이라 그냥 두면 내용 크기(=0)로 쪼그라든다. */
        width:100%;
        --lcd:22px;   /* 화면이 파인 깊이 */
        --cap:12px;   /* 유리 캡이 솟은 높이 */
        --r:12px;
        position:relative; display:block; aspect-ratio:1/1;
        border:0; padding:0; background:none; text-decoration:none; color:inherit;
        border-radius:var(--r);
        transform-style:preserve-3d;
        /* 커서 판정은 유리 윗면이 맡는다 (위 주석 ③) */
        pointer-events:none;
        /* 캡이 솟고 내려앉는 것을 **흐르게** 한다 — 즉시 바뀌면 반사가 순간이동한다. */
        transition:--cap 150ms ease, --lcd 150ms ease, --fk-lift 150ms ease, --fk-s 150ms ease;
        -webkit-tap-highlight-color:transparent;
    }
    .fav-key .fk-face {
        position:absolute; inset:0; overflow:hidden; border-radius:4px;
        background:var(--fk-face, #14151d);
        transform:translateZ(var(--fk-lift, 0px)) scale(calc(1.03 * var(--fk-s, 1)));
        transition:filter 140ms ease, transform 110ms ease;
        box-shadow:
            inset 0 22px 26px -16px rgba(0,0,0,0.95),
            inset 0 0 22px rgba(0,0,0,0.5),
            inset 0 -12px 20px -16px rgba(255,255,255,0.22);
        pointer-events:none;
    }
    .fav-key .fk-art { position:absolute; inset:0; display:grid; place-items:center; }
    .fav-key .fk-art img { width:46%; height:46%; max-width:46%; object-fit:contain; }
    .fav-key .fk-art svg { width:42%; height:42%; stroke:currentColor; fill:none; stroke-width:1.7; }
    .fav-key .fk-cap {
        position:absolute; left:0; right:0; bottom:0; padding:14px 6px 5px; z-index:6;
        font-size:var(--font-size-2xs); line-height:1.2; text-align:center; color:#fff;
        text-shadow:0 1px 2px rgba(0,0,0,0.75);
        background:linear-gradient(to top, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0) 100%);
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }
    /* 있음/없음 점 — 화면 안쪽으로 넉넉히. 모서리에 붙이면 굴절 확대에 잘린다. */
    .fav-key .fk-led {
        position:absolute; top:11px; right:11px; width:7px; height:7px; border-radius:50%; z-index:7;
        background:var(--text-tertiary); box-shadow:0 0 0 2px rgba(0,0,0,0.45);
    }
    .fav-key .fk-led.on { background:#4ade80; box-shadow:0 0 8px 1px rgba(74,222,128,0.8); }

    /* LCD 결 — 서브픽셀 줄 + 주사선. **테마마다 값이 다르다**: 다크는 검은 주사선이
       맞지만, 라이트에서 같은 값을 쓰면 밝은 얼굴에 검댕이 낀다 (2026-08-19 제보). */
    .fav-layout { --fk-scan:rgba(0,0,0,0.55); --fk-rgb:0.40; --fk-lcd-op:0.3; }
    [data-theme="light"] .fav-layout { --fk-scan:rgba(0,0,0,0.16); --fk-rgb:0.22; --fk-lcd-op:0.5; }
    .fav-key .fk-lcd {
        /* 섞기(mix-blend-mode)를 쓰면 3D 면마다 배경을 되읽어야 해서 한 프레임이 초
           단위로 늘어진다 (2026-08-19 실측 — 마우스만 움직여도 화면이 멎었다). 그냥 덮는다. */
        position:absolute; inset:0; z-index:2; pointer-events:none; opacity:var(--fk-lcd-op, 0.3);
        background:
            repeating-linear-gradient(90deg,
                rgba(255,40,40,var(--fk-rgb, 0.4)) 0px, rgba(255,40,40,var(--fk-rgb, 0.4)) 1px,
                rgba(40,255,90,var(--fk-rgb, 0.4)) 1px, rgba(40,255,90,var(--fk-rgb, 0.4)) 2px,
                rgba(60,90,255,var(--fk-rgb, 0.4)) 2px, rgba(60,90,255,var(--fk-rgb, 0.4)) 3px),
            repeating-linear-gradient(0deg,
                var(--fk-scan) 0px, var(--fk-scan) 1px,
                rgba(0,0,0,0) 1px, rgba(0,0,0,0) 3px);
    }

    /* 우물 벽 — 화면(Z=0)에서 베젤 윗면(Z=+lcd)까지 */
    /* 벽 색은 **직접** 적는다 — 밝기 필터(filter:brightness)를 쓰면 면마다 렌더
       서피스가 생겨 프레임이 무너진다. 밝기 차는 색으로 낸다. */
    .fav-key .fk-wall { position:absolute; backface-visibility:hidden; pointer-events:none; }
    .fav-key .fk-w-b { left:3px; right:3px; top:100%; height:var(--lcd); transform-origin:50% 0; transform:rotateX(-90deg); background:#22242f; }
    .fav-key .fk-w-t { left:3px; right:3px; top:calc(var(--lcd) * -1); height:var(--lcd); transform-origin:50% 100%; transform:rotateX(90deg); background:#07080c; }
    .fav-key .fk-w-l { top:3px; bottom:3px; left:calc(var(--lcd) * -1); width:var(--lcd); transform-origin:100% 50%; transform:rotateY(-90deg); background:#13141c; }
    .fav-key .fk-w-r { top:3px; bottom:3px; left:100%; width:var(--lcd); transform-origin:0 50%; transform:rotateY(90deg); background:#13141c; }
    /* 베젤 칼라 — 이게 있어야 화면이 「파여」 보인다 */
    .fav-key .fk-base {
        position:absolute; inset:-9px; border:9px solid #1b1c26; border-radius:calc(var(--r) + 9px);
        transform:translateZ(var(--lcd)); pointer-events:none;
        box-shadow:inset 0 1px 0 rgba(255,255,255,0.07), 0 6px 14px rgba(0,0,0,0.5);
    }

    /* 유리 옆면 — 베젤 위에서 캡 꼭대기까지 */
    .fav-key .fk-gw {
        position:absolute; backface-visibility:hidden; pointer-events:none;
        background:linear-gradient(to bottom, rgba(225,235,255,0.30) 0%, rgba(160,180,220,0.10) 45%, rgba(255,255,255,0.22) 100%);
        box-shadow:inset 0 0 0 1px rgba(255,255,255,0.22), inset 0 1px 0 rgba(255,255,255,0.55);
    }
    .fav-key .fk-gw-b { left:var(--r); right:var(--r); top:100%; height:var(--cap); transform-origin:50% 0; transform:translateZ(var(--lcd)) rotateX(-90deg); }
    .fav-key .fk-gw-t { left:var(--r); right:var(--r); top:calc(var(--cap) * -1); height:var(--cap); transform-origin:50% 100%; transform:translateZ(var(--lcd)) rotateX(90deg); }
    .fav-key .fk-gw-l { top:var(--r); bottom:var(--r); left:calc(var(--cap) * -1); width:var(--cap); transform-origin:100% 50%; transform:translateZ(var(--lcd)) rotateY(-90deg); }
    .fav-key .fk-gw-r { top:var(--r); bottom:var(--r); left:100%; width:var(--cap); transform-origin:0 50%; transform:translateZ(var(--lcd)) rotateY(90deg); }

    /* 유리 윗면 — 반사가 마우스를 따라 흐른다. 커서 판정도 여기가 맡는다. */
    .fav-key .fk-glass {
        position:absolute; inset:0; border-radius:var(--r);
        transform:translateZ(calc(var(--lcd) + var(--cap)));
        pointer-events:auto; cursor:pointer;
        background:
            radial-gradient(70% 45% at var(--fk-sx, 40%) var(--fk-sy, 18%),
                rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.12) 45%, transparent 72%),
            linear-gradient(152deg,
                rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.07) 33%,
                rgba(255,255,255,0.02) 45%, rgba(255,255,255,0) 46%, rgba(255,255,255,0.05) 100%),
            radial-gradient(120% 100% at 50% 120%, rgba(180,200,255,0.14) 0%, transparent 55%);
        box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.7),
            inset 0 0 0 1px rgba(255,255,255,0.22),
            inset 0 -1px 0 rgba(255,255,255,0.3),
            inset 2px 0 0 -1px rgba(120,220,255,0.35),
            inset -2px 0 0 -1px rgba(255,140,200,0.28);
    }
    .fav-key .fk-glass::after {
        content:""; position:absolute; inset:3px; border-radius:calc(var(--r) - 3px);
        box-shadow:
            inset 0 0 0 1px rgba(255,255,255,0.10),
            inset 0 6px 10px -8px rgba(255,255,255,0.9),
            inset 0 -6px 10px -8px rgba(255,255,255,0.5);
    }

    /* 손이 닿을 때 — 유리와 그림이 **같이** 오르내린다 */
    .fav-key.hot { --cap:16px; --fk-lift:6px; --fk-s:1.02; }
    .fav-key.hot .fk-face { filter:brightness(1.2); }
    .fav-key:active, .fav-key.pressed { --cap:3px; --lcd:16px; --fk-lift:0px; --fk-s:0.965; }
    .fav-key:active .fk-face, .fav-key.pressed .fk-face { filter:brightness(0.86); }

    /* 빈 슬롯 */
    /* 빈 칸은 눌러서 담을 수 있다 — 키 상자는 판정에서 빠져 있으니 여기만 되돌린다. */
    .fav-key-empty { cursor:pointer; pointer-events:auto; }
    /* 목록 배치의 담기 칸은 **옅게** — 덱의 빈 칸과 달리 여기선 하나뿐이라 튄다. */
    .fav-grid .fav-key-empty { opacity:0.45; transition:opacity 130ms ease; }
    .fav-grid .fav-key-empty:hover { opacity:1; }
    /* 빈 칸 — 스트림덱은 기기 안이라 어둡고, 나머지 살결은 테마 토큰을 따른다. */
    .fav-key-empty .fk-face { background:var(--bg-tertiary); box-shadow:inset 0 2px 6px rgba(0,0,0,0.18); }
    .skin-glass .fav-key-empty .fk-face { background:#101119; box-shadow:inset 0 3px 9px rgba(0,0,0,0.8); }
    .fav-key-empty .fk-glass, .fav-key-empty .fk-gw, .fav-key-empty .fk-wall, .fav-key-empty .fk-lcd { display:none; }
    .fav-key-empty .fk-plus { position:absolute; inset:0; display:grid; place-items:center; font-size:20px; color:var(--text-tertiary); opacity:0.5; }

    /* ── 살결 ①「발광」 — 기기 흉내를 안 낸다. 키 얼굴 자체가 켜진 화면. ── */
    .skin-glow .fav-deck, .skin-plain .fav-deck { transform:none; }
    .skin-glow .fav-deck {
        background:var(--bg-secondary); border:1px solid var(--border); color:var(--text-primary);
        box-shadow:none;
    }
    .skin-glow .fav-deck-tab{ color:var(--text-primary); }
    .skin-glow .fav-deck-tab.on{
        background:var(--accent-subtle); border-color:var(--accent); color:var(--accent);
    }
    .skin-glow .fav-key{ pointer-events:auto; }
    .skin-glow .fk-wall, .skin-glow .fk-base, .skin-glow .fk-gw, .skin-glow .fk-glass { display:none; }
    .skin-glow .fk-face {
        transform:none; border-radius:12px;
        background:
            radial-gradient(120% 90% at 50% 0%, var(--accent-subtle) 0%, transparent 62%),
            var(--bg-secondary);
        box-shadow:inset 0 0 0 1px var(--border), 0 1px 2px rgba(0,0,0,0.10);
        transition:box-shadow 140ms ease, filter 90ms ease;
    }
    .skin-glow .fav-key.hot .fk-face { box-shadow:0 0 0 2px var(--accent), 0 0 24px -4px var(--accent); filter:none; }
    .skin-glow .fav-key:active .fk-face { filter:brightness(0.86); }
    .skin-glow .fav-key-empty .fk-face { background:var(--bg-tertiary); box-shadow:inset 0 0 0 1px var(--border-hover); }

    /* ── 살결 ⓪「기존」 — 지금까지의 카드 모양. 덱 배치에서도 이 얼굴을 쓴다.
       규칙이 없으면 밑바탕(스트림덱 겹)이 그대로 드러나 「기존을 골랐는데 스트림덱
       버튼이 나온다」가 된다 (2026-08-19 제보). */
    .skin-plain .fav-key { pointer-events:auto; }
    .skin-plain .fk-wall, .skin-plain .fk-base, .skin-plain .fk-gw, .skin-plain .fk-glass { display:none; }
    .skin-plain .fk-face {
        transform:none; border-radius:var(--radius-md);
        background:var(--bg-tertiary); box-shadow:inset 0 0 0 1px var(--border);
        transition:transform 130ms ease, box-shadow 130ms ease, background 130ms ease;
    }
    .skin-plain .fav-key.hot .fk-face {
        transform:translateY(-6px); background:var(--bg-hover);
        box-shadow:inset 0 0 0 1px var(--border-hover), var(--shadow-float);
    }
    .skin-plain .fav-key:active .fk-face { transform:translateY(0); }
    .skin-plain .fk-art img { width:52%; height:52%; }
    .skin-plain .fav-key-empty .fk-face { background:var(--bg-tertiary); box-shadow:inset 0 0 0 1px var(--border); }

    /* ── 살결 ②「납작」 — 지금 KarmoLab 카드 그대로. 격자만 덱에서 빌린다.
       판(껍데기)은 위 § 에서 준다 — 여기서 background:none 으로 지우면 **나중에 선언된
       쪽이 이겨** 덱 배치에서 판이 통째로 사라졌다 (2026-08-19 제보). */
    /* 이름 글자는 **얼굴이 어두울 때만** 흰색이다. 밝은 살결(기존·납작·발광)에서는
       토큰 색을 쓴다 — 라이트 테마에서 흰 글자가 밝은 타일 위에 얹혀 안 읽혔다
       (2026-08-19 제보). */
    .skin-glow .fk-cap, .skin-plain .fk-cap {
        color:var(--text-secondary); text-shadow:none; background:none;
    }
    .skin-glow .fav-key.hot .fk-cap{ color:var(--text-primary); }
    /* LCD 결은 **스트림덱 살결 전용**이다. 다른 살결의 밝은 얼굴 위에 주사선을 얹으면
       회색이 끼어 탁해진다 — 라이트 테마에서 특히 심했다 (2026-08-19 제보). */
    .skin-plain .fk-lcd { display:none; }

    /* 크기 조절 — 살결과 나란히, 다른 축 */
    .fav-deck-size { display:flex; align-items:center; gap:6px; margin-left:8px; }
    .fav-deck-size input[type="range"] { width:92px; accent-color:var(--accent); cursor:pointer; }
    .fav-deck-size output { font-size:var(--font-size-2xs); opacity:0.7; font-variant-numeric:tabular-nums; min-width:34px; }

    /* 살결 고르는 칸 */
    .fav-deck-skins { display:flex; gap:4px; margin-left:8px; }
    .fav-deck-skin {
        font:inherit; font-size:var(--font-size-2xs); padding:4px 9px; border-radius:999px; cursor:pointer;
        border:1px solid rgba(255,255,255,0.14); background:rgba(255,255,255,0.05); color:inherit; opacity:0.7;
    }
    .fav-deck-skin.on { opacity:1; border-color:var(--accent); color:var(--accent); background:var(--accent-subtle); }
    .skin-glow .fav-deck-skin{
        border-color:var(--border); background:var(--bg-tertiary); color:var(--text-secondary);
    }
    .skin-glow .fav-deck-skin.on{ color:var(--accent); border-color:var(--accent); background:var(--accent-subtle); }

    /* 조절칸 — 살결·크기는 배치와 무관하게 늘 여기 있다 */
    .fav-controls { display:flex; align-items:center; gap:12px; flex-wrap:wrap; justify-content:center; margin-bottom:var(--space-md); }
    .fav-skins { display:flex; gap:4px; }
    .fav-skin {
        font:inherit; font-size:var(--font-size-2xs); padding:5px 10px; border-radius:999px; cursor:pointer;
        border:1px solid var(--border); background:var(--bg-tertiary); color:var(--text-secondary);
    }
    .fav-skin:hover { color:var(--text-primary); border-color:var(--border-hover); }
    .fav-skin.on { color:var(--accent); border-color:var(--accent); background:var(--accent-subtle); }
    .fav-sizer { display:flex; align-items:center; gap:6px; }
    .fav-sizer input[type="range"] { width:110px; accent-color:var(--accent); cursor:pointer; }
    .fav-sizer output { font-size:var(--font-size-2xs); color:var(--text-tertiary); font-variant-numeric:tabular-nums; min-width:30px; }

    /* 목록 배치에서도 크기 슬라이더가 먹는다 (칸·아이콘이 같이 큰다) */
    .fav-layout .fav-grid { grid-template-columns:repeat(auto-fill, minmax(var(--fk-size, 72px), 1fr)); }
    .skin-plain .fav-icon { width:calc(var(--fk-size, 72px) * 0.62); height:calc(var(--fk-size, 72px) * 0.62); }
    /* 목록 배치에 키(살결)를 얹을 때 — 덱 껍데기가 없으니 칸 크기를 격자가 정한다 */

    .fav-item-wrap.dragging { opacity:0.45; }
    .fav-item-wrap.drop-here .fk-face { outline:2px dashed var(--accent); outline-offset:2px; }
    .fav-key[draggable="true"] { -webkit-user-drag:element; }


    /* ── 라이트 테마의 스트림덱 — **기기도 밝다** ──────────────────
       처음엔 「실물이 검으니 라이트에서도 검게」로 뒀는데, 밝은 화면 한가운데 검은 판이
       박혀 겉돌았다 (2026-08-19 제보). 같은 물건의 흰색 판으로 바꾼다: 몸체·베젤·우물
       벽·화면·유리 반사까지 밝은 쪽 값으로. */
    [data-theme="light"] .skin-glass .fav-deck {
        background:linear-gradient(178deg, #f6f4fb 0%, #e6e4f0 100%);
        border:1px solid rgba(26,26,31,0.08);
        color:var(--text-primary);
        box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.9),
            0 1px 0 rgba(26,26,31,0.06),
            0 24px 44px -22px rgba(26,26,31,0.28);
    }
    [data-theme="light"] .skin-glass .fav-deck-tablist {
        background:linear-gradient(180deg, rgba(26,26,31,0.09) 0%, rgba(26,26,31,0.04) 100%);
        box-shadow:inset 0 2px 4px rgba(26,26,31,0.16), inset 0 -1px 0 rgba(255,255,255,0.8);
        scrollbar-color:rgba(26,26,31,0.22) transparent;
    }
    [data-theme="light"] .skin-glass .fav-deck-tablist::-webkit-scrollbar-thumb { background:rgba(26,26,31,0.22); }
    [data-theme="light"] .skin-glass .fav-deck-tab {
        color:var(--text-secondary); border-color:rgba(26,26,31,0.10);
        background:linear-gradient(180deg, #ffffff 0%, #f0eef7 100%);
        box-shadow:inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 0 rgba(26,26,31,0.10), 0 2px 4px rgba(26,26,31,0.10);
    }
    [data-theme="light"] .skin-glass .fav-deck-tab:hover { color:var(--text-primary); }
    [data-theme="light"] .skin-glass .fav-deck-tab.on {
        color:var(--accent); background:#e7e3f7; border-color:color-mix(in srgb, var(--accent) 45%, transparent);
        box-shadow:inset 0 2px 4px rgba(26,26,31,0.18), 0 0 8px -4px var(--accent);
    }
    /* 화면 = 밝은 LCD */
    [data-theme="light"] .skin-glass .fk-face {
        background:var(--fk-face, #f4f2fa);
        box-shadow:
            inset 0 18px 22px -18px rgba(26,26,31,0.35),
            inset 0 0 18px rgba(26,26,31,0.10),
            inset 0 -10px 16px -14px rgba(255,255,255,0.9);
    }
    [data-theme="light"] .skin-glass .fk-cap {
        color:var(--text-primary); text-shadow:none;
        background:linear-gradient(to top, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 100%);
    }
    /* 우물 벽·베젤 = 흰 플라스틱 */
    [data-theme="light"] .skin-glass .fk-base { border-color:#dedbeb; box-shadow:inset 0 1px 0 rgba(255,255,255,0.9), 0 5px 12px rgba(26,26,31,0.14); }
    [data-theme="light"] .skin-glass .fk-w-t { background:#c9c6d9; }
    [data-theme="light"] .skin-glass .fk-w-b { background:#ffffff; }
    [data-theme="light"] .skin-glass .fk-w-l,
    [data-theme="light"] .skin-glass .fk-w-r { background:#e0ddec; }
    /* 유리 — 밝은 바탕에서는 흰 반사를 낮추고 모서리만 또렷하게 */
    [data-theme="light"] .skin-glass .fk-glass {
        box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.95),
            inset 0 0 0 1px rgba(26,26,31,0.10),
            inset 0 -1px 0 rgba(255,255,255,0.7),
            inset 2px 0 0 -1px rgba(80,190,255,0.28),
            inset -2px 0 0 -1px rgba(255,120,190,0.22);
    }
    [data-theme="light"] .skin-glass .fk-gw {
        background:linear-gradient(to bottom, rgba(255,255,255,0.85) 0%, rgba(220,220,235,0.5) 45%, rgba(255,255,255,0.75) 100%);
        box-shadow:inset 0 0 0 1px rgba(26,26,31,0.10), inset 0 1px 0 rgba(255,255,255,0.95);
    }
    [data-theme="light"] .skin-glass .fav-key-empty .fk-face {
        background:#e4e1ef; box-shadow:inset 0 3px 8px rgba(26,26,31,0.18);
    }

    @media (prefers-reduced-motion: reduce) {
        .fav-deck { transition:none; }
        .fav-key .fk-face { transition:none; }
    }
`;

/** 반사·기울기를 **전이 가능한 값**으로 등록한다. 안 하면 마우스가 들고 날 때 빛이 튄다. */
export function registerDeckProps(): void {
    const api = (window as unknown as { CSS?: { registerProperty?: (d: object) => void } }).CSS;
    if (!api?.registerProperty) return;
    const props = [
        { name: '--fk-sx', syntax: '<percentage>', initialValue: '40%' },
        { name: '--fk-sy', syntax: '<percentage>', initialValue: '18%' },
        /* 유리 높이·우물 깊이도 **전이 가능한 값**으로 등록한다. 등록 안 하면 손이 닿는
           순간 12px → 16px 가 한 프레임에 튀고, 유리면이 순간이동하면서 반사가 뚝
           옮겨 앉는다 — 그게 「빛이 계속 튄다」의 정체였다 (2026-08-19 제보). */
        { name: '--cap', syntax: '<length>', initialValue: '12px' },
        { name: '--lcd', syntax: '<length>', initialValue: '22px' },
        { name: '--fk-lift', syntax: '<length>', initialValue: '0px' },
        { name: '--fk-s', syntax: '<number>', initialValue: '1' }
    ];
    props.forEach((p) => {
        try { api.registerProperty!({ ...p, inherits: true }); } catch (_) { /* 이미 등록됨 */ }
    });
}


const LAYERS_WELL =
    '<span class="fk-base"></span>' +
    '<span class="fk-wall fk-w-t"></span><span class="fk-wall fk-w-b"></span>' +
    '<span class="fk-wall fk-w-l"></span><span class="fk-wall fk-w-r"></span>';
const LAYERS_GLASS =
    '<span class="fk-gw fk-gw-t"></span><span class="fk-gw fk-gw-b"></span>' +
    '<span class="fk-gw fk-gw-l"></span><span class="fk-gw fk-gw-r"></span>' +
    '<span class="fk-glass"></span>';

type Esc = (s: string) => string;

/**
 * 덱의 **자세**(기울기 + 반사 위치)를 모듈에 남긴다.
 *
 * 위젯은 담기·빼기·보기 전환 때마다 통째로 다시 그린다 — 그때 덱 요소가 새로 태어나면서
 * 인라인으로 얹어 둔 값이 사라지고, 판이 기본 각도로 **툭 되돌아간다**. 사용자 눈에는
 * 「빛이 튄다」로 보인다 (2026-08-19 제보). 마지막 자세를 들고 있다가 새 판에 그대로
 * 얹으면 다시 그려도 이어진다.
 */
const pose = { rx: 8, ry: 0 };

/** 보고 있던 페이지. 자리 옮김·담기로 다시 그려도 그 칸에 그대로 있게. */
let activePage = 0;

/** 기울기를 판에 얹는다. 반사는 키가 각자 맡는다(paintShine). */
function applyPose(deck: HTMLElement, instant = false): void {
    void instant;
    deck.style.setProperty('--fk-rx', pose.rx.toFixed(2) + 'deg');
    deck.style.setProperty('--fk-ry', pose.ry.toFixed(2) + 'deg');
}

/**
 * 키 한 장. **바깥 껍데기(`fav-item-wrap` / `fav-item` + data 속성)는 다른 보기와 같게**
 * 둔다 — 그래야 클릭·빼기·검색 배선을 그대로 쓴다 (덱만 따로 배선하면 그날부터 갈린다).
 */
export function keyHtml(it: FavoriteItem, group: string, esc: Esc, iconUrl: (i: FavoriteItem) => string, metaDesc: string): string {
    const isTool = it.type === 'tool';
    const isApp = it.type === 'app';
    const searchable = [it.label, group, it.url || '', it.toolId || '', it.scheme || '', it.exec || '', metaDesc]
        .join(' ')
        .toLowerCase();

    const art = isTool
        ? `<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">${it.icon || ''}</svg>`
        /* 크기를 속성으로도 박는다 — CSS 가 아직 안 붙은 순간의 「거대 파비콘」 방지. */
        : `<img width="48" height="48" src="${esc(isApp ? it.icon || '' : iconUrl(it))}" alt="" decoding="async">`;

    const removeBtn = isTool
        ? `<button type="button" class="fav-remove" data-tool="${esc(it.toolId || '')}">×</button>`
        : isApp
        ? `<button type="button" class="fav-remove" data-app-remove="${esc((it.scheme || it.exec || '').toLowerCase())}">×</button>`
        : it.isCustom && it.url
        ? `<button type="button" class="fav-remove" data-group="${esc(group)}" data-url="${esc(it.url)}">×</button>`
        : '';

    const attrs = isTool
        ? `href="#" data-tool-id="${esc(it.toolId || '')}"`
        : isApp
        ? `href="${esc(it.scheme ? it.scheme + '://' : '#')}" data-app-key="${esc((it.scheme || it.exec || '').toLowerCase())}"`
        : `href="${esc(it.url || '')}" target="_blank" rel="noopener noreferrer"`;

    const led = isApp && isDesktop()
        ? `<span class="fk-led" data-app-badge="${esc((it.scheme || it.exec || '').toLowerCase())}"></span>`
        : '';

    return `
        <div class="fav-item-wrap" data-searchable="${esc(searchable)}" data-key="${esc(itemKey(it))}" data-group="${esc(group)}">
            ${removeBtn}
            <a class="fav-item fav-key" draggable="true" ${attrs} title="${esc(it.label)}">
                ${LAYERS_WELL}
                <span class="fk-face">
                    <span class="fk-art">${art}</span>
                    <span class="fk-lcd"></span>${led}
                    <span class="fk-cap">${esc(it.label)}</span>
                </span>
                ${LAYERS_GLASS}
            </a>
        </div>`;
}

export function emptyHtml(group: string, slot: number, esc: Esc): string {
    /* 빈 칸도 누를 수 있다 — 그 자리에 바로 담게(추가창을 연다). */
    return `
        <div class="fav-item-wrap">
            <button type="button" class="fav-key fav-key-empty" data-add-slot="${slot}" data-add-group="${esc(group)}">
                <span class="fk-face"><span class="fk-plus">+</span></span>
            </button>
        </div>`;
}

export function renderDeckHtml(
    groups: FavoriteGroup[],
    esc: Esc,
    iconUrl: (i: FavoriteItem) => string,
    metaDescOf: (i: FavoriteItem) => string
): string {
    if (!groups.length) return '';
    /* 자리표·현재 페이지는 **탭보다 먼저** 정해야 한다 — 탭이 이 값을 읽는다
       (아래에 두면 TDZ 로 위젯이 통째로 안 뜬다, 2026-08-19). */
    const slots = loadSlots();
    const page = Math.min(activePage, Math.max(0, groups.length - 1));
    const tabs = groups
        .map((g, i) => `<button type="button" class="fav-deck-tab ${i === page ? 'on' : ''}" data-deck-tab="${i}">${esc(g.group)}</button>`)
        .join('');

    const pages = groups
        .map((g, i) => {
            /* 자리표대로 편다 — **빈 칸은 그대로 빈 칸**. 자동으로 앞당겨 채우지 않는다
             * (그게 「정렬되지 않게」의 뜻이다, 사용자 결정 2026-08-19). */
            const laid = arrange(g.items, g.group, slots, SLOTS);
            const keys = laid.map((it, slot) =>
                it ? keyHtml(it, g.group, esc, iconUrl, metaDescOf(it)) : emptyHtml(g.group, slot, esc)
            );
            /* 폴더 키는 뺐다 — 위 탭 줄이 이미 모든 그룹을 보여 주는데, 페이지마다
             * 「다음 그룹」 키가 한 칸씩 앉아 있으면 그 카테고리의 물건인 줄 읽힌다
             * (2026-08-19 제보). 자리도 한 칸씩 먹었다. */
            while (keys.length % 6 !== 0) {
                keys.push(emptyHtml(g.group, keys.length, esc));
                if (keys.length > 60) break;
            }
            return `<div class="fav-deck-grid" data-deck-page-idx="${i}" data-group="${esc(g.group)}" ${i === page ? '' : 'hidden'}>${keys.join('')}</div>`;
        })
        .join('');


    return `
        <div class="fav-deck-stage" data-deck-stage>
            <div class="fav-deck" data-deck>
                <div class="fav-deck-tabs">
                    <div class="fav-deck-tablist">${tabs}</div>
                </div>
                ${pages}
            </div>
        </div>`;
}

/**
 * 덱 배선. 되돌리는 함수를 준다 — 위젯이 다시 그려질 때 리스너가 쌓이면 안 된다.
 */
export function wireDeck(container: HTMLElement, onSlotsChanged: () => void = () => {}): () => void {
    const stage = container.querySelector<HTMLElement>('[data-deck-stage]');
    const deck = container.querySelector<HTMLElement>('[data-deck]');
    if (!stage || !deck) return () => {};

    /* 새로 그린 판에 **먼저** 지난 자세를 얹는다 — 첫 그림 전에 얹어야 되돌아가는
       순간이 안 보인다. */
    applyPose(deck, true);

    /* 첫 그림에도 한 번 칠한다 — 안 하면 기본값(가운데)이라 판 전체가 똑같아 보인다. */
    requestAnimationFrame(() => paintShine());

    /* 끌기 상태 — 클릭 처리보다 **위에** 둔다 (아래에 두면 클릭 때 아직 초기화 전이라
       ReferenceError 로 화면이 죽는다). */
    let dragKey: string | null = null;
    let dropAt = 0;

    /**
     * 반사 자리 — **커서가 아니라 기울기에서** 나온다.
     *
     * 조명은 방에 붙박여 있다. 커서를 따라 빛이 쫓아다니면 손전등을 든 것처럼 보여
     * 어색하다 (2026-08-19 제보). 실물에서 반사가 미끄러지는 이유는 두 가지뿐이다:
     *   ① 판이 기울어 유리면의 법선이 돌아간다 → 열두 칸이 **같은 방향으로** 미끄러진다
     *   ② 키가 판 가운데에서 멀수록 보는 각이 달라진다 → 가장자리 칸일수록 더 눕는다
     * 그래서 기울기(pose)와 키의 자리만으로 계산한다. 커서 좌표는 안 쓴다.
     */
    const paintShine = (): void => {
        const live = deck.querySelector<HTMLElement>('.fav-deck-grid:not([hidden])');
        if (!live) return;
        const board = live.getBoundingClientRect();
        if (!board.width) return;
        live.querySelectorAll<HTMLElement>('.fav-key').forEach((key) => {
            const r = key.getBoundingClientRect();
            if (!r.width) return;
            /* 판 가운데 기준으로 이 칸이 어느 쪽에 있나 (−0.5 ~ 0.5) */
            const ox = (r.left + r.width / 2 - board.left) / board.width - 0.5;
            const oy = (r.top + r.height / 2 - board.top) / board.height - 0.5;
            /* 기울기 1도당 반사가 미끄러지는 정도(%). 판 전체가 함께 움직인다. */
            const sx = 42 + pose.ry * 3.2 + ox * 26;
            const sy = 16 - pose.rx * 2.4 + oy * 18;
            key.style.setProperty('--fk-sx', sx.toFixed(1) + '%');
            key.style.setProperty('--fk-sy', sy.toFixed(1) + '%');
        });
    };

    const showPage = (idx: number): void => {
        activePage = idx;
        container.querySelectorAll<HTMLElement>('[data-deck-page-idx]').forEach((p) => {
            p.hidden = p.dataset.deckPageIdx !== String(idx);
        });
        container.querySelectorAll<HTMLElement>('[data-deck-tab]').forEach((t) => {
            t.classList.toggle('on', t.dataset.deckTab === String(idx));
        });
        applyPose(deck, true);
        paintShine();
    };

    const onClick = (e: MouseEvent): void => {
        /* 끌어 놓은 직후의 클릭은 삼킨다 — 안 그러면 옮기자마자 그 키가 열린다. */
        if (Date.now() - dropAt < 250) { e.preventDefault(); e.stopPropagation(); return; }
        const target = e.target as HTMLElement;
        const tab = target.closest<HTMLElement>('[data-deck-tab]');
        if (tab) { showPage(Number(tab.dataset.deckTab)); return; }
    };
    deck.addEventListener('click', onClick);


    /* 마우스를 따라 기운다. 나가도 **되돌리지 않는다** — 원위치로 튕기는 그 순간이
     * 제일 어색하다. 멀미 설정은 존중한다. */
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    /* 프레임 간격만큼만 반영한다. 예전엔 requestAnimationFrame 으로 잠갔는데, 탭이
       뒤에 있으면 rAF 가 아예 안 돌아 **자물쇠가 영영 안 풀렸다** — 그 상태로 돌아오면
       빛이 첫 값에 굳어 있다가 다음 움직임에 한 번에 튄다 (2026-08-19). 시계로 잰다. */
    let lastAt = 0;
    const onMove = (e: PointerEvent): void => {
        /* 살결 클래스는 뿌리(.fav-layout)에 붙는다 — 덱에서 찾으면 늘 빗나가
           기울기가 통째로 죽는다 (2026-08-19 제보). */
        if (!deck.closest('.skin-glass')) return;
        const now = performance.now();
        if (now - lastAt < 12) return;
        lastAt = now;
        const r = stage.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        if (dragKey) return;   /* 끄는 동안 판이 같이 기울면 손이 따라가지 못한다 */
        pose.rx = 8 - py * 4;
        pose.ry = px * 5;
        applyPose(deck);
        /* **반사는 키마다 따로 친다.** 덱 하나에 값 하나를 두면 열두 칸의 빛이 한 몸으로
           움직여서, 눈에는 「안 따라온다 / 가끔 튄다」로 보인다. 각 키의 제 상자 기준으로
           커서 위치를 넣어 주면 바깥 칸일수록 빛이 비스듬히 눕는다 (2026-08-19 제보). */
        paintShine();
    };
    if (!still) stage.addEventListener('pointermove', onMove);

    /* ── 끌어서 자리 바꾸기 ─────────────────────────────────────
     * 놓은 자리와 **맞바꾼다**(끼워 넣고 밀지 않는다). 덱은 자리가 뜻을 갖는 배치라,
     * 하나 옮겼다고 나머지가 우르르 밀리면 손이 기억한 위치가 무너진다. */
    const onDragStart = (e: DragEvent): void => {
        const wrap = (e.target as HTMLElement).closest<HTMLElement>('.fav-item-wrap[data-key]');
        if (!wrap) { e.preventDefault(); return; }   /* 빈 칸·탭은 끌지 않는다 */
        dragKey = wrap.dataset.key || null;
        if (e.dataTransfer) {
            /* 링크(<a href>)를 그냥 끌면 브라우저가 **주소**를 끌어 다른 창에 떨군다.
               우리 뜻은 「칸을 옮긴다」이므로 자리 열쇠만 싣고, 끌리는 그림도 키 얼굴로 준다. */
            e.dataTransfer.setData('text/plain', dragKey || '');
            e.dataTransfer.effectAllowed = 'move';
            const face = wrap.querySelector<HTMLElement>('.fk-face');
            if (face) e.dataTransfer.setDragImage(face, face.offsetWidth / 2, face.offsetHeight / 2);
        }
        wrap.classList.add('dragging');
    };
    const onDragOver = (e: DragEvent): void => {
        if (!dragKey) return;
        const cell = (e.target as HTMLElement).closest<HTMLElement>('.fav-item-wrap');
        if (!cell) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        deck.querySelectorAll('.drop-here').forEach((n) => n.classList.remove('drop-here'));
        cell.classList.add('drop-here');
    };
    const onDrop = (e: DragEvent): void => {
        if (!dragKey) return;
        const cell = (e.target as HTMLElement).closest<HTMLElement>('.fav-item-wrap');
        const grid = (e.target as HTMLElement).closest<HTMLElement>('.fav-deck-grid');
        if (!cell || !grid) return;
        e.preventDefault();
        const group = grid.dataset.group || '';
        const cells = [...grid.querySelectorAll<HTMLElement>('.fav-item-wrap')];
        const to = cells.indexOf(cell);
        const from = cells.findIndex((c) => c.dataset.key === dragKey);
        if (to < 0 || from < 0 || to === from) return;

        /* 지금 화면 순서를 자리표로 굳힌 뒤 두 자리를 맞바꾼다. */
        const order = cells.map((c) => c.dataset.key || null);
        const tmp = order[to]; order[to] = order[from]; order[from] = tmp;
        const map = loadSlots();
        map[group] = order;
        saveSlots(map);
        onSlotsChanged();
    };
    const onDragEnd = (): void => {
        dragKey = null;
        dropAt = Date.now();
        deck.querySelectorAll('.dragging, .drop-here').forEach((n) => n.classList.remove('dragging', 'drop-here'));
    };
    deck.addEventListener('dragstart', onDragStart);
    deck.addEventListener('dragover', onDragOver);
    deck.addEventListener('drop', onDrop);
    deck.addEventListener('dragend', onDragEnd);

    return () => {
        deck.removeEventListener('click', onClick);
        deck.removeEventListener('dragstart', onDragStart);
        deck.removeEventListener('dragover', onDragOver);
        deck.removeEventListener('drop', onDrop);
        deck.removeEventListener('dragend', onDragEnd);
        stage.removeEventListener('pointermove', onMove);
    };
}

/**
 * 키 배선 — **배치와 무관**하다. 살결이 「기존」이 아니면 목록 배치에서도 키를 쓰므로,
 * 손 닿음(.hot)과 있음/없음 점은 여기서 한 번에 맡는다 (예전엔 덱 안에만 있어서
 * 목록 배치에서는 키가 아무 반응도 안 했다 — 2026-08-19 제보).
 */
export function wireKeys(container: HTMLElement): () => void {
    /* 손 닿음을 CSS :hover 에 맡기지 않는다 — 기울어진 판 위에서는 커서가 경계를
     * 스칠 때마다 들어왔다 나갔다 한다. 진입 즉시, 이탈 140ms 유예. */
    let hot: HTMLElement | null = null;
    let timer = 0;
    const onOver = (e: PointerEvent): void => {
        const key = (e.target as HTMLElement).closest<HTMLElement>('.fav-key');
        if (!key || key === hot || key.classList.contains('fav-key-empty')) return;
        window.clearTimeout(timer);
        hot?.classList.remove('hot');
        hot = key;
        key.classList.add('hot');
    };
    const cool = (): void => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => { hot?.classList.remove('hot'); hot = null; }, 140);
    };
    const onOut = (e: PointerEvent): void => {
        if (!hot) return;
        const to = e.relatedTarget as Node | null;
        if (to && hot.contains(to)) return;
        cool();
    };
    container.addEventListener('pointerover', onOver);
    container.addEventListener('pointerout', onOut);


    /* 있음/없음 점 — 데스크톱만 답할 수 있다 (웹은 설치 여부를 알 방법이 없다). */
    if (isDesktop()) {
        container.querySelectorAll<HTMLElement>('[data-app-badge]').forEach((dot) => {
            const key = dot.dataset.appBadge || '';
            const spec = /[\\/]/.test(key) ? { exec: key } : { scheme: key };
            void checkInstalled(spec).then((ok) => {
                if (ok === null) { dot.remove(); return; }
                dot.classList.toggle('on', ok);
            });
        });
    }

    return () => {
        window.clearTimeout(timer);
        container.removeEventListener('pointerover', onOver);
        container.removeEventListener('pointerout', onOut);
    };
}
