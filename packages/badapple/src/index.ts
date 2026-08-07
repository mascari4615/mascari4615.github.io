/**
 * BadApple — 무엇이든 화면으로 쓴다.
 *
 * 이름은 원본 밈(Bad Apple!!)에서 왔지만 **넣는 영상은 아무거나**다. 영상 파일은 여기 없다 —
 * 쓰는 사람이 자기 것을 넣는다.
 *
 * 쓰는 순서:
 *   ① `sampleVideo` 로 영상에서 흑백 격자를 뽑고 `encode` 로 한 파일(.bab)로 굽는다
 *   ② `decode` 로 풀어 `Player` 에 넣는다
 *   ③ 그릴 곳을 `player.stage.add(...)` 로 붙인다 — 붙이고 떼는 건 언제든 자유
 *   ④ 시계 값을 주며 `player.tick(now)` 를 부른다
 *
 * 그릴 곳(표면)이 지켜야 할 약속은 `surface.ts` 에 두 개뿐이다. 도구가 사라져도 재생기는
 * 모르고 지나간다 — 그게 이 구조의 목적이다.
 */

export { decode, encode, MAGIC, type Clip, type ClipMeta, type EncodeOptions } from './format.js';
export { Player, type PlayerOptions } from './player.js';
export { Stage, type Frame } from './stage.js';
export { Registry } from './registry.js';
export { sampleVideo, type Sampled, type SampleOptions } from './sample.js';
export type { Paint, Rect, Surface, SurfaceShape } from './surface.js';
export { DomTilesSurface, type DomTilesOptions } from './surfaces/dom-tiles.js';
export { measureCandidates, pickTileGroup, pickTileGroups, type DiscoverOptions, type Measured } from './surfaces/discover.js';
export { TextSurface, type TextSurfaceOptions } from './surfaces/text.js';
export {
	bandFor,
	busyBurn,
	LoadDriver,
	LoadSurface,
	type Band,
	type Burn,
	type LoadDriverOptions,
	type LoadSurfaceOptions
} from './surfaces/load.js';
