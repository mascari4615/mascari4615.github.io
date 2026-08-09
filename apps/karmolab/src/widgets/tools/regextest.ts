/**
 * 정규식 테스터 (TASK-KL-088)
 * 하이라이트는 exec 루프로 만들되, 빈 매치(`a*` 류)에서 lastIndex 를 강제로 밀어 무한루프를 막는다.
 */
import { t, loadNamespace, locale } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* 예시는 **쓸 때** 만든다 — 표로 굳히면 말 묶음이 오기 전이라 한국어로 박힌다. */
  const presets = (): Array<{ label: string; pattern: string; flags: string; sample: string }> => [
    { label: t('regextest.preset.email'), pattern: '[\\w.+-]+@[\\w-]+\\.[\\w.]+', flags: 'g', sample: t('regextest.sample.email') },
    { label: t('regextest.preset.phone'), pattern: '01[016789]-?\\d{3,4}-?\\d{4}', flags: 'g', sample: '010-1234-5678 / 01098765432' },
    { label: 'URL', pattern: 'https?://[\\w./?=&%-]+', flags: 'g', sample: t('regextest.sample.url') },
    { label: t('regextest.preset.html'), pattern: '<[^>]+>', flags: 'g', sample: t('regextest.sample.html') },
    { label: t('regextest.preset.hangul'), pattern: t('regextest.pattern.hangul'), flags: 'g', sample: t('regextest.sample.hangul') },
    { label: t('regextest.preset.date'), pattern: '(\\d{4})-(\\d{2})-(\\d{2})', flags: 'g', sample: t('regextest.sample.date') },
    { label: t('regextest.preset.spaces'), pattern: '\\s{2,}', flags: 'g', sample: t('regextest.sample.spaces') }
  ];


  Toolbox.register({
    id: 'regextest',
    title: t('widgets.regextest.title', undefined, "정규식 테스터"),
    category: 'tool',
    desc: t('widgets-desc.regextest.desc', undefined, "정규표현식을 실시간으로 시험하고 매치·그룹·치환 결과를 확인합니다"),
    layout: 'wide',
    icon: '<path d="M12 4v16M5 8l14 8M19 8L5 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('regextest.t21', undefined, "정규식"),
        build: function (container: HTMLElement): void {
          void loadNamespace('regextest').then(function () {

          Mdd.linePreset('tool_run', { msg: t('regextest.mdd') });
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('regextest.label.pattern'))}</label>
              <div style="display:flex; gap:8px; align-items:center;">
                <span style="color:var(--text-tertiary); font-family:var(--font-mono);">/</span>
                <input type="text" id="rxPattern" class="mono-input" placeholder="[a-z]+" style="flex:1;">
                <span style="color:var(--text-tertiary); font-family:var(--font-mono);">/</span>
                <input type="text" id="rxFlags" aria-label="${esc(t('regextest.aria.flags'))}" class="mono-input" value="gm" style="width:70px;">
              </div>
              <div class="tool-chips" style="margin-top:10px;">
                ${presets().map((p, i) => `<button type="button" class="tool-chip rx-preset" data-i="${i}">${p.label}</button>`).join('')}
              </div>
              <div class="tool-status" style="margin-top:8px;">${esc(t('regextest.note.flags'))}</div>
            </div>

            <div class="tool-split">
              <div class="tool-split-pane">
                <label class="field-label">${esc(t('regextest.label.text'))}</label>
                <textarea id="rxInput" aria-label="${esc(t('regextest.aria.text'))}" class="mono-input" style="min-height:180px;"></textarea>
                <label class="field-label" style="margin-top:12px;">${esc(t('regextest.label.replace'))}</label>
                <input type="text" id="rxReplace" class="mono-input" placeholder="[$&]">
              </div>
              <div class="tool-split-pane">
                <label class="field-label">${esc(t('regextest.label.highlight'))}</label>
                <div id="rxHighlight" class="rx-highlight"></div>
                <label class="field-label" style="margin-top:12px;">${esc(t('regextest.label.replaced'))}</label>
                <div id="rxReplaced" class="rx-highlight"></div>
              </div>
            </div>

            <div class="tool-status" id="rxStatus" style="margin-top:var(--space-lg);">${esc(t('regextest.status.idle'))}</div>
            <div id="rxMatches" class="tool-list"></div>
          `;
          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const pattern = $<HTMLInputElement>('#rxPattern');
          const flags = $<HTMLInputElement>('#rxFlags');
          const input = $<HTMLTextAreaElement>('#rxInput');
          const replace = $<HTMLInputElement>('#rxReplace');
          const highlight = $<HTMLElement>('#rxHighlight');
          const replaced = $<HTMLElement>('#rxReplaced');
          const status = $<HTMLElement>('#rxStatus');
          const matchesEl = $<HTMLElement>('#rxMatches');

          function run(): void {
            const pat = pattern.value;
            const text = input.value;
            if (!pat) {
              highlight.innerHTML = esc(text);
              replaced.innerHTML = '';
              matchesEl.innerHTML = '';
              status.textContent = t('regextest.status.idle');
              status.className = 'tool-status';
              return;
            }
            let re: RegExp;
            try {
              re = new RegExp(pat, flags.value.includes('g') ? flags.value : flags.value + 'g');
            } catch (e) {
              status.textContent = t('regextest.err.pattern') + (e instanceof Error ? e.message : String(e));
              status.className = 'tool-status error';
              highlight.innerHTML = esc(text);
              matchesEl.innerHTML = '';
              return;
            }

            let html = '';
            let last = 0;
            let count = 0;
            const rows: string[] = [];
            let m: RegExpExecArray | null;
            while ((m = re.exec(text)) !== null) {
              count++;
              html += esc(text.slice(last, m.index)) + `<mark class="rx-mark">${esc(m[0]) || '∅'}</mark>`;
              last = m.index + m[0].length;
              const groups = m.slice(1).map((g, i) => `$${i + 1}=${g === undefined ? t('regextest.value.none') : g}`);
              const named = m.groups ? Object.keys(m.groups).map((k) => `${k}=${m?.groups?.[k]}`) : [];
              rows.push(
                `<div class="tool-list-row"><span class="tool-list-key">#${count} @${m.index}</span><span class="tool-list-val">${esc(m[0])}</span><span class="tool-list-dim">${esc([...groups, ...named].join(' · '))}</span></div>`
              );
              if (m[0] === '') re.lastIndex++;
              if (count > 5000) break;
            }
            html += esc(text.slice(last));
            highlight.innerHTML = html || t('regextest.hint.text');
            matchesEl.innerHTML = rows.slice(0, 200).join('');
            status.textContent = count
              ? t('regextest.value.matches', { n: count.toLocaleString(locale()) })
              : t('regextest.value.noMatch');
            status.className = 'tool-status ' + (count ? 'ok' : '');

            if (replace.value) {
              try {
                replaced.textContent = text.replace(re, replace.value);
              } catch (e) {
                replaced.textContent = t('regextest.err.replace') + (e instanceof Error ? e.message : String(e));
              }
            } else {
              replaced.innerHTML = t('regextest.hint.replace');
            }
          }

          [pattern, flags, input, replace].forEach((el) => el.addEventListener('input', run));
          container.querySelectorAll('.rx-preset').forEach((btn) => {
            (btn as HTMLButtonElement).onclick = () => {
              const p = presets()[Number((btn as HTMLElement).dataset.i)];
              pattern.value = p.pattern;
              flags.value = p.flags;
              if (!input.value.trim()) input.value = p.sample;
              run();
            };
          });

          pattern.value = presets()[0].pattern;
          input.value = presets()[0].sample;
          run();
                  });
        }
      }
    ]
  });
})();
