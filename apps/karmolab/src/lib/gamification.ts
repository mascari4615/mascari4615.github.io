/**
 * 기록·연속일·경험치 — 사용자 데이터 한 벌 (TASK-KL-321)
 *
 * 왜 여기 있나: 같은 `toolbox_user_data` 를 **두 벌이 따로** 만지고 있었다. 본체는
 * `toolbox.ts` 안에서(도전과제·뱃지·진행도), 플래너는 React 섬 안에서(연속일·경험치·레벨).
 * 열쇠가 같으니 서로의 값을 덮어쓸 수 있고, 실제로 규칙도 갈라져 있었다 — 섬만 레벨을
 * 올리고 본체는 그 필드를 몰랐다. 섬을 걷어 내면서 **셈은 여기 한 곳**으로 모은다.
 *
 * 여기 있는 것은 전부 순수 함수 + 저장 한 겹이다. 화면은 없다 — 화면은 부르는 쪽이 그린다.
 * 그래야 노드에서 그대로 시험할 수 있다(`scripts/test-gamification.mjs`).
 */

export const USER_DATA_KEY = 'toolbox_user_data';

export interface StreakState {
    /** 지금 이어지는 날 수 */
    current: number;
    /** 여태 가장 길게 이어진 날 수 */
    longest: number;
    /** 마지막으로 기록한 날 (로컬 달력 YYYY-MM-DD) */
    lastActivityDate: string;
}

export interface UserData {
    achievements: string[];
    badges: string[];
    progress: Record<string, number>;
    streaks: Record<string, StreakState>;
    totalExp: number;
    level: number;
}

export interface TrackMeta {
    id: string;
    /** 화면 이름은 부르는 쪽이 i18n 으로 붙인다 — 여기엔 열쇠만 둔다 */
    labelKey: string;
}

/** 플래너 스트릭 기본 트랙. 이름표는 `i18n/<언어>/planner.json` 이 들고 있다. */
export const DEFAULT_TRACKS: readonly TrackMeta[] = [
    { id: 'daily_review', labelKey: 'planner.track.daily_review' },
    { id: 'exercise', labelKey: 'planner.track.exercise' }
] as const;

/** 연속일 마일스톤 도전과제 id — `widgets/user.ts` 의 도전과제 목록과 같은 문자열을 쓴다. */
export const STREAK_ACHIEVEMENTS = ['streak_first', 'streak_7', 'streak_30', 'streak_100'] as const;
export type StreakAchievementId = (typeof STREAK_ACHIEVEMENTS)[number];

export const EXP_REWARDS = {
    STREAK_COMPLETE: 30,
    STREAK_BONUS_PER_DAY: 5,
    TASK_COMPLETE: 20,
    TASK_IN_PROGRESS: 10
} as const;

/* ===== 순수 셈 ===== */

