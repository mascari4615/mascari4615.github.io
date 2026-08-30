/**
 * 휴지통. 지운 것으로 **표시만** 하고 청크는 그대로 둔다.
 *
 * 왜 색인(`idx`) 안에 안 넣나: 화면은 R2 만 본다. 화면이 R2 의 색인을 고쳐도,
 * 다음 PC 전송기는 Drive 의 옛 색인을 읽어 그대로 덮어쓴다. 표시가 조용히 사라진다.
 * 그래서 **딴 자리**(`trash`)에 둔다. 색인은 PC 만 쓰고, 휴지통은 화면도 쓴다.
 * 서로 안 밟는다.
 *
 * 곁따라오는 것: 화면이 쓸 수 있는 키가 `trash` 하나뿐이라 공격면이 좁다.
 * 최악이라야 파일이 목록에서 사라지는 것이고, 그건 되살리면 그만이다.
 * 열쇠 재료와 색인과 암호문은 화면에서 못 건드린다.
 *
 * 영영 지우기(청크 삭제)는 여기 없다. 그것은 PC 에서만 한다 (`empty-trash.mjs`).
 */

/** 담기는 모양. 경로마다 버린 시각(ms) */
export function emptyTrash() {
    return { v: 1, items: {} };
}

/** 낯선 판이나 깨진 값이 와도 화면이 안 죽게 */
export function normalizeTrash(raw) {
    if (!raw || typeof raw !== 'object' || !raw.items || typeof raw.items !== 'object') {
        return emptyTrash();
    }
    const items = {};
    for (const [path, at] of Object.entries(raw.items)) {
        if (typeof path === 'string' && path && Number.isFinite(at) && at > 0) items[path] = at;
    }
    return { v: 1, items };
}

export function inTrash(trash, path) {
    return Object.prototype.hasOwnProperty.call(trash.items, path);
}

/** 버리기. 이미 있으면 시각을 안 덮는다. 처음 버린 때가 알고 싶은 값이다 */
export function putTrash(trash, paths, at = Date.now()) {
    const items = { ...trash.items };
    for (const p of paths) {
        if (typeof p !== 'string' || !p) continue;
        if (!Object.prototype.hasOwnProperty.call(items, p)) items[p] = at;
    }
    return { v: 1, items };
}

/** 되살리기 */
export function takeTrash(trash, paths) {
    const items = { ...trash.items };
    for (const p of paths) delete items[p];
    return { v: 1, items };
}

/** 목록에서 버린 것을 뺀다. 휴지통 보기에서는 반대로 그것만 */
export function applyTrash(files, trash, { showTrash = false } = {}) {
    return files.filter((f) => inTrash(trash, f.path) === showTrash);
}

/** 몇 개, 합쳐서 몇 바이트인가 */
export function trashSummary(files, trash) {
    const rows = files.filter((f) => inTrash(trash, f.path));
    return { count: rows.length, bytes: rows.reduce((n, f) => n + f.size, 0) };
}
