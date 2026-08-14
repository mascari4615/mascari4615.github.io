/**
 * 정규식 테스터 (TASK-KL-088)
 * 하이라이트는 exec 루프로 만들되, 빈 매치(`a*` 류)에서 lastIndex 를 강제로 밀어 무한루프를 막는다.
 */
import { t, loadNamespace, locale } from '../../lib/i18n';
import { markLive } from './shared/say';
import { merged, parse as parseRegex, pieces as regexPieces, toRailroad, type Piece } from '../../core/regexplain';

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
          void Promise.all([loadNamespace('regextest'), loadNamespace('regexplain')]).then(function () {

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

            <!-- 시험만으로는 「왜 이게 잡히나」를 모른다 — 조각마다 무슨 뜻인지 + 철길 그림 (TASK-KL-316) -->
            <details id="rxExplainBox" style="margin-top:var(--space-lg);">
              <summary style="cursor:pointer;">${esc(t('regextest.explain.title'))}</summary>
              <div id="rxRail" style="overflow:auto; margin:10px 0;"></div>
              <div id="rxPieces" class="tool-list"></div>
            </details>
          `;
          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const pattern = $<HTMLInputElement>('#rxPattern');
          const flags = $<HTMLInputElement>('#rxFlags');
          const input = $<HTMLTextAreaElement>('#rxInput');
          const replace = $<HTMLInputElement>('#rxReplace');
          const highlight = $<HTMLElement>('#rxHighlight');
          const replaced = $<HTMLElement>('#rxReplaced');
          const status = $<HTMLElement>('#rxStatus');
          /* 이 줄은 **읽히는 자리**다 (TASK-KL-291) — 표시가 없으면 화면낭독기가 아무 말도 안 한다. */
          markLive(status);
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

            explain(pat);
          }

          /**
           * 조각마다 무슨 뜻인지 + 철길 그림 (TASK-KL-316).
           *
           * 시험만 있으면 「이게 왜 잡히나」를 못 배운다. 말은 **여기서** 만든다 —
           * 알맹이(`core/regexplain`)는 `what` 열쇠만 돌려주므로 영어·일본어 화면에서도 그 말이 나온다.
           */
          function explain(pat: string): void {
            const rail = $<HTMLElement>('#rxRail');
            const list = $<HTMLElement>('#rxPieces');
            if (pat === '') {
              rail.textContent = '';
              list.innerHTML = '';
              return;
            }
            try {
              const node = parseRegex(pat);
              rail.innerHTML = toRailroad(node, matchMedia('(prefers-color-scheme: dark)').matches);
              list.innerHTML = merged(regexPieces(node)).map(sentence).join('');
            } catch (e) {
              rail.textContent = '';
              const why = esc(t('regextest.explain.cannot')) + ' ' + esc(e instanceof Error ? e.message : String(e));
              list.innerHTML = '<div class="tool-list-row"><span class="tool-list-val">' + why + '</span></div>';
            }
          }

          /** 한 조각을 한 줄로. 몇 번인지는 뒤에 붙인다. */
          function sentence(piece: Piece): string {
            const what = t('regexplain.what.' + piece.what, { text: piece.text ?? '', name: piece.name ?? '' });
            const q = piece.quant;
            let times = '';
            if (q !== undefined) {
              if (q.min === 0 && q.max === undefined) times = t('regexplain.times.any');
              else if (q.min === 1 && q.max === undefined) times = t('regexplain.times.oneOrMore');
              else if (q.min === 0 && q.max === 1) times = t('regexplain.times.maybe');
              else if (q.max === undefined) times = t('regexplain.times.atLeast', { n: q.min });
              else if (q.min === q.max) times = t('regexplain.times.exact', { n: q.min });
              else times = t('regexplain.times.between', { min: q.min, max: q.max });
              if (q.lazy === true) times += ' ' + t('regexplain.times.lazy');
            }
            const pad = '&nbsp;&nbsp;'.repeat(piece.depth);
            return (
              '<div class="tool-list-row"><span class="tool-list-key">' + pad + esc(piece.text ?? '') + '</span>' +
              '<span class="tool-list-val">' + esc(what) + '</span>' +
              '<span class="tool-list-dim">' + esc(times) + '</span></div>'
            );
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
