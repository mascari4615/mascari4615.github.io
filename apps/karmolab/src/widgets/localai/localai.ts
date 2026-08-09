/**
 * 브라우저 안에서 도는 AI — 번역 · 요약 (TASK-KL-209).
 *
 * 왜 있나: KarmoLab 의 AI 는 전부 집 노트북 서버로 나간다. 그 한 대가 자면 AI 도구가 통째로
 * 쉰다. 브라우저에 모델이 들어오면서 **서버 없이·공짜로·오프라인** 도는 길이 생겼다.
 * 이 도구는 그 길만 쓴다 — 서버를 한 번도 안 부른다.
 *
 * 무엇을 **안 하나**: 서버 쓰는 AI 도구들을 이쪽으로 바꾸지 않는다. 내장 모델은 「똑똑한
 * 자동완성」 급이라 그림·긴 글·캐릭터 대화는 여전히 서버 몫이다. 없던 자리를 만들 뿐이다.
 *
 * 없는 브라우저에서: **없는 척하지 않는다.** 「이 브라우저는 아직」이라고 적고, 어디서 되는지
 * 알려 준다. 조용히 빈 화면을 두면 사람은 고장으로 읽는다.
 *
 * 모델은 처음 쓸 때 내려받는다(무료, 수십 MB). 그동안 화면이 멈춘 것처럼 보이는 것이 이
 * 기능의 유일한 사용자 함정이라, 진행률을 그대로 보여 준다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const ID = 'localai';

  interface DownloadMonitor {
    addEventListener: (type: 'downloadprogress', fn: (e: { loaded: number }) => void) => void;
  }
  interface TranslatorLike {
    translate: (text: string) => Promise<string>;
  }
  interface TranslatorApi {
    availability: (opts: { sourceLanguage: string; targetLanguage: string }) => Promise<string>;
    create: (opts: {
      sourceLanguage: string;
      targetLanguage: string;
      monitor?: (m: DownloadMonitor) => void;
    }) => Promise<TranslatorLike>;
  }
  interface SummarizerLike {
    summarize: (text: string) => Promise<string>;
  }
  interface SummarizerApi {
    availability: () => Promise<string>;
    create: (opts: {
      type?: string;
      format?: string;
      length?: string;
      monitor?: (m: DownloadMonitor) => void;
    }) => Promise<SummarizerLike>;
  }
  interface PromptLike {
    prompt: (text: string) => Promise<string>;
    destroy?: () => void;
  }
  interface PromptApi {
    availability: () => Promise<string>;
    create: (opts?: { monitor?: (m: DownloadMonitor) => void; initialPrompts?: Array<{ role: string; content: string }> }) => Promise<PromptLike>;
  }
  interface DetectorApi {
    availability: () => Promise<string>;
    create: (opts?: { monitor?: (m: DownloadMonitor) => void }) => Promise<{
      detect: (text: string) => Promise<Array<{ detectedLanguage: string; confidence: number }>>;
    }>;
  }

  const g = globalThis as unknown as {
    Translator?: TranslatorApi;
    Summarizer?: SummarizerApi;
    LanguageModel?: PromptApi;
    LanguageDetector?: DetectorApi;
  };

  const LANGS: Array<[string, string]> = [
    ['ko', t('localai.t12')],
    ['en', t('localai.t13')],
    ['ja', t('localai.t14')],
    ['zh', t('localai.t15')],
    ['es', t('localai.t16')],
    ['fr', t('localai.t17')],
    ['de', t('localai.t18')],
    ['vi', t('localai.t19')],
  ];


  /** 안 되는 브라우저에 놓는 안내 — 빈 화면 대신 **왜 안 되는지**를 적는다. */
  function unsupported(what: string): string {
    return `<div class="lai-note">
        <strong>이 브라우저에서는 ${esc(what)}을 아직 못 씁니다.</strong><br>
        ${esc(t('localai.t01'))}<br>
        <span class="lai-dim">${esc(t('localai.t02'))}</span>
      </div>`;
  }

  Mdd.injectCSS(
    'localai',
    `
      .lai-wrap { display:flex; flex-direction:column; gap:14px; }
      .lai-note { padding:12px 14px; border:1px dashed var(--border); border-radius:var(--radius-lg);
          font-size:var(--font-size-sm); color:var(--text-secondary); line-height:1.65; }
      .lai-dim { color:var(--text-tertiary); font-size:var(--font-size-xs); }
      .lai-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
      .lai-ta { width:100%; min-height:130px; padding:12px; box-sizing:border-box;
          background:var(--bg-tertiary); border:1px solid var(--border); border-radius:var(--radius-md);
          color:var(--text-primary); font-family:inherit; font-size:var(--font-size-sm); line-height:1.6;
          resize:vertical; }
      .lai-out { min-height:130px; padding:12px; background:var(--bg-secondary);
          border:1px solid var(--border); border-radius:var(--radius-md); color:var(--text-primary);
          font-size:var(--font-size-sm); line-height:1.7; white-space:pre-wrap; }
      .lai-out:empty::before { content:'결과가 여기 나옵니다'; color:var(--text-tertiary); }
      .lai-bar { height:6px; background:var(--bg-tertiary); border-radius:999px; overflow:hidden; }
      .lai-bar > span { display:block; height:100%; background:var(--accent); width:0%; transition:width .2s; }
      .lai-state { font-size:11px; color:var(--text-tertiary); }
    `
  );

  /**
   * **영원히 기다리지 않는다** (실측으로 얻음).
   *
   * 모델을 못 받는 환경이 있다(정책·저장공간·기기). 그때 `create()` 는 오류도 안 내고 그냥
   * 안 돌아온다 — 화면은 「준비 중…」에 멈춘 채고, 사람은 그것을 **고장으로 읽는다**.
   * 그래서 시간을 재고, 넘으면 왜 못 했는지 적고 끝낸다. 멈춘 화면보다 솔직한 실패가 낫다.
   */
  function withLimit<T>(work: Promise<T>, seconds: number, what: string): Promise<T> {
    return Promise.race([
      work,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(t('localai.notReady', { what, seconds }))), seconds * 1000)
      ),
    ]);
  }

  /** 가용성 값을 사람 말로. 「downloadable」 같은 낱말을 그대로 보여 주지 않는다. */
  function sayAvailability(state: string): string {
    if (state === 'available') return t('localai.t20');
    if (state === 'downloadable') return t('localai.t21');
    if (state === 'downloading') return t('localai.t22');
    return t('localai.t23');
  }

  /** 모델 내려받기 진행률을 그대로 보여 준다 — 안 보여 주면 「멈췄다」로 읽힌다. */
  function progressWatcher(bar: HTMLElement, state: HTMLElement) {
    return (m: DownloadMonitor): void => {
      m.addEventListener('downloadprogress', (e) => {
        const pct = Math.round((e.loaded || 0) * 100);
        (bar.firstElementChild as HTMLElement).style.width = `${pct}%`;
        state.textContent = t('localai.downloading', { pct });
      });
    };
  }

  function buildTranslate(container: HTMLElement): void {
    if (!g.Translator) {
      container.innerHTML = unsupported(t('localai.t24'));
      return;
    }
    container.innerHTML = `
      <div class="lai-wrap">
        <div class="lai-note">
          ${esc(t('localai.t03'))} <b>${esc(t('localai.t04'))}</b> ${esc(t('localai.t05'))}
        </div>
        <div class="lai-row">
          <label class="lai-state" for="laiFrom">${esc(t('localai.label.laiFrom'))}</label>
          <select id="laiFrom">
            <option value="auto">${esc(t('localai.opt.auto'))}</option>
            ${LANGS.map(([code, name]) => `<option value="${code}">${esc(name)}</option>`).join('')}
          </select>
          <span class="lai-state">→</span>
          <select id="laiTo">
            ${LANGS.map(([code, name]) => `<option value="${code}"${code === 'en' ? ' selected' : ''}>${esc(name)}</option>`).join('')}
          </select>
          <button type="button" class="btn" id="laiRun">${esc(t('localai.btn.laiRun'))}</button>
        </div>
        <textarea id="laiIn" class="lai-ta" placeholder="${esc(t('localai.ph.laiIn'))}"></textarea>
        <div class="lai-bar"><span></span></div>
        <div class="lai-state" id="laiState"></div>
        <div class="lai-out" id="laiOut"></div>
      </div>`;

    const input = container.querySelector('#laiIn') as HTMLTextAreaElement;
    const out = container.querySelector('#laiOut') as HTMLElement;
    const state = container.querySelector('#laiState') as HTMLElement;
    const bar = container.querySelector('.lai-bar') as HTMLElement;
    const from = container.querySelector('#laiFrom') as HTMLSelectElement;
    const to = container.querySelector('#laiTo') as HTMLSelectElement;
    const run = container.querySelector('#laiRun') as HTMLButtonElement;

    async function detect(text: string): Promise<string | null> {
      if (!g.LanguageDetector) return null;
      try {
        const detector = await withLimit(g.LanguageDetector.create(), 20, t('localai.t25'));
        const guesses = await withLimit(detector.detect(text.slice(0, 400)), 15, t('localai.t25'));
        return guesses?.[0]?.detectedLanguage || null;
      } catch {
        return null; // 감지가 안 되면 사람에게 고르라고 한다 — 틀린 언어로 번역하는 것보다 낫다
      }
    }

    run.onclick = async (): Promise<void> => {
      const text = input.value.trim();
      if (!text) {
        state.textContent = t('localai.t26');
        return;
      }
      run.disabled = true;
      out.textContent = '';
      state.textContent = t('localai.t27');
      try {
        let source = from.value;
        if (source === 'auto') {
          const guessed = await detect(text);
          if (!guessed) {
            state.textContent = t('localai.t28');
            run.disabled = false;
            return;
          }
          source = guessed;
          state.textContent = t('localai.guessed', { lang: esc(LANGS.find((l) => l[0] === guessed)?.[1] || guessed) });
        }
        if (source === to.value) {
          state.textContent = t('localai.t29');
          run.disabled = false;
          return;
        }
        const pair = { sourceLanguage: source, targetLanguage: to.value };
        /* 물어보는 것조차 안 돌아오는 환경이 있다(실측: 헤드리스에서 여기서 멈췄다).
           그래서 **첫 단계부터** 시간을 잰다 — 안 그러면 「준비 중…」에서 영영 멈춘다. */
        const can = await withLimit(g.Translator!.availability(pair), 15, t('localai.t30'));
        state.textContent = sayAvailability(can);
        if (can === 'unavailable') {
          run.disabled = false;
          return;
        }
        const translator = await withLimit(
          g.Translator!.create({ ...pair, monitor: progressWatcher(bar, state) }),
          can === 'available' ? 20 : 120,
          t('localai.t31')
        );
        state.textContent = t('localai.t32');
        out.textContent = await withLimit(translator.translate(text), 60, t('localai.btn.laiRun'));
        state.textContent = t('localai.t33');
        Toolbox.trackUse?.('localai-translate');
      } catch (err) {
        /* 실패해도 **왜인지** 적는다 — 빈 화면은 고장으로 읽힌다. */
        state.textContent = t('localai.failTranslate', { why: String(err).split('\n')[0].slice(0, 110) });
      } finally {
        run.disabled = false;
      }
    };
  }

  function buildSummarize(container: HTMLElement): void {
    if (!g.Summarizer) {
      container.innerHTML = unsupported(t('localai.t34'));
      return;
    }
    container.innerHTML = `
      <div class="lai-wrap">
        <div class="lai-note">
          ${esc(t('localai.t06'))} <b>${esc(t('localai.t04'))}</b> ${esc(t('localai.t07'))}
          <span class="lai-dim">${esc(t('localai.t08'))}</span>
        </div>
        <div class="lai-row">
          <select id="laiLen">
            <option value="short">${esc(t('localai.opt.short'))}</option>
            <option value="medium" selected>${esc(t('localai.opt.medium'))}</option>
            <option value="long">${esc(t('localai.opt.long'))}</option>
          </select>
          <select id="laiType">
            <option value="tldr" selected>${esc(t('localai.opt.tldr'))}</option>
            <option value="key-points">${esc(t('localai.opt.keypoints'))}</option>
            <option value="teaser">${esc(t('localai.opt.teaser'))}</option>
          </select>
          <button type="button" class="btn" id="laiSum">${esc(t('localai.btn.laiSum'))}</button>
        </div>
        <textarea id="laiSumIn" class="lai-ta" placeholder="${esc(t('localai.ph.laiSumIn'))}"></textarea>
        <div class="lai-bar"><span></span></div>
        <div class="lai-state" id="laiSumState"></div>
        <div class="lai-out" id="laiSumOut"></div>
      </div>`;

    const input = container.querySelector('#laiSumIn') as HTMLTextAreaElement;
    const out = container.querySelector('#laiSumOut') as HTMLElement;
    const state = container.querySelector('#laiSumState') as HTMLElement;
    const bar = container.querySelector('.lai-bar') as HTMLElement;
    const btn = container.querySelector('#laiSum') as HTMLButtonElement;

    btn.onclick = async (): Promise<void> => {
      const text = input.value.trim();
      if (!text) {
        state.textContent = t('localai.t35');
        return;
      }
      btn.disabled = true;
      out.textContent = '';
      state.textContent = t('localai.t27');
      try {
        const can = await withLimit(g.Summarizer!.availability(), 15, t('localai.t36'));
        state.textContent = sayAvailability(can);
        if (can === 'unavailable') {
          btn.disabled = false;
          return;
        }
        const summarizer = await withLimit(
          g.Summarizer!.create({
            type: (container.querySelector('#laiType') as HTMLSelectElement).value,
            length: (container.querySelector('#laiLen') as HTMLSelectElement).value,
            format: 'plain-text',
            monitor: progressWatcher(bar, state),
          }),
          can === 'available' ? 20 : 120,
          t('localai.t37')
        );
        state.textContent = t('localai.t38');
        out.textContent = await withLimit(summarizer.summarize(text), 90, t('localai.btn.laiSum'));
        state.textContent = t('localai.t33');
        Toolbox.trackUse?.('localai-summarize');
      } catch (err) {
        state.textContent = t('localai.failSummarize', { why: String(err).split('\n')[0].slice(0, 110) });
      } finally {
        btn.disabled = false;
      }
    };
  }

  /**
   * 짧은 생성 — 「똑똑한 자동완성」 급이라 **그렇게 쓴다** (TASK-KL-209 ③).
   *
   * 무거운 것(긴 글·사실 확인·캐릭터 대화)은 서버 몫이다. 여기서는 다듬기·이름 짓기처럼
   * 짧고 틀려도 되는 일만 시킨다 — 그게 이 모델이 잘하는 자리다.
   */
  function buildPrompt(container: HTMLElement): void {
    if (!g.LanguageModel) {
      container.innerHTML = unsupported(t('localai.t39'));
      return;
    }
    container.innerHTML = `
      <div class="lai-wrap">
        <div class="lai-note">
          ${esc(t('localai.t09'))} <b>${esc(t('localai.t04'))}</b> ${esc(t('localai.t10'))}
          <span class="lai-dim">${esc(t('localai.t11'))}</span>
        </div>
        <textarea id="laiPIn" class="lai-ta" placeholder="${esc(t('localai.ph.laiPIn'))}"></textarea>
        <div class="lai-row"><button type="button" class="btn" id="laiPRun">${esc(t('localai.btn.laiPRun'))}</button></div>
        <div class="lai-bar"><span></span></div>
        <div class="lai-state" id="laiPState"></div>
        <div class="lai-out" id="laiPOut"></div>
      </div>`;
    const input = container.querySelector('#laiPIn') as HTMLTextAreaElement;
    const out = container.querySelector('#laiPOut') as HTMLElement;
    const state = container.querySelector('#laiPState') as HTMLElement;
    const bar = container.querySelector('.lai-bar') as HTMLElement;
    const btn = container.querySelector('#laiPRun') as HTMLButtonElement;

    btn.onclick = async (): Promise<void> => {
      const text = input.value.trim();
      if (!text) {
        state.textContent = t('localai.t40');
        return;
      }
      btn.disabled = true;
      out.textContent = '';
      state.textContent = t('localai.t27');
      try {
        const can = await withLimit(g.LanguageModel!.availability(), 15, t('localai.t41'));
        state.textContent = sayAvailability(can);
        if (can === 'unavailable') {
          btn.disabled = false;
          return;
        }
        const session = await withLimit(
          g.LanguageModel!.create({ monitor: progressWatcher(bar, state) }),
          can === 'available' ? 20 : 180,
          t('localai.t42')
        );
        state.textContent = t('localai.t43');
        out.textContent = await withLimit(session.prompt(text), 90, t('localai.t44'));
        state.textContent = t('localai.t33');
        session.destroy?.();
        Toolbox.trackUse?.('localai-prompt');
      } catch (err) {
        state.textContent = t('localai.fail', { why: String(err).split(String.fromCharCode(10))[0].slice(0, 110) });
      } finally {
        btn.disabled = false;
      }
    };
  }

  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta(ID),
    tabs: [
      {
        id: 'localai-translate',
        label: t('localai.tab.translate', undefined, '번역'),
        /* 그리기 전에 말 묶음을 받는다 — 화면 글자가 전부 그 안에서 만들어진다. */
        build: function (container: HTMLElement): void {
          void loadNamespace('localai').then(function () {
            buildTranslate(container);
          });
        },
      },
      {
        id: 'localai-summarize',
        label: t('localai.tab.summarize', undefined, '요약'),
        /* 그리기 전에 말 묶음을 받는다 — 화면 글자가 전부 그 안에서 만들어진다. */
        build: function (container: HTMLElement): void {
          void loadNamespace('localai').then(function () {
            buildSummarize(container);
          });
        },
      },
      {
        id: 'localai-prompt',
        label: t('localai.tab.prompt', undefined, '짧은 생성'),
        /* 그리기 전에 말 묶음을 받는다 — 화면 글자가 전부 그 안에서 만들어진다. */
        build: function (container: HTMLElement): void {
          void loadNamespace('localai').then(function () {
            buildPrompt(container);
          });
        },
      },
    ],
  });
})();
