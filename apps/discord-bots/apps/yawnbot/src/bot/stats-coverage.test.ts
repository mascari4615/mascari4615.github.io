import { describe, expect, it } from 'vitest';
import {
  coverageDebugLine,
  coverageNotice,
  summarizeCoverage,
  UNKNOWN_COVERAGE,
} from './stats-coverage';
import { buildDebugText, buildWrappedEmbed } from './slash/wrapped';
import { renderWrappedPage } from './wrapped-web';
import { debugDump, emptyState, summarize } from '../services/server-stats';

const ch = (id: string, name: string, visible: boolean) => ({ channelId: id, name, visible });

describe('summarizeCoverage', () => {
  it('보는 것/못 보는 것을 가른다', () => {
    const report = summarizeCoverage([ch('1', 'a', true), ch('2', 'b', false), ch('3', 'c', false)]);
    expect(report).toMatchObject({ known: true, total: 3, visible: 1 });
    expect(report.blind.map((b) => b.name)).toEqual(['b', 'c']);
  });
});

describe('coverageNotice — 0 의 원인을 가르는 문장', () => {
  it('전부 가려졌으면 메시지 수와 무관하게 알린다', () => {
    const notice = coverageNotice(summarizeCoverage([ch('1', 'ㅗ', false)]), 0);
    expect(notice).toContain('볼 수 있는 채널이 하나도 없어요');
    expect(notice).toContain('채널 보기');
  });

  it('일부만 가려졌는데 기록이 0 이면 그 채널을 지목한다', () => {
    const notice = coverageNotice(summarizeCoverage([ch('1', 'a', true), ch('2', '잡담', false)]), 0);
    expect(notice).toContain('#잡담');
    expect(notice).toContain('세지 못합니다');
  });

  it('숫자가 있어도 가려진 채널이 있으면 「이 숫자에는 안 들어갔다」', () => {
    const notice = coverageNotice(summarizeCoverage([ch('1', 'a', true), ch('2', 'b', false)]), 120);
    expect(notice).toContain('안 들어갔어요');
  });

  it('다 보이면 잔소리 X', () => {
    expect(coverageNotice(summarizeCoverage([ch('1', 'a', true)]), 0)).toBeNull();
  });

  it('확인 못 한 상태에서 넘겨짚지 않는다', () => {
    expect(coverageNotice(UNKNOWN_COVERAGE, 0)).toBeNull();
  });

  it('가려진 채널이 많으면 앞 몇 개만 + 나머지 개수', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((n, i) => ch(String(i), n, false));
    const notice = coverageNotice(summarizeCoverage([...many, ch('9', 'ok', true)]), 5) ?? '';
    expect(notice).toContain('외 2개');
  });
});

// 실제로 사용자가 보는 세 자리에 그 문장이 닿는지 — 순수 함수만 초록이면 화면엔 없을 수 있다.
describe('빈 결산 화면이 원인을 가리킨다', () => {
  const blind = summarizeCoverage([ch('1', 'ㅗ', false)]);
  const state = emptyState();
  const summary = summarize(state, 'g1', { days: 7, now: new Date('2026-08-09T12:00:00Z') });

  it('카드(embed) 빈 상태 — 「며칠 떠들고」 대신 권한을 말한다', () => {
    const json = buildWrappedEmbed(summary, '우리 서버', blind).toJSON();
    expect(json.description).toContain('채널 보기');
    expect(json.description).not.toContain('며칠 떠들고');
  });

  it('카드 빈 상태 — 시야를 모를 땐 기존 안내 그대로', () => {
    const json = buildWrappedEmbed(summary, '우리 서버', UNKNOWN_COVERAGE).toJSON();
    expect(json.description).toContain('며칠 떠들고');
  });

  it('「자세히」 덤프 — 가려진 채널을 첫 용의자로 적는다', () => {
    const text = buildDebugText(
      { ...debugDump(state, 'g1', { days: 7, now: new Date('2026-08-09T12:00:00Z') }), dirty: false, statePath: 'x', stateFileExists: true, stateFileMtime: null },
      7,
      blind,
    );
    expect(text).toContain('채널 시야: 봄 0 / 전체 1');
    expect(text).toContain('가려진 채널 1개부터 의심');
  });

  it('웹 결산 페이지 — 눈에 띄는 칸으로 먼저 알린다', () => {
    const html = renderWrappedPage({
      guildName: '우리 서버',
      days: 7,
      summary,
      detail: { ...debugDump(state, 'g1', { days: 7, now: new Date('2026-08-09T12:00:00Z') }), dirty: false, statePath: 'x', stateFileExists: true, stateFileMtime: null },
      channelNames: {},
      coverage: blind,
      generatedAt: '2026-08-09T12:00:00.000Z',
    });
    expect(html).toContain('card blind');
    expect(html).toContain('채널 보기');
    // embed 용 굵게 문법이 웹에 별표로 새지 않는다
    expect(html).not.toContain('**');
  });
});

describe('coverageDebugLine', () => {
  it('모르면 모른다고 적는다', () => {
    expect(coverageDebugLine(UNKNOWN_COVERAGE)).toContain('확인 못 함');
  });

  it('가려진 채널 이름을 편다', () => {
    const line = coverageDebugLine(summarizeCoverage([ch('1', 'a', true), ch('2', 'ㅗ', false)]));
    expect(line).toContain('봄 1 / 전체 2');
    expect(line).toContain('#ㅗ');
  });
});
