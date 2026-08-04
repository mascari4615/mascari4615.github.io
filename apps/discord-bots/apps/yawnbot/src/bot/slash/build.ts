/**
 * /빌드 — WM 노트북 빌드머신 발사 (TASK-WM-197).
 *
 * 왜 봇이 하나: 빌드는 폰에서 걸 일이 많은데(자다 일어나서, 밖에서), 그때마다
 * 깃허브 앱을 열어 워크플로를 찾아 입력칸을 채우는 게 유일하게 남은 PC-스러운
 * 단계였다. 결과는 이미 디스코드로 오므로, 시작도 같은 자리에서 되게 한다.
 *
 * 진행/결과 카드는 이 커맨드가 만들지 않는다 — 빌드 워크플로가 #wm-build 에
 * 직접 띄우고 갱신한다 (한 사건을 두 곳에서 보고하면 반드시 어긋난다).
 */
import { MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { BotContext } from './bot-context';

const REPO = 'Mascari4615/Witch-Mendokusai';
const WORKFLOW = 'build.yml';
const ACTIONS_URL = `https://github.com/${REPO}/actions/workflows/${WORKFLOW}`;

interface DispatchInputs {
  platform: string;
  build_type: string;
  publish: string;
  cancel_running: string;
}

async function dispatchWorkflow(token: string, inputs: DispatchInputs): Promise<{ ok: boolean; detail: string }> {
  const response = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'yawnbot',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs }),
    },
  );
  if (response.status === 204) return { ok: true, detail: '' };
  // 실패 사유를 그대로 보여준다 — 토큰 권한 부족이 가장 흔한데, 「실패」 한 마디면
  // 무엇을 고쳐야 하는지 알 수 없다.
  let detail = `HTTP ${response.status}`;
  try {
    const body = (await response.json()) as { message?: string };
    if (body?.message) detail += ` — ${body.message}`;
  } catch {
    /* 본문이 없을 수도 있다 */
  }
  return { ok: false, detail };
}

export async function handleBuild(ctx: BotContext, interaction: ChatInputCommandInteraction): Promise<void> {
  const platform = interaction.options.getString('플랫폼', true);
  const buildType = interaction.options.getString('종류') ?? 'development';
  const cancelRunning = interaction.options.getBoolean('취소하고시작') ?? false;

  const token = process.env.GH_TOKEN ?? process.env.MEMO_GITHUB_PAT;
  if (!token) {
    await interaction.reply({
      content: '깃허브 토큰이 없어서 빌드를 걸 수 없어요 (봇 환경에 GH_TOKEN 필요).',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // 빌드는 30~40분 노트북을 통째로 쓴다 — 누른 순간 되돌릴 수 없는 비용이라
  // 응답을 먼저 잡아두고(3초 제한) 실제 발사 결과를 이어 붙인다.
  await interaction.deferReply();

  const result = await dispatchWorkflow(token, {
    platform,
    build_type: buildType,
    publish: 'none',
    cancel_running: cancelRunning ? 'true' : 'false',
  });

  if (!result.ok) {
    await interaction.editReply(`빌드를 걸지 못했어요: ${result.detail}\n${ACTIONS_URL}`);
    return;
  }

  const queueNote = cancelRunning
    ? '진행 중이던 빌드는 끊고 시작해요.'
    : '앞에 도는 빌드가 있으면 끝난 뒤에 시작해요.';
  // 채널은 이름으로만 가리킨다 — 채널 id 를 소스에 박으면 채널을 다시 만드는 순간
  // 조용히 엉뚱한 곳을 가리키게 된다.
  await interaction.editReply(
    `🛠 **${platform}** ${buildType} 빌드를 노트북에 걸었어요. ${queueNote}\n` +
      '진행 상황과 결과는 #wm-build 카드에서 그대로 자라요.',
  );
}
