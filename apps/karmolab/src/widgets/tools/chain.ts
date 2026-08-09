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
import { CORES } from '../../core/registry.generated';
import { spec as chainSpec } from '../../core/chain';
import { readInvocation } from '../../lib/tool-url';

(function (): void {
  /**
   * 화면에서 부를 수 있는 도구 = **알맹이가 있는 것**. 목록을 손으로 안 적는다 —
   * 빌드가 `src/core/*.ts` 를 훑어 만든 것을 그대로 쓴다(`data/core-tools.json`).
   * 손으로 적으면 도구를 옮길 때마다 여기가 조용히 낡는다.
   */
  /*
   * 부를 수 있는 도구 표는 **빌드가 찍는다**(`scripts/gen-core-tools.mjs`). 손으로 적으면
   * 도구를 옮길 때마다 여기가 조용히 낡아 멀쩡한 도구를 「모른다」고 답한다.
   */
  const known = CORES;

  function callTool(toolId: string, op: string, args: Record<string, unknown>): string {
    const entry = known[toolId];
    if (entry === undefined) {
      throw new Error(`모르는 도구입니다: ${toolId} (있는 것: ${Object.keys(known).slice(0, 8).join(' · ')} …)`);
    }
    if (entry.ops.includes(op) === false) {
      throw new Error(`${toolId} 에 「${op}」 는 없습니다 (있는 것: ${entry.ops.join(' · ')})`);
    }
    /*
     * 해시 알맹이는 계산기를 밖에서 받는다. 브라우저에서는 CryptoJS 가 그 손이다
     * (SHA3-512·Keccak-512 는 알맹이가 직접 계산하므로 여기 안 온다).
     * 없으면 감추지 않고 그대로 던진다 — 「빈 값」보다 「없다」가 낫다.
     */
    const deps: Record<string, unknown> = {
      hash: (algo: string, text: string): string => {
        const lib = (window as unknown as { CryptoJS?: Record<string, ((m: string) => { toString: () => string }) | undefined> }).CryptoJS;
        if (lib === undefined) throw new Error('해시 계산기(CryptoJS)가 아직 안 실렸습니다');
        const fn = lib[algo];
        if (typeof fn !== 'function') throw new Error(`이 화면에서는 ${algo} 를 못 구합니다`);
        return fn(text).toString();
      }
    };
    return String(entry.run(op, args, deps));
  }

  const EXAMPLE = JSON.stringify(
    [
      { tool: 'base64', op: 'encode', args: { text: '안녕하세요' } },
      { tool: 'hashgen', op: 'text', args: { text: '$1', algo: 'SHA256' } }
    ],
    null,
    2
  );

  Toolbox.register({
    id: 'chain',
    title: '도구 묶어 쓰기',
    category: 'tool',
    desc: '도구 여러 개를 이어서 한 번에. 앞 결과가 다음 도구의 입력이 됩니다',
    // 껍데기(widgets-lazy-meta)와 **같은 값이어야** 한다 — 다르면 test:tools 가 막는다.
    // 여기가 비어 있어서(undefined) 메타의 'wide' 와 어긋났고, verify 19개 중 이 하나가 빨갰다.
    layout: 'wide',
    tabs: [
      {
        // 탭에도 id 가 있어야 한다 — 주소(#chain/묶어쓰기)와 검사가 이걸로 탭을 집는다.
        id: 'chain',
        label: '묶어 쓰기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-block">
              <label class="tool-label" for="chSteps">단계 (JSON)</label>
              <textarea id="chSteps" class="tool-input" rows="10" spellcheck="false"></textarea>
              <p class="tool-hint">
                <code>"$1"</code> = 1번 결과 통째로 · <code>"a{{1}}b"</code> = 글 안에 끼우기 ·
                최대 ${MAX_STEPS}단계
              </p>
              <div class="tool-row">
                <button id="chRun" class="tool-btn tool-btn-primary" type="button">실행</button>
                <button id="chExample" class="tool-btn" type="button">예시 넣기</button>
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

          const go = (): void => {
            $('#chOut').innerHTML = '';
            let parsed: Step[];
            try {
              parsed = parseSteps(steps.value);
            } catch (e) {
              say((e as Error).message, 'error');
              return;
            }
            try {
              const rows = runChain(parsed, callTool).map((r) => ({
                step: r.step,
                label: `${r.tool}_${r.op}`,
                output: r.output
              }));
              draw(rows);
              say(`${rows.length}단계 실행 — 결과는 마지막 줄입니다`, 'ok');
            } catch (e) {
              say((e as Error).message, 'error');
            }
          };

          $<HTMLButtonElement>('#chRun').onclick = () => go();
          $<HTMLButtonElement>('#chExample').onclick = () => {
            steps.value = EXAMPLE;
            say('예시를 넣었습니다 — 실행을 눌러 보세요');
          };

          // 주소로 부른 경우 (`/karmolab/t/chain/?op=run&steps=…`). 없으면 예시로 시작한다.
          const call = readInvocation(chainSpec);
          if (call === null) {
            steps.value = EXAMPLE;
            say('예시가 들어 있습니다 — 실행을 눌러 보세요');
            return;
          }
          if (call.error !== undefined) {
            steps.value = EXAMPLE;
            say(call.error, 'error');
            return;
          }
          steps.value = String(call.args.steps ?? '');
          go();
        }
      }
    ]
  });
})();
