/**
 * 초대 카드가 **진짜 디스코드에서** 도는지 (사용자 2026-09-01)
 *
 * ── 왜 명령을 안 치고 이러고 있나 ─────────────────────────────
 *
 * 사람이 `/오락실` 을 치는 그 자체를 자동으로 할 길이 없음. 셋 다 막힘
 *
 *  ① 봇 토큰으로 슬래시 명령 호출: **API 가 안 열어 줌.** 봇은 명령을 받는 쪽
 *  ② 사람 토큰으로 API 호출(셀프봇): 되기는 하나 **디스코드 ToS 위반.** 자동화된
 *     사용자 계정은 금지. 걸리면 그 계정이 정지. 검사라서 봐주는 예외 없음
 *  ③ 디스코드 앱을 화면 조작으로: 결국 ②다. 입력 수단이 키보드든 API든
 *     디스코드가 보는 것은 자동화된 사용자 계정 하나
 *
 * 그래서 **명령만 빼고 나머지를 봇이 제 손으로 해 본다.** 명령 자리(옵션 읽기,
 * 방 코드 만들기, 카드 만들기)는 `arcade-invite-flow.test.ts` 가 이미 덮음
 * 여기서만 알 수 있는 것은 그 검사가 못 잡는 둘이다:
 *
 *  - **권한**. 이 채널에서 봇이 글을 올리고 제 글을 고칠 수 있나
 *  - **모양**. 카드와 버튼이 디스코드에서 실제로 그려지나 (링크 버튼의 URL 규칙 등)
 *
 * ── 하는 일 ──────────────────────────────────────────────────
 *
 * 카드를 올리고, 구경하기로 고치고, 끝난 판으로 고친 뒤 지움
 * `--keep` 을 주면 안 지운다(눈으로 보려고).
 *
 *   node scripts/smoke-arcade-invite.mjs [--keep] [--channel <id>]
 *
 * 채널을 안 주면 `data/webhook-routes.json` 의 `localDefault` 첫 자리
 * 이미 오락실 결과가 나가는 곳이라 새 채널을 안 만듦
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { applyYawnbotDotenvLayers } = require_('./load-dotenv-layers.cjs');
applyYawnbotDotenvLayers(ROOT);

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const askedChannel = args[args.indexOf('--channel') + 1];

const token = process.env.DISCORD_TOKEN?.trim();
if (!token) {
  console.log('[smoke] 못 돌림: DISCORD_TOKEN 이 없다. 토큰이 있는 기계에서 돌려라');
  process.exit(2);
}

const routes = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'webhook-routes.json'), 'utf8'));
const channelId = (askedChannel && /^\d+$/.test(askedChannel) ? askedChannel : null) ?? routes.localDefault?.[0];
if (!channelId) {
  console.log('[smoke] 못 돌림: 보낼 채널을 모른다 (--channel <id> 또는 webhook-routes.json 의 localDefault)');
  process.exit(2);
}

/* 진짜 방 코드처럼 생겼지만 아무도 안 쓰는 것. 사람이 눌러도 빈 방이라 판이 안 깨진다 */
const CODE = 'SMOKE';
const LINK = `https://yawnbot.mascari4615.com/kl/r/${CODE}?g=gomoku`;

const card = (stage, extra) =>
  new EmbedBuilder()
    .setTitle('🎮 오목 (연기 검사)')
    .setDescription(
      '방 `' + CODE + '`\n' +
        (stage === 'playing' ? '두는 중' : stage === 'done' ? '끝난 판' : '자리 기다리는 중') +
        (extra ? ', ' + extra : '')
    )
    .setColor(stage === 'done' ? 0x8b897b : stage === 'playing' ? 0xff9800 : 0x4caf50);

const row = (stage) =>
  stage === 'done'
    ? []
    : [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel(stage === 'playing' ? '구경하기' : '들어가기')
            .setStyle(ButtonStyle.Link)
            .setURL(LINK)
        )
      ];

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(ok ? `  [O] ${name}` : `  [X] ${name}. ${detail}`);
  if (!ok) failures.push(name);
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let msg = null;

try {
  await client.login(token);
  console.log(`[smoke] 붙었다: ${client.user?.tag}, 채널 ${channelId}`);

  const channel = await client.channels.fetch(channelId).catch(() => null);
  check('채널을 찾는다', !!channel, '없는 채널이거나 봇이 못 본다');
  check('보낼 수 있는 채널이다', !!channel?.isSendable?.(), '권한이 없다');

  if (channel?.isSendable?.()) {
    msg = await channel.send({
      content: '-# 연기 검사. 곧 지워집니다',
      embeds: [card('waiting')],
      components: row('waiting')
    });
    check('카드를 올린다', !!msg?.id);
    check('버튼이 하나 붙었다', msg.components?.[0]?.components?.length === 1, JSON.stringify(msg.components ?? []));

    await wait(700);
    const playing = await msg.edit({ embeds: [card('playing', '2명')], components: row('playing') }).catch((e) => {
      check('두는 중으로 고친다', false, String(e?.message ?? e));
      return null;
    });
    if (playing) {
      check('두는 중으로 고친다', true);
      check(
        '버튼 글자가 구경하기로 바뀐다',
        playing.components?.[0]?.components?.[0]?.label === '구경하기',
        JSON.stringify(playing.components?.[0]?.components?.[0] ?? {})
      );
    }

    await wait(700);
    const done = await msg.edit({ embeds: [card('done', '검은 돌 이겼다')], components: [] }).catch(() => null);
    check('끝난 판으로 고친다', !!done);
    check('끝난 판은 버튼이 없다', (done?.components?.length ?? 0) === 0);
  }

  if (msg && !keep) {
    await wait(700);
    const gone = await msg.delete().then(() => true).catch(() => false);
    check('치운다', gone, '지우기 권한이 없다. --keep 으로 남겨 두고 손으로 지워라');
  } else if (msg) {
    console.log(`[smoke] --keep 이라 글을 남겼다. 채널에서 눈으로 봐라: ${msg.url}`);
  }
} finally {
  await client.destroy();
}

console.log(failures.length ? `[smoke] ❌ ${failures.length}건 실패: ${failures.join(', ')}` : '[smoke] ✅ 전부 통과');
process.exit(failures.length ? 1 : 0);