/** 로컬 달력 기준 YYYY-MM-DD. UTC 로 자르면 한국 새벽에 하루가 밀린다. */
export function localDateString(d: Date = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function parseLocalDate(s: string): Date {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/** prev 가 today 의 바로 전날인가. 달·해가 바뀌는 자리를 손으로 세지 않으려고 날짜로 뺀다. */
function isYesterday(prev: string, today: string): boolean {
    return (parseLocalDate(today).getTime() - parseLocalDate(prev).getTime()) / 86400000 === 1;
}

export function emptyUserData(): UserData {
    return { achievements: [], badges: [], progress: {}, streaks: {}, totalExp: 0, level: 0 };
}

function normalizeStreak(raw: unknown): StreakState | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const current = Number(o.current);
    const longest = Number(o.longest);
    if (!Number.isFinite(current) || !Number.isFinite(longest)) return null;
    return {
        current,
        longest,
        lastActivityDate: typeof o.lastActivityDate === 'string' ? o.lastActivityDate : ''
    };
}

/** 저장된 것이 어떤 모양이든 여기서 한 모양으로 만든다 — 옛 판이 남아 있어도 안 죽게. */
export function mergeUserData(parsed: Partial<UserData> | null | undefined): UserData {
    const d = emptyUserData();
    if (!parsed || typeof parsed !== 'object') return d;
    const streaks: Record<string, StreakState> = {};
    if (parsed.streaks && typeof parsed.streaks === 'object' && !Array.isArray(parsed.streaks)) {
        for (const [k, v] of Object.entries(parsed.streaks)) {
            const n = normalizeStreak(v);
            if (n) streaks[k] = n;
        }
    }
    return {
        achievements: Array.isArray(parsed.achievements) ? [...parsed.achievements] : d.achievements,
        badges: Array.isArray(parsed.badges) ? [...parsed.badges] : d.badges,
        progress:
            parsed.progress && typeof parsed.progress === 'object' && !Array.isArray(parsed.progress)
                ? { ...parsed.progress }
                : d.progress,
        streaks,
        totalExp: typeof parsed.totalExp === 'number' ? parsed.totalExp : 0,
        level: typeof parsed.level === 'number' ? parsed.level : 0
    };
}

export function hadAnyStreakActivity(data: UserData): boolean {
    return Object.values(data.streaks).some((v) => v.lastActivityDate);
}

export interface RecordResult {
    data: UserData;
    /** 오늘 이미 기록했으면 false — 하루에 한 번만 는다 */
    changed: boolean;
    newState?: StreakState;
    /** 이번에 새로 열린 마일스톤 도전과제 */
    unlocked: StreakAchievementId[];
    /** 이번 기록으로 받은 경험치 (안 늘었으면 0) */
    exp: number;
    leveledUp: boolean;
    newLevel: number;
}

/**
 * 오늘 활동 기록 → 연속일·마일스톤·경험치까지 한 번에 셈한다 (저장은 안 한다).
 *
 * 하나로 묶은 이유: 섬에서는 연속일·도전과제·경험치가 세 함수로 나뉘어 있었고, 부르는 쪽이
 * 그 셋을 순서대로 부르면서 **중간 상태를 두 번 읽어** 도전과제가 덮이는 자리가 있었다.
 * 들어간 값 하나 → 나온 값 하나면 그 사고가 안 난다.
 */
export function recordActivity(data: UserData, trackId: string, activityDate?: string): RecordResult {
    const today = activityDate ?? localDateString();
    const prev = data.streaks[trackId] ?? { current: 0, longest: 0, lastActivityDate: '' };

    if (prev.lastActivityDate === today) {
        return { data, changed: false, unlocked: [], exp: 0, leveledUp: false, newLevel: data.level };
    }

    const continued = !!prev.lastActivityDate && isYesterday(prev.lastActivityDate, today);
    const current = continued ? prev.current + 1 : 1;
    const newState: StreakState = {
        current,
        longest: Math.max(prev.longest, current),
        lastActivityDate: today
    };

    const unlocked: StreakAchievementId[] = [];
    const achievements = [...data.achievements];
    const push = (id: StreakAchievementId): void => {
        if (!achievements.includes(id)) {
            achievements.push(id);
            unlocked.push(id);
        }
    };
    if (!hadAnyStreakActivity(data) && current === 1) push('streak_first');
    if (current === 7) push('streak_7');
    if (current === 30) push('streak_30');
    if (current === 100) push('streak_100');

    /* 보너스는 10일에서 멈춘다 — 안 그러면 오래 이어 온 사람만 하루에 수백씩 받아 레벨이 튄다. */
    const exp = EXP_REWARDS.STREAK_COMPLETE + EXP_REWARDS.STREAK_BONUS_PER_DAY * Math.min(current, 10);
    const totalExp = (data.totalExp || 0) + exp;
    const newLevel = calcLevel(totalExp);

    return {
        data: {
            ...data,
            achievements,
            streaks: { ...data.streaks, [trackId]: newState },
            totalExp,
            level: newLevel
        },
        changed: true,
        newState,
        unlocked,
        exp,
        leveledUp: newLevel > data.level,
        newLevel
    };
}

/** 레벨 = floor(sqrt(경험치 / 50)) — 뒤로 갈수록 천천히 오른다. */
export function calcLevel(totalExp: number): number {
    return Math.floor(Math.sqrt(Math.max(0, totalExp) / 50));
}

export function getLevelRange(level: number): { min: number; max: number } {
    return { min: level * level * 50, max: (level + 1) * (level + 1) * 50 };
}

/** 이번 레벨 안에서 얼마나 왔나 (0~1) */
export function getLevelProgress(totalExp: number): number {
    const { min, max } = getLevelRange(calcLevel(totalExp));
    return max === min ? 1 : (totalExp - min) / (max - min);
}

/* ===== 저장 한 겹 ===== */

export function loadUserData(): UserData {
    try {
        const raw = localStorage.getItem(USER_DATA_KEY);
        if (raw) return mergeUserData(JSON.parse(raw) as Partial<UserData>);
    } catch {
        /* 깨진 값이면 빈 것으로 시작한다 — 여기서 던지면 화면 전체가 안 뜬다 */
    }
    return emptyUserData();
}

export function saveUserData(data: UserData): void {
    try {
        localStorage.setItem(USER_DATA_KEY, JSON.stringify(data));
    } catch {
        /* 저장 못 하는 브라우저(사생활 모드 등)에서도 화면은 돌아야 한다 */
    }
}

export function addExp(amount: number): { newLevel: number; leveledUp: boolean } {
    const data = loadUserData();
    const oldLevel = data.level;
    data.totalExp = (data.totalExp || 0) + amount;
    data.level = calcLevel(data.totalExp);
    saveUserData(data);
    return { newLevel: data.level, leveledUp: data.level > oldLevel };
}

/**
 * 화면에서 부르는 자리 — 읽고·셈하고·저장하고·알린다.
 * 되돌려주는 것 = 이번에 실제로 변한 것 (안 변했으면 `changed: false`).
 */
export function recordStreakActivity(trackId: string, activityDate?: string): RecordResult {
    const before = loadUserData();
    const result = recordActivity(before, trackId, activityDate);
    if (!result.changed) return result;
    saveUserData(result.data);
    return result;
}
