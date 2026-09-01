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
 * 채널은 **제 것**을 쓴다. 길드에 `arcade-smoke` 가 있으면 그것, 없으면 만듦.
 * 검사 부스러기를 남 보는 채널에 쌓지 않으려고 (사용자 2026-09-01).
 * 못 만들면 `data/webhook-routes.json` 의 `localDefault` 로 물러섬
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { applyYawnbotDotenvLayers } = require_('./load-dotenv-layers.cjs');
applyYawnbotDotenvLayers(ROOT);

const args = process.argv.slice(2);
const keep = args.includes('--keep');
/* indexOf 가 -1 이면 +1 이 0 이라 첫 인자를 채널로 잡음.
   실제로 --keep 이 채널 이름이 돼서 검사 채널 만들기를 건너뛰었음 (실측) */
const at = args.indexOf('--channel');
const askedChannel = at >= 0 ? args[at + 1] : undefined;

const token = process.env.DISCORD_TOKEN?.trim();
if (!token) {
  console.log('[smoke] 못 돌림: DISCORD_TOKEN 이 없다. 토큰이 있는 기계에서 돌려라');
  process.exit(2);
}

const routes = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'webhook-routes.json'), 'utf8'));
/* 여기 글은 검사 부스러기다. 남 보는 채널에 쌓이면 그 채널이 못 쓰게 됨.
   그래서 제 채널을 하나 두고 없으면 만든다 (사용자 2026-09-01) */
