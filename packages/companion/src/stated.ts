import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { conversationOnly } from './conversation';
import type { MemoryEntry } from './types';

/**
 * 직접 들은 것 — 짐작한 것보다 무겁다.
 *
 * 기억 쪽 연구가 한결같이 짚는 것: **사람이 대놓고 말한 사실은 모델이 눈치로 알아낸 것보다
 * 무거워야 한다.** 그리고 둘이 어긋나면 **조용히 덮지 말고 드러내야** 한다.
 *
 * 우리 「아는 것」(16회차)은 전부 **두뇌가 졸여서 만든 짐작**이다. 조수님이 「나 커피 좋아해」라고
 * 직접 말해도, 나중에 졸이기가 「커피를 싫어함」이라고 써 버리면 그만이다. 33회차에 말로
 * 고치는 길을 냈지만 **고쳐 놓은 게 다시 덮이는 것**은 못 막았다.
 *
 * 그래서 **직접 들은 것을 따로 쌓는다.** 자기상(23회차)이 「얘가 저에 대해 한 말」이라면
 * 이건 그 짝인 **「조수님이 저에 대해 한 말」**이다.
 *
 * 뽑는 것도 좁게 잡는다. 아무 말이나 「사실」로 쌓으면 그건 그냥 대화 기록이다. **자기에
 * 대해 대놓고 말한 것**만 — 「나는 ~」 「내가 ~」 「난 ~」으로 시작하는 취향·상태·사정.
 */
export interface Stated {
  /** 조수님이 한 말 (그대로). */
  said: string;
  at: number;
}

/** 자기 얘기를 꺼내는 말머리. */
const 나는 = /(^|[\s,.!?])(나는|나도|난|내가|내|나 )/;

/** 사실이랄 만한 것 — 취향·상태·사정. */
const 사실꼴 = /(좋아|싫어|못 해|못해|잘 해|잘해|안 해|알레르기|먹어|안 먹|마셔|안 마셔|살아|일해|다녀|무서워|편해|불편|힘들어하|자주|보통|늘|항상|매일)/;

/** 지나가는 말 — 지금 기분이지 사실이 아니다. */
const 그때뿐 = /(오늘|지금|방금|아까|어제|이따|내일|잠깐)/;

/**
 * 묻는 말 — 사실이 아니다.
 *
 * 실측(52회차): 「내가 커피 좋아해 싫어해?」가 사실로 쌓였다. 묻는 말은 **얘한테 답을
 * 구하는 것**이지 자기에 대해 알려 주는 게 아니다. 안 빼면 물어본 것이 그대로 사실이 된다.
 */
const 묻는말 = /([?？]|좋아해 싫어해|맞아\?|아니야\?|어때\?|일까|을까|ㄹ까)/;

/**
 * 조수님이 **자기에 대해 대놓고 말한 것**을 뽑는다.
 *
 * 「오늘 피곤해」는 사실이 아니라 오늘 기분이다. **그때뿐인 말은 뺀다** — 안 빼면 「피곤함」이
 * 영구 사실로 굳는다.
 */
export function statedFacts(entries: readonly MemoryEntry[]): Stated[] {
  return conversationOnly(entries)
    .filter((e) => e.role === 'sensed')
    .filter((e) => {
      const t = e.text.trim();
      if (t.length < 5 || t.length > 80) return false;
      if (그때뿐.test(t)) return false;
      if (묻는말.test(t)) return false;
      return 나는.test(t) && 사실꼴.test(t);
    })
    .map((e) => ({ said: e.text.trim(), at: e.at }));
}

export interface StatedStoreOptions {
  path?: string;
  /** 몇 개까지 들고 있을지. */
  keep?: number;
  log?: (message: string) => void;
}

/**
 * 직접 들은 것을 쌓아 두는 곳.
 *
 * **덮어쓰지 않는다.** 같은 얘기를 또 하면 새것을 쌓되 옛것도 남긴다 — 사람은 바뀌고,
 * 바뀐 것과 처음 것이 **둘 다 보여야** 어긋남을 알아챌 수 있다.
 */
