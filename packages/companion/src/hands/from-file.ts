import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

import type { Hand } from '../hands';

/**
 * 파일로 손 늘리기 — 코드를 안 고치고 할 수 있는 일을 더한다.
 *
 * 레퍼런스 쪽 얼개에서 배운 것: **곁가지 확장.** 알맹이(core)를 손대지 않고 옆에서 능력을
 * 더할 수 있어야 한다. 그래야 만든 사람이 아니어도 늘릴 수 있다.
 *
 * 우리는 인격을 이미 파일로 갈아끼운다(`characters/*.md`). 그런데 **손은 코드에 박혀
 * 있었다** — 새 손을 하나 더하려면 데모 파일을 고쳐야 했다. 인격은 파일이고 손은 코드인
 * 이유가 없다.
 *
 * **다만 아무거나 실행하게 열지 않는다.** 손이 위험한 건 처음부터 알고 있었고(그래서 지금껏
 * 할 수 있는 일을 하나씩 쥐여줬다), 파일로 늘린다고 그 원칙이 바뀌지는 않는다. 파일로 만들 수
 * 있는 건 **정해진 몇 가지 갈래**뿐이고, 전부 **읽기만** 한다. 「이 명령을 실행해라」 같은
 * 갈래는 두지 않았다 — 그건 파일 하나로 아무 프로그램이나 돌릴 수 있다는 뜻이고, 그 문은
 * 사람이 직접 열어야 한다.
 */
export type HandKind = 'read-file' | 'read-dir';

export interface HandSpec {
  name: string;
  /** 무슨 일인지 — 그대로 두뇌에 간다. */
  what: string;
  /** 무엇을 넘겨야 하는지. */
  needs?: string;
  kind: HandKind;
  /** 읽을 파일이나 폴더. */
  path: string;
  /** 찾아온 것을 보고 다시 생각해야 하나. 읽는 손은 대개 그렇다. */
  feedsBack?: boolean;
  /** 얼마나 읽을지 (글자 수 / 파일 개수). */
  limit?: number;
  /**
   * **언제 쓸지** — 이 말들이 나오면 미리 써 둔다.
   *
   * 43회차에 손을 두뇌가 아니라 우리가 미리 쓰도록 바꿨는데, 그 「언제 쓸지」가 **코드에
   * 박혀 있었다.** 그래서 파일로 손을 더해도 자동으로는 영영 안 쓰였다 — 능력만 있고
   * 쓰임이 없으면 없는 것과 같다.
   *
   * 도구 명세에 「어떤 말이 나오면 이걸 쓴다」를 같이 적는 건 도구 라우팅 쪽의 흔한
   * 방식이다. 정규식이 아니라 **낱말·구절 목록**으로 둔다 — 사람이 적을 것이니 쉬워야 한다.
   */
  when?: string[];
}

export interface FromFileOptions {
  /** 이 폴더 밖은 못 읽는다. 안 주면 어디든 읽는다(내 컴퓨터니 기본은 열어 둔다). */
  within?: string;
  log?: (message: string) => void;
}

/** 적어 둔 것이 손 명세로 쓸 만한가. */
export function readSpec(raw: unknown): HandSpec | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const x = raw as Record<string, unknown>;
  if (typeof x.name !== 'string' || x.name.trim() === '') return null;
  if (typeof x.what !== 'string' || x.what.trim() === '') return null;
  if (x.kind !== 'read-file' && x.kind !== 'read-dir') return null;
  if (typeof x.path !== 'string' || x.path.trim() === '') return null;

  return {
    name: x.name.trim(),
    what: x.what.trim(),
    needs: typeof x.needs === 'string' ? x.needs : '(없어도 된다)',
    kind: x.kind,
    path: x.path.trim(),
    feedsBack: x.feedsBack !== false,
    limit: typeof x.limit === 'number' && x.limit > 0 ? x.limit : undefined,
    when: Array.isArray(x.when)
      ? x.when.filter((w): w is string => typeof w === 'string' && w.trim() !== '').map((w) => w.trim())
      : undefined,
  };
}

/** 이 경로가 울타리 안인가. */
export function insideFence(path: string, fence?: string): boolean {
  if (fence === undefined) return true;
  const 울타리 = resolve(fence);
  const 대상 = resolve(path);
  return 대상 === 울타리 || 대상.startsWith(울타리 + (울타리.endsWith('\\') || 울타리.endsWith('/') ? '' : '\\'))
    || 대상.startsWith(`${울타리}/`);
}

