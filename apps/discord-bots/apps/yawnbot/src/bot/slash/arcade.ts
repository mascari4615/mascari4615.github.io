/**
 * `/오락실`. 채널에서 방을 열고 **문패 링크**를 뿌린다 (TASK-KL-264 D4)
 *
 * 사람을 모으는 자리는 디스코드다. 그런데 지금은 누군가 사이트를 열고, 방을 만들고, 링크를
 * 복사해서, 채널에 붙여야 한다. 네 걸음이다. 놀자는 말을 꺼내는 데 드는 비용이 노는 비용보다
 * 크면 아무도 안 꺼낸다.
 *
 * 여기서는 한 걸음이다: `/오락실 오목` → 방 코드가 생기고 문패 링크가 채널에 뜬다.
 * 누르면 그 방으로 들어간다.
 *
 * **방을 서버가 들고 있지 않다.** 코드만 만들어 준다. 판은 브라우저끼리(P2P) 돌고, 봇은
 * 이 코드로 모이자고 말할 뿐이다. 그래서 봇이 죽어도 이미 뿌린 링크는 그대로 산다.
 */
import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PKG_ROOT } from '../../paths';

const CARD = 'https://yawnbot.mascari4615.com/kl/r';

/**
 * 방 코드 알파벳. 사이트(`apps/karmolab/src/lib/room.ts`)와 **같아야 한다.**
 * 0/O 와 1/I 가 빠져 있다: 사람이 소리 내어 읽어 주는 코드라 헷갈리는 글자를 안 쓴다.
 * 여기서 다른 알파벳을 쓰면 봇이 만든 방을 사이트가 못 알아보는 것이 아니라. 알아는 보되
 * 사람이 손으로 옮겨 적을 때만 틀린다. 그래서 더 나쁘다(가끔만 안 된다).
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeCode(len = 5): string {
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** 놀이 이름표. 같은 저장소의 말 묶음이 정본. 없으면 빈 표(그래도 명령은 돈다). */
export function loadGames(): Array<{ id: string; name: string }> {
  try {
    const file = path.join(PKG_ROOT, '..', '..', '..', 'karmolab', 'i18n', 'ko', 'arcade.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
    const out: Array<{ id: string; name: string }> = [];
    for (const [k, v] of Object.entries(raw)) {
      const m = /^arcade\.game\.([a-z0-9]+)\.name$/.exec(k);
      if (m) out.push({ id: m[1], name: v });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  } catch {
    return [];
  }
}

export function buildArcade(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('오락실')
    .setDescription('오락실 방을 열고 링크를 뿌린다')
    .addStringOption((opt) =>
      opt
        .setName('놀이')
        .setDescription('무엇을 할까 (안 고르면 아무거나)')
        .setAutocomplete(true)
        .setRequired(false),
    ) as SlashCommandBuilder;
}

export async function arcadeAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const q = String(interaction.options.getFocused()).toLowerCase();
  const games = loadGames();
  await interaction.respond(
    games
      .filter((g) => g.name.toLowerCase().includes(q) || g.id.includes(q))
      .slice(0, 25)
      .map((g) => ({ name: g.name, value: g.id })),
  );
}

export async function handleArcade(interaction: ChatInputCommandInteraction): Promise<void> {
  const games = loadGames();
  const asked = interaction.options.getString('놀이') ?? '';
  /* **아는 놀이만 링크에 싣는다.** 주소에 그대로 들어가는 값이라, 아무 글자나 받으면
     남의 말을 우리가 하게 된다(문패 라우트에서도 같은 자리를 막았다). */
  const found = games.find((g) => g.id === asked);
  const pick = found ?? (games.length ? games[Math.floor(Math.random() * games.length)] : null);
  const code = makeCode();
  const link = pick ? `${CARD}/${code}?g=${encodeURIComponent(pick.id)}` : `${CARD}/${code}`;

  await interaction.reply({
    content:
      (pick ? `🎮 **${pick.name}**, 방 \`${code}\`` : `🎮 오락실, 방 \`${code}\``) +
      '\n' + link +
      '\n-# 눌러서 들어오면 됩니다. 자리가 비면 봇이 앉아요.',
  });
}
