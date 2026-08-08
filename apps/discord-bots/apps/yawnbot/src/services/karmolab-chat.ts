/**
 * KarmoLab 실시간 익명 채팅 (TASK-KL-149) — **사이트에 하나뿐인 방**.
 *
 * 왜 있나: 광장(`/kl/presence`)은 「지금 N명」을 이미 세고 있었다. 그런데 그 N명은 서로에게
 * 말을 걸 방법이 없었다 — 숫자는 있는데 목소리가 없는 상태. 이 파일이 그 빈자리를 채운다.
 *
 * 왜 방이 하나인가: 개인 사이트는 동시 접속이 적다. 도구마다·글마다 방을 쪼개면 **전부 빈 방**이
 * 된다. 빈 방은 「조용하다」가 아니라 「죽었다」로 읽힌다. 한 방만이 살아 있을 수 있다.
 *
 * 왜 익명인데 이름이 있나: 줄마다 새 익명이면 대화가 안 엮인다(「누구한테 하는 말이지?」).
 * 그래서 **하루짜리 이름표**를 준다 — 방문자 열쇠에서 결정적으로 나온 「색 + 동물」이고,
 * 자정(KST)에 통째로 갈린다. 하루 안에서는 대화가 이어지고, 어제와는 안 엮인다.
 * 로그인해도 계정은 안 드러난다 — 익명은 익명이다.
 *
 * 왜 디스크에 남기나: 배포가 하루에도 여러 번 nssm restart 를 건다. 메모리에만 두면 채팅방이
 * 하루에 몇 번씩 조용히 비워지고, 그때 들어온 사람은 죽은 사이트를 본다. 24시간만 남긴다 —
 * 채팅은 쌓아 두는 기록이 아니라 흘러가는 자리다.
 *
 * 저장 = `data/karmolab-chat-state.json` (`.gitignore` 의 `data/*-state.json`).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PKG_ROOT } from '../paths';

/** 한 줄. 클라이언트에 그대로 나가는 모양이다 — 여기 없는 값은 밖에서 못 본다. */
export interface ChatMessage {
    id: string;
    text: string;
    /** 오늘의 이름표 — 「연보라 수달」. */
    name: string;
    /** 이름표 색 (css 색값). 같은 이름이 같은 색으로 계속 보이게. */
    color: string;
    /**
     * 오늘 하루 이 사람을 가리키는 **공개** 번호. 짧은 해시다.
     * 화면이 「내 줄인가」와 「연달아 말한 같은 사람인가」를 판단하는 데만 쓴다.
     * 내일이면 다른 값이 된다 — 어제의 누구인지는 이걸로도 못 캔다.
     */
    who: string;
    /** 주인이 한 말인가. 익명 사이에서 주인만 드러난다 — 안 그러면 공지를 할 수가 없다. */
    byOwner: boolean;
    at: string;
}

interface ChatState {
    version: 1;
    /**
     * 이름표를 섞는 소금. **재시작해도 유지해야 한다** — 새로 만들면 한낮에 모두의 이름이 바뀐다.
     * 날짜와 함께 섞이므로, 이 값이 그대로여도 날짜가 넘어가면 이름은 갈린다.
     */
    salt: string;
    messages: ChatMessage[];
    /** 재갈 — `who` → 언제까지(ms). 주인만 물린다. */
    mutes: Record<string, number>;
    /**
     * 오늘 이 방에서 **말한 적 있는** 로그인 계정 → 마지막으로 말한 시각 (TASK-KL-157).
     *
     * 왜 있나: 방이 비어 있을 때 남긴 말은 아무에게도 안 닿는다. 그러면 아무도 안 남기고,
     * 방은 영영 빈다 — 실시간 방의 죽는 방식이 정확히 이것이다. 「지금 보고 있는 사람」이
     * 아니라 **오늘 여기 있던 사람**에게 알리면, 혼자 남긴 말도 누군가에게 닿는다.
     *
     * 로그인한 사람만 담긴다 — 익명은 알릴 곳이 없다(그게 익명의 값이다).
     */
    speakers?: Record<string, number>;
}

const STATE_FILE = 'karmolab-chat-state.json';