export class StatedStore {
  private facts: Stated[] = [];

  constructor(private readonly options: StatedStoreOptions = {}) {
    const path = options.path;
    if (path !== undefined && existsSync(path)) {
      try {
        this.facts = JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        this.facts = [];
      }
    }
  }

  get all(): readonly Stated[] {
    return this.facts;
  }

  /** 오간 말에서 새로 줍는다. 새로 쌓은 개수를 돌려준다. */
  learn(entries: readonly MemoryEntry[]): number {
    const 이미 = new Set(this.facts.map((f) => f.said));
    let 새것 = 0;
    for (const f of statedFacts(entries)) {
      if (이미.has(f.said)) continue;
      이미.add(f.said);
      this.facts.push(f);
      새것 += 1;
    }
    if (새것 === 0) return 0;

    const keep = this.options.keep ?? 8;
    if (this.facts.length > keep) this.facts = this.facts.slice(-keep);
    this.save();
    this.options.log?.(`직접 들은 것 ${새것}개를 쌓았다 (모두 ${this.facts.length})`);
    return 새것;
  }

  /** 잘못 쌓인 것을 지운다. */
  forget(keyword: string): boolean {
    const 전 = this.facts.length;
    this.facts = this.facts.filter((f) => f.said.includes(keyword) === false);
    if (this.facts.length === 전) return false;
    this.save();
    return true;
  }

  private save(): void {
    const path = this.options.path;
    if (path === undefined) return;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(this.facts, null, 2), 'utf8');
  }
}

/**
 * 짐작한 것(아는 것)과 **어긋나는지** 본다.
 *
 * 조용히 덮지 않는다 — 어긋나면 그걸 두뇌에 알려서 **직접 들은 쪽을 따르게** 한다.
 * 완벽하게 가릴 수는 없어서, **같은 것을 두고 좋아함/싫어함이 갈리는 자리**만 본다.
 */
export function findConflicts(facts: readonly Stated[], known: string | null): string[] {
  if (known === null || known.trim() === '') return [];

  const 어긋난것: string[] = [];
  for (const f of facts) {
    const 좋아함 = /좋아/.test(f.said);
    const 싫어함 = /싫어|안 좋아/.test(f.said);
    if (좋아함 === 싫어함) continue; // 둘 다거나 둘 다 아니면 못 가린다

    // 그 말의 알맹이 낱말이 아는 것에도 있고, 거기선 반대로 적혀 있나.
    for (const 낱말 of f.said.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)) {
      if (낱말.length < 2) continue;
      const 줄 = known.split('\n').find((l) => l.includes(낱말));
      if (줄 === undefined) continue;
      const 아는쪽좋아함 = /좋아/.test(줄);
      const 아는쪽싫어함 = /싫어|안 좋아/.test(줄);
      if (아는쪽좋아함 === 아는쪽싫어함) continue;
      if (좋아함 !== 아는쪽좋아함) {
        어긋난것.push(`직접 들은 「${f.said}」 와 아는 것의 「${줄.trim()}」 가 어긋난다`);
        break;
      }
    }
  }
  return 어긋난것;
}

/**
 * 두뇌에 넘길 한 줄.
 *
 * **직접 들은 쪽이 무겁다**고 못 박는다. 그리고 어긋나는 게 있으면 **조용히 넘기지 말고**
 * 그 사실까지 알려 준다.
 */
export function statedNote(facts: readonly Stated[], conflicts: readonly string[] = [], howMany = 3): string {
  const 보일것 = facts.slice(-howMany);
  if (보일것.length === 0) return '';

  const 줄 = 보일것.map((f) => `「${f.said.slice(0, 40)}」`).join(', ');
  const 어긋남 = conflicts.length === 0
    ? ''
    : ` 그런데 어긋나는 게 있다: ${conflicts[0]}. 직접 들은 쪽을 따라라.`;

  return (
    `조수님이 직접 말한 것: ${줄}. ` +
    `이건 네가 짐작한 것보다 무겁다 — 짐작과 다르면 이쪽이 맞다.${어긋남}`
  );
}
