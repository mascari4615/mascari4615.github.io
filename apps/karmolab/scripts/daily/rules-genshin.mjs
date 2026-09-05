/**
 * 표에 넣을 자격. **이 규칙이 정본** (TASK-KAR-202).
 *
 * 표를 만드는 쪽과 낡았는지 보는 쪽이 같은 규칙을 써야 함
 * 두 곳에 따로 적었더니 116 대 118 로 갈려 거짓 경보가 남
 * 규칙은 여기 한 곳. 양쪽이 불러 씀. 부작용이 없어야 해서 파일을 안 건드림
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
 * 표에 들어갈 것만 남김
 * - 원소나 무기가 없으면 속성 비교가 성립 안 함
 * - **이름이 겹치면 뺀다**: 여행자는 한 이름에 원소 여섯과 성별 둘로 12항목이라,
 *   두면 정답이 여럿이라 이름으로 맞히는 놀이가 성립 안 함
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
