/**
 * Node 에서 lib/markdown 렌더러를 쓰는 문 (TASK-KL-354).
 *
 * 렌더러 정본은 `src/lib/markdown/render.ts` **하나**다. 여기서는 그 TS 를 그 자리에서 묶어
 * 불러올 뿐, 규칙을 다시 적지 않는다 (두 벌이면 언젠가 갈라진다). 빌드 산출물(js/) 순서에도
 * 안 얽매인다. 생성기가 빌드보다 먼저 돌아도 된다.
 *
 * marked(vendor UMD)는 Node 의 require/import 로는 안 열린다 (ESM 패키지 안의 UMD 라 exports
 * 가 빈 채로 온다. 실측). exports 를 직접 만들어 평가하면 열린다. 시험도 같은 문을 쓴다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const APP_ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

export function loadMarked() {
    const code = fs.readFileSync(path.join(APP_ROOT, 'js', 'vendor', 'marked.min.js'), 'utf8');
    const exports = {};
    new Function('exports', 'module', code)(exports, { exports });
    return exports;
}

/** 렌더러 모듈(render.ts)을 묶어서 가져온다. { renderMarkdown, safeHref, escapeHtml, ... } */
export async function loadMarkdownLib() {
    return loadLib('render.ts');
}

/** 앞머리 모듈(frontmatter.ts). { splitFrontMatter, coverImage, coverAttrs } */
export async function loadFrontMatterLib() {
    return loadLib('frontmatter.ts');
}

async function loadLib(file) {
    const bundled = esbuild.buildSync({
        entryPoints: [path.join(APP_ROOT, 'src', 'lib', 'markdown', file)],
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'neutral',
        target: ['es2020'],
    });
    const url = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`;
    return import(url);
}
