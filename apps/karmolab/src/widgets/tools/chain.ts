/**
 * 묶어 쓰기 — 화면 (해자① / 흡수계획 06 § 6)
 *
 * MCP 쪽에는 `chain_run` 이 있다. 여기는 **사람이 같은 것을 눈으로 보는 자리**다.
 * 단계 목록을 적으면 순서대로 돌고, **각 단계 결과가 따로 보인다** — 어디서 어긋났는지
 * 마지막 값만 보고는 알 수 없기 때문이다(알맹이가 모든 단계를 내놓는 이유와 같다).
 *
 * 계산은 `core/chain.ts` 가 한다. 여기서 다시 짜지 않는다 — 화면과 MCP 가 다른 답을 내면
 * 이 도구를 믿을 이유가 없어진다(passgen 에서 실제로 그랬다).
 *
 * **부르는 손**은 화면이 준다: 알맹이를 미리 다 들고 있는 게 아니라, 필요한 도구가 나올 때
 * 그때 불러온다(`import()`). 그래야 이 위젯 하나 때문에 첫 화면이 무거워지지 않는다.
 */
import { MAX_STEPS, parseSteps, runChain, type Step } from '../../core/chain';
import { CORE_OPS } from '../../core/registry-lazy.generated';
import { spec as chainSpec } from '../../core/chain';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /**
   * 화면에서 부를 수 있는 도구 = **알맹이가 있는 것**. 목록을 손으로 안 적는다 —
   * 빌드가 `src/core/*.ts` 를 훑어 만든 것을 그대로 쓴다(`data/core-tools.json`).
   * 손으로 적으면 도구를 옮길 때마다 여기가 조용히 낡는다.
   */
  /*
   * 부를 수 있는 도구 표는 **빌드가 찍는다**(`scripts/gen-core-tools.mjs`). 손으로 적으면
   * 도구를 옮길 때마다 여기가 조용히 낡아 멀쩡한 도구를 「모른다」고 답한다.
   */
  /* ★ **알맹이는 쓸 때 받는다** (2026-08-13, TASK-KL-205 빚 갚기).
     예전에는 정적 표(`registry.generated`)를 들여서 **도구 서른다섯 개의 알맹이 전부**가 이
     묶음에 실렸다 — 250KB(gzip 87.7KB)로 위젯 천장 64KB 의 1.4배였다. 정작 한 사람이 쓰는 것은
     자기가 적은 단계에 나오는 도구 두어 개다. 그래서 「무엇을 부를 수 있나」(ops)만 늘 들고,
     알맹이는 **그 도구가 실제로 불릴 때** 받아 온다(`loadCores` 가 돌리기 직전에 채운다). */
  const known: Record<string, { run: (op: string, args: Record<string, unknown>, deps: Record<string, unknown>) => unknown; ops: string[] }> = {};

  /** 이번 판에 나오는 도구들의 알맹이만 받아 둔다 — 없는 이름은 여기서 조용히 넘기고 아래가 말한다.
   *  파일 하나가 알맹이 하나다(`js/core/<id>.js`, 대개 1KB 안팎) — 이 묶음은 IIFE 라 `import()`
   *  로는 안 쪼개져서, 이 저장소가 원래 쓰는 「그때 붙이는 스크립트」 방식으로 받는다. */
  async function loadCores(ids: string[]): Promise<void> {
    const bag = window as unknown as { __KARMO_CORES?: Record<string, { run: never }> };
    await Promise.all(
      [...new Set(ids)].map(
        (id) =>
          new Promise<void>((resolve) => {
            if (known[id] || CORE_OPS[id] === undefined) return resolve();
            const put = (): void => {
              const got = bag.__KARMO_CORES?.[id];
              if (got) known[id] = { run: got.run as never, ops: CORE_OPS[id] ?? [] };
              resolve();
            };
            if (bag.__KARMO_CORES?.[id]) return put();
            const s = document.createElement('script');
            s.src = `/apps/karmolab/core/${id}.js`;
            s.onload = put;
            s.onerror = () => resolve(); // 못 받으면 아래에서 「모르는 도구」로 말한다
            document.head.appendChild(s);
          })
      )
    );
  }

  function callTool(toolId: string, op: string, args: Record<string, unknown>): string {
    const entry = known[toolId];
    if (entry === undefined) {
      throw new Error(t('chain.unknownTool', { id: toolId, known: Object.keys(CORE_OPS).slice(0, 8).join(' · ') }));
    }
    if (entry.ops.includes(op) === false) {
      throw new Error(t('chain.unknownOp', { id: toolId, op, ops: entry.ops.join(' · ') }));
    }
    /*
     * 해시 알맹이는 계산기를 밖에서 받는다. 브라우저에서는 CryptoJS 가 그 손이다
     * (SHA3-512·Keccak-512 는 알맹이가 직접 계산하므로 여기 안 온다).
     * 없으면 감추지 않고 그대로 던진다 — 「빈 값」보다 「없다」가 낫다.
     */
    const deps: Record<string, unknown> = {
      hash: (algo: string, text: string): string => {
        const lib = (window as unknown as { CryptoJS?: Record<string, ((m: string) => { toString: () => string }) | undefined> }).CryptoJS;
        if (lib === undefined) throw new Error(t('chain.err.02'));
        const fn = lib[algo];
        if (typeof fn !== 'function') throw new Error(t('chain.noAlgo', { algo }));
        return fn(text).toString();
      }
    };
    return String(entry.run(op, args, deps));
  }

  /* 예시는 **쓸 때** 만든다 — 실려 오는 순간 만들면 말 묶음이 아직 없어 열쇠가 그대로 박힌다. */
  const example = (): string =>
    JSON.stringify(
    [
      { tool: 'base64', op: 'encode', args: { text: t('chain.t03') } },
      { tool: 'hashgen', op: 'text', args: { text: '$1', algo: 'SHA256' } }
    ],
    null,
    2
  );

  Toolbox.register({
    id: 'chain',
    title: t('widgets.chain.title', undefined, "도구 묶어 쓰기"),
    category: 'tool',
    desc: t('widgets-desc.chain.desc', undefined, "도구 여러 개를 이어서 한 번에. 앞 결과가 다음 도구의 입력이 됩니다"),
    // 껍데기(widgets-lazy-meta)와 **같은 값이어야** 한다 — 다르면 test:tools 가 막는다.
    // 여기가 비어 있어서(undefined) 메타의 'wide' 와 어긋났고, verify 19개 중 이 하나가 빨갰다.
    layout: 'wide',
    tabs: [
      {
        // 탭에도 id 가 있어야 한다 — 주소(#chain/묶어쓰기)와 검사가 이걸로 탭을 집는다.
        id: 'chain',
        label: t('chain.t06', undefined, "묶어 쓰기"),
        build: function (container: HTMLElement): void {
          void loadNamespace('chain').then(function () {

          container.innerHTML = `
            <div class="tool-block">
              <label class="tool-label" for="chSteps">${esc(t('chain.label.chSteps'))}</label>
              <textarea id="chSteps" class="tool-input" rows="10" spellcheck="false"></textarea>
              <p class="tool-hint">
                <code>"$1"</code> ${esc(t('chain.t01'))} <code>"a{{1}}b"</code> = 글 안에 끼우기 ·
                최대 ${MAX_STEPS}단계
              </p>
              <div class="tool-row">
                <button id="chRun" class="tool-btn tool-btn-primary" type="button">${esc(t('chain.btn.chRun'))}</button>
                <button id="chExample" class="tool-btn" type="button">${esc(t('chain.btn.chExample'))}</button>
              </div>
              <div id="chSay" class="tool-note" role="status"></div>
              <div id="chOut"></div>
            </div>`;

          const $ = <T extends HTMLElement>(sel: string): T => container.querySelector(sel) as T;
          const steps = $<HTMLTextAreaElement>('#chSteps');
          const say = (msg: string, tone = ''): void => {
            const el = $('#chSay');
            el.textContent = msg;
            el.className = `tool-note${tone ? ' ' + tone : ''}`;
          };

          const draw = (rows: Array<{ step: number; label: string; output: string }>): void => {
            $('#chOut').innerHTML = rows
              .map(
                (r) =>
                  `<div class="tool-list-row"><span class="tool-list-key">${r.step}. ${r.label}</span>` +
                  `<code class="tool-list-val">${r.output.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</code></div>`
              )
              .join('');
          };

          const go = async (): Promise<void> => {
            $('#chOut').innerHTML = '';
            let parsed: Step[];
            try {
              parsed = parseSteps(steps.value);
            } catch (e) {
              say((e as Error).message, 'error');
              return;
            }
            /* 이번 판에 나오는 도구의 알맹이만 먼저 받아 둔다 — 그 뒤는 예전처럼 곧바로 돈다. */
            try {
              await loadCores(parsed.map((p) => p.tool));
            } catch {
              say(t('chain.err.02'), 'error');
              return;
            }
            try {
              const rows = runChain(parsed, callTool).map((r) => ({
                step: r.step,
                label: `${r.tool}_${r.op}`,
                output: r.output
              }));
              draw(rows);
              say(t('chain.ranSteps', { n: rows.length }), 'ok');
            } catch (e) {
              say((e as Error).message, 'error');
            }
          };

          $<HTMLButtonElement>('#chRun').onclick = () => { void go(); };
          $<HTMLButtonElement>('#chExample').onclick = () => {
            steps.value = example();
            say(t('chain.say.07'));
          };

          // 주소로 부른 경우 (`/karmolab/t/chain/?op=run&steps=…`). 없으면 예시로 시작한다.
          const call = readInvocation(chainSpec);
          if (call === null) {
            steps.value = example();
            say(t('chain.say.08'));
            return;
          }
          if (call.error !== undefined) {
            steps.value = example();
            say(call.error, 'error');
            return;
          }
          steps.value = String(call.args.steps ?? '');
          go();
                  });
        }
      }
    ]
  });
})();
