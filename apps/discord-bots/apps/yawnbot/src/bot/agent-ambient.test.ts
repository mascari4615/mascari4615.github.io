/**
 * agent-ambient 회귀 (TASK-KAR-018-LT-DIVERSITY D-4/D-5/D-6).
 *
 * 결정층 *순수* — rate-limit·active context·prefilter·speak prompt 의
 * silence default 와 멘션 우회 의 잠금. LLM 폭주 회귀의 1차 안전망.
 */
import { describe, it, expect } from 'vitest';
import type { BusEvent } from './agent-channel-bus';
import type { CoreDef } from '../services/agent-core';
import {
  isRateLimited,
  isMentionedFor,
  recentActiveContext,
  formatActiveContext,
  buildPrefilterPrompt,
  parsePrefilterResponse,
  buildSpeakPrompt,
  DEFAULT_RATE_LIMIT,
} from './agent-ambient';

const mkUtter = (ts: string, coreId: string, text = 'x'): BusEvent => ({
  ts,
  source: 'agent-runtime',
  type: 'core-utter',
  channelId: 'C1',
  coreId,
  text,
});
const mkMsg = (ts: string, text = 'hi', refs?: BusEvent['refs']): BusEvent => ({
  ts,
  source: 'discord',
  type: 'channel-msg',
  channelId: 'C1',
  authorName: 'fourth',
  text,
  refs,
});

const baseCore: CoreDef = {
  id: 'atlas',
  role: '시스템 진단·메타 인프라',
  status: 'active',
  defaultSkin: 'atlas',
  emoji: '🛰',
  displayName: 'Atlas',
  body: '직무: 시스템 헬스, repo 진단. escalation: 위기 시 사용자 컨펌.',
  skills: [],
  frontmatter: {},
};

describe('isRateLimited — 5분 sliding 2 발화 cap', () => {
  it('윈도우 안 0발화 = false', () => {
    expect(isRateLimited([], 'atlas', { now: new Date('2026-05-23T03:00:00Z') })).toBe(false);
  });

  it('윈도우 안 1발화 = false (cap 미달)', () => {
    const events = [mkUtter('2026-05-23T02:59:00.000Z', 'atlas')];
    expect(isRateLimited(events, 'atlas', { now: new Date('2026-05-23T03:00:00Z') })).toBe(false);
  });

  it('윈도우 안 2발화 = true (cap 도달)', () => {
    const events = [
      mkUtter('2026-05-23T02:58:00.000Z', 'atlas'),
      mkUtter('2026-05-23T02:59:30.000Z', 'atlas'),
    ];
    expect(isRateLimited(events, 'atlas', { now: new Date('2026-05-23T03:00:00Z') })).toBe(true);
  });

  it('5분 전 발화는 윈도우 밖 = false', () => {
    const events = [
      mkUtter('2026-05-23T02:50:00.000Z', 'atlas'),
      mkUtter('2026-05-23T02:51:00.000Z', 'atlas'),
    ];
    expect(isRateLimited(events, 'atlas', { now: new Date('2026-05-23T03:00:00Z') })).toBe(false);
  });

  it('다른 코어 발화는 안 셈 (per-core cap)', () => {
    const events = [
      mkUtter('2026-05-23T02:58:00.000Z', 'echo'),
      mkUtter('2026-05-23T02:59:00.000Z', 'echo'),
    ];
    expect(isRateLimited(events, 'atlas', { now: new Date('2026-05-23T03:00:00Z') })).toBe(false);
  });

  it('cap 옵션 override 가능', () => {
    const events = [mkUtter('2026-05-23T02:59:00.000Z', 'atlas')];
    expect(
      isRateLimited(events, 'atlas', { now: new Date('2026-05-23T03:00:00Z'), cap: 1 }),
    ).toBe(true);
  });

  it('DEFAULT_RATE_LIMIT 가 2 (사용자 컨펌 cap)', () => {
    expect(DEFAULT_RATE_LIMIT).toBe(2);
  });
});

describe('isMentionedFor — 멘션 우회 결정', () => {
  it('refs.mentionedCoreIds 에 본인 id 포함 = true', () => {
    const ev = mkMsg('2026-05-23T03:00:00Z', '@atlas 봐줘', {
      mentionedCoreIds: ['atlas'],
    });
    expect(isMentionedFor(ev, 'atlas')).toBe(true);
  });

  it('다른 코어 멘션 = false', () => {
    const ev = mkMsg('2026-05-23T03:00:00Z', '@echo', {
      mentionedCoreIds: ['echo'],
    });
    expect(isMentionedFor(ev, 'atlas')).toBe(false);
  });

  it('refs 부재 = false', () => {
    const ev = mkMsg('2026-05-23T03:00:00Z', 'plain');
    expect(isMentionedFor(ev, 'atlas')).toBe(false);
  });
});