/** 들고 있는 줄 수 상한. 넘으면 오래된 것부터 버린다. */
export const MAX_MESSAGES = 200;
/** 이보다 오래된 줄은 버린다. 채팅은 기록이 아니다. */
export const MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;
export const TEXT_MAX = 300;
/** 연달아 칠 때 최소 간격. 사람 손보다 빠른 것은 사람이 아니다. */
export const MIN_INTERVAL_MS = 1200;
/** 짧은 시간 안에 몇 줄까지. 도배 방지. */
export const BURST_LIMIT = 20;
export const BURST_WINDOW_MS = 60 * 1000;

/**
 * 이름표 재료.
 *
 * 색과 동물을 곱하면 480 가지다 — 이 사이트 동시 접속 규모에서 겹칠 일이 사실상 없고,
 * 겹쳐도 대화가 안 망가진다(색이 같이 다르다). 굳이 번호를 붙여 이름을 못생기게 만들지 않는다.
 */
const COLORS: { label: string; css: string }[] = [
    { label: '연보라', css: '#b39ddb' },
    { label: '하늘', css: '#7fc7f5' },
    { label: '민트', css: '#5fd3b2' },
    { label: '살구', css: '#f2a97e' },
    { label: '자몽', css: '#ef8b8b' },
    { label: '레몬', css: '#e6c65c' },
    { label: '풀빛', css: '#8fc76a' },
    { label: '바다', css: '#5aa9e6' },
    { label: '분홍', css: '#f094c0' },
    { label: '보라', css: '#a086e0' },
    { label: '잿빛', css: '#a9b4c2' },
    { label: '구리', css: '#d09a5e' },
];

const ANIMALS = [
    '수달', '너구리', '여우', '올빼미', '고슴도치', '두더지', '다람쥐', '해달',
    '펭귄', '물범', '알파카', '라마', '카피바라', '왈라비', '오소리', '족제비',
    '삵', '표범', '늑대', '순록', '큰부리새', '홍학', '두루미', '기러기',
    '개구리', '도롱뇽', '거북', '도마뱀', '문어', '해파리', '고래', '돌고래',
    '나비', '반딧불이', '무당벌레', '사슴벌레', '달팽이', '해마', '가오리', '복어',
];

export interface ChatIdentity {
    who: string;
    name: string;
    color: string;
    /** 서버만 아는 열쇠. 밖으로 안 내보낸다 — 이게 새면 익명이 아니다. */
    key: string;
}

export interface PostResult {
    ok: boolean;
    message?: ChatMessage;
    error?: 'empty' | 'too_long' | 'too_fast' | 'too_many' | 'muted';
    /** 막혔을 때 몇 밀리초 뒤에 다시 되나. 화면이 사람 말로 풀어 쓴다. */
    retryAfterMs?: number;
}

