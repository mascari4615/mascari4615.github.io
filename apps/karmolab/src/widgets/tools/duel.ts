/**
 * 번개 대결 — 몇 초짜리 미니게임으로 붙는 1:1 (TASK-KL-132, 첫 사이클)
 *
 * 레퍼런스에서 가져온 것 (2026-08-07 조사):
 *  - **와리오웨어**의 마이크로게임 — 「한 단어 명령 + 3~5초 + 즉시 판정」, 그리고 갈수록 짧아지는
 *    제한 시간. 설명을 읽을 틈이 없어야 재밌다. 명령은 한 단어, 고르는 곳은 늘 같은 자리에 넷.
 *  - **브라우저 파티게임**(GameBuddies·게이밍카우치 류) — 가입 없이 **링크/방 코드**로 30초 안에
 *    시작하고, 판이 끝나도 **방을 안 닫는다**(다시 붙는 마찰이 0이어야 한 판 더 한다).
 *  - 다만 그것들은 전부 **여럿이서, 자기 서버로** 돈다. 몇 초짜리 마이크로게임 1:1 은 못 찾았고,
 *    와리오웨어 대결 모드는 콘솔 전용이다 — 거기가 이 도구의 자리다.
 *
 * 서버가 없다: 짝짓기는 공개망을 거쳐 붙고(트리스테로), 오간 것은 둘 사이에서만 흐른다.
 * 우리 쪽에 방도 기록도 남지 않는다.
 *
 * 판정은 방을 만든 쪽이 맡는다 — 양쪽이 각자 재면 시계가 달라 승부가 갈리지 않는다.
 * P2P 라 마음먹으면 속일 수 있다. 캐주얼 놀이라 감수한다(순위표가 없으니 속일 값도 없다).
 */
