/**
 * 몸이 나타나는 자리.
 *
 * desk = 떠 있는 창 · 듣기 · 말하기 (지금 face)
 * page = 긴 채팅 화면 (같은 코어, 창 배치만 다름)
 *
 * 두뇌·인격과 직교한다. 화면을 바꾼다고 누가 말하는지 바뀌지 않는다.
 */
export const SURFACE_NAMES = ['desk', 'page'] as const;
export type SurfaceName = (typeof SURFACE_NAMES)[number];

export function parseSurfaceName(raw: string | undefined): SurfaceName {
  const name = (raw ?? 'desk').trim().toLowerCase();
  return (SURFACE_NAMES as readonly string[]).includes(name) ? (name as SurfaceName) : 'desk';
}