/** 한국 날짜. 이름표가 갈리는 경계는 서버가 어디 있든 **한국 자정**이다. */
export function kstDate(now: Date = new Date()): string {
    return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export class KarmolabChatStore {
    private state: ChatState;
    private dirty = false;
    /** 지금 창을 열어 둔 사람들. 저장하지 않는다 — 끊기면 없는 것이다. */
    private readonly listeners = new Set<(event: ChatEvent) => void>();
    /** 도배 판정용. 메모리에만 둔다 — 재시작하면 한 번 봐주는 셈이고, 그게 맞다. */
    private readonly recentPosts = new Map<string, number[]>();

    constructor(private readonly statePath = path.join(PKG_ROOT, 'data', STATE_FILE)) {
        this.state = this.load();
    }

    private load(): ChatState {
        try {
            if (fs.existsSync(this.statePath)) {
                const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as Partial<ChatState>;
                return {
                    version: 1,
                    salt: parsed.salt || crypto.randomBytes(16).toString('hex'),
                    messages: parsed.messages ?? [],
                    mutes: parsed.mutes ?? {},
                    speakers: parsed.speakers ?? {},
                };
            }
        } catch (error) {
            console.error('[karmolab-chat] 상태 파일을 못 읽었다 — 빈 방으로 시작한다:', error);
        }
        return { version: 1, salt: crypto.randomBytes(16).toString('hex'), messages: [], mutes: {}, speakers: {} };
    }

    private markDirty(): void {
        this.dirty = true;
    }

    flush(): void {
        if (!this.dirty) return;
        try {
            fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
            const tmp = `${this.statePath}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2) + '\n', 'utf-8');
            fs.renameSync(tmp, this.statePath);
            this.dirty = false;
        } catch (error) {
            console.error('[karmolab-chat] 상태 저장 실패:', error);
        }
    }

    /**
     * 오늘의 이름표를 만든다.
     *
     * 같은 사람이면 하루 종일 같은 값이 나오고, 날짜가 바뀌면 다른 값이 나온다.
     * 어디에도 저장하지 않는다 — 필요할 때마다 다시 계산하면 되고, 저장 안 하는 편이 더 익명이다.
     */
    identityFor(visitorKey: string, now: Date = new Date()): ChatIdentity {
        const digest = crypto
            .createHash('sha256')
            .update(`${this.state.salt}|${kstDate(now)}|${visitorKey}`)
            .digest();
        const color = COLORS[digest[0] % COLORS.length];
        const animal = ANIMALS[digest[1] % ANIMALS.length];
        return {
            who: digest.toString('hex').slice(0, 10),
            name: `${color.label} ${animal}`,
            color: color.css,
            key: digest.toString('hex'),
        };
    }

    /** 오래되거나 넘치는 줄을 버린다. 읽기·쓰기 어느 쪽이든 들어올 때 한 번 훑는다. */
    private prune(now: Date = new Date()): void {
        const cutoff = now.getTime() - MESSAGE_TTL_MS;
        const before = this.state.messages.length;
        this.state.messages = this.state.messages.filter((m) => Date.parse(m.at) >= cutoff);
        if (this.state.messages.length > MAX_MESSAGES) {
            this.state.messages = this.state.messages.slice(-MAX_MESSAGES);
        }
        for (const [who, until] of Object.entries(this.state.mutes)) {
            if (until <= now.getTime()) delete this.state.mutes[who];
        }
        // 말한 기록도 줄과 같은 수명을 갖는다 — 어제 말한 사람에게 오늘 알리는 건 스팸이다.
        const speakerCutoff = now.getTime() - MESSAGE_TTL_MS;
        for (const [accountId, at] of Object.entries(this.state.speakers ?? {})) {
            if (at < speakerCutoff) delete this.state.speakers![accountId];
        }
        if (this.state.messages.length !== before) this.markDirty();
    }

    recent(limit = MAX_MESSAGES, now: Date = new Date()): ChatMessage[] {
        this.prune(now);
        return this.state.messages.slice(-limit);
    }

    /**
     * 한 줄 남긴다.
     *
     * 막을 때는 **왜 막혔는지**를 같이 돌려준다. 「안 돼요」만 주면 사용자는 자기가 도배로
     * 잡힌 건지 서버가 죽은 건지 구분을 못 한다 (커뮤니티에서 한 번 겪은 것과 같은 함정).
     */
    post(
        visitorKey: string,
        rawText: string,
        options: { byOwner?: boolean; accountId?: string | null } = {},
        now: Date = new Date(),
    ): PostResult {
        this.prune(now);

        // 줄바꿈은 두 줄까지만 남기고 접는다 — 세로로 화면을 밀어 버리는 도배를 막는다.
        const text = String(rawText ?? '')
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        if (!text) return { ok: false, error: 'empty' };
        if (text.length > TEXT_MAX) return { ok: false, error: 'too_long' };

        const identity = this.identityFor(visitorKey, now);
        const mutedUntil = this.state.mutes[identity.who];
        if (mutedUntil && mutedUntil > now.getTime()) {
            return { ok: false, error: 'muted', retryAfterMs: mutedUntil - now.getTime() };
        }

        const stamps = (this.recentPosts.get(identity.key) ?? []).filter(
            (t) => t > now.getTime() - BURST_WINDOW_MS,
        );
        const last = stamps[stamps.length - 1];
        if (last !== undefined && now.getTime() - last < MIN_INTERVAL_MS) {
            return { ok: false, error: 'too_fast', retryAfterMs: MIN_INTERVAL_MS - (now.getTime() - last) };
        }
        if (stamps.length >= BURST_LIMIT) {
            return {
                ok: false,
                error: 'too_many',
                retryAfterMs: stamps[0] + BURST_WINDOW_MS - now.getTime(),
            };
        }
        stamps.push(now.getTime());
        this.recentPosts.set(identity.key, stamps);

        const message: ChatMessage = {
            id: crypto.randomUUID(),
            text,
            name: identity.name,
            color: identity.color,
            who: identity.who,
            byOwner: Boolean(options.byOwner),
            at: now.toISOString(),
        };
        this.state.messages.push(message);
        if (this.state.messages.length > MAX_MESSAGES) this.state.messages.shift();
        // 오늘 여기서 말한 사람으로 적어 둔다 — 나중에 온 말을 이 사람들에게 알린다.
        if (options.accountId) {
            this.state.speakers = { ...(this.state.speakers ?? {}), [options.accountId]: now.getTime() };
        }
        this.markDirty();
        this.broadcast({ type: 'msg', message });
        return { ok: true, message };
    }

    /** 주인이 한 줄 지운다. 지운 자리는 남기지 않는다 — 「삭제됨」 줄이 도배가 되면 의미가 없다. */
    remove(id: string): boolean {
        const before = this.state.messages.length;
        this.state.messages = this.state.messages.filter((m) => m.id !== id);
        if (this.state.messages.length === before) return false;
        this.markDirty();
        this.broadcast({ type: 'del', id });
        return true;
    }

    /** 주인이 재갈을 물린다. 오늘 이름표 기준이므로 **자정이면 어차피 풀린다**. */
    mute(who: string, minutes: number, now: Date = new Date()): boolean {
        if (!who) return false;
        this.state.mutes[who] = now.getTime() + Math.max(1, minutes) * 60 * 1000;
        this.markDirty();
        return true;
    }

    isMuted(who: string, now: Date = new Date()): boolean {
        const until = this.state.mutes[who];
        return Boolean(until && until > now.getTime());
    }

    // ── 흐르는 쪽 (SSE) ────────────────────────────────────────────────────────

    subscribe(listener: (event: ChatEvent) => void): () => void {
        /* 새로 붙은 사람에게는 「몇 명」을 **다시 안 보낸다** — 첫 마디(hello)에 이미 들어 있다.
         * 자기 자신에게도 쏘면 붙자마자 같은 수를 두 번 받고, 그 사이에 잠깐 다른 수가 보인다.
         * 그래서 지금 있는 사람들에게만 알린 뒤 목록에 넣는다. */
        const others = [...this.listeners];
        this.listeners.add(listener);
        const here = this.listeners.size;
        for (const other of others) other({ type: 'here', here });

        return () => {
            this.listeners.delete(listener);
            this.broadcast({ type: 'here', here: this.listeners.size });
        };
    }

    /**
     * 오늘 이 방에서 말한 사람들 (자기 자신 제외).
     * 「지금 보고 있는 사람」이 아니라 「오늘 여기 있던 사람」 — 빈 방에 남긴 말도 닿게 하는 열쇠다.
     */
    todaysSpeakers(exceptAccountId: string | null, now: Date = new Date()): string[] {
        this.prune(now);
        return Object.keys(this.state.speakers ?? {}).filter((id) => id !== exceptAccountId);
    }

    /**
     * 오늘 이 방에서 목소리를 낸 사람이 몇 명인가 (익명 포함).
     *
     * 「지금 1명」만 보이면 죽은 방으로 읽힌다. 오늘 몇 사람이 여기서 말했는지가 같이 보이면
     * 같은 화면이 「지금은 조용한 방」으로 읽힌다 — 남길 마음이 생기는 건 그때다.
     * 사람 수는 오늘 줄에 찍힌 이름표 수로 센다(줄 수가 아니다 — 한 사람이 서른 줄을 칠 수 있다).
     */
    todaysVoiceCount(now: Date = new Date()): number {
        this.prune(now);
        return new Set(this.state.messages.map((m) => m.who)).size;
    }

    /** 지금 채팅창을 열어 둔 사람 수. 「사이트에 몇 명」(presence)과 다른 값이다. */
    hereCount(): number {
        return this.listeners.size;
    }

    private broadcast(event: ChatEvent): void {
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (error) {
                // 한 사람의 연결이 깨졌다고 남의 줄까지 못 가면 안 된다.
                console.error('[karmolab-chat] 보내기 실패(한 명):', error);
            }
        }
    }
}

export type ChatEvent =
    | { type: 'msg'; message: ChatMessage }
    | { type: 'del'; id: string }
    | { type: 'here'; here: number };

let singleton: KarmolabChatStore | null = null;

export function getKarmolabChatStore(): KarmolabChatStore {
    if (!singleton) singleton = new KarmolabChatStore();
    return singleton;
}
