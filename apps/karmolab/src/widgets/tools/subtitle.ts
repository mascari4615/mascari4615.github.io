/**
 * 자막 시간 맞추기 (TASK-KL-088)
 *
 * 자막이 0.5초씩 어긋나 있으면 보는 내내 거슬린다. 그렇다고 자막을 다시 구하면 번역이 달라진다.
 * 시간만 밀면 되는 일인데, 그러자고 자막 편집기를 깔기는 아깝다.
 *
 * 신경 쓴 곳:
 *  - **점점 벌어지는 어긋남**은 미는 것으로 안 고쳐진다. 영화 프레임 수가 달라서 생기는 것이라
 *    시간을 비율로 늘려야 한다(23.976 ↔ 25 처럼). 두 방법을 다 둔다.
 *  - 첫 줄과 끝 줄 시각을 **바꾸기 전후로 나란히 보여 준다.** 자막은 눈으로 확인할 방법이
 *    영상을 틀어 보는 것뿐이라, 숫자로라도 맞는지 보여야 한다.
 *  - SRT 와 VTT 를 오간다. 웹 플레이어는 VTT 만 받고, 대부분의 자막은 SRT 로 돌아다닌다.
 */
(function (): void {
  interface Cue { start: number; end: number; text: string }

  /** `00:01:02,500` 또는 `00:01:02.500` → 초 */
  function parseTime(s: string): number {
    const m = s.trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/);
    if (!m) return NaN;
    return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;
  }

  function fmt(sec: number, vtt: boolean): string {
    const s = Math.max(0, sec); // 앞으로 너무 밀어 음수가 되면 0 으로 붙인다
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = Math.floor(s % 60);
    const ms = Math.round((s - Math.floor(s)) * 1000);
    const p = (n: number, w = 2): string => String(n).padStart(w, '0');
    return `${p(h)}:${p(m)}:${p(ss)}${vtt ? '.' : ','}${p(ms, 3)}`;
  }

  /** SRT·VTT 를 모두 받아 자막 줄로 만든다 (번호·머리말은 버린다) */
  function parse(text: string): Cue[] {
    const cues: Cue[] = [];
    const blocks = text.replace(/\r/g, '').replace(/^WEBVTT.*?\n/s, '').split(/\n{2,}/);
    for (const b of blocks) {
      const lines = b.split('\n').filter((l) => l.trim() !== '');
      const at = lines.findIndex((l) => l.includes('-->'));
      if (at < 0) continue;
      const [a, z] = lines[at].split('-->');
      const start = parseTime(a);
      const end = parseTime(z);
      if (isNaN(start) || isNaN(end)) continue;
      cues.push({ start, end, text: lines.slice(at + 1).join('\n') });
    }
    return cues;
  }

  function build(cues: Cue[], vtt: boolean): string {
    const body = cues
      .map((c, i) => `${vtt ? '' : i + 1 + '\n'}${fmt(c.start, vtt)} --> ${fmt(c.end, vtt)}\n${c.text}`)
      .join('\n\n');
    return (vtt ? 'WEBVTT\n\n' : '') + body + '\n';
  }

  Toolbox.register({
    id: 'subtitle',
    title: '자막 시간 맞추기',
    category: 'tool',
    desc: '어긋난 자막을 밀거나 늘려 맞춥니다. SRT·VTT 를 서로 바꿉니다',
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 14h5M13 14h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '자막',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="sbDrop">
              <input type="file" id="sbFile" accept=".srt,.vtt,text/plain" hidden>
              <span>자막 파일(.srt·.vtt)을 끌어다 놓거나, 아래에 그대로 붙여 넣으세요</span>
            </div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <label class="field-label" for="sbIn">자막 원본</label>
              <textarea id="sbIn" rows="7" spellcheck="false" style="width:100%;" placeholder="1&#10;00:00:01,000 --> 00:00:03,000&#10;첫 대사"></textarea>
            </div>

            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">시간 밀기 <span id="sbShiftVal" class="range-value">0초</span></div>
                  <input type="range" id="sbShift" aria-label="시간 밀기" min="-100" max="100" value="0">
                </div>
                <div>
                  <div class="tool-sublabel">점점 벌어질 때</div>
                  <select id="sbRate" aria-label="프레임 수 바꾸기">
                    <option value="1">그대로</option>
                    <option value="1.0427">23.976 → 25 (빨라짐)</option>
                    <option value="0.959">25 → 23.976 (느려짐)</option>
                    <option value="1.0010">23.976 → 24</option>
                    <option value="0.999">24 → 23.976</option>
                  </select>
                </div>
              </div>
              <div class="tool-chips" style="margin-top:10px;">
                <button type="button" class="tool-chip active" data-out="srt">SRT 로</button>
                <button type="button" class="tool-chip" data-out="vtt">VTT 로 (웹 플레이어)</button>
              </div>
            </div>

            <div class="cc-stats" id="sbStats"></div>
            <div class="tool-list" id="sbCompare"></div>

            <div class="field-group">
              <label class="field-label" for="sbOut">맞춘 자막</label>
              <textarea id="sbOut" rows="8" spellcheck="false" style="width:100%;" readonly></textarea>
              <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
                <button class="btn btn-ghost btn-sm" id="sbCopy">복사</button>
                <button class="btn btn-primary btn-sm" id="sbSave">파일로 받기</button>
              </div>
            </div>

            <div class="tool-status" id="sbStatus">자막은 브라우저 안에서만 다뤄집니다 — 어디에도 올리지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLTextAreaElement>('#sbIn');
          const out = $<HTMLTextAreaElement>('#sbOut');
          const stats = $<HTMLElement>('#sbStats');
          const compare = $<HTMLElement>('#sbCompare');
          const status = $<HTMLElement>('#sbStatus');
          let outFmt: 'srt' | 'vtt' = 'srt';
          let baseName = '자막';

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          function run(): void {
            const cues = parse(input.value);
            if (!cues.length) {
              out.value = '';
              stats.innerHTML = '';
              compare.innerHTML = '';
              say(input.value.trim() ? '자막 시간 줄(-->)을 못 찾았어요. SRT 나 VTT 인지 확인해 주세요.' : '자막을 붙여 넣거나 파일을 올려 보세요.', input.value.trim() ? 'error' : '');
              return;
            }
            const shift = parseInt($<HTMLInputElement>('#sbShift').value, 10) / 10;
            const rate = parseFloat($<HTMLSelectElement>('#sbRate').value);
            const moved = cues.map((c) => ({ ...c, start: c.start * rate + shift, end: c.end * rate + shift }));
            out.value = build(moved, outFmt === 'vtt');

            const clipped = moved.filter((c) => c.start < 0).length;
            stats.innerHTML =
              stat('자막 줄', `${cues.length}줄`, true) +
              stat('민 시간', `${shift >= 0 ? '+' : ''}${shift.toFixed(1)}초`) +
              stat('내보낼 형식', outFmt.toUpperCase());

            // 자막은 영상을 틀어 봐야 확인되는데, 숫자로라도 맞는지 보여 준다
            const row = (k: string, a: number, b: number): string =>
              `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${fmt(a, false)} → ${fmt(b, false)}</span></div>`;
            compare.innerHTML =
              row('첫 줄', cues[0].start, moved[0].start) +
              row('끝 줄', cues[cues.length - 1].start, moved[moved.length - 1].start);

            if (clipped) say(`${clipped}줄이 0초보다 앞으로 밀려 0초에 붙였어요. 너무 많이 당겼는지 보세요.`, 'error');
            else say(`${cues.length}줄을 맞췄어요. 위 첫 줄·끝 줄 시각이 맞는지 봐 주세요.`, 'ok');
            Toolbox.trackUse?.('subtitle');
          }

          const drop = $<HTMLElement>('#sbDrop');
          const fileInput = $<HTMLInputElement>('#sbFile');
          const readFile = (f: File): void => {
            baseName = (f.name || '자막').replace(/\.[^.]+$/, '');
            f.text().then((t) => {
              input.value = t;
              // 받은 것이 VTT 면 대개 그대로 VTT 로 쓰고 싶어 한다
              if (/^WEBVTT/.test(t.trim())) {
                outFmt = 'vtt';
                container.querySelectorAll('[data-out]').forEach((c) => c.classList.toggle('active', (c as HTMLElement).dataset.out === 'vtt'));
              }
              run();
            });
          };
          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) readFile(fileInput.files[0]);
          };
          drop.addEventListener('dragover', (e) => {
            e.preventDefault();
            drop.classList.add('over');
          });
          drop.addEventListener('dragleave', () => drop.classList.remove('over'));
          drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('over');
            const f = e.dataTransfer?.files?.[0];
            if (f) readFile(f);
          });

          input.addEventListener('input', run);
          $<HTMLInputElement>('#sbShift').addEventListener('input', () => {
            $<HTMLElement>('#sbShiftVal').textContent = (parseInt($<HTMLInputElement>('#sbShift').value, 10) / 10).toFixed(1) + '초';
            run();
          });
          $<HTMLSelectElement>('#sbRate').addEventListener('change', run);
          container.querySelectorAll('[data-out]').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              container.querySelectorAll('[data-out]').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
              outFmt = ((chip as HTMLElement).dataset.out as 'srt' | 'vtt') || 'srt';
              run();
            };
          });
          $<HTMLButtonElement>('#sbCopy').onclick = () => {
            void Toolbox.copyText?.(out.value, { message: '맞춘 자막을 복사했어요' });
          };
          $<HTMLButtonElement>('#sbSave').onclick = () => {
            if (!out.value) {
              say('먼저 자막을 넣어 주세요.', 'error');
              return;
            }
            const blob = new Blob([out.value], { type: 'text/plain;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${baseName}.${outFmt}`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            say(`${baseName}.${outFmt} 로 받았어요.`, 'ok');
          };
          run();
        }
      }
    ]
  });
})();
