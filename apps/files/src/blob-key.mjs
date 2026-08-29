/**
 * Worker 가 내줄 수 있는 키인가.
 *
 * 왜 따로 뺐나: 이 규칙이 worker.mjs 안에 정규식 한 줄로 박혀 있었고, 미리보기(`t/<id>`)를
 * 새로 담은 날 그 줄을 같이 안 고쳤다. 배포됐으면 미리보기가 전부 400 이었다.
 * 시험이 붙을 수 있는 자리로 옮긴다.
 *
 * 규칙은 **허용 목록**이다. 아는 모양만 통과시킨다. 버킷의 다른 자리를 주소로 훑는 것을
 * 막는 것이 목적이라, 새 갈래를 담을 때는 여기를 같이 고쳐야 한다.
 */

/** 열쇠 재료와 색인. 파일이 늘 때마다 바뀐다 */
const FIXED = new Set(['hdr', 'idx']);

/** 청크 `c/<id>/<n>`, 미리보기 `t/<id>`. id 는 hex */
const CHUNK = /^c\/[0-9a-f]+\/\d+$/;
const THUMB = /^t\/[0-9a-f]+$/;

export function allowedKey(key) {
    if (typeof key !== 'string' || key === '') return false;
    if (FIXED.has(key)) return true;
    return CHUNK.test(key) || THUMB.test(key);
}

/** 이 키를 오래 잡아 둬도 되나. 한 번 쓰이면 안 바뀌는 것만 */
export function immutableKey(key) {
    return CHUNK.test(key) || THUMB.test(key);
}
