/**
 * 놀이가 고를 수 있는 표 한 목록 (TASK-KL-150 ②).
 *
 * 왜 있나: 표를 올릴 수 있게 됐는데(KL-150), 정작 **놀이 화면에서는 남의 표가 안 보였다**.
 * 놀이들은 저마다 `loadPacks()`(이 브라우저)만 읽고 판 목록을 그렸기 때문이다. 그러면 올리는
 * 것은 「자랑용」에 그치고, 표 하나가 놀이 여럿을 켜는 일이 안 일어난다.
 *
 * 그래서 「고를 수 있는 표」를 여기 한 벌만 둔다 — 놀이마다 다시 짜면 그날부터 갈라진다
 * (실제로 「높은 쪽 고르기」와 「스무고개」가 이미 같은 코드를 두 벌 갖고 있었다).
 *
 * 고르는 순간까지 **표 전체는 안 받는다**. 목록은 요약만 받고, 실제로 고른 하나만 받아
 * 이 브라우저로 들인다(`ensureLocal`) — 놀이들은 지금까지처럼 이 브라우저 표를 읽으면 된다.
 */
import { loadPacks, type Pack } from '../widgets/pack-store';
import { adoptShared, listShared } from './shared-packs';

export interface PackChoice {
  /** 놀이가 쓰는 판 이름. 이 브라우저 표면 `pack:<로컬id>`, 아직 안 받은 남의 표면 `shared:<주소>`. */
  id: string;
  title: string;
  emoji: string;
  /** 아직 이 브라우저에 없는 표인가 (고르면 그때 받는다). */
  remote: boolean;
  /** 누가 올린 표인가 — 목록에서 「남의 표」임을 말할 수 있게. */
  owner?: string;
}

/** 놀이가 표에 요구하는 것. `number` = 견줄 숫자 칸 · `image` = 그림. */
export type PackNeeds = 'number' | 'image';

function meets(pack: Pack, needs: PackNeeds): boolean {
  return needs === 'number'
    ? pack.fields.some((f) => f.kind === 'number')
    : pack.items.filter((i) => typeof i.img === 'string' && i.img).length >= 4;
}

/** 이 브라우저에 있는 표. 서버를 안 기다리므로 화면이 **먼저** 찬다. */
export function localChoices(needs: PackNeeds): PackChoice[] {
  return loadPacks()
    .filter((p) => meets(p, needs))
    .map((p) => ({ id: `pack:${p.id}`, title: p.title, emoji: p.emoji, remote: false }));
}

/**
 * 남이 올린 표. 이미 이 브라우저에 이어받아 둔 것은 **빼고** 준다 — 안 그러면 같은 표가
 * 목록에 두 번 선다(하나는 내 것, 하나는 남의 것으로).
 */
export async function sharedChoices(needs: PackNeeds, limit = 20): Promise<PackChoice[]> {
  const got = await listShared({ needs, sort: 'popular', limit });
  if (!got) return [];
  const already = new Set(loadPacks().map((p) => p.sharedId).filter(Boolean));
  return got.packs
    .filter((r) => !already.has(r.id))
    .map((r) => ({ id: `shared:${r.id}`, title: r.title, emoji: r.emoji, remote: true, owner: r.ownerHandle }));
}

/**
 * 고른 표를 **실제로 쓸 수 있게** 만든다.
 *
 * 이 브라우저 표면 그대로. 남의 표면 그때 받아 들인다(이어받기와 같은 문 — 순위판은 올라간
 * 주소로 갈리므로 같은 표로 논 사람끼리 한 판에서 만난다).
 *
 * @returns 놀이가 쓸 판 이름(`pack:<로컬id>`). 못 받으면 null.
 */
export async function ensureLocal(choiceId: string): Promise<string | null> {
  if (choiceId.indexOf('pack:') === 0) return choiceId;
  if (choiceId.indexOf('shared:') !== 0) return null;
  const adopted = await adoptShared(choiceId.slice(7));
  return adopted ? `pack:${adopted.id}` : null;
}
