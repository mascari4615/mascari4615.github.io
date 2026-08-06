/**
 * 슬래시 커맨드 등록 (Discord API에 등록하는 스크립트)
 *
 * 스키마는 `bot/slash/registry.ts` 의 엔트리(`builder`)가 단일 정본 (TASK-YB-025 slice 2).
 * 본 파일 = 레지스트리 파생 + 환경/배포 조립만. 커맨드 추가 시 여기 안 건드림.
 */
import './load-env';
import './install-console-timestamps';
import { deployApplicationCommands } from '@discord-bots/common';
import { SLASH_COMMANDS } from './bot/slash/registry';
import { loadOpsReportContext, reportDeploy } from './services/ops-self-report';

// 공개 명령(`public: true`)은 *전역* 등록 — 초대받은 서버에서도 목록에 떠야 한다.
// 나머지는 지금처럼 본진 길드에만 등록해 남의 서버 명령창을 어지럽히지 않는다.
// (전역 등록은 반영에 최대 1시간 걸릴 수 있다 — 길드 등록에도 함께 넣어 본진은 즉시 갱신.)
const publicCommands = SLASH_COMMANDS.filter((c) => c.public).map((c) => c.builder().toJSON());
const commands = SLASH_COMMANDS.map((c) => c.builder().toJSON());

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  if (!token || !clientId) {
    console.error('[Deploy] DISCORD_TOKEN 또는 CLIENT_ID가 없습니다.');
    process.exitCode = 1;
    return;
  }
  if (!guildId) {
    console.error('[Deploy] DISCORD_GUILD_ID가 없습니다. 글로벌 배포를 방지하기 위해 길드 ID가 필요합니다.');
    console.error('[Deploy] 글로벌 커맨드를 초기화하려면 npm run deploy:clear-global 을 사용하세요.');
    process.exitCode = 1;
    return;
  }
  await deployApplicationCommands({ token, clientId, commands, logPrefix: '[Deploy]', guildId, guildOnly: true });

  if (publicCommands.length > 0) {
    await deployApplicationCommands({
      token,
      clientId,
      commands: publicCommands,
      logPrefix: '[Deploy:public]',
      guildOnly: false,
    });
  }

  const opsCtx = loadOpsReportContext();
  if (opsCtx) {
    await reportDeploy(opsCtx, { count: commands.length, target: `guild:${guildId}` });
  }
}

void main();
