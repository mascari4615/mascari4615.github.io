/**
 * 잠깐 쓰는 메일 (흡혈 원장 3, 50 temp-mail / TASK-KL-339)
 *
 * 10분만 사는 주소를 만들어 확인 메일을 받는다. 셈, 통신은 `lib/tempmail`.
 *
 * ★ 이 도구가 바깥 temp-mail 과 다른 점: **주소를 알아도 못 읽는다.** 발급할 때 열쇠를
 * 따로 받아 이 탭에만 두고(sessionStorage), 조회에 그 열쇠를 쓴다. 주소는 남에게 줘도 된다.
 *
 * ★ 안 켜졌으면 그렇다고 말한다. 편지를 받는 문은 사람이 Cloudflare 대시보드에서 켠다.
 * 그전까지 주소만 그럴듯하게 내주고 편지가 영영 안 오는 게 제일 나쁘다.
 */
import { escapeHtml as esc } from './shared/text';
import { markLive } from './shared/say';
import { t, loadNamespace } from '../../lib/i18n';
import { intervalWhileVisible } from '../../lib/tick';
import {
  TTL_CHOICES,
  askReady,
  codeIn,
  dropBox,
  forget,
  leftSay,
  openBox,
  preview,
  readBox,
  recall,
  type Letter,
  type Mailbox
} from '../../lib/tempmail';

