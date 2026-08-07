/**
 * 원신 표에 넣을 자격 — **이 규칙이 정본이다** (TASK-KAR-202).
 *
 * 표를 만드는 쪽(fetch-genshin)과 낡았는지 보는 쪽(check-freshness)이 같은 규칙을 써야 한다.
 * 두 곳에 따로 적었더니 116 vs 118 로 갈려 「낡았다」는 거짓 경보가 났다.
 * 규칙을 여기 한 곳에 두고 양쪽이 불러 쓴다. 부작용이 없어야 해서 파일을 안 건드린다.
 */
export const ELEMENT = {
  Ice: '얼음', Wind: '바람', Electric: '번개', Water: '물', Fire: '불', Rock: '바위', Grass: '풀',
};
export const WEAPON = {
  WEAPON_SWORD_ONE_HAND: '한손검',
  WEAPON_CLAYMORE: '양손검',
  WEAPON_POLE: '창',
  WEAPON_BOW: '활',
  WEAPON_CATALYST: '법구',
};
export const REGION = {
  MONDSTADT: '몬드', LIYUE: '리월', INAZUMA: '이나즈마', SUMERU: '수메르',
  FONTAINE: '폰타인', NATLAN: '나타', SNEZHNAYA: '스네즈나야', FATUI: '스네즈나야',
};
export const BODY = { GIRL: '소녀', LADY: '여성', MALE: '남성', BOY: '소년', LOLI: '아이' };

export const AVATAR_URL = 'https://gi.yatta.moe/api/v2/kr/avatar';

/**
 * 표에 들어갈 캐릭터만 남긴다.
 * - 원소·무기가 없으면 속성 비교가 성립하지 않는다.
 * - **이름이 겹치면 뺀다**: 여행자는 한 이름에 원소 6 × 성별 2 = 12항목이라,
 *   두면 정답이 여럿이 되어 이름으로 맞히는 놀이가 성립하지 않는다.
 */
export function playableGenshin(list) {
  const count = {};
  for (const c of list) count[c.name] = (count[c.name] ?? 0) + 1;
  return list.filter(
    (c) => ELEMENT[c.element] && WEAPON[c.weaponType] && c.icon && c.release && count[c.name] === 1,
  );
}

export async function fetchGenshinList() {
  const raw = await (await fetch(AVATAR_URL)).json();
  return Object.values(raw.data.items);
}
