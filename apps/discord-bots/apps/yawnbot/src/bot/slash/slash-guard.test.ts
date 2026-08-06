import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { guardSlashInteraction } from './slash-guard';
import { SLASH_COMMANDS } from './registry';

/** 최소한의 가짜 인터랙션 — 실제로 검사하는 건 길드/채널/명령 이름뿐이다. */
function fakeInteraction(commandName: string, guildId: string | null) {
  const reply = vi.fn().mockResolvedValue(undefined);
  return {
    interaction: {
      isChatInputCommand: () => true,
      commandName,
      guildId,
      channelId: 'ch-any',
      reply,
    } as never,
    reply,
  };
}

const ORIGINAL = process.env.YAWNBOT_ALLOWED_GUILD_IDS;

describe('허용 목록 게이트', () => {
  beforeEach(() => {
    process.env.YAWNBOT_ALLOWED_GUILD_IDS = 'home-guild';
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.YAWNBOT_ALLOWED_GUILD_IDS;
    else process.env.YAWNBOT_ALLOWED_GUILD_IDS = ORIGINAL;
  });

  it('사적인 명령은 남의 서버에서 거부된다', async () => {
    const { interaction, reply } = fakeInteraction('이미지', 'someone-else');
    expect(await guardSlashInteraction(interaction)).toBe(false);
    expect(reply).toHaveBeenCalled();
  });

  it('공개 명령(결산)은 남의 서버에서도 통과한다', async () => {
    const { interaction, reply } = fakeInteraction('결산', 'someone-else');
    expect(await guardSlashInteraction(interaction)).toBe(true);
    expect(reply).not.toHaveBeenCalled();
  });

  it('도움말도 공개다 — 초대받은 서버가 뭘 할 수 있는지 알아야 한다', async () => {
    const { interaction } = fakeInteraction('도움말', 'someone-else');
    expect(await guardSlashInteraction(interaction)).toBe(true);
  });

  it('본진에서는 사적인 명령도 통과한다', async () => {
    const { interaction } = fakeInteraction('이미지', 'home-guild');
    expect(await guardSlashInteraction(interaction)).toBe(true);
  });

  it('공개 표시는 의도한 명령에만 붙어 있다 (실수로 다 열리지 않게)', () => {
    const publicNames = SLASH_COMMANDS.filter((c) => c.public).map((c) => c.name).sort();
    expect(publicNames).toEqual(['결산', '도움말']);
  });
});
