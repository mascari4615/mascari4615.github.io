/**
 * 함께 편집 — 같은 글을 둘이 동시에 고쳐도 안 깨진다 (TASK-KL-183 C).
 *
 * 커서(KL-180)까지는 「누가 있다」였다. 여기서부터는 **같은 것을 만진다**.
 *
 * 왜 자체 구현인가: 필요한 것은 글자 하나짜리 규칙(RGA)뿐이고, 그건 200줄이면 끝난다.
 * 라이브러리를 들이면 번들이 수십 KB 늘고, 우리 도구는 브라우저에서 도는 것이라 그 무게가
 * 그대로 사람 회선으로 간다.
 *
 * 규칙 (RGA — Replicated Growable Array):
 *  ① 글자마다 **변하지 않는 이름**을 준다 `siteId:seq`. 자리(index)는 사람마다 달라지지만
 *     이름은 안 변한다 — 그래서 「3번째 뒤에 넣어」가 아니라 「그 글자 뒤에 넣어」로 말한다.
 *  ② 지운 글자는 **바로 안 버린다**(무덤). 남이 그 뒤에 넣으라고 말할 수 있기 때문이다.
 *  ③ 같은 자리에 둘이 동시에 넣으면 **이름이 큰 쪽이 앞**. 규칙이 하나뿐이라 어느 순서로
 *     받아도 두 화면이 같은 글에 닿는다(수렴).
 *
 * 서버는 연산을 그냥 흘려보내기만 한다 — 순서를 지켜 주지 않아도 되고, 저장하지도 않는다.
 */
export interface CharNode {
    id: string;
    /** 이 글자 바로 앞 글자의 이름 (맨 앞이면 null) */
    after: string | null;
    ch: string;
    deleted: boolean;
}

export type TextOp =
    | { t: 'ins'; id: string; after: string | null; ch: string }
    | { t: 'del'; id: string };

export class CoText {
    private nodes = new Map<string, CharNode>();
    /**
     * 「이 글자 뒤에 붙은 것들」 — 이름이 큰 것이 앞이다.
     *
     * 자리를 배열 하나로 관리하려 했더니 **남의 자손을 건너뛰는 규칙**이 빠져 두 화면이
     * 갈라졌다(실측: `heYXllo` vs `heXYllo`). 나무로 두면 그 규칙이 구조 자체가 된다 —
     * 형제는 이름 순, 자손은 부모 바로 뒤. 어느 순서로 받아도 같은 나무가 된다.
     */
    private children = new Map<string | null, CharNode[]>();
    private seq = 0;

    constructor(private readonly siteId: string) {}

    private childrenOf(id: string | null): CharNode[] {
        let list = this.children.get(id);
        if (!list) {
            list = [];
            this.children.set(id, list);
        }
        return list;
    }

    /** 나무를 앞에서부터 훑는다 (부모 → 자손 순). */
    private walk(): CharNode[] {
        const out: CharNode[] = [];
        const stack: Array<string | null> = [null];
        const visit = (parent: string | null): void => {
            for (const node of this.childrenOf(parent)) {
                out.push(node);
                visit(node.id);
            }
        };
        void stack;
        visit(null);
        return out;
    }

    /** 지금 글 (무덤은 빼고). */
    get text(): string {
        let out = '';
        for (const node of this.walk()) if (!node.deleted) out += node.ch;
        return out;
    }

    /** 화면 자리 → 글자 이름. 자리 0 은 맨 앞(= null). */
    private idAt(index: number): string | null {
        let seen = 0;
        for (const node of this.walk()) {
            if (node.deleted) continue;
            seen += 1;
            if (seen === index) return node.id;
        }
        return null;
    }

    private insertNode(node: CharNode): void {
        if (this.nodes.has(node.id)) return; // 같은 연산을 두 번 받아도 한 번만 (그물이 겹칠 수 있다)
        this.nodes.set(node.id, node);
        const siblings = this.childrenOf(node.after);
        // 같은 자리에 둘이 동시에 넣으면 **이름이 큰 쪽이 앞**. 규칙이 하나뿐이라 수렴한다.
        let at = 0;
        while (at < siblings.length && siblings[at].id > node.id) at += 1;
        siblings.splice(at, 0, node);
    }

    /** 남이 보낸 연산을 받는다. 어느 순서로 받아도 결과가 같다. */
    apply(op: TextOp): void {
        if (op.t === 'ins') {
            this.insertNode({ id: op.id, after: op.after, ch: op.ch, deleted: false });
            return;
        }
        const node = this.nodes.get(op.id);
        if (node) node.deleted = true;
    }

    /** 내가 자리 `index` 뒤에 글자를 넣는다 → 남에게 보낼 연산. */
    localInsert(index: number, ch: string): TextOp {
        this.seq += 1;
        // 이름은 자리와 무관하다 — 앞자리를 0 으로 채워 문자열 비교가 곧 숫자 비교가 되게 한다.
        const id = `${String(this.seq).padStart(6, '0')}:${this.siteId}`;
        const op: TextOp = { t: 'ins', id, after: this.idAt(index), ch };
        this.apply(op);
        return op;
    }

    /** 내가 자리 `index` 의 글자를 지운다 (1부터). */
    localDelete(index: number): TextOp | null {
        const id = this.idAt(index);
        if (!id) return null;
        const op: TextOp = { t: 'del', id };
        this.apply(op);
        return op;
    }

    /**
     * 화면 글자와 지금 글을 맞춘다 — 사람이 어떻게 고쳤든(붙여넣기·잘라내기 포함) 연산으로 바꾼다.
     * 앞뒤로 같은 부분을 잘라내고 **가운데만** 바꾼다: 한 글자 고쳤는데 글 전체를 다시 보내면
     * 남의 커서가 통째로 튄다.
     */
    diffTo(next: string): TextOp[] {
        const prev = this.text;
        if (prev === next) return [];
        let head = 0;
        while (head < prev.length && head < next.length && prev[head] === next[head]) head += 1;
        let tail = 0;
        while (
            tail < prev.length - head &&
            tail < next.length - head &&
            prev[prev.length - 1 - tail] === next[next.length - 1 - tail]
        ) {
            tail += 1;
        }
        const ops: TextOp[] = [];
        // 지우기는 **뒤에서부터** — 앞에서 지우면 뒤 자리가 밀린다.
        for (let i = prev.length - tail; i > head; i -= 1) {
            const op = this.localDelete(i);
            if (op) ops.push(op);
        }
        for (let i = 0; i < next.length - tail - head; i += 1) {
            ops.push(this.localInsert(head + i, next[head + i]));
        }
        return ops;
    }
}
