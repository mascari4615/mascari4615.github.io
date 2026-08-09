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
(function (): void {
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
    ['ko', '한국어'],
    ['en', '영어'],
    ['ja', '일본어'],
    ['zh', '중국어(간체)'],
    ['es', '스페인어'],
    ['fr', '프랑스어'],
    ['de', '독일어'],
    ['vi', '베트남어'],
  ];

  function esc(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** 안 되는 브라우저에 놓는 안내 — 빈 화면 대신 **왜 안 되는지**를 적는다. */
  function unsupported(what: string): string {
    return `<div class="lai-note">
        <strong>이 브라우저에서는 ${esc(what)}을 아직 못 씁니다.</strong><br>
        브라우저 안에 든 모델을 쓰는 기능이라, 크롬 계열의 최근 판이 필요합니다
        (다른 AI 도구들은 그대로 씁니다 — 그건 서버가 합니다).<br>
        <span class="lai-dim">여기서 도는 것은 전부 이 기기 안에서 끝납니다. 글이 밖으로 안 나갑니다.</span>
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
        setTimeout(() => reject(new Error(`${what}이(가) ${seconds}초 안에 준비되지 않았습니다`)), seconds * 1000)
      ),
    ]);
  }

  /** 가용성 값을 사람 말로. 「downloadable」 같은 낱말을 그대로 보여 주지 않는다. */
  function sayAvailability(state: string): string {
    if (state === 'available') return '모델이 이미 있습니다.';
    if (state === 'downloadable') return '모델을 처음 받습니다 (무료, 한 번만).';
    if (state === 'downloading') return '모델을 받는 중입니다.';
    return '이 조합은 이 기기에서 안 됩니다.';
  }

  /** 모델 내려받기 진행률을 그대로 보여 준다 — 안 보여 주면 「멈췄다」로 읽힌다. */
  function progressWatcher(bar: HTMLElement, state: HTMLElement) {
    return (m: DownloadMonitor): void => {
      m.addEventListener('downloadprogress', (e) => {
        const pct = Math.round((e.loaded || 0) * 100);
        (bar.firstElementChild as HTMLElement).style.width = `${pct}%`;
        state.textContent = `모델 받는 중 ${pct}% — 처음 한 번만 받습니다(무료). 다 받으면 오프라인에서도 됩니다.`;
      });
    };
  }

  function buildTranslate(container: HTMLElement): void {
    if (!g.Translator) {
      container.innerHTML = unsupported('브라우저 안 번역');
      return;
    }
    container.innerHTML = `
      <div class="lai-wrap">
        <div class="lai-note">
          번역이 <b>이 기기 안에서</b> 됩니다 — 서버로 글을 보내지 않고, 다 받고 나면 인터넷이 없어도 됩니다.
        </div>
        <div class="lai-row">
          <label class="lai-state" for="laiFrom">원문</label>
          <select id="laiFrom">
            <option value="auto">자동 감지</option>
            ${LANGS.map(([code, name]) => `<option value="${code}">${esc(name)}</option>`).join('')}
          </select>
          <span class="lai-state">→</span>
          <select id="laiTo">
            ${LANGS.map(([code, name]) => `<option value="${code}"${code === 'en' ? ' selected' : ''}>${esc(name)}</option>`).join('')}
          </select>
          <button type="button" class="btn" id="laiRun">번역</button>
        </div>
        <textarea id="laiIn" class="lai-ta" placeholder="번역할 글을 붙여 넣으세요"></textarea>
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
        const detector = await withLimit(g.LanguageDetector.create(), 20, '말 알아보기');
        const guesses = await withLimit(detector.detect(text.slice(0, 400)), 15, '말 알아보기');
        return guesses?.[0]?.detectedLanguage || null;
      } catch {
        return null; // 감지가 안 되면 사람에게 고르라고 한다 — 틀린 언어로 번역하는 것보다 낫다
      }
    }

    run.onclick = async (): Promise<void> => {
      const text = input.value.trim();
      if (!text) {
        state.textContent = '번역할 글을 넣어 주세요.';
        return;
      }
      run.disabled = true;
      out.textContent = '';
      state.textContent = '준비 중…';
      try {
        let source = from.value;
        if (source === 'auto') {
          const guessed = await detect(text);
          if (!guessed) {
            state.textContent = '어느 말인지 못 알아봤습니다 — 원문 언어를 직접 골라 주세요.';
            run.disabled = false;
            return;
          }
          source = guessed;
          state.textContent = `원문을 ${esc(LANGS.find((l) => l[0] === guessed)?.[1] || guessed)}로 봤습니다.`;
        }
        if (source === to.value) {
          state.textContent = '원문과 옮길 말이 같습니다.';
          run.disabled = false;
          return;
        }
        const pair = { sourceLanguage: source, targetLanguage: to.value };
        /* 물어보는 것조차 안 돌아오는 환경이 있다(실측: 헤드리스에서 여기서 멈췄다).
           그래서 **첫 단계부터** 시간을 잰다 — 안 그러면 「준비 중…」에서 영영 멈춘다. */
        const can = await withLimit(g.Translator!.availability(pair), 15, '번역 준비 확인');
        state.textContent = sayAvailability(can);
        if (can === 'unavailable') {
          run.disabled = false;
          return;
        }
        const translator = await withLimit(
          g.Translator!.create({ ...pair, monitor: progressWatcher(bar, state) }),
          can === 'available' ? 20 : 120,
          '번역 모델'
        );
        state.textContent = '번역 중…';
        out.textContent = await withLimit(translator.translate(text), 60, '번역');
        state.textContent = '끝. 이 글은 기기 밖으로 안 나갔습니다.';
        Toolbox.trackUse?.('localai-translate');
      } catch (err) {
        /* 실패해도 **왜인지** 적는다 — 빈 화면은 고장으로 읽힌다. */
        state.textContent = `번역 실패 — ${String(err).split('\n')[0].slice(0, 110)}`;
      } finally {
        run.disabled = false;
      }
    };
  }

  function buildSummarize(container: HTMLElement): void {
    if (!g.Summarizer) {
      container.innerHTML = unsupported('브라우저 안 요약');
      return;
    }
    container.innerHTML = `
      <div class="lai-wrap">
        <div class="lai-note">
          긴 글을 <b>이 기기 안에서</b> 줄입니다. 서버로 안 보냅니다.
          <span class="lai-dim">내장 모델은 가볍습니다 — 사실 확인이 필요한 글은 원문을 보세요.</span>
        </div>
        <div class="lai-row">
          <select id="laiLen">
            <option value="short">짧게</option>
            <option value="medium" selected>보통</option>
            <option value="long">길게</option>
          </select>
          <select id="laiType">
            <option value="tldr" selected>한 마디로</option>
            <option value="key-points">요점만</option>
            <option value="teaser">맛보기</option>
          </select>
          <button type="button" class="btn" id="laiSum">요약</button>
        </div>
        <textarea id="laiSumIn" class="lai-ta" placeholder="줄이고 싶은 글을 붙여 넣으세요"></textarea>
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
        state.textContent = '줄일 글을 넣어 주세요.';
        return;
      }
      btn.disabled = true;
      out.textContent = '';
      state.textContent = '준비 중…';
      try {
        const can = await withLimit(g.Summarizer!.availability(), 15, '요약 준비 확인');
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
          '요약 모델'
        );
        state.textContent = '줄이는 중…';
        out.textContent = await withLimit(summarizer.summarize(text), 90, '요약');
        state.textContent = '끝. 이 글은 기기 밖으로 안 나갔습니다.';
        Toolbox.trackUse?.('localai-summarize');
      } catch (err) {
        state.textContent = `요약 실패 — ${String(err).split('\n')[0].slice(0, 110)}`;
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
      container.innerHTML = unsupported('브라우저 안 짧은 생성');
      return;
    }
    container.innerHTML = `
      <div class="lai-wrap">
        <div class="lai-note">
          짧은 글을 <b>이 기기 안에서</b> 만듭니다. 서버로 안 보냅니다.
          <span class="lai-dim">가벼운 모델입니다 — 다듬기·이름 짓기처럼 짧고 틀려도 되는 일에 씁니다.
          긴 글·사실 확인은 다른 AI 도구(서버 쪽)를 쓰세요.</span>
        </div>
        <textarea id="laiPIn" class="lai-ta" placeholder="예: 이 문장을 더 짧고 분명하게 고쳐 줘 — ..."></textarea>
        <div class="lai-row"><button type="button" class="btn" id="laiPRun">만들기</button></div>
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
        state.textContent = '시킬 일을 적어 주세요.';
        return;
      }
      btn.disabled = true;
      out.textContent = '';
      state.textContent = '준비 중…';
      try {
        const can = await withLimit(g.LanguageModel!.availability(), 15, '준비 확인');
        state.textContent = sayAvailability(can);
        if (can === 'unavailable') {
          btn.disabled = false;
          return;
        }
        const session = await withLimit(
          g.LanguageModel!.create({ monitor: progressWatcher(bar, state) }),
          can === 'available' ? 20 : 180,
          '모델'
        );
        state.textContent = '만드는 중…';
        out.textContent = await withLimit(session.prompt(text), 90, '생성');
        state.textContent = '끝. 이 글은 기기 밖으로 안 나갔습니다.';
        session.destroy?.();
        Toolbox.trackUse?.('localai-prompt');
      } catch (err) {
        state.textContent = `실패 — ${String(err).split(String.fromCharCode(10))[0].slice(0, 110)}`;
      } finally {
        btn.disabled = false;
      }
    };
  }

  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta(ID),
    tabs: [
      { id: 'localai-translate', label: '번역', build: buildTranslate },
      { id: 'localai-summarize', label: '요약', build: buildSummarize },
      { id: 'localai-prompt', label: '짧은 생성', build: buildPrompt },
    ],
  });
})();
