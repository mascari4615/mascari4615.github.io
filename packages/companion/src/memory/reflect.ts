import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { MemoryEntry } from '../types';

/**
 * 되새김 — 오간 말에서 **바로 안 보이는 것**을 스스로 짚는다.
 *
 * 기억을 세 겹으로 쌓아 왔다. 최근 몇 마디 · 졸여 만든 **사실 목록** · 감정이 실린
 * **그때 그 일**. 셋 다 **일어난 일**이다. 없는 건 그 위에 얹히는 것 — 「그래서 뭐가
 * 보이나」다.
 *
 * 레퍼런스(Generative Agents)가 기억을 셋으로 나누는데(담기·꺼내기·**되새김**) 우리는 앞의
 * 둘만 했다(73·74회차). 되새김은 요약이 아니다. 요약은 있던 걸 줄이지만, 되새김은 **없던
 * 문장을 만든다** — 「요즘 조수님은 막힌 얘기를 밤에만 꺼낸다」 같은 것. 사실 목록을 아무리
 * 잘 졸여도 저 문장은 안 나온다.
 *
 * 곁에 오래 있는 존재와 그냥 잘 받아 적는 도구를 가르는 게 이 자리다.
 *
 * **지어내지 못하게 묶는다.** 되새김은 헛것이 나오기 가장 쉬운 자리다 — 그럴듯하고,
 * 틀려도 티가 안 나고, 한 번 적히면 계속 재료로 실린다. 그래서 셋을 요구한다:
 * **근거로 삼은 말을 같이 대라** · 못 대면 버린다 · 조수님에 대한 것만(얘 자신의 성향을
 * 조수님 것으로 적는 사고를 이미 네 번 밟았다).
 */

export interface 깨달음 {
  /** 짚어 낸 것. */
  what: string;
  /** 어디서 봤나 — 근거로 삼은 말 조각들. */
  evidence: readonly string[];
  at: number;
}

export interface 되새김옵션 {
  path?: string;
  /** 몇 개까지 들고 있을까. */
  keep?: number;
  /** 새 사람 말이 이만큼 쌓이면 한 번 되새긴다. */
  마다?: number;
  ask?: (exchange: readonly MemoryEntry[], alreadyKnown: readonly string[]) => Promise<readonly 깨달음[] | null>;
  log?: (message: string) => void;
}

export class reflection {
  private list: 깨달음[] = [];
  private countedText = 0;
  private readonly options: Required<Pick<되새김옵션, 'keep' | '마다'>> & 되새김옵션;

  constructor(options: 되새김옵션 = {}) {
    this.options = { keep: 12, 마다: 12, ...options };
    if (options.path !== undefined && existsSync(options.path)) {
      try {
        const raw = JSON.parse(readFileSync(options.path, 'utf8')) as 깨달음[];
        if (Array.isArray(raw)) this.list = raw.filter((x) => typeof x?.what === 'string');
      } catch {
        // 깨진 파일 때문에 대화가 멈추면 안 된다.
      }
    }
  }

  get all(): readonly 깨달음[] {
    return this.list;
  }

  /** 사람 말이 몇 마디 더 쌓였다. 되새길 때가 됐으면 true. */
  calc(exchange2: readonly MemoryEntry[]): boolean {
    this.countedText = exchange2.filter((e) => e.role === 'sensed' && e.channel === 'web').length;
    return this.셀때인가;
  }

  get 셀때인가(): boolean {
    return this.options.ask !== undefined && this.countedText >= this.options.마다;
  }

  /**
   * 되새긴다. **말하는 길에서 부르지 않는다** — 오래 걸리고, 늦어도 아무도 안 아프다.
   *
   * 이미 짚은 것은 다시 짚지 않게 넘겨 준다. 안 넘기면 같은 말을 여러 번 적어 놓고
   * 그게 재료 자리를 다 먹는다.
   */
  async reflect(exchange3: readonly MemoryEntry[]): Promise<number> {
    const ask2 = this.options.ask;
    if (ask2 === undefined) return 0;
    if (exchange3.length === 0) return 0;
    this.countedText = 0;

    let produced: readonly 깨달음[] | null = null;
    try {
      produced = await ask2(exchange3, this.list.map((x) => x.what));
    } catch (err) {
      this.options.log?.(`되새기다 실패 — ${(err as Error)?.message ?? err}`);
      return 0;
    }
    if (produced === null) return 0;

    let storedCount = 0;
    for (const x of produced) {
      const what = String(x?.what ?? '').trim();
      const evidence = (x?.evidence ?? []).map((s) => String(s).trim()).filter((s) => s !== '');
      // **근거를 못 대면 버린다.** 되새김은 헛것이 가장 잘 나오는 자리다.
      if (what === '' || evidence.length === 0) {
        if (what !== '') this.options.log?.(`근거가 없어 버렸다 — 「${what.slice(0, 40)}」`);
        continue;
      }
      if (this.has(what)) continue;
      this.list.push({ what: what, evidence: evidence, at: x?.at ?? Date.now() });
      storedCount += 1;
    }
    if (storedCount === 0) return 0;
    if (this.list.length > this.options.keep) this.list = this.list.slice(-this.options.keep);
    this.save();
    this.options.log?.(`${storedCount}가지를 새로 짚었다 — ${this.list.slice(-storedCount).map((x) => x.what).join(' / ')}`);
    return storedCount;
  }

