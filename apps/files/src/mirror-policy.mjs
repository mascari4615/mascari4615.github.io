/**
 * 열람 저장(R2)에 **무엇을 둘 것인가** 한 자리.
 *
 * 왜 가르나: 열람 트리는 64GB 인데 화면에서 실제로 열리는 것은 그보다 훨씬 작다.
 * 나머지를 같이 두면 저장 값만 나가고 화면은 달라지지 않는다.
 *
 * 영상은 **크기로 한 번 더 가른다** (2026-08-29). 실측하니 1,031개 31.4GB 인데
 * 100MB 이하가 **997개(97%)·13.1GB** 다 — 덩치는 큰 몇 개가 먹는다(5.0GB·4.3GB·1.7GB).
 * 게다가 화면은 파일을 **통째로 받아 복호**하므로, 큰 영상은 올려 봐야 브라우저가 못 버틴다.
 * 그래서 97%를 열어 주고 나머지는 「여기서는 못 봅니다」로 정직하게 말하는 쪽을 택했다.
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

/** 크기가 받쳐 줄 때만 싣는 것 — 영상. */
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv']);

/** 이 크기를 넘는 영상은 안 싣는다. 통째로 받아 복호하는 화면이 감당하는 선. */
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

function extOf(rel) {
  const name = rel.slice(rel.lastIndexOf('/') + 1);
  const i = name.lastIndexOf('.');
  return i <= 0 ? '' : name.slice(i).toLowerCase();
}

/** 화면이 이 파일을 열 수 있는 갈래인가 (크기는 안 본다). */
export function playableKind(rel) {
  if (typeof rel !== 'string') return false;
  const e = extOf(rel);
  return MIRROR_EXT.has(e) || VIDEO_EXT.has(e);
}

/**
 * 이 파일을 열람 저장에도 둘 것인가.
 * @param {string} rel 경로
 * @param {number} [size] 바이트. 영상일 때만 쓴다 — 모르면 **안 싣는다**(크기를 모른 채
 *   5GB 를 올리는 것보다, 안 올리고 화면이 「못 본다」고 말하는 편이 낫다).
 */
export function mirrorable(rel, size) {
  if (typeof rel !== 'string') return false;
  const e = extOf(rel);
  if (MIRROR_EXT.has(e)) return true;
  if (!VIDEO_EXT.has(e)) return false;
  return typeof size === 'number' && size <= VIDEO_MAX_BYTES;
}
