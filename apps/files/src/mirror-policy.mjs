/**
 * 열람 저장(R2)에 **무엇을 둘 것인가** 한 자리.
 *
 * 왜 가르나: 열람 트리는 64GB 인데 화면에서 실제로 열리는 그림·글은 1.8GB 다.
 * 나머지를 같이 두면 저장 값만 나가고 화면은 달라지지 않는다 — 영상·기타는 Drive 정본에만
 * 두고, 목록에는 그대로 뜨며 받을 때만 Drive 를 거친다.
 *
 * `hdr`·`idx` 는 이 판단 밖이다. 그게 없으면 화면이 클라우드 자체를 못 연다.
 */

/** 브라우저가 메모리에서 바로 보여 줄 수 있는 것들. `vault.mjs previewKind` 와 결이 같다. */
const MIRROR_EXT = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.txt',
  '.md',
  '.json',
  '.csv',
  '.log',
]);

/** 이 파일을 열람 저장에도 둘 것인가. 확장자만 본다 — 경로는 판단에 안 쓴다. */
export function mirrorable(rel) {
  if (typeof rel !== 'string') return false;
  const name = rel.slice(rel.lastIndexOf('/') + 1);
  const i = name.lastIndexOf('.');
  if (i <= 0) return false;
  return MIRROR_EXT.has(name.slice(i).toLowerCase());
}
