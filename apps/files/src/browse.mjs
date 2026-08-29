/**
 * 폴더 안에서 고르고 줄 세우기. 정렬, 갈래 거르기, 이름 찾기.
 *
 * 왜 여기 모았나:
 * - 목록과 액자가 **같은 차례**를 써야 함. 다음과 이전이 그 차례를 따르므로
 * - 화면 그리는 쪽에 흩으면 두 보기가 서로 다른 순서를 그림
 *
 * 자연 정렬. `p2` 가 `p10` 앞. 탐색기와 Finder 가 그 방식
 */

/** 갈래 칩. 화면에 보이는 차례대로 */
export const KINDS = [
    { id: 'image', label: '그림' },
    { id: 'video', label: '영상' },
    { id: 'text', label: '글' },
    { id: 'file', label: '기타' }
];

export const SORTS = [
    { id: 'name', label: '이름' },
    { id: 'size', label: '크기' },
    { id: 'kind', label: '갈래' }
];

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

/** 파일 이름만. 경로 비교는 폴더가 섞여 차례가 흔들림 */
const baseOf = (p) => p.slice(p.lastIndexOf('/') + 1);

/**
 * 거르고 줄 세우기.
 * @param {Array<{path:string,size:number}>} files
 * @param {{kind:string, query:string, sort:string, desc:boolean, kindOf:(p:string)=>string}} opt
 */
export function arrange(files, opt) {
    const { kind = '', query = '', sort = 'name', desc = false, kindOf } = opt;
    const q = query.trim().toLowerCase();
    const out = files.filter((f) => {
        if (kind && kindOf(f.path) !== kind) return false;
        if (q && !baseOf(f.path).toLowerCase().includes(q)) return false;
        return true;
    });
    out.sort((a, b) => {
        if (sort === 'size') return a.size - b.size;
        if (sort === 'kind') {
            const gap = collator.compare(kindOf(a.path), kindOf(b.path));
            if (gap !== 0) return gap;
        }
        return collator.compare(baseOf(a.path), baseOf(b.path));
    });
    if (desc) out.reverse();
    return out;
}

/** 폴더도 같은 규칙으로. 폴더는 늘 위에 두므로 따로 세운다 */
export function arrangeFolders(names, opt) {
    const q = (opt.query ?? '').trim().toLowerCase();
    const out = names.filter((n) => !q || n.toLowerCase().includes(q));
    out.sort((a, b) => collator.compare(a, b));
    if (opt.desc) out.reverse();
    return out;
}

/** 지금 무엇으로 좁혔는지 한 줄. 아무것도 안 걸렸으면 빈 문자열 */
export function activeSummary({ kind, query }, total, shown) {
    const bits = [];
    if (kind) bits.push(KINDS.find((k) => k.id === kind)?.label ?? kind);
    if (query.trim()) bits.push(`"${query.trim()}"`);
    if (!bits.length) return '';
    return `${bits.join(', ')} ${shown} / ${total}`;
}
