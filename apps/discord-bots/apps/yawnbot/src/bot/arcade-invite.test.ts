/**
 * 초대 카드가 방을 따라 사는가 (사용자 2026-09-01)
 *
 * - 디스코드를 안 띄움. 여기서 볼 것은 상태가 앞으로만 가는가와 문구
 * - 진짜로 글이 고쳐지는지는 실서버에서 눈으로
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { rememberCard, cardOf, lineOf, moveCard, resetInvites, inviteEmbed } from './arcade-invite';

const CODE = 'K7QMR';
const put = (): void =>
  rememberCard(CODE, {
    channelId: '1',
    messageId: '2',
    game: 'gomoku',
    gameName: '오목',
    link: 'https://example.test/r/' + CODE
  });

/** 채널을 못 찾는 가짜. 고치기가 실패해도 상태는 움직여야 함 */
const client = { channels: { fetch: async (): Promise<null> => null } } as never;

beforeEach(() => resetInvites());

describe('초대 카드', () => {
  it('기억한 방은 처음에 기다리는 중', () => {
    put();
    expect(cardOf(CODE)?.stage).toBe('waiting');
    expect(lineOf('waiting')).toBe('자리 기다리는 중');
  });

  it('모르는 방은 아무 일도 안 한다', async () => {
    expect(await moveCard(client, 'NOPE1', 'done')).toBe(false);
  });

  it('상태는 앞으로만 간다. 끝난 판이 기다리는 중으로 돌면 헛걸음이 온다', async () => {
    put();
    await moveCard(client, CODE, 'done', '내가 이겼다');
    expect(cardOf(CODE)?.stage).toBe('done');
    await moveCard(client, CODE, 'waiting');
    expect(cardOf(CODE)?.stage).toBe('done');
  });

  it('덧말은 상태 줄 뒤에 붙는다', () => {
    expect(lineOf('done', '내가 이겼다')).toBe('끝난 판, 내가 이겼다');
    expect(lineOf('playing', '둘이 두는 중')).toBe('두는 중, 둘이 두는 중');
  });

  it('카드에 놀이 이름과 방 코드가 있다', () => {
    const json = inviteEmbed('오목', CODE, 'waiting').toJSON();
    expect(json.title).toContain('오목');
    expect(json.description).toContain(CODE);
  });
});
