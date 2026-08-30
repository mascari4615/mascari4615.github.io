/**
 * 글 그래프. 블로그 글 사이 링크를 힘-배치로 (change.blog-finish ②).
 *
 * 원래 Chirpy 테마의 별도 모듈(`/assets/js/graph-view/graph-view.js`, rollup 산출)을 동적
 * import 했는데, 테마 철거로 그 모듈은 더 안 지어진다. 그리기를 위젯 안으로 들였다 . 
 * d3(vendor, lazyScriptPaths 선적재) + 캔버스. 데이터 = `/assets/js/data/post-graph.json`
 * (`gen-post-pages.mjs` 가 공개 글로 매 배포 새로 굽는다. hidden 은 안 실린다).
 */
import { t, loadNamespace } from '../lib/i18n';

declare const d3: {
    forceSimulation: (nodes: unknown[]) => ForceSimulation;
    forceLink: (links: unknown[]) => ForceAny;
    forceManyBody: () => ForceAny;
    forceCenter: (x: number, y: number) => ForceAny;
    forceCollide: (radius: number) => ForceAny;
    zoom: () => ZoomAny;
    select: (el: Element) => SelectionAny;
    zoomIdentity: ZoomTransform;
} | undefined;
interface ForceSimulation {
    force(name: string, force: ForceAny): ForceSimulation;
    on(type: string, handler: () => void): ForceSimulation;
    alphaDecay(v: number): ForceSimulation;
    stop(): void;
}
type ForceAny = {
    id?: (fn: (d: { id: string }) => string) => ForceAny;
    distance?: (v: number) => ForceAny;
    strength?: (v: number) => ForceAny;
};
type ZoomAny = { scaleExtent(v: [number, number]): ZoomAny; on(type: string, fn: (event: { transform: ZoomTransform }) => void): ZoomAny };
type SelectionAny = { call(z: ZoomAny): SelectionAny };
interface ZoomTransform {
    k: number;
    x: number;
    y: number;
    invert(p: [number, number]): [number, number];
}

interface GraphNode {
    id: string;
    label: string;
    href: string;
    group?: string;
    x?: number;
    y?: number;
}
interface GraphLink {
    source: GraphNode | string;
    target: GraphNode | string;
}

