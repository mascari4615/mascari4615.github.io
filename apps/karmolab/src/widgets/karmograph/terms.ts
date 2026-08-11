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
    console.error(t('karmograph.t430'), e);
    return emptyTerms();
  }
}

export function saveTerms(terms: MyTerms): void {
  try {
    localStorage.setItem(TERMS_KEY, JSON.stringify(terms));
  } catch (e) {
    console.error(t('karmograph.t431'), e);
  }
}

/**
 * 새 id. 팩 id 와 절대 안 겹치게 `my-` 를 붙인다 — 겹치면 팩 정의가 내 정의를 덮어
 * 「분명 색을 골랐는데 딴 색으로 나온다」가 된다.
 */
export function newTermId(prefix: 'n' | 'e', taken: Set<string>): string {
  let n = 1;
  while (taken.has(`my-${prefix}${n}`)) n += 1;
  return `my-${prefix}${n}`;
}
