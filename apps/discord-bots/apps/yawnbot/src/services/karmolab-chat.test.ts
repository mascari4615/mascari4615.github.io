/**
 * 채팅방 시험 (TASK-KL-149).
 *
 * 여기서 지키려는 것은 세 가지다:
 *  ① **이름표가 하루를 간다** — 한낮에 이름이 바뀌면 대화가 통째로 끊긴다.
 *  ② **도배가 실제로 막힌다** — 상한을 적어 두기만 하고 안 걸리는 일이 흔하다.
 *  ③ **다시 켜도 방이 남는다** — 배포가 하루에 몇 번씩 서비스를 재시작한다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { KarmolabChatStore, MAX_MESSAGES, MESSAGE_TTL_MS, TEXT_MAX, BURST_LIMIT, MIN_INTERVAL_MS, kstDate } from './karmolab-chat';

let dir: string;
let statePath: string;

function makeStore(): KarmolabChatStore {
    return new KarmolabChatStore(statePath);
}

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kl-chat-'));
    statePath = path.join(dir, 'chat-state.json');
});
afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('이름표', () => {
    it('같은 사람이면 하루 종일 같은 이름·색이다', () => {
        const store = makeStore();
        const morning = store.identityFor('visitor-a', new Date('2026-08-08T00:10:00+09:00'));
        const night = store.identityFor('visitor-a', new Date('2026-08-08T23:50:00+09:00'));
        expect(night.name).toBe(morning.name);
        expect(night.color).toBe(morning.color);
        expect(night.who).toBe(morning.who);
    });

    it('날이 바뀌면 이름이 갈린다 (한국 자정 기준)', () => {
        const store = makeStore();
        // 한국 시간 23:59 와 00:01 — UTC 로 보면 같은 날이라 서버 시간대로 자르면 이 시험이 통과해 버린다.
        const before = store.identityFor('visitor-a', new Date('2026-08-08T23:59:00+09:00'));
        const after = store.identityFor('visitor-a', new Date('2026-08-09T00:01:00+09:00'));
        expect(kstDate(new Date('2026-08-08T23:59:00+09:00'))).toBe('2026-08-08');
        expect(kstDate(new Date('2026-08-09T00:01:00+09:00'))).toBe('2026-08-09');
        expect(after.who).not.toBe(before.who);
    });

    it('사람이 다르면 열쇠가 다르고, 열쇠는 밖으로 나가는 값과 다르다', () => {
        const store = makeStore();
        const a = store.identityFor('visitor-a');
        const b = store.identityFor('visitor-b');
        expect(a.who).not.toBe(b.who);
        // 공개 번호는 열쇠의 앞 조각일 뿐 — 열쇠 전체가 새면 익명이 아니다.
        expect(a.key.length).toBeGreaterThan(a.who.length);
    });
});

describe('보내기', () => {
    it('빈 줄과 너무 긴 줄은 안 들어간다', () => {
        const store = makeStore();
        expect(store.post('v', '   ').error).toBe('empty');
        expect(store.post('v', 'x'.repeat(TEXT_MAX + 1)).error).toBe('too_long');
    });

    it('연달아 치면 막고, 왜·언제까지인지 같이 준다', () => {
        const store = makeStore();
        const now = new Date('2026-08-08T12:00:00Z');
        expect(store.post('v', '하나', {}, now).ok).toBe(true);
        const second = store.post('v', '둘', {}, new Date(now.getTime() + 100));
        expect(second.ok).toBe(false);
        expect(second.error).toBe('too_fast');
        expect(second.retryAfterMs).toBeGreaterThan(0);
        // 간격을 채우면 통과한다 — 영영 막히는 게 아니다.
        expect(store.post('v', '둘', {}, new Date(now.getTime() + MIN_INTERVAL_MS + 1)).ok).toBe(true);
    });

    it('짧은 시간에 많이 보내면 도배로 막힌다', () => {
        const store = makeStore();
        const base = new Date('2026-08-08T12:00:00Z').getTime();
        let last: ReturnType<KarmolabChatStore['post']> | null = null;
        for (let i = 0; i < BURST_LIMIT + 1; i += 1) {
            last = store.post('v', `줄 ${i}`, {}, new Date(base + i * (MIN_INTERVAL_MS + 10)));
        }
        expect(last?.error).toBe('too_many');
    });

    it('재갈을 물리면 못 쓰고, 시간이 지나면 풀린다', () => {
        const store = makeStore();
        const now = new Date('2026-08-08T12:00:00Z');
        const who = store.identityFor('v', now).who;
        store.mute(who, 10, now);
        expect(store.post('v', '말', {}, now).error).toBe('muted');
        expect(store.post('v', '말', {}, new Date(now.getTime() + 11 * 60 * 1000)).ok).toBe(true);
    });

    it('여러 줄 도배는 접어서 넣는다', () => {
        const store = makeStore();
        const result = store.post('v', '위\n\n\n\n\n아래');
        expect(result.message?.text).toBe('위\n\n아래');
    });
});

describe('방 유지', () => {
    it('상한을 넘으면 오래된 줄부터 버린다', () => {
        const store = makeStore();
        const base = new Date('2026-08-08T12:00:00Z').getTime();
        for (let i = 0; i < MAX_MESSAGES + 10; i += 1) {
            // 도배 판정을 피하려고 사람마다 다른 열쇠로 보낸다.
            store.post(`v${i}`, `줄 ${i}`, {}, new Date(base + i * 1000));
        }
        const recent = store.recent();
        expect(recent.length).toBe(MAX_MESSAGES);
        expect(recent[recent.length - 1].text).toBe(`줄 ${MAX_MESSAGES + 9}`);
    });

    it('하루 지난 줄은 사라진다', () => {
        const store = makeStore();
        const now = new Date('2026-08-08T12:00:00Z');
        store.post('v', '어제 것', {}, new Date(now.getTime() - MESSAGE_TTL_MS - 1000));
        store.post('w', '오늘 것', {}, now);
        const recent = store.recent(MAX_MESSAGES, now);
        expect(recent.map((m) => m.text)).toEqual(['오늘 것']);
    });

    it('다시 켜도 방과 이름이 그대로다 (배포 재시작이 방을 안 지운다)', () => {
        const first = makeStore();
        const now = new Date('2026-08-08T12:00:00Z');
        const before = first.identityFor('v', now);
        first.post('v', '남아 있어야 한다', {}, now);
        first.flush();

        const second = makeStore();
        expect(second.recent(MAX_MESSAGES, now).map((m) => m.text)).toEqual(['남아 있어야 한다']);
        // 소금을 새로 만들면 한낮에 모두의 이름이 바뀐다 — 그 함정을 여기서 잡는다.
        expect(second.identityFor('v', now).who).toBe(before.who);
    });

    it('주인이 지우면 자리가 안 남는다', () => {
        const store = makeStore();
        const posted = store.post('v', '지울 것');
        expect(store.remove(posted.message!.id)).toBe(true);
        expect(store.recent().length).toBe(0);
        expect(store.remove('없는-id')).toBe(false);
    });
});

describe('흐르는 쪽', () => {
    it('붙어 있는 사람에게 새 줄이 간다', () => {
        const store = makeStore();
        const seen: string[] = [];
        const off = store.subscribe((event) => {
            if (event.type === 'msg') seen.push(event.message.text);
        });
        store.post('v', '들리나');
        expect(seen).toEqual(['들리나']);
        expect(store.hereCount()).toBe(1);
        off();
        // 끊긴 사람에게는 안 간다 — 안 그러면 죽은 연결에 계속 쓴다.
        store.post('w', '이건 안 들린다');
        expect(seen).toEqual(['들리나']);
        expect(store.hereCount()).toBe(0);
    });
});