describe('recentActiveContext + formatActiveContext', () => {
  it('5분 윈도우 안 event 만 시간 오름차순', () => {
    const events: BusEvent[] = [
      mkMsg('2026-05-23T02:50:00Z', 'old'),
      mkMsg('2026-05-23T02:58:00Z', 'b'),
      mkMsg('2026-05-23T02:59:30Z', 'c'),
      mkMsg('2026-05-23T02:57:00Z', 'a'),
    ];
    const ctx = recentActiveContext(events, { now: new Date('2026-05-23T03:00:00Z') });
    expect(ctx.map((e) => e.text)).toEqual(['a', 'b', 'c']);
  });

  it('maxLines 도달 시 가장 최근 N개만 (overflow 폭발 방지)', () => {
    const events: BusEvent[] = [];
    for (let i = 0; i < 50; i++) {
      events.push(mkMsg(`2026-05-23T02:59:${String(i).padStart(2, '0')}Z`, `m${i}`));
    }
    const ctx = recentActiveContext(events, {
      now: new Date('2026-05-23T03:00:00Z'),
      maxLines: 5,
    });
    expect(ctx.length).toBe(5);
    expect(ctx[0].text).toBe('m45');
  });

  it('formatActiveContext 가 channel-msg·core-utter 둘 다 표시', () => {
    const out = formatActiveContext([
      mkMsg('2026-05-23T03:00:00Z', '안녕'),
      mkUtter('2026-05-23T03:00:30Z', 'atlas', '저요'),
    ]);
    expect(out).toContain('[fourth] 안녕');
    expect(out).toContain('[코어:atlas] 저요');
  });
});

describe('buildPrefilterPrompt — silence default + 멘션 우회 규칙', () => {
  it('코어 capability(role/body) + recent context + 평가 대상 모두 포함', () => {
    const ev = mkMsg('2026-05-23T03:00:00Z', '시스템 어떻게 돌아가?');
    const p = buildPrefilterPrompt({
      core: baseCore,
      context: [ev],
      latest: ev,
    });
    expect(p).toContain('Atlas');
    expect(p).toContain('시스템 진단');
    expect(p).toContain('시스템 어떻게 돌아가?');
    expect(p).toContain('react');
    expect(p).toContain('silence 가 default');
  });

  it('JSON 출력 강제 규칙 명시', () => {
    const ev = mkMsg('2026-05-23T03:00:00Z', 'q');
    const p = buildPrefilterPrompt({ core: baseCore, context: [ev], latest: ev });
    expect(p).toContain('{"react": true|false, "why":');
  });
});

describe('parsePrefilterResponse — silence default 가 안전한 폴백', () => {
  it('정상 JSON {"react": true, "why": "..."}', () => {
    const d = parsePrefilterResponse('{"react": true, "why": "내 capability 관련"}');
    expect(d.react).toBe(true);
    expect(d.why).toContain('capability');
  });

  it('react=false 정상 파싱', () => {
    const d = parsePrefilterResponse('{"react": false, "why": "다른 코어"}');
    expect(d.react).toBe(false);
  });

  it('비-JSON 응답 = silence(false)', () => {
    expect(parsePrefilterResponse('아 모르겠는데요?').react).toBe(false);
  });

  it('빈 응답 = silence(false)', () => {
    expect(parsePrefilterResponse('').react).toBe(false);
  });

  it('코드펜스 동봉 시 추출', () => {
    const d = parsePrefilterResponse('```json\n{"react": true, "why": "ok"}\n```');
    expect(d.react).toBe(true);
  });

  it('손상 JSON = silence(false) (안전 폴백)', () => {
    expect(parsePrefilterResponse('{react: true why: ok}').react).toBe(false);
  });

  it('react가 문자열 "true" 라도 허용 (LLM JSON 변종 robustness)', () => {
    expect(parsePrefilterResponse('{"react": "true", "why": "ok"}').react).toBe(true);
  });
});

describe('buildSpeakPrompt — capability + work-memory + 발화 규칙', () => {
  it('core body + recent mem + context 합성', () => {
    const ev = mkMsg('2026-05-23T03:00:00Z', '나 어떻게 도와줄래?');
    const p = buildSpeakPrompt({
      core: baseCore,
      prefilterWhy: '시스템 진단 도메인',
      context: [ev],
      latest: ev,
      recentMem: '- [fix] worker-failed dedupe: 24h 윈도우 도입',
    });
    expect(p).toContain('Atlas');
    expect(p).toContain('시스템 진단');
    expect(p).toContain('worker-failed dedupe');
    expect(p).toContain('시스템 진단 도메인');
    expect(p).toContain('나 어떻게 도와줄래?');
    expect(p).toContain('1~3문장');
  });

  it('mem 빈 문자열 = mem 블록 생략 (잡음 차단)', () => {
    const ev = mkMsg('2026-05-23T03:00:00Z', 'q');
    const p = buildSpeakPrompt({
      core: baseCore,
      prefilterWhy: '',
      context: [ev],
      latest: ev,
    });
    expect(p).not.toContain('work-memory');
  });

  it('mentioned=true 면 멘션 우회 라인 포함', () => {
    const ev = mkMsg('2026-05-23T03:00:00Z', '@atlas 봐줘', {
      mentionedCoreIds: ['atlas'],
    });
    const p = buildSpeakPrompt({
      core: baseCore,
      prefilterWhy: '멘션됨',
      context: [ev],
      latest: ev,
      mentioned: true,
    });
    expect(p).toContain('멘션 우회');
  });
});
