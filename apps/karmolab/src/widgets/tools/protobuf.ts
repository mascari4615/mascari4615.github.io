/**
 * protobuf 뜯어보기 (TASK-KL-316 / 18)
 *
 * 「개발 도구」 작업대의 **뜯어보기** 칸. 알맹이는 `core/protobuf`.
 * `.proto` 가 없어도 번호·형식·값까지는 보여 준다 — 로그에 찍힌 base64 한 덩이가
 * 무엇인지 알아내는 게 대부분의 상황이라서다. 스키마를 주면 이름이 붙는다.
 */
import { decode, encode, parseProto, readBytes, toHex, spec, type Message, type Piece } from '../../core/protobuf';
import { textPane, twoPane } from './shared/markup';
import { escapeHtml as esc } from './shared/text';
import { markLive } from './shared/say';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  Toolbox.register({
    id: 'protobuf',
    title: t('widgets.protobuf.title', undefined, 'protobuf 뜯어보기'),
    category: 'tool',
    desc: t(
      'widgets-desc.protobuf.desc',
      undefined,
      'protobuf 바이너리를 16진수·base64 로 붙여넣으면 칸별로 풀어 줍니다. .proto 를 주면 이름까지 붙습니다'
    ),
    layout: 'wide',
    icon: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" stroke="currentColor" stroke-width="1.4" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: t('protobuf.tab', undefined, 'protobuf'),
        build: function (container: HTMLElement): void {
          void loadNamespace('protobuf').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('protobuf.mdd') });
    container.innerHTML = `
      ${twoPane(
        textPane({ id: 'pbData', name: 'data', label: esc(t('protobuf.label.data')), minHeight: 120 }),
        textPane({ id: 'pbProto', name: 'proto', label: esc(t('protobuf.label.proto')), minHeight: 120 })
      )}
      <div style="display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap; margin:10px 0;">
        <div>
          <label class="field-label" for="pbMessage">${esc(t('protobuf.label.message'))}</label>
          <select id="pbMessage" name="message" aria-label="${esc(t('protobuf.label.message'))}"></select>
        </div>
        <button class="btn btn-ghost" id="pbToJson">${esc(t('protobuf.btn.toJson'))}</button>
        <button class="btn btn-ghost" id="pbFromJson">${esc(t('protobuf.btn.fromJson'))}</button>
      </div>
      <div id="pbOut" class="tool-list"></div>
      <div class="tool-sublabel">${esc(t('protobuf.label.json'))}</div>
      <textarea id="pbJson" name="json" aria-label="${esc(t('protobuf.label.json'))}" class="mono-input" style="min-height:120px;"></textarea>
      <div class="tool-status" id="pbStatus">${esc(t('protobuf.status.idle'))}</div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const data = $<HTMLTextAreaElement>('#pbData');
    const proto = $<HTMLTextAreaElement>('#pbProto');
    const messageBox = $<HTMLSelectElement>('#pbMessage');
    const status = $<HTMLElement>('#pbStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    let all: Message[] = [];

    function rowsOf(pieces: Piece[], depth = 0): string {
      return pieces
        .map((p) => {
          const pad = '&nbsp;'.repeat(depth * 2);
          if (p.children !== undefined) {
            return (
              '<div class="tool-list-row"><span class="tool-list-key">' + pad + '#' + p.no + '</span>' +
              '<span class="tool-list-val">' + esc(p.name ?? '') + ' {</span>' +
              '<span class="tool-list-dim">' + esc(p.declared ?? p.kind) + '</span></div>' +
              rowsOf(p.children, depth + 1)
            );
          }
          const alt = p.alternatives === undefined ? '' : Object.entries(p.alternatives).map(([k, v]) => k + '=' + String(v)).join(' · ');
          return (
            '<div class="tool-list-row"><span class="tool-list-key">' + pad + '#' + p.no + (p.name === undefined ? '' : ' ' + esc(p.name)) + '</span>' +
            '<span class="tool-list-val" style="font-family:var(--font-mono)">' + esc(String(p.value)) + '</span>' +
            '<span class="tool-list-dim">' + esc(p.declared ?? p.kind) + (alt === '' ? '' : ' · ' + esc(alt)) + '</span></div>'
          );
        })
        .join('');
    }

    function syncMessages(): void {
      all = proto.value.trim() === '' ? [] : parseProto(proto.value);
      const keep = messageBox.value;
      messageBox.innerHTML = all.map((m) => '<option value="' + esc(m.name) + '">' + esc(m.name) + '</option>').join('');
      if (all.some((m) => m.name === keep)) messageBox.value = keep;
    }

    function render(): void {
      syncMessages();
      if (data.value.trim() === '') {
        $<HTMLElement>('#pbOut').innerHTML = '';
        status.textContent = t('protobuf.status.idle');
        return;
      }
      try {
        const bytes = readBytes(data.value);
        const schema = all.find((m) => m.name === messageBox.value) ?? (all.length === 1 ? all[0] : undefined);
        const pieces = decode(bytes, schema, all);
        $<HTMLElement>('#pbOut').innerHTML = rowsOf(pieces);
        status.textContent =
          schema === undefined
            ? t('protobuf.status.blind', { n: pieces.length, bytes: bytes.length })
            : t('protobuf.status.named', { n: pieces.length, bytes: bytes.length, name: schema.name });
      } catch (e) {
        $<HTMLElement>('#pbOut').innerHTML = '';
        status.textContent = t('protobuf.status.bad', { msg: String((e as Error).message) });
      }
    }

    [data, proto].forEach((el) => el.addEventListener('input', render));
    messageBox.addEventListener('change', render);

    /* 뜯은 것을 JSON 으로 — 스키마가 있어야 이름이 붙으니 그때가 쓸 만하다 */
    $<HTMLButtonElement>('#pbToJson').onclick = (): void => {
      try {
        const schema = all.find((m) => m.name === messageBox.value) ?? all[0];
        const pieces = decode(readBytes(data.value), schema, all);
        const out: Record<string, unknown> = {};
        for (const p of pieces) {
          const key = p.name ?? '#' + p.no;
          const value = p.children === undefined ? p.value : Object.fromEntries(p.children.map((c) => [c.name ?? '#' + c.no, c.value]));
          if (out[key] === undefined) out[key] = value;
          else if (Array.isArray(out[key])) (out[key] as unknown[]).push(value);
          else out[key] = [out[key], value];
        }
        $<HTMLTextAreaElement>('#pbJson').value = JSON.stringify(out, null, 2);
        status.textContent = t('protobuf.status.toJson');
      } catch (e) {
        status.textContent = t('protobuf.status.bad', { msg: String((e as Error).message) });
      }
    };

    $<HTMLButtonElement>('#pbFromJson').onclick = (): void => {
      try {
        syncMessages();
        const schema = all.find((m) => m.name === messageBox.value) ?? all[0];
        if (schema === undefined) throw new Error(t('protobuf.err.noSchema'));
        const bytes = encode(JSON.parse($<HTMLTextAreaElement>('#pbJson').value) as Record<string, unknown>, schema, all);
        data.value = toHex(bytes);
        render();
        status.textContent = t('protobuf.status.fromJson', { bytes: bytes.length });
      } catch (e) {
        status.textContent = t('protobuf.status.bad', { msg: String((e as Error).message) });
      }
    };

    // 주소로 부른 경우 (`?op=decode&data=089601`) (TASK-KL-205).
    const call = readInvocation(spec);
    if (call !== null && call.error === undefined) {
      if (call.args.data !== undefined) data.value = String(call.args.data);
      if (call.args.proto !== undefined) proto.value = String(call.args.proto);
    }

    render();
  }
})();
