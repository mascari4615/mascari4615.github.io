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
    /**
     * 이 줄을 **지킨** 사람들의 오늘 번호 (TASK-KL-158).
     *
     * 채팅은 하루 뒤 사라진다. 좋은 말이 나와도 그걸 남길 길이 「손으로 글로 옮기기」뿐이면
     * 대부분 그냥 사라진다. 그래서 별 하나로 지킬 수 있게 했다 — **지킨 줄은 안 지워진다.**
     * 「사라지기 전에 알려 주기」보다 이쪽이 근본이다: 알림은 그 순간 보고 있어야 하지만,
     * 지키기는 한 번 누르면 끝난다.
     */
    keptBy?: string[];
    /**
     * 이 줄을 신고한 사람들의 오늘 번호 (TASK-KL-159).
     * 화면이 「이미 신고했다」를 보여 주려고 둔다 — 안 그러면 눌렀는지 몰라 또 누른다.
     * 밖으로는 **내가 눌렀나(참/거짓)** 만 나간다. 목록을 뿌리면 누가 신고했는지가 샌다.
     */
    reportedBy?: string[];
    /**
     * 이 말을 한 사람의 계정 (로그인했을 때만). **밖으로 안 나간다** — 나가면 익명이 아니다.
     * 오직 「이 줄에 답이 달렸다」를 그 사람에게 알리는 데만 쓴다 (TASK-KL-160).
     */
    accountId?: string | null;
    /**
     * 이 줄이 어느 줄에 답하는가 (TASK-KL-159). 최상위면 없음.
     *
     * 왜 필요한가: 여럿이 동시에 말하면 「누구한테 하는 말이지?」가 안 보인다. 방이 커질수록
     * 대화가 아니라 낱말 더미가 된다. 한 단만 둔다 — 더 깊이 접으면 좁은 창에서 못 읽는다.
     */
    replyTo?: { id: string; name: string; text: string } | null;
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
/**
 * 지킨 줄은 몇 개까지 남기나.
 * 무한이면 방이 지킨 줄로만 차서, 지키기가 오히려 방을 죽인다. 넘으면 **오래된 지킨 줄부터** 놓는다.
 */