(function (): void {
    let cleanup: (() => void) | null = null;

    function build(container: HTMLElement): void {
        void loadNamespace('postgraph').then(function () {
            cleanup?.();
            cleanup = null;
            container.innerHTML = '';

            const wrap = document.createElement('div');
            wrap.style.cssText =
                'width:100%;min-height:min(70vh,640px);height:70vh;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--bg-tertiary);overflow:hidden;position:relative;';
            container.appendChild(wrap);

            if (typeof d3 === 'undefined') {
                wrap.textContent = t('postgraph.t01');
                return;
            }
            const engine = d3;

            const canvas = document.createElement('canvas');
            canvas.style.cssText = 'width:100%;height:100%;display:block;cursor:grab;';
            wrap.appendChild(canvas);
            const context = canvas.getContext('2d');
            if (!context) return;

            void fetch('/assets/js/data/post-graph.json')
                .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`http ${response.status}`))))
                .then((data: { nodes: GraphNode[]; links: GraphLink[] }) => {
                    const ratio = window.devicePixelRatio || 1;
                    const width = wrap.clientWidth;
                    const height = wrap.clientHeight;
                    canvas.width = width * ratio;
                    canvas.height = height * ratio;

                    let transform: ZoomTransform = engine.zoomIdentity;
                    let hover: GraphNode | null = null;

                    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
                    const color = {
                        link: dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)',
                        text: dark ? '#e5e7eb' : '#1f2937',
                        node: dark ? '#a79bef' : '#5f4dc2',
                        nodeDim: dark ? '#4b4767' : '#c9c3e8',
                    };

                    const degree = new Map<string, number>();
                    for (const link of data.links) {
                        const s = typeof link.source === 'string' ? link.source : link.source.id;
                        const e = typeof link.target === 'string' ? link.target : link.target.id;
                        degree.set(s, (degree.get(s) ?? 0) + 1);
                        degree.set(e, (degree.get(e) ?? 0) + 1);
                    }
                    const radiusOf = (node: GraphNode): number => 3 + Math.min(6, (degree.get(node.id) ?? 0) * 1.2);

                    function draw(): void {
                        if (!context) return;
                        context.save();
                        context.setTransform(ratio, 0, 0, ratio, 0, 0);
                        context.clearRect(0, 0, width, height);
                        context.translate(transform.x, transform.y);
                        context.scale(transform.k, transform.k);
                        context.strokeStyle = color.link;
                        context.lineWidth = 1 / transform.k;
                        for (const link of data.links) {
                            const s = link.source as GraphNode;
                            const e = link.target as GraphNode;
                            if (s.x === undefined || e.x === undefined) continue;
                            context.beginPath();
                            context.moveTo(s.x, s.y!);
                            context.lineTo(e.x, e.y!);
                            context.stroke();
                        }
                        for (const node of data.nodes) {
                            if (node.x === undefined) continue;
                            context.beginPath();
                            context.fillStyle = degree.get(node.id) ? color.node : color.nodeDim;
                            context.arc(node.x, node.y!, radiusOf(node), 0, Math.PI * 2);
                            context.fill();
                        }
                        if (hover?.x !== undefined) {
                            context.fillStyle = color.text;
                            context.font = `${12 / transform.k}px sans-serif`;
                            context.fillText(hover.label, hover.x + 8 / transform.k, hover.y! + 4 / transform.k);
                        }
                        context.restore();
                    }

                    const simulation = engine
                        .forceSimulation(data.nodes)
                        .force('link', engine.forceLink(data.links).id!((n) => n.id).distance!(60))
                        .force('charge', engine.forceManyBody().strength!(-40))
                        .force('center', engine.forceCenter(width / 2, height / 2))
                        .force('collide', engine.forceCollide(10))
                        .alphaDecay(0.04)
                        .on('tick', draw);

                    engine.select(canvas).call(
                        engine.zoom().scaleExtent([0.2, 5]).on('zoom', (event) => {
                            transform = event.transform;
                            draw();
                        })
                    );

                    const nodeAt = (event: MouseEvent): GraphNode | null => {
                        const rect = canvas.getBoundingClientRect();
                        const [gx, gy] = transform.invert([event.clientX - rect.left, event.clientY - rect.top]);
                        for (const node of data.nodes) {
                            if (node.x === undefined) continue;
                            const r = radiusOf(node) + 3;
                            if ((node.x - gx) ** 2 + (node.y! - gy) ** 2 <= r * r) return node;
                        }
                        return null;
                    };
                    const onMove = (event: MouseEvent): void => {
                        const found = nodeAt(event);
                        if (found !== hover) {
                            hover = found;
                            canvas.style.cursor = found ? 'pointer' : 'grab';
                            draw();
                        }
                    };
                    const onClick = (event: MouseEvent): void => {
                        const found = nodeAt(event);
                        if (found?.href) window.open(found.href, '_blank', 'noopener,noreferrer');
                    };
                    canvas.addEventListener('mousemove', onMove);
                    canvas.addEventListener('click', onClick);
                    cleanup = (): void => {
                        simulation.stop();
                        canvas.removeEventListener('mousemove', onMove);
                        canvas.removeEventListener('click', onClick);
                    };
                    Toolbox.onDispose?.(() => cleanup?.());
                })
                .catch(() => {
                    wrap.textContent = t('postgraph.t01');
                });

            if (typeof Mdd !== 'undefined') {
                Mdd.linePreset('tool_run', { mood: 'idle', msg: t('postgraph.t02') });
            }
        });
    }

    Toolbox.register({
        ...(Toolbox.getLazyWidgetPublicMeta?.('postgraph') ?? {}),
        /* ★ 등록 때 읽는 말은 되받을 글을 반드시 준다 (2026-08-14). 묶음이 아직 없다. */
        tabs: [{ id: 'graph', label: t('postgraph.t03', undefined, '그래프'), build }],
    });
})();
