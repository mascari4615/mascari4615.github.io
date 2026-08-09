/**
 * 오늘의 문제 (TASK-KL-089) — 도구를 열어야 풀리는 하루 한 문제.
 *
 * 자리: 커뮤니티와 같다 — 앱 안의 한 화면(`/karmolab/#quest`). 도구 상세 페이지는 만들지 않는다.
 * 정답은 원문 대신 지문(sha-256 앞 16자)만 둔다 — 소스를 열어도 답이 안 보인다.
 * 대조는 이 브라우저 안에서만 한다.
 */
import { mountCourseNext } from './play-course';
import { mountPlayBoard, renderPlayResult, submitPlay, type PlaySpec } from '../lib/plays';
import { t, loadNamespace } from '../lib/i18n';

/**
 * 오늘의 문제 순위 (TASK-KL-148 ②) — **적게 시도할수록** 위다.
 * 표가 갈리지 않는다: 문제는 하루에 하나뿐이라 모두가 같은 것을 푼다.
 */
const QUEST_SPEC: PlaySpec = { game: 'quest', better: 'low', unit: t('quest.t03'), decimals: 0 };

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  interface Puzzle {
    id: string;
    q: string;
    tool: string;
    hint: string;
    /** 표에 적힌 문제 — 답은 지문(sha-256 앞 16자)으로만 둔다. */
    a?: string[];
    /** 그날 만들어진 문제 — 답을 그 자리에서 견준다. */
    ok?: (v: string) => boolean;
  }

  const KEY = 'karmolab_quest';
  const EPOCH = Date.UTC(2026, 7, 8); // 2026-08-08 (KST 자정)

  const kst = (): Date => new Date(Date.now() + 9 * 3600e3);
  const dayNo = (): number => {
    const k = kst();
    return Math.max(0, Math.floor((Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - EPOCH) / 86400e3));
  };
  const dayLabel = (): string => {
    const k = kst();
    return `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}.`;
  };
  const norm = (s: string): string => s.toLowerCase().replace(/[\s,]/g, '');
  async function fingerprint(s: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm(s)));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }

  /* 날짜에서 나오는 난수 — 같은 날이면 누구에게나 같은 문제가 나온다(서버 없이 맞추는 법). */
  function seeded(n: number): () => number {
    /* 날 번호를 그대로 씨앗에 쓰면 이웃한 날끼리 첫 값이 닮는다 — 갈래를 그 첫 값으로
     * 고르므로 「시간 → 분」이 사흘 내리 나왔다(실측: 열 날 중 넷). 한 번 흩어 준다. */
    let x = (n + 0x9e3779b9) >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x21f0aaad) >>> 0;
    x ^= x >>> 15;
    x = Math.imul(x, 0x735a2d97) >>> 0;
    x ^= x >>> 15;
    x = x >>> 0 || 1;
    return () => {
      x ^= x << 13;
      x >>>= 0;
      x ^= x >> 17;
      x ^= x << 5;
      x >>>= 0;
      return x / 4294967296;
    };
  }

  /**
   * 그날 만들어지는 문제 (TASK-KL-089).
   *
   * 표에 적어 둔 문제는 열여섯 개뿐이라 **열여섯 밤이면 처음으로 돌아온다** — 매일 오는 놀이가
   * 두 주 만에 재방송이 된다. 유형은 그대로 두고 숫자만 그날 것으로 뽑으면 바닥이 없다.
   * 표 문제와 하루씩 번갈아 나오므로, 손으로 쓴 문제의 결도 안 사라진다.
   */
  /**
   * 그날의 갈래 — **앞서 나온 갈래와 겹치면 옮긴다.**
   *
   * 씨앗을 흩어도 우연은 뭉친다: 「시간 → 분」이 사흘 내리 나왔다(실측). 그런데 바로 앞 것과만
   * 견주면 밀린 값이 또 겹쳐서 셋이 이어졌다 — 앞의 **정해진 갈래**를 좇아 올라가며 정해야 한다.
   * 멀리 갈수록 값이 안 바뀌므로 여덟 걸음이면 충분하다(만든 문제는 하루 걸러 나온다).
   */
  function kindOf(day: number): number {
    const raw = (d: number): number => Math.floor(seeded(d)() * 4);
    const start = Math.max(1, day - 16);
    let prev = -1;
    let k = raw(start);
    for (let d = start; d <= day; d += 2) {
      k = raw(d);
      if (k === prev) k = (k + 1) % 4;
      prev = k;
    }
    return k;
  }

  /** 받침을 보고 을/를을 고른다 — 「2570 을」이 아니라 「2570을」. */
  function eul(word: string): string {
    const digit = /[0-9]$/.test(word);
    const last = digit ? '0123456789'.indexOf(word[word.length - 1]) : -1;
    // 숫자는 읽는 소리로 받침을 판단한다 (0 영·1 일·3 삼·6 육·7 칠·8 팔 = 받침 있음)
    const hasBatchim = digit ? [true, true, false, true, false, false, true, true, true, false][last] : true;
    return word + (hasBatchim ? t('quest.t04') : t('quest.t05'));
  }

  /** 받침을 보고 은/는을 고른다 — 「56킬로그램는」은 사람이 쓰는 말이 아니다. */
  function neun(word: string): string {
    const last = word.charCodeAt(word.length - 1);
    const hangul = last >= 0xac00 && last <= 0xd7a3;
    return word + (hangul && (last - 0xac00) % 28 !== 0 ? t('quest.t06') : t('quest.t07'));
  }

  function madeToday(day: number): Puzzle {
    const rnd = seeded(day);
    const pickOf = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
    rnd(); // 갈래를 정할 때 쓴 몫 — 아래 값들이 그것과 같은 흐름을 타지 않게 한 번 흘린다
    const kind = kindOf(day);
    const norm2 = (v: string): string => v.toLowerCase().replace(/[\s,]/g, '');

    if (kind === 0) {
      const n = 100 + Math.floor(rnd() * 3900);
      const base = pickOf([2, 8, 16]);
      return {
        id: `g${day}`,
        q: t('quest.q.radix', { subject: eul(String(n)), n: String(n), base: String(base) }),
        tool: 'radix',
        hint: t('quest.hint.radix', { subject: eul(String(n)), n: String(n), base: String(base) }),
        ok: (v) => norm2(v).replace(/^0[bxo]/, '') === n.toString(base)
      };
    }
    if (kind === 1) {
      const n = 1 + Math.floor(rnd() * 60);
      const [from, to, f] = pickOf<[string, string, (x: number) => number]>([
        [t('quest.t08'), t('quest.t09'), (x) => x / 1.609344],
        [t('quest.t10'), t('quest.t11'), (x) => x * 2.2046226],
        [t('quest.t12'), t('quest.t13'), (x) => (x * 9) / 5 + 32],
        [t('quest.t14'), t('quest.t15'), (x) => x * 2.54]
      ]);
      const want = f(n);
      return {
        id: `g${day}`,
        // 「46 킬로미터 는」처럼 띄어 놓으면 사람이 쓰는 말이 아니다 — 붙여 적는다.
        q: t('quest.q.unit', { subject: from === t('quest.t12') ? t('quest.celsius', { n: String(n) }) : `${n}${neun(from)}`, n: String(n), from, to }),
        tool: 'unitconv',
        hint: t('quest.hint.unit', { from, to, n: String(n) }),
        // 반올림 자리를 하나 어긋나게 적어도 맞다고 본다 — 도구가 보여 주는 자릿수가 제각각이다.
        ok: (v) => Math.abs(parseFloat(norm2(v)) - want) < 0.15
      };
    }
    if (kind === 2) {
      const mb = pickOf([2, 4, 8, 16, 32, 64, 128]);
      return {
        id: `g${day}`,
        q: t('quest.q.bytes', { mb: String(mb) }),
        tool: 'bytesize',
        hint: t('quest.hint.bytes', { mb: String(mb) }),
        ok: (v) => parseFloat(norm2(v).replace(/kb$/, '')) === mb * 1024
      };
    }
    const h = Math.floor(rnd() * 20) + 1;
    const m = pickOf([5, 10, 15, 20, 25, 40, 50]);
    const total = h * 60 + m;
    return {
      id: `g${day}`,
      q: t('quest.q.time', { h: String(h), m: String(m) }),
      tool: 'timecalc',
      hint: t('quest.hint.time', { h: String(h), m: String(m) }),
      ok: (v) => parseFloat(norm2(v).replace(/분$/, '')) === total
    };
  }

  Toolbox.register({
    id: 'quest',
    title: t('widgets.quest.title', undefined, "오늘의 문제"),
    category: 'tool',
    desc: t('widgets-desc.quest.desc', undefined, "도구를 열어야 풀리는 하루 한 문제 — 진법·모스·해시·단위"),
    // 커뮤니티와 같은 틀 — 넓게 쓰고 도구 제목 카드는 안 그린다.
    layout: 'wide',
    noHero: true,
    icon:
      '<path d="M9 8a3 3 0 1 1 4 2.8c-.8.3-1 .9-1 1.7v.5" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/><circle cx="12" cy="17.5" r="1.2" fill="currentColor"/>',
    tabs: [
      {
        id: 'app',
        label: t('quest.t16', undefined, "오늘의 문제"),
        build: function (container: HTMLElement): void {
          void loadNamespace('quest').then(function () {

          if (typeof Mdd !== 'undefined') Mdd.linePreset?.('tool_run', { msg: t('quest.t18') });
          container.innerHTML = `
            <p class="qs-lead">${esc(t('quest.t01'))}</p>
            <!-- 오늘 성적은 **연습을 하든 말든** 이 자리에 남는다 (TASK-KL-089).
                 예전에는 연습을 시작하면 오늘 결과도 「결과 복사」도 화면에서 통째로 사라져,
                 연습을 그만두면 오늘 것을 자랑할 길이 없었다. -->
            <div class="qs-today" id="qsToday" hidden>
              <span id="qsTodayText"></span>
              <button type="button" class="btn btn-ghost" id="qsShare">${esc(t('quest.btn.qsShare'))}</button>
            </div>
            <section class="qs-card">
              <div class="qs-day" id="qsDay"></div>
              <p class="qs-q" id="qsQ">${esc(t('quest.label.qsQ'))}</p>
              <form class="qs-row" id="qsForm" autocomplete="off">
                <input type="text" id="qsAns" aria-label="${esc(t('quest.aria.qsAns'))}" placeholder="${esc(t('quest.ph.qsAns'))}">
                <button type="submit" class="btn btn-primary">${esc(t('quest.t02'))}</button>
                <button type="button" class="btn btn-ghost" id="qsHintBtn">${esc(t('quest.btn.qsHintBtn'))}</button>
              </form>
              <button type="button" class="qs-tool" id="qsTool">${esc(t('quest.btn.qsTool'))}</button>
              <div class="qs-slot" id="qsSlot" hidden></div>
              <p class="qs-hint" id="qsHint" hidden></p>
              <p class="tool-status" id="qsMsg" aria-live="polite"></p>
              <p class="qs-tries" id="qsTries"></p>
              <p class="pc-line" id="qsCourse" hidden></p>
              <p id="qsRecord" hidden></p>
              <div id="qsBoard" hidden></div>
              <div class="qs-after" id="qsAfter" style="display:none; gap:6px; flex-wrap:wrap;">
                <button type="button" class="btn btn-primary" id="qsMore">${esc(t('quest.btn.qsMore'))}</button>
              </div>
            </section>
          `;

          const $ = (id: string) => container.querySelector<HTMLElement>('#' + id)!;
          const ans = () => container.querySelector<HTMLInputElement>('#qsAns')!;
          let all: Puzzle[] = [];
          let current: Puzzle | null = null;
          let tries = 0;
          let done = false;
          let practice = false;
          /** 이 자리에서 이미 낸 연습 문제 — 되돌아오지 않게 센다. */
          const usedPractice = new Set<string>();

          const load = (): Record<string, { win: boolean; tries: number }> => {
            try {
              return JSON.parse(localStorage.getItem(KEY) || '{}');
            } catch {
              return {};
            }
          };
          const save = (o: unknown): void => {
            try {
              localStorage.setItem(KEY, JSON.stringify(o));
            } catch {
              /* 사생활 모드 — 기록만 못 남고 놀이는 된다 */
            }
          };

          /* 「도구를 열어야 풀리는 문제」인데 도구를 열면 이 화면을 떠나야 했다 —
           * 적던 답도 몇 번째인지도 날아갔다. 도구를 **문제 밑에서** 편다.
           * 못 펴면(스크립트를 못 받거나 그 도구가 없으면) 그때만 도구 페이지로 보낸다. */
          function openTool(id: string): void {
            const slot = $('qsSlot');
            const btn = $('qsTool') as HTMLButtonElement;
            if (!slot.hidden) {
              slot.hidden = true;
              slot.innerHTML = '';
              btn.textContent = t('quest.btn.qsTool');
              return;
            }
            btn.disabled = true;
            btn.textContent = t('quest.t19');
            void Promise.resolve(Toolbox.kickLazyLoad?.(id))
              .catch(() => undefined)
              .then(() => {
                const ok = Toolbox.renderInline?.(id, slot);
                btn.disabled = false;
                /* 스크립트를 못 받으면 자리표(「불러오는 중…」)가 그려지고 `ok` 는 참으로 온다 —
                 * 그것만 믿으면 영영 안 끝나는 상자가 남는다. 자리표가 보이면 못 편 것이다. */
                if (!ok || slot.querySelector('.tb-lazy-loading')) {
                  location.href = `/karmolab/t/${id}/`;
                  return;
                }
                slot.hidden = false;
                btn.textContent = t('quest.t20');
              });
          }

          function paint(p: Puzzle): void {
            $('qsDay').textContent = practice ? t('quest.t21') : `#${dayNo() + 1} · ${dayLabel()}`;
            $('qsQ').textContent = p.q;
            $('qsHint').textContent = p.hint;
            // 문제가 바뀌면 펴 둔 도구도 그 문제의 것으로 — 남겨 두면 딴 문제의 도구가 붙어 있다.
            const slot = $('qsSlot');
            slot.hidden = true;
            slot.innerHTML = '';
            ($('qsTool') as HTMLButtonElement).textContent = t('quest.btn.qsTool');
          }

          /** 오늘 성적 줄 — 기록이 있으면 켜 두고, 연습을 하든 말든 안 끈다. */
          function paintToday(): void {
            const st = load()[dayLabel()];
            if (!st) {
              $('qsToday').hidden = true;
              return;
            }
            $('qsToday').hidden = false;
            $('qsTodayText').textContent = st.win
              ? t('quest.share.win', { day: String(dayNo() + 1), n: String(st.tries) })
              : t('quest.share.lose', { day: String(dayNo() + 1) });
          }

          function finish(win: boolean): void {
            done = true;
            ans().disabled = true;
            $('qsAfter').style.display = 'flex';
            if (!practice) {
              // 오늘 것을 끝낸 그 자리에서 남은 놀이를 말해 준다 (연습은 오늘 것이 아니다).
              mountCourseNext($('qsCourse'), 'quest');
            }
            if (practice) return; // 연습은 오늘 성적을 흐리지 않는다
            const st = load();
            st[dayLabel()] = { win, tries };
            save(st);
            paintToday();
            /* 맞힌 판만 기록에 남긴다 (TASK-KL-148 ②). 적게 시도할수록 잘한 것이고,
               「오늘 순위」가 이 놀이의 순위다 — 원장이 날짜별 최고를 따로 센다. */
            if (win && tries >= 1) {
              void submitPlay(QUEST_SPEC, tries).then((r) => {
                const slot = document.getElementById('qsRecord');
                if (!slot || !slot.isConnected) return;
                renderPlayResult(slot, QUEST_SPEC, r);
                if (r.server && r.server.improved) {
                  const board = document.getElementById('qsBoard');
                  if (board) mountPlayBoard(board, QUEST_SPEC, 'day');
                }
              });
            }
          }

          /* 오늘 것을 끝내면 할 게 없어 그냥 나가게 된다 — 지난 문제를 연습으로 더 풀게 한다. */
          function practiceRound(): void {
            const todayId = current ? current.id : '';
            /* 이미 낸 연습 문제는 다시 안 낸다. 매번 무작위로 뽑았더니 열 번 이어 하는 동안
             * 두 개가 되돌아왔다(실측: 열 판에 서로 다른 문제 여덟). 표를 다 돌면 그때 비운다. */
            let pool = all.filter((x) => x.id !== todayId && x.id !== current?.id && !usedPractice.has(x.id));
            if (!pool.length) {
              usedPractice.clear();
              pool = all.filter((x) => x.id !== todayId && x.id !== current?.id);
            }
            if (!pool.length) return;
            current = pool[Math.floor(Math.random() * pool.length)];
            usedPractice.add(current.id);
            practice = true;
            done = false;
            tries = 0;
            ans().disabled = false;
            ans().value = '';
            ans().focus();
            $('qsAfter').style.display = 'none';
            $('qsHint').hidden = true;
            $('qsTries').textContent = '';
            $('qsMsg').textContent = t('quest.t22');
            paint(current);
          }

          function start(): void {
            fetch('/apps/karmolab/data/quest-puzzles.json')
              .then((r) => r.json())
              .then((j: { puzzles: Puzzle[] }) => {
                all = j.puzzles;
                // 하루는 손으로 쓴 문제, 하루는 그날 만든 문제 — 표가 다 돌아도 재방송이 안 된다.
                const d = dayNo();
                current = d % 2 === 1 ? madeToday(d) : all[Math.floor(d / 2) % all.length];
                paint(current);
                paintToday();
                const st = load()[dayLabel()];
                if (st) {
                  tries = st.tries;
                  $('qsMsg').textContent = st.win ? t('quest.t23') : t('quest.t24');
                  $('qsTries').textContent = st.win ? '🟩' : '🟥';
                  finish(st.win);
                } else {
                  // 매일 오는 놀이라 열자마자 칠 수 있어야 한다 — 화면은 안 밀리게.
                  ans().focus({ preventScroll: true });
                }
              })
              .catch(() => {
                // 잠깐 끊긴 것뿐인데 새로고침을 시키지 않는다 — 그 자리에서 다시 받는다.
                $('qsQ').textContent = t('quest.t25');
                $('qsMsg').textContent = t('quest.t26');
                const again = document.createElement('button');
                again.type = 'button';
                again.className = 'btn btn-primary';
                again.textContent = t('quest.t27');
                again.addEventListener('click', () => {
                  again.remove();
                  $('qsQ').textContent = t('quest.label.qsQ');
                  $('qsMsg').textContent = '';
                  start();
                });
                $('qsForm').insertAdjacentElement('afterend', again);
              });
          }

          $('qsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (done || !current) return;
            const v = ans().value.trim();
            if (!v) return;
            tries++;
            const hit = current.ok ? current.ok(v) : (current.a || []).indexOf(await fingerprint(v)) !== -1;
            if (hit) {
              $('qsMsg').textContent = t('quest.correct', { n: String(tries) });
              $('qsTries').textContent = '🟩';
              finish(true);
            } else if (tries >= 5) {
              $('qsMsg').textContent = t('quest.t28');
              $('qsTries').textContent = '🟥';
              finish(false);
            } else {
              $('qsMsg').textContent = t('quest.wrong', { n: String(tries) });
              ans().select();
            }
          });

          $('qsTool').addEventListener('click', () => {
            if (current) openTool(current.tool);
          });
          $('qsHintBtn').addEventListener('click', () => {
            $('qsHint').hidden = false;
          });
          $('qsMore').addEventListener('click', practiceRound);
          $('qsShare').addEventListener('click', () => {
            const st = load()[dayLabel()] || { win: false, tries: 5 };
            const text =
              `KarmoLab 오늘의 문제 #${dayNo() + 1}\n` +
              (st.win ? `🟩 ${st.tries}/5` : '🟥 5/5') +
              '\nblog.mascari4615.com/karmolab/#quest';
            void navigator.clipboard.writeText(text).then(() => {
              $('qsShare').textContent = t('quest.t29');
            });
          });

          start();
                  });
        }
      }
    ]
  });
})();
