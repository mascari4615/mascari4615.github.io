/**
 * 논문에게 묻기 (TASK-KL-238 / 34 elicit · 35 consensus · 38 scispace)
 *
 * 셋은 화면만 다르고 알맹이가 같다 — **물음을 던지면 논문이 답하게 한다.** 그 셋의 진짜 재산은
 * 모델이 아니라 색인(수억 편)인데, 그건 OpenAlex 가 키 없이 준다. 그래서 우리가 지은 것은
 * 「초록에서 물음에 답하는 문장을 고르는 규칙」(`lib/paperask`) 하나다.
 *
 * ★ 이 화면의 규율: **논문이 쓴 문장을 그대로 보여 준다.** 요약을 지어 얹으면 「논문이 그렇게
 *   말했다」로 읽히는데 그건 우리가 책임질 수 없는 말이다. 그래서 답 칸에는 늘 **원문 문장**과
 *   그 논문으로 가는 링크가 함께 선다 — 못 미덥거든 그 자리에서 확인하라는 뜻이다.
 *
 * 이미 있는 것과의 자리 나누기: 「논문 지도」(`papermap`)는 *무엇부터 읽나*, 여기는 *그래서 뭐래*.
 */
import { searchWithAbstracts, type Paper } from '../../lib/openalex';
import { askPapers, tally } from '../../lib/paperask';
import { statusLine } from './shared/say';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: unknown): string =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'askpapers',
    title: t('widgets.askpapers.title', undefined, '논문에게 묻기'),
    category: 'tool',
    desc: t(
      'widgets-desc.askpapers.desc',
      undefined,
      '물음을 던지면 논문이 답합니다. 지어낸 요약이 아니라 초록에 실제로 있는 문장을 그대로 뽑아 링크와 함께 보여 줍니다'
    ),
    layout: 'wide',
    icon: '<path d="M5 4h11l3 3v13H5z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M16 4v3h3" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M9 12h6M9 15.5h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="9" r="0" fill="currentColor"/>',
    tabs: [
      {
        id: 'app',
        label: t('askpapers.tab', undefined, '묻기'),
        build: function (container: HTMLElement): void {
          void loadNamespace('askpapers').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    container.innerHTML = `
      <div class="field-group">
        <label class="field-label" for="apQ">${esc(t('askpapers.label.q'))}</label>
        <input type="text" id="apQ" name="q" spellcheck="false" placeholder="${esc(t('askpapers.placeholder'))}">
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin:10px 0 var(--space-lg);">
        <button class="btn btn-primary" id="apRun">${esc(t('askpapers.btn.run'))}</button>
      </div>
      <div class="tool-display" id="apTally">—</div>
      <div id="apList"></div>
      <div class="tool-status" id="apStatus">${esc(t('askpapers.status.idle'))}</div>
      <p class="tool-hint tool-note">${esc(t('askpapers.note.limits'))}</p>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const input = $<HTMLInputElement>('#apQ');
    const button = $<HTMLButtonElement>('#apRun');
    const list = $<HTMLElement>('#apList');
    const tallyBox = $<HTMLElement>('#apTally');
    const say = statusLine($<HTMLElement>('#apStatus'));

    let running = false;

    async function run(): Promise<void> {
      const question = input.value.trim();
      if (question === '') {
        say(t('askpapers.say.needQ'), 'error');
        return;
      }
      if (running) return;
      running = true;
      button.disabled = true;
      list.innerHTML = '';
      tallyBox.textContent = '—';
      say(t('askpapers.say.asking', { q: question }));

      const papers: Paper[] = await searchWithAbstracts(question, 8);
      if (papers.length === 0) {
        say(t('askpapers.say.none'), 'error');
        running = false;
        button.disabled = false;
        return;
      }

      const answered = askPapers(papers, question, 2);
      const counted = tally(papers, answered);
      /* ★ **답 못 한 편도 숫자로 밝힌다** — 「8편 찾음」만 보이면 여덟 편이 답한 줄 안다. */
      tallyBox.textContent =
        counted === null
          ? '—'
          : t('askpapers.tally', {
              answered: String(counted.answered),
              asked: String(counted.asked),
              from: String(counted.fromYear || '?'),
              to: String(counted.toYear || '?'),
              cited: counted.topCited.toLocaleString()
            });

      list.innerHTML = answered
        .map(({ paper, picks }) => {
          const who = paper.authors.slice(0, 3).join(', ') + (paper.authors.length> 3 ? ' 외' : '');
          const head = paper.url
            ? `<a href="${esc(paper.url)}" target="_blank" rel="noopener noreferrer">${esc(paper.title)}</a>`
            : esc(paper.title);
          return (
            `<div class="tool-list-row" style="display:block; padding:10px 0;">` +
            `<div style="font-weight:600;">${head}</div>` +
            `<div class="tool-list-dim">${esc(who)} · ${esc(String(paper.year || '?'))} · ${esc(t('askpapers.cited', { n: paper.cited.toLocaleString() }))}</div>` +
            picks
              .map((p) => `<blockquote style="margin:6px 0 0; padding-left:10px; border-left:2px solid var(--accent, #6aa9ff);">${esc(p.sentence)}</blockquote>`)
              .join('') +
            `</div>`
          );
        })
        .join('');

      say(
        answered.length === 0
          ? t('askpapers.say.noAnswer', { n: String(papers.length) })
          : t('askpapers.say.done', { n: String(answered.length) }),
        answered.length === 0 ? 'error' : 'ok'
      );
      running = false;
      button.disabled = false;
      Toolbox.trackUse?.('ask');
    }

    button.onclick = () => void run();
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') void run();
    });

    // 주소로 바로 (`?q=...`) — 남에게 「이거 봐」로 보낼 수 있어야 물음이 오간다.
    const from = new URLSearchParams(location.search).get('q');
    if (from !== null && from !== '') {
      input.value = from;
      void run();
    }
  }
})();
