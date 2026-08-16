/**
 * 일기 — 하루에 한 장 (TASK-KL-322)
 *
 * 일정과 달리 일기는 **날짜가 곧 열쇠**다. 하루에 여러 장이 아니라 한 장이고, 그래서 id 가
 * 따로 없다 — `2026-08-17` 이 그 일기의 이름이다. 같은 날 또 쓰면 그 장을 고치는 것이지
 * 새 장이 생기지 않는다.
 *
 * 저장은 [[TASK-KL-321]] 에서 만든 「이 브라우저」 자리 옆이다. 구글에 보낼 것이 아니므로
 * 연동과 아무 상관 없이 돈다. 나중에 밖으로 내보낼 때(메모 저장소든 드라이브든) 여기가
 * 그대로 원본이 된다 — 그때 붙일 자리만 `exportAll` 로 열어 둔다.
 *
 * 빈 글은 **지운 것으로 본다.** 「오늘 뭐 썼더라」 하고 열었다가 그냥 닫았을 때 빈 장이
 * 쌓이면, 달력에 일기 표식이 거짓으로 켜진다.
 */

const DIARY_KEY = 'karmolab_planner_diary';

export interface DiaryEntry {
    /** 로컬 달력 YYYY-MM-DD — 이것이 곧 이 일기의 이름이다 */
    date: string;
    text: string;
    /** 마지막으로 고친 때 (밀리초) */
    updatedAt: number;
}

function readAll(): DiaryEntry[] {
    try {
        const raw = localStorage.getItem(DIARY_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (e): e is DiaryEntry =>
                !!e && typeof e.date === 'string' && typeof e.text === 'string' && e.text.trim() !== ''
        );
    } catch {
        /* 깨진 값이면 없는 것으로 본다 — 여기서 던지면 화면 전체가 안 뜬다 */
        return [];
    }
}

function writeAll(items: DiaryEntry[]): void {
    try {
        localStorage.setItem(DIARY_KEY, JSON.stringify(items));
    } catch {
        /* 저장 못 하는 브라우저에서도 쓰는 동안은 화면이 돌아야 한다 */
    }
}

/** 그 날 일기 (없으면 null) */
export function readDiary(date: string): DiaryEntry | null {
    return readAll().find((e) => e.date === date) ?? null;
}

/**
 * 그 날 일기를 적는다. 빈 글이면 지운다.
 * 되돌려주는 값 = 적은 뒤 그 날에 일기가 있는가 (연속일·표식이 이걸로 갈린다).
 */
export function writeDiary(date: string, text: string, now: number = Date.now()): boolean {
    const items = readAll().filter((e) => e.date !== date);
    const trimmed = text.trim();
    if (trimmed) items.push({ date, text: trimmed, updatedAt: now });
    /* 최근 날짜가 위 — 훑을 때 오늘부터 보인다 */
    items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    writeAll(items);
    return !!trimmed;
}

export function deleteDiary(date: string): void {
    writeAll(readAll().filter((e) => e.date !== date));
}

/** 최근 날짜부터 */
export function listDiary(): DiaryEntry[] {
    return readAll().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** 일기가 있는 날들 — 달력에 표식을 켤 때 쓴다 */
export function diaryDates(): Set<string> {
    return new Set(readAll().map((e) => e.date));
}

/**
 * 글 안 찾기. 대소문자·앞뒤 공백은 무시한다.
 * 찾는 말이 비면 전부 — 「검색칸을 지우면 원래대로」가 사람이 기대하는 것이다.
 */
export function searchDiary(query: string): DiaryEntry[] {
    const q = query.trim().toLowerCase();
    const all = listDiary();
    if (!q) return all;
    return all.filter((e) => e.text.toLowerCase().includes(q) || e.date.includes(q));
}

/** 몇 자 썼나 (공백만인 줄은 안 센다) */
export function charCount(text: string): number {
    return text.trim().length;
}

/** 한 줄 미리보기 — 목록에 쓸 첫 줄 */
export function preview(text: string, max = 80): string {
    const line = text.trim().split('\n').find((l) => l.trim()) ?? '';
    return line.length > max ? line.slice(0, max) + '…' : line;
}

/**
 * 통째로 내보내기 — 밖(메모 저장소·드라이브)으로 옮길 때의 붙일 자리.
 * 날짜 오름차순 = 파일로 떨어뜨렸을 때 읽기 좋은 차례.
 */
export function exportAll(): DiaryEntry[] {
    return readAll().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * 밖에서 가져오기. 같은 날이 겹치면 **나중에 고친 쪽**이 이긴다 —
 * 두 기계에서 쓴 것을 합칠 때 사람이 고른 적 없는 쪽이 이기면 안 된다.
 */
export function importAll(incoming: DiaryEntry[]): { added: number; updated: number } {
    const byDate = new Map(readAll().map((e) => [e.date, e]));
    let added = 0;
    let updated = 0;
    for (const raw of incoming) {
        if (!raw || typeof raw.date !== 'string' || typeof raw.text !== 'string') continue;
        const text = raw.text.trim();
        if (!text) continue;
        const at = typeof raw.updatedAt === 'number' ? raw.updatedAt : 0;
        const mine = byDate.get(raw.date);
        if (!mine) {
            byDate.set(raw.date, { date: raw.date, text, updatedAt: at });
            added++;
        } else if (at > mine.updatedAt) {
            byDate.set(raw.date, { date: raw.date, text, updatedAt: at });
            updated++;
        }
    }
    writeAll([...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)));
    return { added, updated };
}