(function (): void {
  Toolbox.register({
    id: 'tempmail',
    title: t('widgets.tempmail.title', undefined, '잠깐 쓰는 메일'),
    category: 'dev',
    desc: t(
      'widgets-desc.tempmail.desc',
      undefined,
      '10분만 사는 메일 주소를 만들어 확인 메일을 받습니다. 주소를 알아도 열쇠 없이는 못 읽습니다'
    ),
    layout: 'wide',
    icon:
      '<rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/>' +
      '<path d="M3 7l9 6 9-6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="18.5" cy="17.5" r="3.6" fill="var(--bg-secondary, #fff)" stroke="currentColor" stroke-width="1.4"/>' +
      '<path d="M18.5 15.6v2l1.3 1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('tempmail.tab', undefined, '메일'),
        build: function (container: HTMLElement): void {
          void loadNamespace('tempmail').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('tempmail.mdd') });
    container.innerHTML = `
      <div style="display:flex; gap:10px; margin-bottom:10px; flex-wrap:wrap; align-items:center;">
        <label class="tool-checkline" for="tmTtl">${esc(t('tempmail.label.ttl'))}</label>
        <select id="tmTtl" name="minutes" aria-label="${esc(t('tempmail.label.ttl'))}"
                style="height:38px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg); padding:0 10px;">
          ${TTL_CHOICES.map((m) => `<option value="${m}">${esc(t('tempmail.opt.minutes', { n: m }))}</option>`).join('')}
        </select>
        <button class="btn btn-primary" id="tmNew">${esc(t('tempmail.btn.new'))}</button>
        <button class="btn btn-ghost" id="tmDrop" style="display:none">${esc(t('tempmail.btn.drop'))}</button>
      </div>

      <div id="tmBoxRow" style="display:none; align-items:center; gap:10px; flex-wrap:wrap; border:1px solid var(--border); border-radius:var(--radius-xl); padding:10px 12px; margin-bottom:10px;">
        <code id="tmAddr" style="font-size:1.1em; user-select:all;"></code>
        <button class="btn btn-ghost" id="tmCopy">${esc(t('tempmail.btn.copy'))}</button>
        <span class="range-value" id="tmLeft"></span>
      </div>

      <div id="tmCode" style="display:none; border:1px solid var(--border); border-radius:var(--radius-xl); padding:10px 12px; margin-bottom:10px;">
        <div class="tool-sublabel">${esc(t('tempmail.code.label'))}</div>
        <div style="display:flex; gap:10px; align-items:center;">
          <code id="tmCodeValue" style="font-size:1.6em; letter-spacing:.08em; user-select:all;"></code>
          <button class="btn btn-ghost" id="tmCodeCopy">${esc(t('tempmail.btn.copy'))}</button>
        </div>
      </div>

      <div id="tmList"></div>
      <div class="tool-status" id="tmStatus">${esc(t('tempmail.status.idle'))}</div>
      <p class="tool-hint tool-note">${esc(t('tempmail.note.limits'))}</p>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const status = $<HTMLElement>('#tmStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). 편지가 왔는지를 여기로 듣는다. */
    markLive(status);

    let box: Mailbox | null = recall();
    let letters: Letter[] = [];
    let opened: string | null = null;
    /** 되풀이 시계 둘을 멈추는 손잡이. **보이는 동안만** 돈다 (`lib/tick`). */
    let stopPolling: (() => void) | null = null;
    let stopClock: (() => void) | null = null;
    const stopAll = (): void => {
      stopPolling?.();
      stopClock?.();
      stopPolling = null;
      stopClock = null;
    };

    /* 위젯이 갈아 끼워질 때 시계를 놓고 간다. 안 놓으면 갈아 끼울 때마다 쌓인다. */
    Toolbox.onDispose?.(stopAll);

    /** 아직 안 켜졌으면 **그렇게 말한다.** 주소만 그럴듯하게 내주는 게 제일 나쁘다. */
    void askReady().then((ready) => {
      if (ready === null) {
        status.textContent = t('tempmail.status.noRelay');
        return;
      }
      if (!ready.ready) {
        status.textContent = t('tempmail.status.notOn');
        $<HTMLButtonElement>('#tmNew').disabled = true;
      }
    });

    function renderBox(): void {
      const row = $<HTMLElement>('#tmBoxRow');
      if (box === null) {
        row.style.display = 'none';
        $<HTMLButtonElement>('#tmDrop').style.display = 'none';
        $<HTMLElement>('#tmCode').style.display = 'none';
        return;
      }
      row.style.display = 'flex';
      $<HTMLButtonElement>('#tmDrop').style.display = '';
      $<HTMLElement>('#tmAddr').textContent = box.address;
      $<HTMLElement>('#tmLeft').textContent = leftSay(box.expiresAt);
    }

    function renderLetters(): void {
      const list = $<HTMLElement>('#tmList');
      if (box === null) {
        list.innerHTML = '';
        return;
      }
      if (letters.length === 0) {
        list.innerHTML = `<p class="tool-hint">${esc(t('tempmail.list.empty'))}</p>`;
        return;
      }
      list.innerHTML = letters
        .slice()
        .reverse()
        .map((l) => {
          const body = opened === l.id ? `<pre class="tool-pre" style="white-space:pre-wrap; margin:8px 0 0;">${esc(l.text)}</pre>` : '';
          return `<div class="tool-row" data-id="${esc(l.id)}" style="border:1px solid var(--border); border-radius:var(--radius-xl); padding:10px 12px; margin-bottom:8px; cursor:pointer;">
            <div style="display:flex; gap:8px; justify-content:space-between; flex-wrap:wrap;">
              <strong>${esc(l.subject || t('tempmail.list.noSubject'))}</strong>
              <span class="tool-hint">${esc(l.from)}</span>
            </div>
            <div class="tool-hint">${esc(preview(l.text))}</div>
            ${body}
          </div>`;
        })
        .join('');
      list.querySelectorAll<HTMLElement>('.tool-row').forEach((el) => {
        el.onclick = (): void => {
          const id = el.dataset.id ?? '';
          opened = opened === id ? null : id;
          renderLetters();
        };
      });

      /* 확인 코드를 맨 위에 크게. 이 도구를 쓰는 이유의 열에 아홉이 그거다. */
      const newest = letters[letters.length - 1];
      const code = newest ? codeIn(newest.text) : null;
      const panel = $<HTMLElement>('#tmCode');
      if (code === null) {
        panel.style.display = 'none';
      } else {
        panel.style.display = '';
        $<HTMLElement>('#tmCodeValue').textContent = code;
      }
    }

    async function refresh(): Promise<void> {
      if (box === null) return;
      const got = await readBox(box);
      if (got === null) {
        /* 사라졌거나 열쇠가 안 맞는다. 뒷단은 둘을 구별해 주지 않는다(그게 맞다). */
        box = null;
        forget();
        stopAll();
        renderBox();
        renderLetters();
        status.textContent = t('tempmail.status.gone');
        return;
      }
      const grew = got.length > letters.length;
      letters = got;
      renderLetters();
      if (grew) status.textContent = t('tempmail.status.arrived', { n: letters.length });
    }

    function start(): void {
      stopAll();
      /*
       * 5초에 한 번 묻는다. 확인 메일은 대개 십몇 초 안에 온다. 더 자주 물으면 남의 서버다.
       *
       * ★ **숨은 탭에서는 안 묻는다** (`intervalWhileVisible`). 확인 메일을 기다리는 사람은
       * 대개 이 탭을 떠나 가입 창에 가 있는데, 그 사이에도 5초마다 남의 서버를 두드리면
       * 그건 배터리를 태우는 것이다. 돌아오면 **곧바로 한 번** 물어 밀린 편지를 보여 준다.
       */
      stopPolling = intervalWhileVisible(() => void refresh(), 5000);
      /* 남은 시간은 따로 센다. 편지를 안 물어도 시계는 줄어야 한다. */
      stopClock = intervalWhileVisible(renderBox, 1000);
      document.addEventListener('visibilitychange', onBack);
      void refresh();
    }

    /** 탭으로 돌아오면 기다리지 않고 바로 묻는다. 5초를 더 기다리게 하면 느려 보인다. */
    const onBack = (): void => {
      if (!document.hidden && box !== null) void refresh();
    };

    $<HTMLButtonElement>('#tmNew').onclick = async (): Promise<void> => {
      status.textContent = t('tempmail.status.making');
      const minutes = Number($<HTMLSelectElement>('#tmTtl').value);
      const got = await openBox(minutes);
      if (got === null) {
        status.textContent = t('tempmail.status.failed');
        return;
      }
      box = got;
      letters = [];
      opened = null;
      renderBox();
      renderLetters();
      status.textContent = t('tempmail.status.ready');
      start();
    };

    $<HTMLButtonElement>('#tmDrop').onclick = async (): Promise<void> => {
      if (box === null) return;
      await dropBox(box);
      box = null;
      letters = [];
      stopAll();
      renderBox();
      renderLetters();
      status.textContent = t('tempmail.status.dropped');
    };

    const copy = (text: string): void => {
      void Toolbox.copyText?.(text, { message: t('tempmail.status.copied') });
    };
    $<HTMLButtonElement>('#tmCopy').onclick = (): void => {
      if (box !== null) copy(box.address);
    };
    $<HTMLButtonElement>('#tmCodeCopy').onclick = (): void => copy($<HTMLElement>('#tmCodeValue').textContent ?? '');

    /* 새로고침해도 이 탭에서는 그 주소가 그대로다. 열쇠가 세션에 남아 있다. */
    if (box !== null) {
      renderBox();
      status.textContent = t('tempmail.status.resumed');
      start();
    }
    renderLetters();
  }
})();
