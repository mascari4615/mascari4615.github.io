/**
 * 도장 (TASK-KL-196 A) — 이 브라우저가 어느 도구를 처음 쓴 날.
 *
 * 여기 있는 이유: 도구를 열었다는 사실은 이미 **한 곳**에서 알린다(`account.ts` 의
 * `traceCurrentTool`). 도장도 거기서 같이 찍어야 「도구를 열었다」의 판정이 두 벌이 안 된다.
 * 그런데 그 파일은 계정 담당이고 도감은 위젯이라, 둘 다 기대는 자리를 따로 둔다(여기).
 *
 * 왜 로컬에도 남기나: 서버(발자국)는 **로그인한 사람만** 갖는다. 도감이 로그인 뒤에만 보이면,
 * 도감을 보려고 로그인하는 것이 아니라 로그인해야 도감이 생기는 셈이라 순서가 반대다.
 *
 * 날짜만 적는다. 횟수는 안 센다 — 도감은 수집이지 성적표가 아니다.
 */
const KEY = 'karmolab_stamps';

export type Stamps = Record<string, string>;

/** 오늘(KST). 놀이·판과 같은 모양(`YYYY-MM-DD`)을 쓴다. */
function today(): string {
    return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}

export function stampsLocal(): Stamps {
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
        return raw && typeof raw === 'object' ? (raw as Stamps) : {};
    } catch {
        return {};
    }
}

/**
 * 도장을 찍는다. **처음 쓴 날은 안 덮는다** — 덮으면 도감의 날짜가 「마지막으로 쓴 날」이 되고,
 * 그러면 「이건 언제 처음 써 봤지」를 영영 못 본다.
 * @returns 이번에 처음 찍혔으면 true (부르는 쪽이 축하할 수 있게).
 */
export function stampToday(toolId: string): boolean {
    if (!toolId) return false;
    try {
        const stamps = stampsLocal();
        if (stamps[toolId]) return false;
        stamps[toolId] = today();
        localStorage.setItem(KEY, JSON.stringify(stamps));
        return true;
    } catch {
        /* 사생활 모드 — 도장은 못 남지만 도구는 그대로 쓴다 */
        return false;
    }
}

/** 몇 칸 찍혔나. 첫 화면이 한 줄로 보여 줄 때 쓴다. */
export function stampCount(): number {
    return Object.keys(stampsLocal()).length;
}