import { joinRoom, selfId } from 'trystero/nostr';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const ROUNDS = 5;
  const LIMIT_START = 4000; // 첫 판 제한 (레퍼런스: 3~5초)
  const LIMIT_STEP = 400; // 판마다 이만큼 짧아진다 — 마지막은 2.4초
  const APP_ID = 'karmolab-duel';

  type Kind = 'chosung' | 'bigger' | 'color' | 'sum' | 'same' | 'reverse';
  interface Round {
    kind: Kind;
    order: string; // 한 단어 명령
    choices: string[];
    answer: number;
    limitMs: number;
    tint?: string[]; // 색깔 게임에서 보기마다 칠할 색
  }

  /* 문제는 **말 묶음이 들고 있다.** 초성 놀이는 한글에만 있는 놀이라, 말만 갈아끼우면
   * 다른 언어에선 놀이가 성립하지 않는다. 그래서 언어마다 *같은 규칙의 그 나라 놀이*를
   * 적어 둔다 — en = 모음 뺀 글자, ja = ローマ字の子音. 미끼는 첫 글자만 같고 실마리로
   * 되돌리면 달라지게 골라 둔다(겹치면 답이 둘이 된다).
   * 표를 미리 굳히지 않고 **쓸 때 만든다** — 굳히면 그 시점엔 말 묶음이 아직 안 왔다. */
  const QUIZ_COUNT = 6;
  const 문제판 = (): Array<[string, string, string[]]> =>
    Array.from({ length: QUIZ_COUNT }, (_, i) => [
      t(`duel.quiz.${i}.clue`),
      t(`duel.quiz.${i}.a`),
      t(`duel.quiz.${i}.d`).split(',')
    ]);
  const 색이름 = (): Array<[string, string]> => [
    [t('duel.color.red'), '#e0483c'],
    [t('duel.color.blue'), '#3b74d8'],
    [t('duel.color.green'), '#33a06a'],
    [t('duel.color.yellow'), '#d8a72a'],
    [t('duel.color.purple'), '#8a5cd0']
  ];

  const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

  function shuffle<T>(a: T[]): T[] {
    const out = a.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** 판을 미리 다 만들어 상대에게 통째로 보낸다 — 양쪽이 각자 뽑으면 다른 문제가 뜬다. */
  function makeRound(i: number): Round {
    const limitMs = LIMIT_START - i * LIMIT_STEP;
    const 갈래: Kind[] = ['chosung', 'bigger', 'color', 'sum', 'same', 'reverse'];
    const kind: Kind = 갈래[Math.floor(Math.random() * 갈래.length)];
    if (kind === 'chosung') {
      const [초성, 정답, 미끼] = pick(문제판());
      const choices = shuffle([정답, ...미끼]);
      return { kind, order: 초성, choices, answer: choices.indexOf(정답), limitMs };
    }
    if (kind === 'bigger') {
      const nums = new Set<number>();
      while (nums.size < 4) nums.add(Math.floor(Math.random() * 900) + 100);
      const choices = [...nums].map(String);
      const max = Math.max(...[...nums]);
      return { kind, order: t('duel.order.bigger'), choices, answer: choices.indexOf(String(max)), limitMs };
    }
    if (kind === 'sum') {
      // 셈: 두 수를 더한 값 고르기. 미끼는 정답 언저리라 대충 보면 걸린다.
      const a = Math.floor(Math.random() * 40) + 5;
      const b = Math.floor(Math.random() * 40) + 5;
      const 정답 = a + b;
      const 후보 = new Set<number>([정답]);
      while (후보.size < 4) 후보.add(정답 + (Math.floor(Math.random() * 11) - 5) || 정답 + 6);
      const choices = shuffle([...후보]).map(String);
      return {
        kind,
        order: t('duel.order.sum', { a, b }),
        choices,
        answer: choices.indexOf(String(정답)),
        limitMs
      };
    }
    if (kind === 'same') {
      // 같은 것: 명령에 뜬 글자와 똑같은 칸 고르기. 미끼는 한 글자만 다르다.
      const 씨앗 = pick(문제판())[1];
      const 글자통 = t('duel.letters');
      const 흔들기 = (w: string): string => {
        const i = Math.floor(Math.random() * w.length);
        const 대체 = 글자통[Math.floor(Math.random() * 글자통.length)];
        return w.slice(0, i) + 대체 + w.slice(i + 1);
      };
      const 미끼 = new Set<string>();
      let 헛돌이 = 0;
      while (미끼.size < 3 && 헛돌이++ < 40) {
        const w = 흔들기(씨앗);
        if (w !== 씨앗) 미끼.add(w);
      }
      const choices = shuffle([씨앗, ...미끼]);
      return { kind, order: t('duel.order.same', { w: 씨앗 }), choices, answer: choices.indexOf(씨앗), limitMs };
    }
    if (kind === 'reverse') {
      // 거꾸로: 명령에 뜬 글자를 뒤집은 것 고르기.
      const 씨앗 = pick(문제판())[1];
      const 정답 = [...씨앗].reverse().join('');
      const 미끼 = new Set<string>();
      let 헛돌이 = 0;
      while (미끼.size < 3 && 헛돌이++ < 40) {
        const w = shuffle([...씨앗]).join('');
        if (w !== 정답) 미끼.add(w);
      }
      const choices = shuffle([정답, ...미끼]);
      return {
        kind,
        order: t('duel.order.reverse', { w: 씨앗 }),
        choices,
        answer: choices.indexOf(정답),
        limitMs
      };
    }
    /* 색깔(스트룹): 「글자 말고 **칠해진 색**」을 고른다. 정답 칸만 부른 색으로 칠하고,
     * 글자는 일부러 다른 색 이름을 적는다 — 글자를 읽으면 오히려 틀린다. */
    const 팔레트 = 색이름();
    const 고를색 = pick(팔레트);
    const 나머지 = 팔레트.filter((c) => c[0] !== 고를색[0]);
    const 정답자리 = Math.floor(Math.random() * 4);
    const 글자 = shuffle(나머지);
    const choices: string[] = [];
    const tint: string[] = [];
    for (let k = 0; k < 4; k++) {
      choices.push(글자[k % 글자.length][0]);
      tint.push(k === 정답자리 ? 고를색[1] : pick(나머지)[1]);
    }
    return {
      kind: 'color',
      order: t('duel.order.color', { c: 고를색[0] }),
      choices,
      answer: 정답자리,
      limitMs,
      tint
    };
  }

  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  Toolbox.register({
    id: 'duel',
    title: t('widgets.duel.title', undefined, '번개 대결'),
    category: 'tool',
    desc: t(
      'widgets-desc.duel.desc',
      undefined,
      '몇 초짜리 미니게임으로 둘이 붙습니다. 링크 하나면 바로 시작하고, 방을 우리 서버에 두지 않습니다'
    ),
    layout: 'wide',
    noHero: true,
    icon: '<path d="M13 2L5 13h6l-1 9 9-12h-6l1-8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('duel.tab', undefined, '대결'),
        build: function (container: HTMLElement): void {
          void loadNamespace('duel').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에 — 문제도 화면도 전부 말 묶음에서 나온다. */
  function draw(container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: t('duel.mdd') });

          container.innerHTML = `
            <div class="du-stage" id="duStage">
              <div class="du-order" id="duOrder">${esc(t('duel.title.idle'))}</div>
              <div class="du-choices" id="duChoices"></div>
              <div class="du-timerbar"><div class="du-timerfill" id="duTimer"></div></div>
            </div>

            <div class="du-scores">
              <div class="du-score"><span class="du-who">${esc(t('duel.who.me'))}</span><b id="duMeScore">0</b></div>
              <div class="du-round" id="duRound">— </div>
              <div class="du-score"><span class="du-who" id="duFoeName">${esc(t('duel.who.foe'))}</span><b id="duFoeScore">0</b></div>
            </div>

            <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin:var(--space-lg) 0;">
              <button class="btn btn-primary" id="duMake">${esc(t('duel.btn.make'))}</button>
              <button class="btn btn-ghost" id="duMatch">${esc(t('duel.btn.match'))}</button>
              <button class="btn btn-ghost" id="duGhost">${esc(t('duel.btn.ghost'))}</button>
              <button class="btn btn-ghost" id="duAgain" style="display:none;">${esc(t('duel.btn.again'))}</button>
              <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                ${esc(t('duel.label.name'))} <input type="text" id="duName" maxlength="10" placeholder="${esc(
                  t('duel.name.default')
                )}" style="width:100px;" aria-label="${esc(t('duel.aria.name'))}">
              </label>
            </div>

            <div class="du-share" id="duShare" style="display:none;">
              <input type="text" id="duUrl" readonly aria-label="${esc(t('duel.aria.url'))}">
              <button class="btn btn-primary" id="duCopy">${esc(t('duel.btn.copy'))}</button>
            </div>

            <div class="tool-status" id="duStatus">${esc(t('duel.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const orderEl = $<HTMLElement>('#duOrder');
          const choicesEl = $<HTMLElement>('#duChoices');
          const timerEl = $<HTMLElement>('#duTimer');
          const status = $<HTMLElement>('#duStatus');
          const nameInput = $<HTMLInputElement>('#duName');

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };

          let room: ReturnType<typeof joinRoom> | null = null;
          let host = false;
          let foe = '';
          let myScore = 0;
          let foeScore = 0;
          let roundIndex = -1;
          let current: Round | null = null;
          let startedAt = 0;
          let answered = false;
          let myResult: { ok: boolean; ms: number } | null = null;
          let foeResult: { ok: boolean; ms: number } | null = null;
          let timer = 0;
          let raf = 0;

          type Send = (data: unknown) => void;
          let sendPlan: Send | null = null;
          let sendResult: Send | null = null;
          let sendScore: Send | null = null;
          let sendHello: Send | null = null;

          /** 입력칸이 비어 있으면 적어 둔 이름이라도 쓴다. */
          function 내이름(): string {
            const typed = nameInput.value.trim();
            if (typed) return typed;
            try {
              return (localStorage.getItem('karmolab.duel.name') || '').trim() || t('duel.name.default');
            } catch {
              return t('duel.name.default');
            }
          }

          function paintScores(): void {
            $<HTMLElement>('#duMeScore').textContent = String(myScore);
            $<HTMLElement>('#duFoeScore').textContent = String(foeScore);
            $<HTMLElement>('#duRound').textContent = roundIndex >= 0 ? `${roundIndex + 1} / ${ROUNDS}` : '— ';
          }

          function showRound(r: Round): void {
            current = r;
            answered = false;
            myResult = null;
            foeResult = null;
            orderEl.textContent = r.order;
            orderEl.className = 'du-order du-order-live';
            choicesEl.innerHTML = r.choices
              .map(
                (c, i) =>
                  `<button class="du-choice" data-i="${i}"${r.tint ? ` style="color:${r.tint[i]}"` : ''}>${esc(c)}</button>`
              )
              .join('');
            choicesEl.querySelectorAll<HTMLButtonElement>('.du-choice').forEach((b) => {
              b.onclick = () => answer(Number(b.dataset.i));
            });
            startedAt = performance.now();
            const tick = (): void => {
              const left = r.limitMs - (performance.now() - startedAt);
              timerEl.style.width = `${Math.max(0, (left / r.limitMs) * 100)}%`;
              if (left > 0) raf = requestAnimationFrame(tick);
            };
            cancelAnimationFrame(raf);
            tick();
            clearTimeout(timer);
            timer = window.setTimeout(() => {
              if (!answered) answer(-1);
            }, r.limitMs);

            /* 유령과 놀 때는 상대의 손을 여기서 흉내 낸다. 사람처럼 가끔 틀리고, 가끔 늦는다 —
             * 늘 맞히면 이길 수 없고 늘 틀리면 이길 이유가 없다. */
            clearTimeout(유령손);
            if (유령) {
              const 걸림 = 500 + Math.random() * Math.max(400, r.limitMs - 700);
              const 맞힘 = Math.random() < 0.72;
              유령손 = window.setTimeout(() => {
                foeResult = { ok: 맞힘, ms: 걸림 };
                if (myResult) settle();
              }, 걸림);
            }
          }

          function answer(i: number): void {
            if (answered || !current) return;
            answered = true;
            clearTimeout(timer);
            cancelAnimationFrame(raf);
            const ms = performance.now() - startedAt;
            const ok = i === current.answer;
            choicesEl.querySelectorAll<HTMLButtonElement>('.du-choice').forEach((b, k) => {
              b.disabled = true;
              if (k === current?.answer) b.classList.add('du-right');
              else if (k === i) b.classList.add('du-wrong');
            });
            orderEl.textContent = ok ? t('duel.ok') : t('duel.no');
            orderEl.className = 'du-order ' + (ok ? 'du-ok' : 'du-no');
            const mine = { ok, ms };
            myResult = mine;
            if (host) settle();
            else sendResult?.(mine);
          }

          /** 방을 만든 쪽이 두 결과를 모아 이번 판의 임자를 정한다. */
          function settle(): void {
            // 유령과 놀 때 내가 먼저 끝냈으면 유령의 손을 기다린다(예약이 곧 온다).
            if (!myResult || !foeResult) return;
            const a = myResult;
            const b = foeResult;
            if (a.ok && (!b.ok || a.ms <= b.ms)) myScore++;
            else if (b.ok && (!a.ok || b.ms < a.ms)) foeScore++;
            paintScores();
            sendScore?.({ me: foeScore, foe: myScore, round: roundIndex });
            window.setTimeout(nextRound, 900);
          }

          function nextRound(): void {
            roundIndex++;
            if (roundIndex >= ROUNDS) {
              // 끝났다는 것도 말해 줘야 한다 — 손님 쪽은 다음 판을 받아야 화면이 바뀌므로,
              // 안 보내면 마지막 판 화면에서 영영 기다린다(연결은 멀쩡한데 안 끝난 것처럼 보인다).
              sendPlan?.({ round: -1 });
              finish();
              return;
            }
            const r = makeRound(roundIndex);
            sendPlan?.({ round: roundIndex, r });
            paintScores();
            showRound(r);
          }

          function finish(): void {
            orderEl.className = 'du-order';
            orderEl.textContent =
              myScore > foeScore ? t('duel.win') : myScore < foeScore ? t('duel.lose') : t('duel.draw');
            choicesEl.innerHTML = '';
            timerEl.style.width = '0%';
            say(t('duel.status.finish', { me: myScore, foe: foeScore }), 'ok');
            $<HTMLElement>('#duAgain').style.display = host ? '' : 'none';
            Toolbox.trackUse?.('finish');
          }

          function connect(roomId: string, asHost: boolean): void {
            host = asHost;
            try {
              localStorage.setItem('karmolab.duel.name', nameInput.value.trim());
            } catch {
              /* 못 적어도 그만 */
            }
            say(asHost ? t('duel.status.waiting') : t('duel.status.joining'));
            const r0 = joinRoom({ appId: APP_ID }, roomId);
            room = r0;
            // 받는 자리를 만들 때 같이 건다 (트리스테로 0.25 부터 이 모양이다).
            sendHello = r0.makeAction('hello', {
              onMessage: (data) => {
                foe = String((data as { name?: string }).name || t('duel.who.foe')).slice(0, 10);
                $<HTMLElement>('#duFoeName').textContent = foe;
              }
            }).send as Send;
            sendPlan = r0.makeAction('plan', {
              onMessage: (data) => {
                const d = data as unknown as { round: number; r?: Round };
                if (d.round < 0 || !d.r) {
                  finish();
                  return;
                }
                roundIndex = d.round;
                paintScores();
                showRound(d.r);
              }
            }).send as Send;
            sendResult = r0.makeAction('res', {
              onMessage: (data) => {
                foeResult = data as unknown as { ok: boolean; ms: number };
                if (host) settle();
              }
            }).send as Send;
            sendScore = r0.makeAction('score', {
              onMessage: (data) => {
                const d = data as unknown as { me: number; foe: number };
                myScore = d.me;
                foeScore = d.foe;
                paintScores();
              }
            }).send as Send;

            r0.onPeerJoin = (): void => {
              sendHello?.({ name: 내이름() });
              if (!asHost) {
                say(t('duel.status.metGuest'));
                return;
              }
              say(t('duel.status.metHost'));
              $<HTMLElement>('#duShare').style.display = 'none';
              roundIndex = -1;
              myScore = 0;
              foeScore = 0;
              window.setTimeout(nextRound, 3000);
            };
            r0.onPeerLeave = (): void => {
              say(t('duel.status.left'));
              clearTimeout(timer);
              cancelAnimationFrame(raf);
            };

            // 공개망을 거쳐 붙는다 — 통신망에 따라 아예 안 붙는 자리가 있다. 조용히 기다리게 두지 않는다.
            window.setTimeout(() => {
              if (!foe && roundIndex < 0) {
                say(t('duel.status.blocked'));
              }
            }, 30000);
          }

          try {
            nameInput.value = localStorage.getItem('karmolab.duel.name') || '';
          } catch {
            /* 못 읽어도 그만 */
          }
          /* 적는 즉시 적어 둔다 — 위젯이 다시 짜이면(핫리로드·주소 바뀜) 입력칸이 비워져서
           * 이름 없이 붙는 일이 실제로 있었다. 다시 짜여도 위에서 되살아난다. */
          nameInput.addEventListener('input', () => {
            try {
              localStorage.setItem('karmolab.duel.name', nameInput.value.trim());
            } catch {
              /* 못 적어도 그만 */
            }
          });

          const joined = location.hash.match(/r=([A-Za-z0-9_-]{6,})/);
          if (joined) {
            $<HTMLElement>('#duMake').style.display = 'none';
            $<HTMLElement>('#duMatch').style.display = 'none';
            connect(joined[1], false);
          }

          /* 「아무나랑」 — 대기방에 들어가 처음 만난 사람과 짝을 짓고, **둘만의 방으로 옮긴다.**
           * 대기방에서 그대로 놀면 나중에 온 사람들에게까지 판이 새어 나간다. 방 이름을 두 사람의
           * 번호로 만들면 양쪽이 따로 계산해도 같은 이름이 나온다(주고받을 필요가 없다). */
          let 유령 = false;
          let 유령손 = 0;
          let 짝지음 = false;
          function 아무나랑(): void {
            $<HTMLElement>('#duMake').style.display = 'none';
            $<HTMLElement>('#duMatch').style.display = 'none';
            say(t('duel.status.searching'));
            const lobby = joinRoom({ appId: APP_ID }, 'lobby');
            lobby.onPeerJoin = (peerId: string): void => {
              if (짝지음) return;
              짝지음 = true;
              const 방 = 'p' + [selfId, peerId].sort().join('').replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
              void lobby.leave();
              connect(방, selfId < peerId); // 번호가 앞선 쪽이 판을 돌린다 — 양쪽이 같은 답을 낸다
            };
            // 아무도 없으면 계속 기다린다. 얼마나 기다렸는지는 말해 준다.
            window.setTimeout(() => {
              if (!짝지음) say(t('duel.status.lonely'));
            }, 45000);
          }

          /** 아무도 없을 때 — 유령이 대신 달린다. 혼자 온 사람이 그냥 나가지 않게. */
          function 유령과(): void {
            유령 = true;
            host = true;
            foe = t('duel.who.ghost');
            $<HTMLElement>('#duFoeName').textContent = foe;
            $<HTMLElement>('#duMake').style.display = 'none';
            $<HTMLElement>('#duMatch').style.display = 'none';
            $<HTMLElement>('#duGhost').style.display = 'none';
            $<HTMLElement>('#duShare').style.display = 'none';
            say(t('duel.status.ghost'));
            roundIndex = -1;
            myScore = 0;
            foeScore = 0;
            nextRound();
          }

          $<HTMLButtonElement>('#duGhost').onclick = 유령과;
          $<HTMLButtonElement>('#duMatch').onclick = 아무나랑;

          $<HTMLButtonElement>('#duMake').onclick = () => {
            const roomId = selfId.slice(0, 10) + Math.random().toString(36).slice(2, 6);
            const url = `${location.origin}/karmolab/t/duel/#r=${roomId}`;
            $<HTMLInputElement>('#duUrl').value = url;
            $<HTMLElement>('#duShare').style.display = '';
            $<HTMLElement>('#duMake').style.display = 'none';
            $<HTMLElement>('#duMatch').style.display = 'none';
            connect(roomId, true);
            void Toolbox.copyText?.(url, { message: t('duel.copy.shared') });
            Toolbox.trackUse?.('share');
          };
          $<HTMLButtonElement>('#duCopy').onclick = () => {
            void Toolbox.copyText?.($<HTMLInputElement>('#duUrl').value, { message: t('duel.copy.done') });
          };
          $<HTMLButtonElement>('#duAgain').onclick = () => {
            myScore = 0;
            foeScore = 0;
            roundIndex = -1;
            nextRound();
          };

          Toolbox.onDispose?.(() => {
            clearTimeout(timer);
            clearTimeout(유령손);
            cancelAnimationFrame(raf);
            room?.leave();
          });
  }
})();
