import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { MemoryEntry } from './types';

/**
 * 자기상 — 얘가 저에 대해 이미 한 말.
 *
 * 레퍼런스 쪽에서 오래 가는 기억을 붙인 목적이 정확히 이것이다: **몇 년에 걸쳐 자기상이
 * 흔들리지 않게.** 매번 새로 지어내면 그건 한 사람이 아니라 매번 다른 사람이다.
 *
 * 우리 얘는 **조수님은 알아도 자기를 몰랐다**(16회차에서 만든 「아는 것」은 조수님 얘기다).
 * 「뭐 좋아해?」를 두 번 물으면 두 번 다르게 답한다. 그건 인격이 아니라 그때그때의 문장이다.
 *
 * **말을 바꿔 적지 않는다.** 두뇌한테 졸이게 하면 「음악을 좋아함」 같은 요약이 남는데,
 * 다음에 그걸 보고 또 새로 지어낸다. 일관성에 필요한 건 요약이 아니라 **그때 실제로 한 말
 * 그대로**다.
 *
 * 재료도 아무 말이나 쓰지 않는다. 얘가 「내가」라고 말한 문장을 전부 긁으면 놀이 잡담이
 * 쏟아진다(실측: 자기 언급 11개 중 7개가 「내가 이겼다」류였다). **조수님이 얘에 대해 물은
 * 자리**만 센다 — 거기가 자기를 말하는 자리다.
 */
export interface SelfFact {
  /** 조수님이 뭘 물었나. */
  asked: string;
  /** 그때 얘가 뭐라 했나 (그대로). */
  answered: string;
  at: number;
}

const 나에대한물음 = /(너|네가|넌|욘|당신)/;
const 물음표 = /[?？]\s*$/;
const 물음말 = /(뭐|무엇|어때|어떤|좋아하|싫어하|누구|왜|할 줄|할줄|있어|없어|해)/;

/** 이 말이 「얘에 대한 물음」인가. */
export function asksAboutSelf(text: string): boolean {
  const t = text.trim();
  if (나에대한물음.test(t) === false) return false;
  return 물음표.test(t) || 물음말.test(t);
}

/**
 * 자기를 말한 게 아닌 대꾸 — 호응이거나 회피다.
 *
 * 처음엔 「여섯 자 넘으면 자기 얘기」로 걸렀는데, 라이브에서 **한 개도 안 잡혔다.**
 * 이 얘는 「소파…」 「이불…」처럼 세 자로 답한다 — 짧은 게 인격이다. 길이로 재면 이
 * 얘한테는 영영 자기상이 안 쌓인다. 그래서 **길이가 아니라 알맹이**로 가른다.
 */
const 알맹이없음 = /^[…\s]*(응|어|음|아|그래|글쎄|몰라|모르겠어|모르겠는데|모르겠|ㅇㅇ|넵)[…\s.?!]*$/;

/**
 * 오간 말에서 「자기를 말한 자리」를 뽑는다.
 *
 * 호응·회피는 자기를 말한 게 아니다 — 그걸 자기상으로 쌓으면 노트가 「응」으로 가득 찬다.
 */
export function selfMoments(entries: readonly MemoryEntry[], minLength = 2): SelfFact[] {
  const out: SelfFact[] = [];
  for (let i = 0; i < entries.length - 1; i += 1) {
    const 물음 = entries[i];
    const 답 = entries[i + 1];
    if (물음.role !== 'sensed' || 답.role !== 'said') continue;
    if (물음.channel === 'screen' || 물음.channel === 'nudge') continue;
    if (asksAboutSelf(물음.text) === false) continue;
    const 답한말 = 답.text.trim();
    // 그 자리에서 튀어나온 고정 대꾸는 자기를 말한 게 아니다 (23회차의 놀이 잡담 문제).
    if (답.via === 'reflex') continue;
    if (답한말.length < minLength) continue;
    if (알맹이없음.test(답한말)) continue;
    out.push({ asked: 물음.text.trim(), answered: 답한말, at: 답.at });
  }
  return out;
}

export interface SelfImageOptions {
  /** 어디에 남길지. 없으면 프로세스 안에서만 산다. */
  path?: string;
  /** 몇 개까지 들고 있을지. 많으면 인격을 덮는다. */
  keep?: number;
  log?: (message: string) => void;
}

/**
 * 자기상 — 껐다 켜도 이어진다.
 *
 * 오래된 것부터 버린다. 「예전에 이렇게 말했다」가 스무 줄이면 그건 인격이 아니라 서류다.
 */
export class SelfImage {
  private facts: SelfFact[] = [];

  constructor(private readonly options: SelfImageOptions = {}) {
    const path = options.path;
    if (path !== undefined && existsSync(path)) {
      try {
        this.facts = JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        this.facts = [];
      }
    }
  }

  /** 지금 들고 있는 것. */
  get all(): readonly SelfFact[] {
    return this.facts;
  }

  /**
   * 오간 말에서 새로 배운다. 같은 물음에 대한 답은 **옛것을 지키고 새것을 버린다.**
   *
   * 처음 한 말이 자기상이고 나중 말이 흔들린 것이다 — 새것으로 덮으면 흔들림을 붙잡아
   * 두는 게 아니라 흔들림을 따라가는 것이 된다.
   */
  learn(entries: readonly MemoryEntry[]): number {
    const 이미 = new Set(this.facts.map((f) => 다듬기(f.asked)));
    let 새것 = 0;
    for (const fact of selfMoments(entries)) {
      const 열쇠 = 다듬기(fact.asked);
      if (이미.has(열쇠)) continue;
      이미.add(열쇠);
      this.facts.push(fact);
      새것 += 1;
    }
    if (새것 === 0) return 0;

    const keep = this.options.keep ?? 6;
    if (this.facts.length > keep) this.facts = this.facts.slice(-keep);
    this.save();
    this.options.log?.(`자기상에 ${새것}개 쌓았다 (모두 ${this.facts.length})`);
    return 새것;
  }

  /** 잘못 쌓인 것을 지운다. */
  forget(keyword: string): boolean {
    const 전 = this.facts.length;
    this.facts = this.facts.filter((f) => f.answered.includes(keyword) === false && f.asked.includes(keyword) === false);
    if (this.facts.length === 전) return false;
    this.save();
    return true;
  }

  /** 두뇌에 넘길 한 줄. 없으면 빈 문자열. */
  note(): string {
    if (this.facts.length === 0) return '';
    const 줄 = this.facts.map((f) => `「${f.asked.slice(0, 24)}」 → 「${f.answered.slice(0, 40)}」`).join(' / ');
    return (
      `전에 나에 대해 이렇게 말했다: ${줄}. ` +
      '오늘 다르게 지어내지 마라 — 같은 걸 물으면 그때와 같은 사람이어야 한다. ' +
      '토씨까지 똑같이 읊으라는 건 아니다.'
    );
  }

  private save(): void {
    const path = this.options.path;
    if (path === undefined) return;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(this.facts, null, 2), 'utf8');
  }
}

/** 물음을 견주기 좋게 다듬는다 — 「뭐 좋아해?」와 「뭐 좋아해」는 같은 물음이다. */
const 다듬기 = (text: string): string => text.replace(/[\s?？!.…,]/g, '');
