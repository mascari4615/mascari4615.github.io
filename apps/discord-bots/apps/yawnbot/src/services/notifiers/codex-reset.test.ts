import { describe, expect, it, vi } from 'vitest';
import { ResetMonitor, buildResetEmbed, type ResetState } from './codex-reset';
import { classifyResetPost, type ResetPost } from '../sources/codex-reset';

const now = Date.parse('2026-09-09T10:00:00Z');
function post(id: string, text = 'We have reset Codex usage.', postedAt = '2026-09-09T09:00:00Z'): ResetPost {
  return { id, text, postedAt, url: `https://x.com/thsottiaux/status/${id}` };
}
function setup() {
  let saved: ResetState = { author: 'thsottiaux', seen: [], sent: [], signals: [], checkedAt: null };
  const store = { load: () => structuredClone(saved), save: (s: ResetState) => { saved = structuredClone(s); } };
  const fetchPosts = vi.fn<() => Promise<ResetPost[]>>().mockResolvedValue([post('1')]);
  const create = () => new ResetMonitor({ author: 'thsottiaux', store, fetchPosts, now: () => now });
  return { store, fetchPosts, create };
}

describe('수집과 알림 경로', () => {
  it('조회는 발송 기록을 소비하지 않음, 재시작 뒤 중복 방지', async () => {
    const { create } = setup();
    const first = create();
    await first.refresh();
    expect(first.snapshot().sent).toEqual([]);
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await first.deliver(send)).toBe(1);
    const restarted = create();
    await restarted.refresh();
    expect(await restarted.deliver(send)).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('전송 실패는 다음 주기에 재시도', async () => {
    const monitor = setup().create();
    await monitor.refresh();
    await expect(monitor.deliver(async () => { throw new Error('Discord unavailable'); })).rejects.toThrow('Discord');
    expect(monitor.snapshot().sent).toEqual([]);
    expect(await monitor.deliver(async () => {})).toBe(1);
  });
  it('수집 장애는 마지막 확인 시각 보존', async () => {
    const { create, fetchPosts } = setup();
    const monitor = create();
    await monitor.refresh();
    const previous = monitor.snapshot();
    fetchPosts.mockRejectedValueOnce(new Error('HTTP 410'));
    await expect(monitor.refresh()).rejects.toThrow('410');
    expect(monitor.snapshot()).toEqual(previous);
  });
  it('저장 실패 때 수집 위치를 앞당기지 않음', async () => {
    const { store, fetchPosts } = setup();
    const monitor = new ResetMonitor({ author: 'thsottiaux', store: { ...store, save() { throw new Error('disk full'); } }, fetchPosts, now: () => now });
    await expect(monitor.refresh()).rejects.toThrow('disk full');
    expect(monitor.snapshot().seen).toEqual([]);
    expect(monitor.snapshot().checkedAt).toBeNull();
  });
  it('동시 조회는 수집 한 번', async () => {
    const { create, fetchPosts } = setup();
    const monitor = create();
    await Promise.all([monitor.refresh(), monitor.refresh()]);
    expect(fetchPosts).toHaveBeenCalledTimes(1);
  });
  it('관련 없는 글도 재조회하지 않도록 위치 저장', async () => {
    const { create, fetchPosts } = setup();
    fetchPosts.mockResolvedValueOnce([post('100', 'Hello there.'), post('99')]);
    const first = create();
    await first.refresh();
    const restarted = create();
    await restarted.refresh();
    expect(fetchPosts.mock.calls[1]).toEqual(['100']);
  });
  it('초기 과거 묶음은 최신 하나, 이후 새 공지 각각 발송', async () => {
    const { create, fetchPosts } = setup();
    fetchPosts.mockResolvedValueOnce([post('1'), post('2', undefined, '2026-09-09T09:10:00Z')]);
    const monitor = create();
    await monitor.refresh();
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await monitor.deliver(send)).toBe(1);
    expect(send.mock.calls[0][0].post.id).toBe('2');
    fetchPosts.mockResolvedValueOnce([post('3', undefined, '2026-09-09T09:20:00Z'), post('4', 'We will credit a banked reset today.', '2026-09-09T09:25:00Z')]);
    await monitor.refresh();
    expect(await monitor.deliver(send)).toBe(2);
    expect(send.mock.calls.map(c => c[0].post.id)).toEqual(['2', '3', '4']);
  });
  it('지난 공지와 모호한 예고는 자동 전송 제외', async () => {
    const { create, fetchPosts } = setup();
    fetchPosts.mockResolvedValueOnce([post('1', undefined, '2026-09-07T09:00:00Z'), post('2', 'We might reset Codex usage.')]);
    const monitor = create();
    await monitor.refresh();
    expect(await monitor.deliver(async () => {})).toBe(0);
    expect(monitor.snapshot().signals).toHaveLength(2);
  });
  it('작성자 변경은 이전 캐시 제거', async () => {
    const { store, create } = setup();
    await create().refresh();
    const changed = new ResetMonitor({ author: 'different', store, fetchPosts: async () => [] });
    expect(changed.snapshot().signals).toEqual([]);
  });
  it('저장된 과거 회고의 이전 완료 판정도 갱신해 자동 발송 방지', async () => {
    const { store, create, fetchPosts } = setup();
    const signal = { ...classifyResetPost(post('1', 'Last week we reset usage.'))!, status: 'completed' as const };
    store.save({ author: 'thsottiaux', seen: ['1'], sent: [], signals: [signal], checkedAt: null });
    fetchPosts.mockResolvedValueOnce([]);
    const monitor = create();
    await monitor.refresh();
    expect(monitor.snapshot().signals[0].status).toBe('uncertain');
    expect(await monitor.deliver(vi.fn())).toBe(0);
    expect(store.load().seen).toEqual(['1']);
  });
  it('수집 오류 알림은 재시작 뒤에도 6시간 제한', async () => {
    const { create } = setup();
    const send = vi.fn().mockResolvedValue(undefined);
    await create().reportFailure(send);
    await create().reportFailure(send);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('오류 알림 전송 실패는 다시 시도', async () => {
    const { create } = setup();
    const send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    await expect(create().reportFailure(send)).rejects.toThrow('offline');
    await create().reportFailure(send);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('한국어 공지 내용', () => {
  it('예정 시각 경과를 완료로 바꾸지 않음', () => {
    const signal = classifyResetPost(post('1', 'We will reset Codex usage in 3 hours.'))!;
    const embed = buildResetEmbed(signal, now + 5 * 3_600_000).toJSON();
    expect(embed.title).toContain('예정 공지');
    expect(embed.description).toContain('예정 시각이 지났어요');
  });
  it('저장형 지급과 실제 사용량 구분', () => {
    const embed = buildResetEmbed(classifyResetPost(post('1', 'We will credit a banked reset today.'))!, now).toJSON();
    expect(embed.title).toContain('저장형 초기화권');
    expect(embed.description).toContain('시각 미정');
    expect(embed.fields?.some(f => f.value.includes('자동 초기화 시각은 아니에요'))).toBe(true);
  });
  it('PST 원문과 여름 PT 의도 차이 표시', () => {
    const embed = buildResetEmbed(classifyResetPost(post('1', 'We will reset Codex usage at 6pm PST.'))!, now).toJSON();
    expect(embed.description).toContain('UTC-8');
    expect(embed.description).toContain('1시간');
  });
});
