import { describe, expect, it, vi } from 'vitest';
import { classifyResetPost, fetchResetPostLink, formatKst, inferResetTiming, type ResetPost } from './codex-reset';

function post(text: string, postedAt = '2026-09-07T19:24:57Z'): ResetPost {
  return { id: '2097043464538264003', text, postedAt, url: 'https://x.com/thsottiaux/status/2097043464538264003' };
}

describe('초기화 공지 분류', () => {
  it.each([
    ['We have reset Codex usage for all paid users.', 'reset', 'completed'],
    ['We will reset Codex usage. Landing in 3 hours.', 'reset', 'scheduled'],
    ['We will credit a banked reset today. If you create an account before 8pm PT, you qualify.', 'banked', 'scheduled'],
    ['You get a full reset and also one into the reset bank.', 'both', 'uncertain'],
    ['We might reset the Codex quota tomorrow.', 'reset', 'uncertain'],
    ['Did you reset Codex usage?', 'reset', 'uncertain'],
    ['Please reset Codex usage for us.', 'reset', 'uncertain'],
  ])('%s', (text, kind, status) => {
    expect(classifyResetPost(post(text))).toMatchObject({ kind, status });
  });
  it.each([
    'We have not reset Codex usage.',
    'No global reset this week.',
    'I will not reset usage today.',
    'How to reset your password.',
    'Codex is faster today.',
    'I reset my own Codex usage with a banked reset.',
  ])('공지 아닌 글 제외: %s', text => expect(classifyResetPost(post(text))).toBeNull());
});

describe('공식 oEmbed 트윗 링크 조회', () => {
  const url = 'https://x.com/thsottiaux/status/2097174560412246215';
  const body = { author_url: 'https://x.com/thsottiaux', html: `<blockquote class="twitter-tweet"><p>We have reset Codex usage.</p>author<a href="${url}">September 8, 2026</a></blockquote>` };
  it('API 토큰 없이 공식 호스트, 작성자 확인과 Snowflake 시각', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body)));
    const result = await fetchResetPostLink(url + '?s=20', 'thsottiaux', fetcher);
    expect(result.postedAt).toBe('2026-09-08T04:05:53.478Z');
    expect(result.text).toBe('We have reset Codex usage.');
    expect(String(fetcher.mock.calls[0][0])).toMatch(/^https:\/\/publish.x.com\/oembed\?/);
    expect(fetcher.mock.calls[0][1]?.headers).toBeUndefined();
  });
  it.each(['https://evil.invalid/thsottiaux/status/2097174560412246215', 'https://x.com/other/status/2097174560412246215', 'https://x.com/thsottiaux', 'http://x.com/thsottiaux/status/2097174560412246215'])('임의 URL 수집 차단: %s', async input => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(fetchResetPostLink(input, 'thsottiaux', fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('작성자 불일치와 삭제된 글 오류', async () => {
    await expect(fetchResetPostLink(url, 'thsottiaux', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ...body, author_url: 'https://x.com/other' }))))).rejects.toThrow('작성자');
    await expect(fetchResetPostLink(url, 'thsottiaux', vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 })))).rejects.toThrow('404');
  });
  it('긴 글 잘림은 완료 판정 금지, HTML 줄바꿈 보존', async () => {
    const cut = { ...body, html: body.html.replace('We have reset Codex usage.', 'We have reset Codex usage.<br>But\u2026') };
    const result = await fetchResetPostLink(url, 'thsottiaux', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(cut))));
    expect(result.truncated).toBe(true);
    expect(result.text).toContain('\nBut');
    expect(classifyResetPost(result)?.status).toBe('uncertain');
  });
});

describe('원문 시각 계산', () => {
  it.each([
    ['We will reset usage in ~3 hours.', '2026-09-07T22:24:57.000Z', 'around'],
    ['We will reset usage. Lands in the next hour or so.', '2026-09-07T20:24:57.000Z', 'within'],
    ['We will reset usage within thirty minutes.', '2026-09-07T19:54:57.000Z', 'within'],
    ['We will reset usage. Lands around 6pm PST today.', '2026-09-08T02:00:00.000Z', 'around'],
    ['We will reset usage at 6pm PDT today.', '2026-09-08T01:00:00.000Z', 'exact'],
    ['We will reset usage at 6pm PT tomorrow.', '2026-09-09T01:00:00.000Z', 'exact'],
    ['We will reset usage by 23:00 UTC.', '2026-09-07T23:00:00.000Z', 'by'],
  ])('%s', (text, at, qualifier) => expect(inferResetTiming(post(text))).toMatchObject({ at, qualifier }));
  it('겨울 PT는 UTC-8', () => {
    expect(inferResetTiming(post('We will reset usage at 6pm PT today.', '2026-12-01T20:00:00Z'))?.at).toBe('2026-12-02T02:00:00.000Z');
  });
  it('서머타임 종료의 중복 시각 미정', () => {
    expect(inferResetTiming(post('We will reset usage at 1:30am PT tomorrow.', '2026-10-31T18:00:00Z'))).toBeNull();
  });
  it('서머타임 시작의 없는 시각 미정', () => {
    expect(inferResetTiming(post('We will reset usage at 2:30am PT tomorrow.', '2026-03-07T18:00:00Z'))).toBeNull();
  });
  it.each([
    'We will give a banked reset. Lands end of day. Create your account before 8pm PT.',
    'We will reset usage soon.',
    'We will reset usage at 6pm.',
    'We will reset usage at 6pm PT on September 9.',
    'We will reset usage at 25:00 UTC.',
    'We will reset usage at 8am PT today.',
    'We will reset usage at 6pm PT or at 9pm PT.',
    'We will reset usage in 3 hours or in 4 hours.',
  ])('시간 확정 불가: %s', text => expect(inferResetTiming(post(text))).toBeNull());
  it('서버 시간대 무관한 KST 날짜 경계', () => {
    expect(formatKst('2026-09-07T18:00:00Z')).toBe('2026. 09. 08. 03:00 KST');
  });
});
