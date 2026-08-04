/**
 * /빌드 — WM 노트북 빌드머신 조작 (TASK-WM-197).
 *
 * 왜 봇이 하나: 빌드는 폰에서 걸 일이 많은데(자다 일어나서, 밖에서), 그때마다 깃허브
 * 앱을 열어 워크플로를 찾아 입력칸을 채우는 게 유일하게 남은 PC-스러운 단계였다.
 * 결과는 이미 디스코드로 오므로, 걸고·보고·끄는 것도 같은 자리에서 되게 한다.
 *
 * 진행/결과 카드는 이 커맨드가 만들지 않는다 — 빌드 워크플로가 #wm-build 에 직접
 * 띄우고 갱신한다 (한 사건을 두 곳에서 보고하면 반드시 어긋난다).
 */
import { MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { BotContext } from './bot-context';

const REPO = 'Mascari4615/Witch-Mendokusai';
const WORKFLOW = 'build.yml';
const ACTIONS_URL = `https://github.com/${REPO}/actions/workflows/${WORKFLOW}`;

interface WorkflowRun {
  id: number;
  status: string;
  created_at: string;
  html_url: string;
  display_title: string;
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'yawnbot',
    'Content-Type': 'application/json',
  };
}

/** 실패 사유를 그대로 보여준다 — 「실패」 한 마디로는 무엇을 고칠지 알 수 없다. */
async function describeFailure(response: Response): Promise<string> {
  let detail = `HTTP ${response.status}`;
  try {
    const body = (await response.json()) as { message?: string };
    if (body?.message) detail += ` — ${body.message}`;
  } catch {
    /* 본문이 없을 수도 있다 */
  }
  return detail;
}

async function findActiveRun(token: string): Promise<WorkflowRun | null> {
  // queued 와 in_progress 를 따로 물어본다 — status 필터는 값 하나만 받는다.
  for (const status of ['in_progress', 'queued']) {
    const response = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?status=${status}&per_page=1`,
      { headers: githubHeaders(token) },
    );
    if (!response.ok) continue;
    const body = (await response.json()) as { workflow_runs?: WorkflowRun[] };
    const run = body.workflow_runs?.[0];
    if (run) return run;
  }
  return null;
}

function elapsedMinutes(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}

function resolveToken(): string | null {
  return process.env.GH_TOKEN ?? process.env.MEMO_GITHUB_PAT ?? null;
}

export async function handleBuild(ctx: BotContext, interaction: ChatInputCommandInteraction): Promise<void> {
  const token = resolveToken();
  if (!token) {
    await interaction.reply({
      content: '깃허브 토큰이 없어서 빌드를 조작할 수 없어요 (봇 환경에 GH_TOKEN 필요).',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sub = interaction.options.getSubcommand();
  // 빌드는 30~40분 노트북을 통째로 쓴다 — 3초 응답 제한 안에 자리를 잡아두고
  // 실제 결과를 이어 붙인다.
  await interaction.deferReply();

  if (sub === '상태') {
    const run = await findActiveRun(token);
    if (!run) {
      await interaction.editReply(`지금 도는 빌드는 없어요.\n${ACTIONS_URL}`);
      return;
    }
    const word = run.status === 'queued' ? '줄 서 있어요' : `${elapsedMinutes(run.created_at)}분째 돌고 있어요`;
    await interaction.editReply(`🛠 빌드가 ${word}. 자세한 진행은 #wm-build 카드에서 볼 수 있어요.\n${run.html_url}`);
    return;
  }

  if (sub === '취소') {
    const run = await findActiveRun(token);
    if (!run) {
      await interaction.editReply('끊을 빌드가 없어요 (지금 도는 게 없습니다).');
      return;
    }
    const response = await fetch(`https://api.github.com/repos/${REPO}/actions/runs/${run.id}/cancel`, {
      method: 'POST',
      headers: githubHeaders(token),
    });
    // 202 = 취소 접수. 실제 종료는 잠시 뒤라 「끊었다」고 단정하지 않는다.
    if (response.status !== 202) {
      await interaction.editReply(`빌드를 끊지 못했어요: ${await describeFailure(response)}\n${run.html_url}`);
      return;
    }
    await interaction.editReply(
      `🛑 빌드 중단을 걸었어요. 잠시 뒤 멈추고, 노트북에 남은 유니티도 같이 정리돼요.\n` +
        `결과는 #wm-build 카드가 「취소됨」으로 바뀌는 것으로 알 수 있어요.`,
    );
    return;
  }

  // sub === '시작'
  const platform = interaction.options.getString('플랫폼', true);
  const buildType = interaction.options.getString('종류') ?? 'development';
  const cancelRunning = interaction.options.getBoolean('취소하고시작') ?? false;

  const running = await findActiveRun(token);

  const response = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: githubHeaders(token),
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          platform,
          build_type: buildType,
          publish: 'none',
          cancel_running: cancelRunning ? 'true' : 'false',
        },
      }),
    },
  );
  if (response.status !== 204) {
    await interaction.editReply(`빌드를 걸지 못했어요: ${await describeFailure(response)}\n${ACTIONS_URL}`);
    return;
  }

  // 「앞에 뭐가 있으면」이 아니라 실제로 있는지 보고 말한다 — 40분을 기다릴지 말지의
  // 판단이 걸린 정보라 추측으로 흐리면 안 된다.
  let queueNote: string;
  if (cancelRunning) {
    queueNote = running ? '진행 중이던 빌드는 끊고 시작해요.' : '';
  } else if (running) {
    queueNote = `앞에 ${elapsedMinutes(running.created_at)}분째 도는 빌드가 있어서 그게 끝난 뒤에 시작해요.`;
  } else {
    queueNote = '앞에 도는 빌드가 없어서 바로 시작해요.';
  }

  await interaction.editReply(
    `🛠 **${platform}** ${buildType} 빌드를 노트북에 걸었어요. ${queueNote}\n` +
      // 채널은 이름으로만 가리킨다 (id 를 박으면 채널 재생성 시 조용히 엉뚱한 곳).
      '진행 상황과 결과는 #wm-build 카드에서 그대로 자라요.',
  );
}
