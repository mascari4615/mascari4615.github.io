/**
 * 반복형 글 도구의 정본. operation은 화면을 만들지 않고, 입력·선택지·순수 변환만 선언한다.
 * 작업대는 이 계약을 읽어 같은 입력·결과·복사·상태 경험을 한 번만 그린다.
 */
export type TextOperationControl =
  | { id: string; label: string; kind: 'checkbox'; initial: boolean }
  | { id: string; label: string; kind: 'select'; initial: string; options: Array<{ value: string; label: string }> }
  | { id: string; label: string; kind: 'range'; initial: number; min: number; max: number; step?: number }
  | { id: string; label: string; kind: 'text'; initial: string; placeholder?: string }
  | { id: string; label: string; kind: 'textarea'; initial: string; placeholder?: string };

export interface TextOperationResult {
  output: string;
  status: string;
}

export interface TextOperation {
  id: string;
  title: string;
  description: string;
  controls?: TextOperationControl[];
  /**
   * 주소로 부를 때 채울 값 (TASK-KL-257).
   *
   * 왜 여기 있나: 작업대로 합칠 수 있는 도구가 「글 넣고 글 받기」뿐이 아니다. 개발 도구 쪽은
   * 대부분 **주소 호출 계약**(`?op=...&칸=값`)을 이미 들고 있는데, 합치는 순간 그 계약이
   * 사라지면 **링크·에이전트 호출이 조용히 죽는다**. 그래서 조작이 「주소에서 온 값을 내 칸에
   * 어떻게 넣나」를 스스로 말하게 한다 — 작업대는 그걸 그대로 넣어 주기만 한다.
   *
   * 돌려주는 것 = { 입력글, 칸값 } 중 채울 것만. 안 주면 안 바꾼다.
   */
  fromUrl?: (call: { op: string; args: Record<string, string | number | boolean> }) => {
    input?: string;
    values?: Record<string, string | boolean | number>;
  };
  run: (input: string, values: Record<string, string | boolean | number>) => TextOperationResult;
  action?: {
    label: string;
    run: (input: string, values: Record<string, string | boolean | number>) => Promise<{ blob: Blob; name: string; status: string }>;
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 공용 surface. 이 안에만 결과·복사·읽히는 상태 줄이 존재한다. */
export function mountTextOperation(
  host: HTMLElement,
  operation: TextOperation,
  input: string,
  call?: { op: string; args: Record<string, string | number | boolean> } | null
): void {
  const controls = operation.controls || [];
  /* 주소에서 온 값을 **그리기 전에** 반영한다 — 그린 뒤에 넣으면 한 번 헛돌고(빈 결과가 깜빡),
     칸 초기값과 어긋난 채로 남는 자리가 생긴다. */
  const seeded = operation.fromUrl && call ? operation.fromUrl(call) : undefined;
  if (seeded?.input !== undefined) input = seeded.input;
  host.innerHTML = `
    <section class="op-surface" data-operation="${escapeHtml(operation.id)}">
      <header><h2>${escapeHtml(operation.title)}</h2><p>${escapeHtml(operation.description)}</p></header>
      <label class="field-label" for="opInput">입력</label>
      <textarea id="opInput" rows="8" spellcheck="false"></textarea>
      <div class="op-controls">${controls.map((control) => {
        if (control.kind === 'checkbox') return `<label class="tool-chip"><input data-control="${escapeHtml(control.id)}" type="checkbox"${control.initial ? ' checked' : ''}> ${escapeHtml(control.label)}</label>`;
        if (control.kind === 'select') return `<label class="field-label">${escapeHtml(control.label)}<select data-control="${escapeHtml(control.id)}">${control.options.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === control.initial ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></label>`;
        if (control.kind === 'text') return `<label class="field-label">${escapeHtml(control.label)}<input data-control="${escapeHtml(control.id)}" type="text" value="${escapeHtml(control.initial)}"${control.placeholder ? ` placeholder="${escapeHtml(control.placeholder)}"` : ''}></label>`;
        if (control.kind === 'textarea') return `<label class="field-label">${escapeHtml(control.label)}<textarea data-control="${escapeHtml(control.id)}" rows="5"${control.placeholder ? ` placeholder="${escapeHtml(control.placeholder)}"` : ''}>${escapeHtml(control.initial)}</textarea></label>`;
        return `<label class="field-label">${escapeHtml(control.label)} <output data-output="${escapeHtml(control.id)}">${control.initial}</output><input data-control="${escapeHtml(control.id)}" type="range" min="${control.min}" max="${control.max}" step="${control.step || 1}" value="${control.initial}"></label>`;
      }).join('')}</div>
      <label class="field-label" for="opResult">결과</label>
      <textarea id="opResult" rows="8" readonly aria-label="결과"></textarea>
      <button type="button" class="btn btn-ghost" id="opCopy">복사</button>
      ${operation.action ? `<button type="button" class="btn btn-primary" id="opAction">${escapeHtml(operation.action.label)}</button>` : ''}
      <div class="tool-status" id="opStatus" aria-live="polite"></div>
    </section>`;
  const get = <T extends HTMLElement>(selector: string): T => host.querySelector(selector) as T;
  const source = get<HTMLTextAreaElement>('#opInput');
  const result = get<HTMLTextAreaElement>('#opResult');
  const status = get<HTMLElement>('#opStatus');
  source.value = input;
  // 주소에서 온 칸값 반영 (없으면 초기값 그대로).
  for (const [id, value] of Object.entries(seeded?.values ?? {})) {
    const element = host.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[data-control="${id}"]`);
    if (!element) continue;
    if (element instanceof HTMLInputElement && element.type === 'checkbox') element.checked = value === true;
    else element.value = String(value);
  }
  const values = (): Record<string, string | boolean | number> => Object.fromEntries(controls.map((control) => {
    const element = host.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[data-control="${control.id}"]`)!;
    return [control.id, control.kind === 'checkbox' ? (element as HTMLInputElement).checked : control.kind === 'range' ? Number(element.value) : element.value];
  }));
  const run = (): void => {
    const value = operation.run(source.value, values());
    result.value = value.output;
    status.textContent = value.status;
    status.className = `tool-status${source.value ? ' ok' : ''}`;
  };
  source.addEventListener('input', run);
  host.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-control]').forEach((element) => element.addEventListener('input', () => {
    const output = host.querySelector<HTMLOutputElement>(`[data-output="${element.dataset.control}"]`);
    if (output) output.value = element.value;
    run();
  }));
  get<HTMLButtonElement>('#opCopy').onclick = (): void => { if (result.value) void Toolbox.copyText?.(result.value); };
  if (operation.action) get<HTMLButtonElement>('#opAction').onclick = (): void => {
    status.textContent = '만드는 중…';
    void operation.action!.run(source.value, values()).then((file) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(file.blob); link.download = file.name; link.click();
      Toolbox.offerNext?.(status, { blob: file.blob, name: file.name, from: operation.id });
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
      status.textContent = file.status; status.className = 'tool-status ok';
    }).catch((error: unknown) => { status.textContent = error instanceof Error ? error.message : '만들지 못했습니다.'; status.className = 'tool-status error'; });
  };
  run();
}