/* 이름은 `data/channel-spec.json` 이 정본. 여기 또 적으면 언젠가 갈라짐 */
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'channel-spec.json'), 'utf8'));
const SMOKE_CHANNEL = spec.channels.find((c) => c.key === 'arcade-smoke')?.name ?? 'arcade-smoke';
const SMOKE_TOPIC = spec.channels.find((c) => c.key === 'arcade-smoke')?.topic ?? '';
const fallbackId = (askedChannel && /^[0-9]+$/.test(askedChannel) ? askedChannel : null) ?? routes.localDefault?.[0];
if (!fallbackId) {
  console.log('[smoke] 못 돌림: 길드를 알 자리가 없다 (--channel <id> 또는 webhook-routes.json 의 localDefault)');
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

/**
 * **다시 받아온 것**으로 본다. edit 이 돌려준 것은 이쪽이 보낸 값이라,
 * 디스코드가 실제로 무엇을 저장했는지는 말해 주지 않음
 */
const reread = async (channel, id) => channel.messages.fetch({ message: id, force: true });
const labelsOf = (m) => (m.components ?? []).flatMap((row) => (row.components ?? []).map((c) => c.label ?? c.data?.label ?? ''));
const textOf = (m) => (m.embeds ?? []).map((e) => `${e.title ?? ''} ${e.description ?? ''}`).join(' ');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let msg = null;

try {
  /* login 은 READY 전에 끝난다. 그 사이에는 길드 캐시가 비어 있어
     채널의 guild 가 undefined 로 나오고, 검사 채널을 만들 자리를 못 찾는다 (실측) */
  const ready = new Promise((resolve, reject) => {
    client.once('clientReady', resolve);
    client.once('ready', resolve);
    client.once('error', reject);
  });
  await client.login(token);
  await Promise.race([ready, wait(15000)]);
  console.log(`[smoke] 붙었다: ${client.user?.tag}, 길드 ${client.guilds.cache.size}개`);

  /* 길드는 물러설 채널에서 알아냄. 검사 채널은 그 길드 안에 만듦 */
  const anchor = await client.channels.fetch(fallbackId).catch(() => null);
  check('길드를 찾는다', !!anchor?.guild, '없는 채널이거나 봇이 못 본다');

  let channel = anchor;
  if (anchor?.guild && !askedChannel) {
    const guild = anchor.guild;
    const found =
      guild.channels.cache.find((c) => c.name === SMOKE_CHANNEL && c.type === ChannelType.GuildText) ??
      (await guild.channels
        .fetch()
        .then((all) => all.find((c) => c?.name === SMOKE_CHANNEL && c.type === ChannelType.GuildText) ?? null)
        .catch(() => null));

    if (found) {
      channel = found;
      console.log(`[smoke] 검사 채널 그대로 씀: #${found.name} (${found.id})`);
    } else {
      const made = await guild.channels
        .create({
          name: SMOKE_CHANNEL,
          type: ChannelType.GuildText,
          parent: anchor.parentId ?? undefined,
          topic: SMOKE_TOPIC
        })
        .catch((e) => {
          console.log(`[smoke] 검사 채널을 못 만들었다(${e?.message ?? e}). 물러설 채널을 씀`);
          return null;
        });
      if (made) {
        channel = made;
        console.log(`[smoke] 검사 채널 새로 만듦: #${made.name} (${made.id})`);
      }
    }
  }

  check('채널을 찾는다', !!channel);
  check('보낼 수 있는 채널이다', !!channel?.isSendable?.(), '권한이 없다');

  if (channel?.isSendable?.()) {
    msg = await channel.send({
      content: '-# 연기 검사. 곧 지워집니다',
      embeds: [card('waiting')],
      components: row('waiting')
    });
    check('카드를 올린다', !!msg?.id);
    check('버튼이 하나 붙었다', msg.components?.[0]?.components?.length === 1, JSON.stringify(msg.components ?? []));

    /* 올린 것도 다시 받아와 본다. 여기까지가 디스코드에 진짜 남은 값 */
    const fresh = await reread(channel, msg.id);
    check('올린 카드에 방 코드가 있다', textOf(fresh).includes(CODE), textOf(fresh));
    check('올린 카드 버튼이 들어가기다', labelsOf(fresh).join() === '들어가기', labelsOf(fresh).join());

    await wait(700);
    const edited = await msg
      .edit({ embeds: [card('playing', '2명')], components: row('playing') })
      .then(() => true)
      .catch((e) => {
        check('두는 중으로 고친다', false, String(e?.message ?? e));
        return false;
      });
    if (edited) {
      check('두는 중으로 고친다', true);
      const after = await reread(channel, msg.id);
      check('고친 것이 진짜 남았다', textOf(after).includes('두는 중'), textOf(after));
      check('버튼 글자가 구경하기로 바뀐다', labelsOf(after).join() === '구경하기', labelsOf(after).join());
    }

    await wait(700);
    const done = await msg.edit({ embeds: [card('done', '검은 돌 이겼다')], components: [] }).catch(() => null);
    check('끝난 판으로 고친다', !!done);
    if (done) {
      const last = await reread(channel, msg.id);
      check('끝난 판은 버튼이 없다', labelsOf(last).length === 0, labelsOf(last).join());
      check('결과가 적혀 있다', textOf(last).includes('검은 돌 이겼다'), textOf(last));
    }
  }

  if (msg) {
    /* 사람 대신 이쪽이 보려면 실제로 남은 값을 봐야 함. 그림은 못 보지만 값은 전부 봄 */
    const shown = await reread(channel, msg.id).catch(() => null);
    if (shown) {
      console.log('[smoke] 지금 그 글에 남은 것:');
      console.log(
        JSON.stringify(
          {
            embeds: shown.embeds.map((e) => e.toJSON()),
            components: shown.components.map((r) => (r.components ?? []).map((c) => c.toJSON?.() ?? c.data ?? c))
          },
          null,
          2
        )
      );
    }
  }

  if (msg && !keep) {
    await wait(700);
    const gone = await msg.delete().then(() => true).catch(() => false);
    check('치운다', gone, '지우기 권한이 없다. --keep 으로 남겨 두고 손으로 지워라');
    if (gone) {
      const still = await channel.messages.fetch({ message: msg.id, force: true }).then(() => true).catch(() => false);
      check('진짜로 없어졌다', !still);
    }
  } else if (msg) {
    console.log(`[smoke] --keep 이라 글을 남겼다. 채널에서 눈으로 봐라: ${msg.url}`);
  }
} finally {
  await client.destroy();
}

console.log(failures.length ? `[smoke] ❌ ${failures.length}건 실패: ${failures.join(', ')}` : '[smoke] ✅ 전부 통과');
process.exit(failures.length ? 1 : 0);
