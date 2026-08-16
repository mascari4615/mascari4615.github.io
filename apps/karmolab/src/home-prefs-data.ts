/**
 * 첫 화면 블록 설정 — **읽기 쪽 한 벌** (TASK-KL-201 후속, 2026-08-16)
 *
 * 왜 따로 나왔나: 「어느 블록을 감출 것인가」를 두 곳이 알아야 한다.
 *   - `home-page.ts` — 화면을 **짓는** 쪽. 감출 블록은 처음부터 안 보이게 지어야 한다.
 *   - `home-prefs.ts` — 사용자가 **바꾸는** 쪽(순서·감추기·이름).
 * 짓는 쪽이 몰라서, 기본으로 감춰지는 블록 셋(오늘의 판·실황·갈 곳 카드)이 **먼저 그려졌다가
 * 사라지고 있었다.** 실사이트 실측(390px): 첫 그림 뒤 ~200ms 에 377px 가 접히면서 위에 있던
 * 제목·검색칸이 205px 움직였다 — 그 한 번이 사이트 전체 밀림 0.097 중 0.091 이었다.
 * (`.landing-page` 는 세로 가운데 정렬이라, 아래가 접히면 **위가 움직인다**.)
 *
 * 목록을 두 벌 적으면 반드시 갈라진다. 그래서 한 벌만 둔다.
 */

export interface HomePrefs {
    version: number;
    order: string[];
    hidden: string[];
    name: string;
}

export const KEY = 'karmolab_home_prefs';

/** 안 꾸민 사람에게 처음부터 안 보이는 블록. */
export const DEFAULT_HIDDEN = ['today', 'live', 'cta'];

/** 옮길 수 있는 블록 — 이름은 화면에 그대로 나온다. 여기 없는 블록은 손대지 않는다. */
export const BLOCKS: Array<{ id: string; label: string }> = [
    { id: 'today', label: '오늘의 판' },
    { id: 'live', label: '실황' },
    { id: 'cta', label: '갈 곳 카드' },
    { id: 'pulse', label: '방문 수' }
];

export function read(): HomePrefs {
    try {
        const stored = localStorage.getItem(KEY);
        if (!stored) return { version: 2, order: [], hidden: [...DEFAULT_HIDDEN], name: '' };
        const raw = JSON.parse(stored);
        const savedOrder = Array.isArray(raw.order) ? raw.order.filter((id: unknown) => typeof id === 'string') : [];
        const savedHidden = Array.isArray(raw.hidden) ? raw.hidden.filter((id: unknown) => typeof id === 'string') : [];
        const hasCustomLayout = savedOrder.length > 0 || savedHidden.length > 0 || (typeof raw.name === 'string' && raw.name.trim().length > 0);
        const isLegacyEmpty = raw.version !== 2 && !hasCustomLayout;
        return {
            version: 2,
            order: savedOrder,
            hidden: isLegacyEmpty ? [...DEFAULT_HIDDEN] : savedHidden,
            name: typeof raw.name === 'string' ? raw.name.slice(0, 20) : ''
        };
    } catch {
        return { version: 2, order: [], hidden: [...DEFAULT_HIDDEN], name: '' };
    }
}

/** 지을 때 쓰는 답 하나 — 「이 블록, 지금 감춰야 하나?」 */
export function isHiddenAtBuild(id: string): boolean {
    return read().hidden.indexOf(id) >= 0;
}
