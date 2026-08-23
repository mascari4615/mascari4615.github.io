/**
 * **KarmoPose** — 손·폰·마우스를 한 그릇으로.
 *
 * 계약
 * - 소스가 무엇이든 판(frame) 모양은 하나: `{ t, ok, kind, point, depth, grip, buttons, raw }`
 * - **판정은 한 곳** (`gesture.mjs`) — 소스는 값만 낸다
 * - 무거운 연장(손 인식)은 **부른 쪽이 건넨다**. 안 켜면 무게 0 · 카메라 0
 * - 손은 **연속 조작**에만 쓴다 (끌기·당기기). 고르기는 마우스·자판 몫
 */
export { emptyFrame, mergeSources, pointerSource } from './source.mjs';
export { lowpass, makeSmoother, createGestures } from './gesture.mjs';
export { handToFrame, createHandSource, WRIST, THUMB_TIP, INDEX_TIP, INDEX_MCP, PINKY_MCP } from './hand.mjs';
