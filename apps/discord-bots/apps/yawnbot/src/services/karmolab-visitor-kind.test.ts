/**
 * 누가 왔나 가려내기 시험 (TASK-KL-098).
 *
 * 여기서 틀리면 공개해 놓은 「사람 N명」이 거짓말이 된다. 특히 위험한 방향은 한쪽뿐이다 —
 * **봇을 사람으로 세는 것**. 사람을 못 알아보면 수가 작게 나올 뿐이지만, 봇을 사람으로 세면
 * 사이트가 실제보다 붐비는 것처럼 보인다. 그래서 애매한 것은 전부 「알 수 없음」으로 간다.
 */
import { describe, it, expect } from 'vitest';
import { classifyVisitor } from './karmolab-visitor-kind';

const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

describe('누가 왔나', () => {
  it('사람 브라우저는 사람이다', () => {
    expect(classifyVisitor(CHROME)).toBe('human');
    expect(classifyVisitor(IPHONE)).toBe('human');
  });

  it('검색엔진은 검색으로 센다 — 색인해서 사람을 보내 주는 통로다', () => {
    expect(classifyVisitor('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe('search');
    expect(classifyVisitor('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)')).toBe('search');
    expect(classifyVisitor('Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)')).toBe('search');
  });

  it('AI 가 긁어 간 것은 AI 로 센다', () => {
    expect(classifyVisitor('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2')).toBe('ai');
    expect(classifyVisitor('Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)')).toBe('ai');
    expect(classifyVisitor('Mozilla/5.0 (compatible; PerplexityBot/1.0)')).toBe('ai');
    expect(classifyVisitor('Mozilla/5.0 (compatible; CCBot/2.0)')).toBe('ai');
  });

  it('AI 가 검색엔진 이름을 같이 달고 와도 AI 로 센다 — 순서가 뒤집히면 AI 가 검색으로 숨는다', () => {
    expect(classifyVisitor('Mozilla/5.0 (compatible; GoogleOther)')).toBe('ai');
    expect(classifyVisitor('Mozilla/5.0 (compatible; Google-Extended)')).toBe('ai');
    expect(classifyVisitor('Mozilla/5.0 (compatible; Applebot-Extended/0.1)')).toBe('ai');
    // 확장이 아닌 진짜 색인용은 검색이다.
    expect(classifyVisitor('Mozilla/5.0 (compatible; Applebot/0.1)')).toBe('search');
  });

  it('브라우저 흉내를 내도 봇 표식이 있으면 사람이 아니다', () => {
    expect(classifyVisitor(`${CHROME} HeadlessChrome/128.0`)).toBe('unknown');
    expect(classifyVisitor('Mozilla/5.0 (compatible; SomeNewBot/1.0)')).toBe('unknown');
  });

  it('도구가 긁어 간 것은 사람이 아니다', () => {
    expect(classifyVisitor('curl/8.4.0')).toBe('unknown');
    expect(classifyVisitor('python-requests/2.32.0')).toBe('unknown');
    expect(classifyVisitor('node-fetch/1.0')).toBe('unknown');
  });

  it('이름을 안 밝히면 「알 수 없음」이다 — 사람 쪽에 넣지 않는다', () => {
    expect(classifyVisitor('')).toBe('unknown');
    expect(classifyVisitor(undefined)).toBe('unknown');
    expect(classifyVisitor(null)).toBe('unknown');
    expect(classifyVisitor('그냥 아무 글자')).toBe('unknown');
  });
});
