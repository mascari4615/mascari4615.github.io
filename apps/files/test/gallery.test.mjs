import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewKind } from '../src/vault.mjs';
import { mountGallery, worthGallery } from '../src/gallery.mjs';

test('그림이 하나도 없으면 액자 보기를 권하지 않는다', () => {
    const kind = previewKind;
    assert.equal(worthGallery([{ path: 'a.zip' }, { path: 'b.mp4' }], kind), false);
    assert.equal(worthGallery([{ path: 'a.zip' }, { path: 'p/c.png' }], kind), true);
});

/* mountGallery 는 브라우저 것을 쓴다 — 필요한 만큼만 흉내 낸다.
   여기서 재는 것은 「동시에 몇 개나 부르나」와 「뜰 때 되돌려 주나」 둘이다. */
function fakeDom() {
    const made = [];
    class El {
        constructor() {
            this.dataset = {};
            this.children = [];
            this.classList = { add: (c) => this.classes.add(c) };
            this.classes = new Set();
        }
        querySelector() {
            return new El();
        }
        querySelectorAll() {
            return made;
        }
        replaceChildren() {}
        set innerHTML(html) {
            /* 칸 하나에 data-path·data-kind 가 있다는 계약만 흉내 낸다. */
            made.length = 0;
            for (const m of html.matchAll(/data-path="([^"]+)" data-kind="([^"]+)"/g)) {
                const el = new El();
                el.dataset.path = m[1];
                el.dataset.kind = m[2];
                made.push(el);
            }
        }
        get innerHTML() {
            return '';
        }
    }
    const observed = [];
    globalThis.IntersectionObserver = class {
        constructor(cb) {
            this.cb = cb;
            observed.push(this);
        }
        observe(el) {
            /* 곧바로 「보인다」로 친다 — 지연 자체가 아니라 동시 개수를 재는 시험이다. */
            this.cb([{ isIntersecting: true, target: el }]);
        }
        unobserve() {}
        disconnect() {
            this.dead = true;
        }
    };
    const revoked = [];
    globalThis.URL.createObjectURL = () => `blob:${revoked.length}`;
    globalThis.URL.revokeObjectURL = (u) => revoked.push(u);
    globalThis.Blob = class {};
    globalThis.Image = class {};
    return { host: new El(), made, observed, revoked };
}

test('한 번에 넷까지만 받고, 뜰 때 blob 을 되돌려 준다', async () => {
    const dom = fakeDom();
    const files = Array.from({ length: 12 }, (_v, i) => ({ path: `p/${i}.png`, size: 10 }));
    let inFlight = 0;
    let peak = 0;
    const done = [];
    const gal = mountGallery({
        host: dom.host,
        files,
        kindOf: () => 'image',
        mimeOf: () => 'image/png',
        hrefOf: (p) => '#' + p,
        load: async (path) => {
            inFlight += 1;
            peak = Math.max(peak, inFlight);
            await new Promise((r) => setTimeout(r, 5));
            inFlight -= 1;
            done.push(path);
            return { bytes: new Uint8Array([1]) };
        }
    });
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(done.length, 12, '열두 칸을 다 채운다');
    assert.ok(peak <= 4, `동시에 넷을 넘지 않는다 (실제 ${peak})`);
    gal.dispose();
    assert.equal(dom.revoked.length, 12, '들고 있던 blob 을 다 놓는다');
});

test('그림이 아닌 칸은 받지 않는다', async () => {
    const dom = fakeDom();
    let called = 0;
    mountGallery({
        host: dom.host,
        files: [{ path: 'a.mp4' }, { path: 'b.zip' }],
        kindOf: previewKind,
        mimeOf: () => '',
        hrefOf: (p) => '#' + p,
        load: async () => {
            called += 1;
            return null;
        }
    });
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(called, 0);
});