  /** 이미 같은 걸 짚었나 — 글자 그대로가 아니라 **겹치는 낱말**로 본다. */
  private has(what2: string): boolean {
    const fresh = new Set(word(what2));
    if (fresh.size === 0) return false;
    return this.list.some((existing) => {
      const overlap = word(existing.what).filter((w) => fresh.has(w)).length;
      return overlap >= Math.max(2, Math.floor(fresh.size * 0.6));
    });
  }

  forget(chunk: string): boolean {
    const before = this.list.length;
    this.list = this.list.filter((x) => x.what.includes(chunk) === false);
    if (this.list.length === before) return false;
    this.save();
    return true;
  }

  private save(): void {
    if (this.options.path === undefined) return;
    try {
      mkdirSync(dirname(this.options.path), { recursive: true });
      writeFileSync(this.options.path, JSON.stringify(this.list, null, 1), 'utf8');
    } catch {
      // 못 남겨도 이번 판에서는 안다.
    }
  }
}

function word(text: string): string[] {
  return (text.toLowerCase().match(/[가-힣a-z0-9]{2,}/g) ?? []).map((w) => w.slice(0, 2));
}

/**
 * 두뇌에 얹을 한 줄 — **지금 얘기와 이어질 때만.**
 *
 * 늘 붙이면 얘가 사람을 계속 분석하는 꼴이 된다. 그건 곁에 있는 게 아니라 지켜보는 것이다.
 */
export function reflectionNote(store: reflection, currentText: string): string {
  const now2 = new Set(word(currentText));
  if (now2.size === 0) return '';
  const flagged = store.all
    .map((x) => ({ x, overlap: word(x.what).filter((w) => now2.has(w)).length }))
    .filter((r) => r.overlap >= 2)
    .sort((a, b) => b.overlap - a.overlap || b.x.at - a.x.at)[0];
  if (flagged === undefined) return '';
  return (
    `여태 보아 온 것 하나: ${flagged.x.what} ` +
    '지금 얘기와 이어지면 아는 티를 조금만 내라 — 짚어 주듯 말하지 말고, 캐묻지도 마라.'
  );
}

/** 두뇌에게 「바로 안 보이는 것 하나를 짚어라」를 묻는 자리. */
export function askReflection(ask: (prompt: string) => Promise<string | null>) {
  return async (exchange4: readonly MemoryEntry[], alreadyKnown2: readonly string[]) => {
    const conversation = exchange4
      .filter((e) => e.channel === 'web')
      .slice(-60)
      .map((e) => `${e.role === 'said' ? '나(동반자)' : '조수님'}: ${e.text.replace(/\s+/g, ' ').slice(0, 120)}`)
      .join('\n');
    if (conversation.trim() === '') return null;
    const already = alreadyKnown2.length === 0 ? '' : `이미 짚어 둔 것(다시 짚지 마라):\n${alreadyKnown2.map((x) => `- ${x}`).join('\n')}\n\n`;
    const answer = await ask(
      `${already}최근에 오간 말:\n${conversation}\n\n` +
        '위를 읽고 **한 마디만 봐서는 안 보이는 것**을 한두 가지 짚어라. 규칙:\n' +
        '- 요약하지 마라. 여러 마디에 걸쳐야 보이는 것만.\n' +
        '- **조수님에 대한 것만.** 「나(동반자)」가 한 말은 단서로만 써라 — 거기 드러난 내 성향을 조수님 것으로 적지 마라.\n' +
        '- 짚을 게 없으면 아무것도 내지 마라. 억지로 만들지 마라.\n' +
        '- 각 줄은 `짚은 것 || 근거가 된 말 조각 ; 또 다른 조각` 꼴로. 근거는 위 대화에 실제로 있는 말이어야 한다.\n' +
        '- 설명·머리말 없이 그 줄들만. 많아야 두 줄.',
    );
    if (answer === null) return null;
    const produced2: 깨달음[] = [];
    for (const line of answer.split('\n')) {
      const [무엇, evidences] = line.split('||');
      if (evidences === undefined) continue;
      produced2.push({
        what: 무엇.replace(/^[-*\d.\s]+/, '').trim(),
        evidence: evidences.split(';').map((s) => s.trim()).filter((s) => s !== ''),
        at: Date.now(),
      });
    }
    return produced2;
  };
}
