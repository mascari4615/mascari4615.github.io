/**
 * terms.ts — 내 용어 (TASK-KL-202 격차 A-2. 레퍼런스의 「🏷 用語登録」).
 *
 * 팩(`packs.ts`)은 우리가 미리 깎아 둔 어휘다. 그런데 남의 세계관은 남의 말로 굴러간다 —
 * 「계약자」·「혈맹」·「빚졌음」 같은 건 우리가 알 수 없다. 그래서 **사용자가 직접 만든
 * 종류**를 팩 뒤에 붙인다.
 *
 * 팩과 달리 **맵마다가 아니라 사람마다** 저장한다(`karmograph.terms`) — 한 번 만든 말은
 * 다음 맵에서도 쓰고 싶은 것이 정상이다.
 */
import type { NodeKindDef, EdgeKindPreset } from './packs';
import { t, loadNamespace } from '../../lib/i18n';

const TERMS_KEY = 'karmograph.terms';

export interface MyTerms {
  nodeKinds: NodeKindDef[];
  edgeKinds: EdgeKindPreset[];
}

export function emptyTerms(): MyTerms {
  return { nodeKinds: [], edgeKinds: [] };
}

export function loadTerms(): MyTerms {
  try {
    const raw = localStorage.getItem(TERMS_KEY);
    if (!raw) return emptyTerms();
    const parsed = JSON.parse(raw) as Partial<MyTerms>;
    return {
      nodeKinds: Array.isArray(parsed.nodeKinds) ? parsed.nodeKinds : [],
      edgeKinds: Array.isArray(parsed.edgeKinds) ? parsed.edgeKinds : [],
    };
  } catch (e) {
    console.error(t('karmograph.parsed.msg3'), e);
    return emptyTerms();
  }
}

/** 지운 용어의 id — 「내 목록에 없다」와 「지웠다」를 가르는 유일한 표시. */
const GONE_KEY = 'karmograph.terms.gone';

function goneTerms(): Set<string> {
  try {
    const raw = localStorage.getItem(GONE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** 용어를 지웠다고 적어 둔다 — 다른 탭의 저장이 그것을 도로 살리지 못하게. */
export function forgetTerm(id: string): void {
  try {
    localStorage.setItem(GONE_KEY, JSON.stringify([...goneTerms(), id].slice(-100)));
  } catch { /* 칸이 좁으면 포기 — 그때는 용어가 조금 되살아날 뿐이다 */ }
}

/**
 * 내 용어를 쓴다 — **다른 탭이 만든 용어를 지우지 않고** (KL-271).
 *
 * 용어는 판을 열 때 한 번 읽어 기억해 두고, 고칠 때 통째로 쓴다. 그래서 두 탭이 각자 용어를
 * 더하면 **뒤에 쓴 탭이 앞 탭의 용어를 지웠다**(실측 2026-08-14: 둘이어야 할 것이 하나). 쓰기
 * 직전에 저장소를 다시 읽어 내가 모르는 용어는 살린다 — 내가 **지운** 것만 빼고.
 */
export function saveTerms(terms: MyTerms): void {
  try {
    const stored = loadTerms();
    const gone = goneTerms();
    const keep = <T extends { id: string }>(mine: T[], theirs: T[]): T[] => {
      const has = new Set(mine.map((k) => k.id));
      return [...mine, ...theirs.filter((k) => !has.has(k.id) && !gone.has(k.id))];
    };
    const merged: MyTerms = {
      nodeKinds: keep(terms.nodeKinds, stored.nodeKinds),
      edgeKinds: keep(terms.edgeKinds, stored.edgeKinds),
    };
    localStorage.setItem(TERMS_KEY, JSON.stringify(merged));
  } catch (e) {
    console.error(t('karmograph.parsed.msg4'), e);
  }
}

/**
 * 새 id. 팩 id 와 절대 안 겹치게 `my-` 를 붙인다 — 겹치면 팩 정의가 내 정의를 덮어
 * 「분명 색을 골랐는데 딴 색으로 나온다」가 된다.
 *
 * ★ **번호만 세면 탭마다 같은 번호를 뽑는다.**
 *
 * 두 탭에서 각각 용어를 하나씩 만들면 둘 다 `my-n1` 이 되어, 합칠 때 **같은 것으로 보고 하나만
 * 남았다**(실측 2026-08-14). 시각 + 우연 값을 섞어 서로 안 밟게 한다.
 */
export function newTermId(prefix: 'n' | 'e', taken: Set<string>): string {
  for (let n = 0; n < 50; n += 1) {
    const id = `my-${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    if (!taken.has(id)) return id;
  }
  return `my-${prefix}${Date.now().toString(36)}`;
}
