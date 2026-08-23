/**
 * **KarmoMeaning** — 글의 뜻을 숫자로 재고, 가까운 것을 찾는다.
 *
 * 계약
 * - 이 기계에서 돈다. 열쇠·요금·하루치 없음 (바깥 API 를 부르지 않는다)
 * - 자료 모양을 모른다 — `{ id, hash, text }` 만 받고 **번호로** 답한다
 * - 곳간(cache)은 **부른 쪽이 소유**한다. 이 꾸러미는 읽고 채우기만 하고 파일을 안 만든다
 * - 열쇠에 모델 이름이 들어간다 — 모델을 갈면 옛 벡터를 안 집는다
 */
export { LOCAL_MODEL, LOCAL_CHUNK, LOCAL_MAX_CHUNKS, chunk, getExtractor, embedTexts, embedAll } from './embed.mjs';
export { removeSharedBias, toBiasedSpace } from './bias.mjs';
export { nearest } from './near.mjs';
