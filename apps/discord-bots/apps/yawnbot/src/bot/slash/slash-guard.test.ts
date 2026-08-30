import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { guardSlashInteraction } from './slash-guard';
import { SLASH_COMMANDS } from './registry';

/** 최소한의 가짜 인터랙션. 실제로 검사하는 건 길드/채널/명령 이름뿐이다. */
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

  it('도움말도 공개다. 초대받은 서버가 뭘 할 수 있는지 알아야 한다', async () => {
    const { interaction } = fakeInteraction('도움말', 'someone-else');
    expect(await guardSlashInteraction(interaction)).toBe(true);
  });

  it('본진에서는 사적인 명령도 통과한다', async () => {
    const { interaction } = fakeInteraction('이미지', 'home-guild');
    expect(await guardSlashInteraction(interaction)).toBe(true);
  });

  it('공개 표시는 의도한 명령에만 붙어 있다 (실수로 다 열리지 않게)', () => {
    const publicNames = SLASH_COMMANDS.filter((c) => c.public).map((c) => c.name).sort();
    /* 늘릴 때는 **왜 공개인지** 여기 적는다. 이 줄이 게이트다. 실제로 `/오락실` 을 넣었을 때
       배포가 여기서 섰고, 그래서 그냥 켰다가 아니라 이래서 켠다가 됐다.
       - 결산, 도움말: 초대받은 서버가 뭘 할 수 있는지 알아야 한다
       - 오락실: 사람을 모으는 명령이라 **모이는 자리에서 돌아야** 뜻이 있다. 방 코드를 하나
         지어 링크를 뿌리는 것이 전부고. 판은 브라우저끼리 돌아 봇이 들고 있는 것이 없다. */
    expect(publicNames).toEqual(['결산', '도움말', '오락실']);
  });
});
