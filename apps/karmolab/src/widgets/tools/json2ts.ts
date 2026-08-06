/**
 * JSON → 타입 선언 (TASK-KL-088)
 *
 * API 응답을 보고 타입을 손으로 옮겨 적다 보면 필드 하나가 빠지거나 옵셔널 표시를 놓친다.
 * 배열은 특히 위험하다 — 첫 원소만 보고 타입을 정하면, 어떤 원소에만 있는 필드가 통째로 사라진다.
 * 그래서 배열은 **모든 원소를 합쳐** 보고, 일부에만 있는 필드는 옵셔널로 표시한다.
 */
(function (): void {
  type Shape = { kind: string; fields?: Record<string, { shape: Shape; optional: boolean }>; of?: Shape };

  function shapeOf(value: unknown): Shape {
    if (value === null) return { kind: 'null' };
    if (Array.isArray(value)) {
      if (!value.length) return { kind: 'array', of: { kind: 'unknown' } };
      return { kind: 'array', of: value.map(shapeOf).reduce(merge) };
    }
    if (typeof value === 'object') {
      const fields: Record<string, { shape: Shape; optional: boolean }> = {};
      Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
        fields[k] = { shape: shapeOf(v), optional: false };
      });
      return { kind: 'object', fields };
    }
    return { kind: typeof value };
  }

  /** 두 모양을 합친다 — 한쪽에만 있는 필드는 옵셔널이 된다. */
  function merge(a: Shape, b: Shape): Shape {
    if (a.kind === 'null') return b.kind === 'null' ? a : { ...b, kind: b.kind };
    if (b.kind === 'null') return a;
    if (a.kind === 'array' && b.kind === 'array') return { kind: 'array', of: merge(a.of!, b.of!) };
    if (a.kind === 'object' && b.kind === 'object') {
      const fields: Record<string, { shape: Shape; optional: boolean }> = {};
      const keys = new Set([...Object.keys(a.fields!), ...Object.keys(b.fields!)]);
      keys.forEach((k) => {
        const fa = a.fields![k];
        const fb = b.fields![k];
        if (fa && fb) fields[k] = { shape: merge(fa.shape, fb.shape), optional: fa.optional || fb.optional };
        else fields[k] = { shape: (fa || fb).shape, optional: true };
      });
      return { kind: 'object', fields };
    }
    return a.kind === b.kind ? a : { kind: `${a.kind} | ${b.kind}` };
  }

  const safeKey = (k: string): string => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k.replace(/'/g, "\\'")}'`);

  function render(shape: Shape, name: string, out: string[], seen: Set<string>): string {
    if (shape.kind === 'object') {
      let typeName = name;
      let n = 2;
      while (seen.has(typeName)) typeName = name + n++;
      seen.add(typeName);
      const lines: string[] = [`export interface ${typeName} {`];
      Object.entries(shape.fields!).forEach(([k, f]) => {
        const child = render(f.shape, k.charAt(0).toUpperCase() + k.slice(1).replace(/[^\w]/g, ''), out, seen);
        lines.push(`  ${safeKey(k)}${f.optional ? '?' : ''}: ${child};`);
      });
      lines.push('}');
      out.push(lines.join('\n'));
      return typeName;
    }
    if (shape.kind === 'array') return `${render(shape.of!, name.replace(/s$/, '') || 'Item', out, seen)}[]`;
    if (shape.kind === 'null') return 'null';
    if (shape.kind === 'unknown') return 'unknown';
    return shape.kind;
  }

  Toolbox.register({
    id: 'json2ts',
    title: 'JSON → 타입 선언',
    category: 'tool',
    desc: 'JSON 에서 TypeScript 인터페이스를 만듭니다. 배열은 모든 원소를 합쳐 봅니다',
    layout: 'wide',
    icon: '<path d="M9 4H7a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M14 8h6M17 8v9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '타입 생성',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">최상위 타입 이름</div>
                  <input type="text" id="jtName" value="Root" spellcheck="false">
                </div>
                <div>
                  <div class="tool-sublabel">&nbsp;</div>
                  <button class="btn btn-primary" id="jtRun" style="width:100%;">타입 만들기</button>
                </div>
              </div>
            </div>
            <div class="field-group">
              <label class="field-label">JSON</label>
              <textarea id="jtIn" rows="9" spellcheck="false"></textarea>
            </div>
            <div class="field-group">
              <label class="field-label">TypeScript</label>
              <textarea id="jtOut" rows="12" spellcheck="false" readonly></textarea>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-ghost" id="jtCopy">복사</button>
            </div>
            <div class="tool-status" id="jtStatus">배열은 모든 원소를 합쳐 봅니다 — 일부에만 있는 필드는 물음표로 표시됩니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLTextAreaElement>('#jtIn');
          const out = $<HTMLTextAreaElement>('#jtOut');
          const status = $<HTMLElement>('#jtStatus');

          function run(): void {
            let data: unknown;
            try {
              data = JSON.parse(input.value);
            } catch (e) {
              status.textContent = 'JSON 을 읽지 못했어요: ' + (e as Error).message;
              status.className = 'tool-status error';
              return;
            }
            const name = ($<HTMLInputElement>('#jtName').value || 'Root').replace(/[^\w]/g, '') || 'Root';
            const blocks: string[] = [];
            const top = render(shapeOf(data), name, blocks, new Set());
            out.value =
              (blocks.length ? blocks.reverse().join('\n\n') : `export type ${name} = ${top};`) +
              (blocks.length && top !== name ? `\n\nexport type ${name} = ${top};` : '');
            status.textContent = `${blocks.length || 1}개 타입을 만들었습니다.`;
            status.className = 'tool-status ok';
            Toolbox.trackUse?.('generate');
          }

          input.addEventListener('input', run);
          $<HTMLButtonElement>('#jtRun').onclick = run;
          $<HTMLButtonElement>('#jtCopy').onclick = () => {
            if (out.value) void Toolbox.copyText?.(out.value, { message: '타입을 복사했어요' });
          };

          input.value = JSON.stringify(
            { id: 1, name: 'KarmoLab', tags: ['tool', 'lab'], owner: { login: 'mascari4615', verified: true }, items: [{ a: 1 }, { a: 2, b: 'x' }] },
            null,
            2
          );
          run();
        }
      }
    ]
  });
})();