/** 명세 하나를 실제 손으로. 울타리 밖이면 null. */
export function handFrom(spec: HandSpec, options: FromFileOptions = {}): Hand | null {
  if (insideFence(spec.path, options.within) === false) {
    options.log?.(`「${spec.name}」 은 울타리 밖이라 안 만든다: ${spec.path}`);
    return null;
  }

  return {
    name: spec.name,
    what: spec.what,
    needs: spec.needs ?? '(없어도 된다)',
    feedsBack: spec.feedsBack,
    async run(argument: string): Promise<string> {
      try {
        if (spec.kind === 'read-file') {
          if (existsSync(spec.path) === false) return `${spec.path} 가 없다.`;
          const 글 = readFileSync(spec.path, 'utf8');
          const 몇자 = spec.limit ?? 2000;
          // 넘긴 말이 있으면 그 말이 든 줄만 — 파일이 크면 통째로 주는 게 오히려 방해다.
          const 고른것 = argument.trim() === ''
            ? 글
            : 글.split('\n').filter((l) => l.includes(argument.trim())).join('\n');
          const 낼것 = (고른것.trim() === '' ? 글 : 고른것).slice(0, 몇자);
          return 낼것.trim() === '' ? '비어 있다.' : 낼것;
        }

        if (existsSync(spec.path) === false) return `${spec.path} 가 없다.`;
        const 몇개 = spec.limit ?? 40;
        const 것들 = readdirSync(spec.path)
          .filter((n) => argument.trim() === '' || n.includes(argument.trim()))
          .slice(0, 몇개)
          .map((n) => {
            try {
              return statSync(join(spec.path, n)).isDirectory() ? `${n}/` : n;
            } catch {
              return n;
            }
          });
        return 것들.length === 0 ? '아무것도 없다.' : 것들.join('\n');
      } catch (e) {
        // 손이 고장 나도 대화는 이어져야 한다.
        return `못 읽었다: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };
}

/**
 * 명세에 적힌 「언제 쓸지」를 힌트로 바꾼다. 안 적었으면 null.
 *
 * 낱말을 그대로 찾는다 — 사람이 적은 말에 정규식 특수문자가 있어도 터지지 않게 막아 둔다.
 */
export function hintFrom(spec: HandSpec): { hand: string; when: RegExp } | null {
  if (spec.when === undefined || spec.when.length === 0) return null;
  const 막은것 = spec.when.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return { hand: spec.name, when: new RegExp(`(${막은것.join('|')})`) };
}

/**
 * 폴더 안의 손 명세들을 읽어 손으로 만든다.
 *
 * **못 읽은 것은 조용히 넘기지 않는다.** 오타 하나로 손이 사라지면 왜 안 되는지 알 길이
 * 없다 — 무엇이 왜 빠졌는지 남긴다.
 */
export function loadHands(dir: string, options: FromFileOptions = {}): { hands: Hand[]; hints: { hand: string; when: RegExp }[] } {
  if (existsSync(dir) === false) return { hands: [], hints: [] };

  const 손들: Hand[] = [];
  const 힌트들: { hand: string; when: RegExp }[] = [];
  const 이름들 = new Set<string>();
  for (const file of readdirSync(dir).sort()) {
    if (extname(file) !== '.json') continue;
    const path = join(dir, file);

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      options.log?.(`${file} 을 못 읽었다: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    const spec = readSpec(raw);
    if (spec === null) {
      options.log?.(`${file} 은 손 명세로 안 보인다 (이름·설명·갈래·경로가 있어야 한다)`);
      continue;
    }
    if (이름들.has(spec.name)) {
      options.log?.(`${file} 의 「${spec.name}」 은 이름이 겹쳐 건너뛴다`);
      continue;
    }

    const hand = handFrom(spec, options);
    if (hand === null) continue;
    이름들.add(spec.name);
    손들.push(hand);

    const hint = hintFrom(spec);
    if (hint !== null) 힌트들.push(hint);
    else options.log?.(`「${spec.name}」 은 언제 쓸지를 안 적어서 저절로는 안 쓰인다`);
  }

  if (손들.length > 0) options.log?.(`파일에서 손 ${손들.length}개를 더했다: ${손들.map((h) => h.name).join(', ')}`);
  return { hands: 손들, hints: 힌트들 };
}