export const MAX_KEPT = 30;
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
    /**
     * 「지금 여기」를 **사람 단위**로 센다 (사용자 신고 2026-08-08 — 숫자가 계속 왔다갔다).
     *
     * 예전엔 열린 연결 수를 그대로 내보냈다. 그런데 연결은 사람보다 훨씬 자주 생겼다 사라진다:
     *   · 도구 화면은 진짜 페이지 이동이라 옮길 때마다 끊었다 다시 붙는다
     *   · 탭을 두 개 열면 한 사람이 두 명이 된다
     *   · EventSource 는 잠깐 끊기면 스스로 다시 붙는다(그 사이 한 명 줄었다 는다)
     * 그래서 혼자 있어도 숫자가 1↔2 를 오갔다.
     *
     * 이제 이름표(who)별로 묶고, 마지막 연결이 끊겨도 **유예 시간**을 준다. 그 안에 다시
     * 붙으면 아무 일도 없었던 것이다 — 화면 이동·재접속으로는 숫자가 안 움직인다.
     */
    private readonly present = new Map<string, { conns: number; leaveAt: ReturnType<typeof setTimeout> | null }>();
    /** 이름표 없는 연결에 붙일 일련번호 */
    private connSeq = 0;

    /**
     * 마지막 연결이 끊긴 뒤 「아직 있다」로 쳐 주는 시간.
     * 도구 화면 사이 이동은 보통 1초 안쪽이고, 잠깐 끊긴 SSE 도 몇 초면 돌아온다.
     * 너무 길면 나간 사람이 남아 있는 것처럼 보이므로 12초로 잡았다. (시험에서 줄인다)
     */
    constructor(private readonly statePath = path.join(PKG_ROOT, 'data', STATE_FILE),
                private readonly leaveGraceMs = 12000) {
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

        /* 지킨 줄이 너무 많으면 오래된 것부터 놓는다 — 안 그러면 방이 지킨 줄로만 찬다. */
        const kept = this.state.messages.filter((m) => (m.keptBy?.length ?? 0) > 0);
        if (kept.length > MAX_KEPT) {
            for (const old of kept.slice(0, kept.length - MAX_KEPT)) old.keptBy = [];
        }

        // **지킨 줄은 시간이 지나도 안 지운다.** 그게 지키기의 뜻이다.
        this.state.messages = this.state.messages.filter(
            (m) => Date.parse(m.at) >= cutoff || (m.keptBy?.length ?? 0) > 0,
        );
        if (this.state.messages.length > MAX_MESSAGES) {
            // 넘칠 때도 지킨 줄은 남긴다 — 자리는 안 지킨 줄에서만 뺀다.
            const keepSet = new Set(this.state.messages.filter((m) => (m.keptBy?.length ?? 0) > 0));
            const plain = this.state.messages.filter((m) => !keepSet.has(m));
            const drop = new Set(plain.slice(0, this.state.messages.length - MAX_MESSAGES));
            this.state.messages = this.state.messages.filter((m) => !drop.has(m));
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
        options: { byOwner?: boolean; accountId?: string | null; replyTo?: string | null } = {},
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

        /* 답하는 상대의 말을 **그때 모습 그대로** 베껴 둔다. 원본은 지워질 수도, 하루 뒤
           사라질 수도 있는데, 그러면 답글만 남아 「무엇에 대한 답인지」가 없어진다. */
        const parent = options.replyTo ? this.state.messages.find((m) => m.id === options.replyTo) : null;

        const message: ChatMessage = {
            id: crypto.randomUUID(),
            text,
            replyTo: parent ? { id: parent.id, name: parent.name, text: parent.text.slice(0, 60) } : null,
            name: identity.name,
            color: identity.color,
            who: identity.who,
            byOwner: Boolean(options.byOwner),
            accountId: options.accountId ?? null,
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

    /**
     * 이 줄에 답을 받은 사람의 계정 — 알릴 곳이 있으면 준다.
     * 익명(비로그인)이면 null 이다. 그건 알릴 곳이 없다는 뜻이지 고장이 아니다.
     */
    accountOfMessage(id: string): string | null {
        return this.state.messages.find((m) => m.id === id)?.accountId ?? null;
    }

    /**
     * 이 줄을 신고했다고 적어 둔다. 같은 사람이 두 번 눌러도 한 번이다.
     * @returns 새로 적혔으면 true, 이미 있었으면 false. 없는 줄이면 null.
     */
    markReported(id: string, who: string, now: Date = new Date()): boolean | null {
        this.prune(now);
        const message = this.state.messages.find((m) => m.id === id);
        if (!message) return null;
        const list = new Set(message.reportedBy ?? []);
        if (list.has(who)) return false;
        list.add(who);
        message.reportedBy = [...list];
        this.markDirty();
        return true;
    }

    /**
     * 밖으로 내보낼 모양 — **남의 이름표 목록은 빼고** 「내가 눌렀나」만 남긴다.
     * 저장하는 모양과 보여 주는 모양을 가르지 않으면, 익명은 언젠가 목록째 샌다.
     */
    publicMessages(viewerWho: string, now: Date = new Date()): PublicChatMessage[] {
        return this.recent(MAX_MESSAGES, now).map((m) => ({
            id: m.id,
            text: m.text,
            name: m.name,
            color: m.color,
            who: m.who,
            byOwner: m.byOwner,
            at: m.at,
            replyTo: m.replyTo ?? null,
            kept: m.keptBy?.length ?? 0,
            keptByMe: (m.keptBy ?? []).includes(viewerWho),
            reportedByMe: (m.reportedBy ?? []).includes(viewerWho),
        }));
    }

    /**
     * 이 줄을 지킨다 / 지키기를 푼다. 같은 사람이 다시 누르면 풀린다.
     *
     * **누구로 적느냐가 중요하다** (TASK-KL-160). 오늘 이름표(`who`)로만 적으면 자정에
     * 이름표가 갈리면서 「내가 지킨 것」이 통째로 남의 것처럼 보인다 — 지킨 줄은 하루를
     * 넘겨 남는데 지킨 사람은 하루를 못 넘기는 셈이라 앞뒤가 안 맞았다.
     * 그래서 로그인했으면 **계정 열쇠**(`acc:<id>`)로 적는다. 익명은 오늘 이름표로 적고,
     * 그건 하루짜리다 — 익명이 그 이상 남는 표식을 갖는 건 익명이 아니다.
     *
     * @returns 지금 지킨 사람 수. 없는 줄이면 null.
     */
    toggleKeep(id: string, who: string, now: Date = new Date()): number | null {
        this.prune(now);
        const message = this.state.messages.find((m) => m.id === id);
        if (!message) return null;
        const list = new Set(message.keptBy ?? []);
        if (list.has(who)) list.delete(who);
        else list.add(who);
        message.keptBy = [...list];
        this.markDirty();
        this.broadcast({ type: 'keep', id, kept: message.keptBy.length });
        return message.keptBy.length;
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

    subscribe(listener: (event: ChatEvent) => void, who?: string): () => void {
        /* 새로 붙은 사람에게는 「몇 명」을 **다시 안 보낸다** — 첫 마디(hello)에 이미 들어 있다.
         * 자기 자신에게도 쏘면 붙자마자 같은 수를 두 번 받고, 그 사이에 잠깐 다른 수가 보인다.
         * 그래서 지금 있는 사람들에게만 알린 뒤 목록에 넣는다. */
        const others = [...this.listeners];
        this.listeners.add(listener);

        /* 이름표가 없으면(옛 호출부·시험) 이 연결 자체를 한 사람으로 친다. */
        const key = who ?? `conn:${this.connSeq += 1}`;
        const before = this.present.size;
        const slot = this.present.get(key);
        if (slot) {
            slot.conns += 1;
            if (slot.leaveAt) {                      // 나가려다 돌아왔다 — 없던 일로
                clearTimeout(slot.leaveAt);
                slot.leaveAt = null;
            }
        } else {
            this.present.set(key, { conns: 1, leaveAt: null });
        }
        // 사람 수가 안 변했으면(같은 사람의 두 번째 탭) 아무에게도 안 알린다 — 그게 깜빡임의 정체다.
        if (this.present.size !== before) {
            const here = this.present.size;
            for (const other of others) other({ type: 'here', here });
        }

        let released = false;
        return () => {
            if (released) return;                    // 같은 연결을 두 번 끊는 경우(close+error)
            released = true;
            this.listeners.delete(listener);
            const mine = this.present.get(key);
            if (!mine) return;
            mine.conns -= 1;
            if (mine.conns > 0) return;              // 다른 탭이 아직 열려 있다
            /* 유예는 **이름표가 있을 때만** 뜻이 있다 — 다시 붙은 게 같은 사람인지 알아야
             * 「없던 일」로 칠 수 있다. 이름표 없는 연결은 그냥 그 자리에서 뺀다. */
            if (who === undefined) {
                this.present.delete(key);
                this.broadcast({ type: 'here', here: this.present.size });
                return;
            }
            mine.leaveAt = setTimeout(() => {
                this.present.delete(key);
                this.broadcast({ type: 'here', here: this.present.size });
            }, this.leaveGraceMs);
            // 노드가 이 타이머 때문에 안 꺼지면 안 된다 — 사람 수 세기가 프로세스를 붙잡을 일은 없다
            (mine.leaveAt as { unref?: () => void }).unref?.();
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
     * 지키기·신고에서 이 사람을 가리키는 열쇠.
     * 로그인했으면 계정(내일도 나) · 아니면 오늘 이름표(하루짜리).
     */
    static keeperKey(who: string, accountId: string | null | undefined): string {
        return accountId ? `acc:${accountId}` : who;
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

    /**
     * 지금 채팅창을 열어 둔 **사람** 수. 「사이트에 몇 명」(presence)과 다른 값이다.
     * 연결 수가 아니다 — 한 사람이 탭을 셋 열어도 1 이고, 화면을 옮기는 몇 초 동안도 1 이다.
     */
    hereCount(): number {
        return this.present.size;
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

/** 화면이 받는 모양. 저장 모양(`ChatMessage`)과 **다르다** — 목록은 안 나간다. */
export interface PublicChatMessage {
    id: string;
    text: string;
    name: string;
    color: string;
    who: string;
    byOwner: boolean;
    at: string;
    replyTo: { id: string; name: string; text: string } | null;
    kept: number;
    keptByMe: boolean;
    reportedByMe: boolean;
}

export type ChatEvent =
    | { type: 'msg'; message: ChatMessage }
    | { type: 'del'; id: string }
    | { type: 'keep'; id: string; kept: number }
    | { type: 'here'; here: number };

let singleton: KarmolabChatStore | null = null;

export function getKarmolabChatStore(): KarmolabChatStore {
    if (!singleton) singleton = new KarmolabChatStore();
    return singleton;
}
