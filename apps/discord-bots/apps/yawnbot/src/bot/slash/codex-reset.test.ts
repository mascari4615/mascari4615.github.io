import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { buildCodexResetCommand, handleCodexReset } from './codex-reset';
import { fetchResetPostLink } from '../../services/sources/codex-reset';
import { getRecentResets } from '../../services/notifiers/codex-reset';

vi.mock('../../services/sources/codex-reset', async importOriginal => ({ ...await importOriginal<object>(), fetchResetPostLink: vi.fn() }));
vi.mock('../../services/notifiers/codex-reset', async importOriginal => ({ ...await importOriginal<object>(), getRecentResets: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
function interaction(link: string | null) {
  return { options: { getString: () => link }, deferReply: vi.fn(), editReply: vi.fn() };
}

describe('/코덱스 사용자 경로', () => {
  it('선택 트윗 URL 스키마', () => {
    const command = buildCodexResetCommand().toJSON();
    expect(command.name).toBe('코덱스');
    expect(command.options?.[0].name).toBe('트윗');
    expect(command.options?.[0].required).not.toBe(true);
  });
  it('링크 조회는 토큰 없이 개인 응답으로 한국시간 표시', async () => {
    vi.stubEnv('YAWNBOT_X_BEARER_TOKEN', '');
    vi.mocked(fetchResetPostLink).mockResolvedValue({ id: '2097174560412246215', text: 'We have reset Codex usage.', postedAt: '2026-09-08T04:05:53Z', url: 'https://x.com/thsottiaux/status/2097174560412246215' });
    const input = interaction('https://x.com/thsottiaux/status/2097174560412246215');
    await handleCodexReset(input as unknown as ChatInputCommandInteraction);
    expect(input.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const reply = input.editReply.mock.calls[0][0];
    expect(reply.embeds[0].toJSON().description).toContain('13:05 KST');
    expect(reply.allowedMentions).toEqual({ parse: [] });
  });
  it('브라우저 로그인 부재는 수집 실패로 표시', async () => {
    vi.mocked(getRecentResets).mockResolvedValue({ state: { author: 'thsottiaux', seen: [], sent: [], signals: [], checkedAt: null }, stale: true, error: 'X 로그인 필요' });
    const input = interaction(null);
    await handleCodexReset(input as unknown as ChatInputCommandInteraction);
    expect(input.editReply.mock.calls[0][0].content).toContain('X 로그인 필요');
    expect(input.editReply.mock.calls[0][0].content).not.toContain('초기화 공지를 찾지 못했어요');
    expect(fetchResetPostLink).not.toHaveBeenCalled();
  });
  it('API 토큰 없이 브라우저 캐시 조회', async () => {
    vi.mocked(getRecentResets).mockResolvedValue({ state: { author: 'thsottiaux', seen: ['123'], sent: [], signals: [], checkedAt: '2026-09-09T10:00:00Z' }, stale: false });
    const input = interaction(null);
    await handleCodexReset(input as unknown as ChatInputCommandInteraction);
    expect(getRecentResets).toHaveBeenCalled();
    expect(input.editReply.mock.calls[0][0].content).toContain('19:00 KST');
  });
});
