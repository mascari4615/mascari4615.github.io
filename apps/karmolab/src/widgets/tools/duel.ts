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

(function (): void {
  const ROUNDS = 5;
  const LIMIT_START = 4000; // 첫 판 제한 (레퍼런스: 3~5초)
  const LIMIT_STEP = 400; // 판마다 이만큼 짧아진다 — 마지막은 2.4초
  const APP_ID = 'karmolab-duel';

  type Kind = 'chosung' | 'bigger' | 'color';
  interface Round {
    kind: Kind;
    order: string; // 한 단어 명령
    choices: string[];
    answer: number;
    limitMs: number;
    tint?: string[]; // 색깔 게임에서 보기마다 칠할 색
  }

  /* [초성, 정답, 미끼 셋] — 미끼는 **첫 글자만 같고 뒤가 다르다.** 눈으로 훑어야 걸러지도록.
   * 미끼의 초성이 정답과 겹치면 답이 둘이 되므로, 넣을 때 반드시 확인할 것. */
  const 초성판: Array<[string, string, string[]]> = [
    ['ㄱㅇㅇ', '고양이', ['개나리', '기와집', '구운몽']],
    ['ㅂㄷㅂㄷ', '부들부들', ['부글부글', '보슬보슬', '비틀비틀']],
    ['ㅅㄱㅊ', '시금치', ['소고기', '사거리', '세계관']],
    ['ㄴㅁㅇㅋ', '나무위키', ['나무의자', '노란우산', '눈물바다']],
    ['ㅈㄷㅊ', '자동차', ['지하철도', '자전거길', '주차장문']],
    ['ㅁㅇㅋ', '마이크', ['만화책', '물안경', '모래성']]
  ];
  const 색이름: Array<[string, string]> = [
    ['빨강', '#e0483c'],
    ['파랑', '#3b74d8'],
    ['초록', '#33a06a'],
    ['노랑', '#d8a72a'],
    ['보라', '#8a5cd0']
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
    const kind: Kind = (['chosung', 'bigger', 'color'] as Kind[])[Math.floor(Math.random() * 3)];
    if (kind === 'chosung') {
      const [초성, 정답, 미끼] = pick(초성판);
      const choices = shuffle([정답, ...미끼]);
      return { kind, order: 초성, choices, answer: choices.indexOf(정답), limitMs };
    }
    if (kind === 'bigger') {
      const nums = new Set<number>();
      while (nums.size < 4) nums.add(Math.floor(Math.random() * 900) + 100);
      const choices = [...nums].map(String);
      const max = Math.max(...[...nums]);
      return { kind, order: '큰 쪽!', choices, answer: choices.indexOf(String(max)), limitMs };
    }
    /* 색깔(스트룹): 「글자 말고 **칠해진 색**」을 고른다. 정답 칸만 부른 색으로 칠하고,
     * 글자는 일부러 다른 색 이름을 적는다 — 글자를 읽으면 오히려 틀린다. */
    const 고를색 = pick(색이름);
    const 나머지 = 색이름.filter((c) => c[0] !== 고를색[0]);
    const 정답자리 = Math.floor(Math.random() * 4);
    const 글자 = shuffle(나머지);
    const choices: string[] = [];
    const tint: string[] = [];
    for (let k = 0; k < 4; k++) {
      choices.push(글자[k % 글자.length][0]);
      tint.push(k === 정답자리 ? 고를색[1] : pick(나머지)[1]);
    }
    return { kind: 'color', order: `${고를색[0]} 색!`, choices, answer: 정답자리, limitMs, tint };
  }

  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  Toolbox.register({
    id: 'duel',
    title: '번개 대결',
    category: 'tool',
    desc: '몇 초짜리 미니게임으로 둘이 붙습니다. 링크 하나면 바로 시작하고, 방을 우리 서버에 두지 않습니다',
    layout: 'wide',
    noHero: true,
    icon: '<path d="M13 2L5 13h6l-1 9 9-12h-6l1-8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: '대결',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '손가락만 믿을게요. 생각하면 늦어요.' });

          container.innerHTML = `
            <div class="du-stage" id="duStage">
              <div class="du-order" id="duOrder">번개 대결</div>
              <div class="du-choices" id="duChoices"></div>
              <div class="du-timerbar"><div class="du-timerfill" id="duTimer"></div></div>
            </div>

            <div class="du-scores">
              <div class="du-score"><span class="du-who">나</span><b id="duMeScore">0</b></div>
              <div class="du-round" id="duRound">— </div>
              <div class="du-score"><span class="du-who" id="duFoeName">상대</span><b id="duFoeScore">0</b></div>
            </div>

            <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin:var(--space-lg) 0;">
              <button class="btn btn-primary" id="duMake">대결 링크 만들기</button>
              <button class="btn btn-ghost" id="duAgain" style="display:none;">한 판 더</button>
              <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                이름 <input type="text" id="duName" maxlength="10" placeholder="누군가" style="width:100px;" aria-label="대결에 쓸 이름">
              </label>
            </div>

            <div class="du-share" id="duShare" style="display:none;">
              <input type="text" id="duUrl" readonly aria-label="대결 링크">
              <button class="btn btn-primary" id="duCopy">링크 복사</button>
            </div>

            <div class="tool-status" id="duStatus">링크를 만들어 상대에게 보내세요. 상대가 열면 바로 시작합니다.</div>
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
            orderEl.textContent = ok ? '맞다!' : '땡';
            orderEl.className = 'du-order ' + (ok ? 'du-ok' : 'du-no');
            const mine = { ok, ms };
            myResult = mine;
            if (host) settle();
            else sendResult?.(mine);
          }

          /** 방을 만든 쪽이 두 결과를 모아 이번 판의 임자를 정한다. */
          function settle(): void {
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
            orderEl.textContent = myScore > foeScore ? '이겼다!' : myScore < foeScore ? '졌다' : '비겼다';
            choicesEl.innerHTML = '';
            timerEl.style.width = '0%';
            say(`${myScore} : ${foeScore} — 방은 그대로 열려 있어요. 「한 판 더」를 누르면 바로 시작합니다.`, 'ok');
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
            say(asHost ? '상대를 기다리는 중… 링크를 보내세요.' : '방에 붙는 중…');
            const r0 = joinRoom({ appId: APP_ID }, roomId);
            room = r0;
            // 받는 자리를 만들 때 같이 건다 (트리스테로 0.25 부터 이 모양이다).
            sendHello = r0.makeAction('hello', {
              onMessage: (data) => {
                foe = String((data as { name?: string }).name || '상대').slice(0, 10);
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
              sendHello?.({ name: nameInput.value.trim() || '누군가' });
              if (!asHost) {
                say('붙었다! 곧 시작합니다.');
                return;
              }
              say('붙었다! 3초 뒤 시작합니다.');
              $<HTMLElement>('#duShare').style.display = 'none';
              roundIndex = -1;
              myScore = 0;
              foeScore = 0;
              window.setTimeout(nextRound, 3000);
            };
            r0.onPeerLeave = (): void => {
              say('상대가 나갔어요. 링크를 다시 보내면 이어서 할 수 있습니다.');
              clearTimeout(timer);
              cancelAnimationFrame(raf);
            };

            // 공개망을 거쳐 붙는다 — 통신망에 따라 아예 안 붙는 자리가 있다. 조용히 기다리게 두지 않는다.
            window.setTimeout(() => {
              if (!foe && roundIndex < 0) {
                say('아직 아무도 안 왔어요. 상대가 링크를 열었는데도 이 상태라면, 서로의 통신망이 직접 연결을 막고 있는 것입니다.');
              }
            }, 30000);
          }

          try {
            nameInput.value = localStorage.getItem('karmolab.duel.name') || '';
          } catch {
            /* 못 읽어도 그만 */
          }

          const joined = location.hash.match(/r=([A-Za-z0-9_-]{6,})/);
          if (joined) {
            $<HTMLElement>('#duMake').style.display = 'none';
            connect(joined[1], false);
          }

          $<HTMLButtonElement>('#duMake').onclick = () => {
            const roomId = selfId.slice(0, 10) + Math.random().toString(36).slice(2, 6);
            const url = `${location.origin}/karmolab/t/duel/#r=${roomId}`;
            $<HTMLInputElement>('#duUrl').value = url;
            $<HTMLElement>('#duShare').style.display = '';
            $<HTMLElement>('#duMake').style.display = 'none';
            connect(roomId, true);
            void Toolbox.copyText?.(url, { message: '링크를 복사했어요 — 보내면 바로 붙습니다' });
            Toolbox.trackUse?.('share');
          };
          $<HTMLButtonElement>('#duCopy').onclick = () => {
            void Toolbox.copyText?.($<HTMLInputElement>('#duUrl').value, { message: '링크를 복사했어요' });
          };
          $<HTMLButtonElement>('#duAgain').onclick = () => {
            myScore = 0;
            foeScore = 0;
            roundIndex = -1;
            nextRound();
          };

          Toolbox.onDispose?.(() => {
            clearTimeout(timer);
            cancelAnimationFrame(raf);
            room?.leave();
          });
        }
      }
    ]
  });
})();
