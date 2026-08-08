/**
 * 오늘의 코스 — 놀이 셋이 함께 쓰는 셈법 (TASK-KL-089).
 *
 * 코스는 놀이터 화면에만 있었다. 그런데 사람이 코스를 떠올리는 순간은 **한 판을 끝낸 그때**다 —
 * 그 자리에서 「하나 남았다」를 말해 주지 않으면 그냥 창을 닫는다.
 *
 * 그러려면 놀이마다 「오늘 뭘 했나」를 각자 세게 되는데, 세 곳에 적으면 그날부터 갈라진다.
 * 셈은 여기 한 벌만 둔다. 새 판정 기준은 만들지 않는다 — 각 놀이가 이미 이 브라우저에
 * 남긴 것만 읽는다. 못 읽으면 코스만 조용히 빠지고 놀이는 그대로 된다.
 */
export interface CourseStep {
  id: string;
  title: string;
  url: string;
  done: boolean;
}

const READ = (k: string): any => {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null');
  } catch {
    return null;
  }
};

/** 오늘(KST) 을 각 놀이가 저장에 쓰는 것과 **같은 모양**으로. 여기서 갈리면 전부 어긋난다. */
export function courseDay(): string {
  const k = new Date(Date.now() + 9 * 3600e3);
  return `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}.`;
}

export function doneToday(id: string): boolean {
  try {
    if (id === 'daily') {
      return Object.keys(localStorage).some((k) => {
        if (!/^daily:[^:]+:[^:]+$/.test(k)) return false;
        const v = READ(k);
        return !!v && (v.status === 'won' || v.status === 'lost');
      });
    }
    if (id === 'quest') return !!(READ('karmolab_quest') || {})[courseDay()];
    if (id === 'higher') {
      const h = READ('karmolab_higher_day');
      return !!h && h.day === courseDay() && (h.rounds || 0) > 0;
    }
    if (id === 'twenty') {
      const t = READ('karmolab_twenty_day');
      return !!t && t.day === courseDay() && (t.rounds || 0) > 0;
    }
    /* 월드컵은 「오늘 한 판」을 따로 안 적는다 — 지난 우승 목록에 오늘 날짜가 있으면 한 것이다
       (새 저장을 하나 더 만들면 그날부터 두 벌이 갈라진다). */
    if (id === 'worldcup') {
      const list = READ('karmolab_worldcup_history');
      if (!Array.isArray(list) || !list.length) return false;
      const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
      return list.some((h: { at?: string }) => String(h && h.at).slice(0, 10) === today);
    }
  } catch {
    /* 사생활 모드 */
  }
  return false;
}

/**
 * 코스가 **셀 줄 아는** 놀이 — 「오늘 했나」를 읽는 법이 위 doneToday 에 적힌 것들.
 *
 * 놀이터 목록에는 이보다 더 들어올 수 있다(새 놀이가 늘 먼저 목록에 붙는다). 그때 목록을
 * 그대로 코스로 삼으면, 읽을 줄 모르는 놀이가 **영영 안 끝나는 칸**이 되어 코스가 통째로
 * 완주 불가가 된다. 그래서 코스는 여기 적힌 것만 센다 — 새 놀이는 읽는 법을 더한 날 합류한다.
 */
const COUNTED = ['daily', 'higher', 'quest', 'twenty', 'worldcup'];

/** 놀이 목록(games.json)을 받아 오늘 상태를 붙여 돌려준다. 셀 줄 모르는 놀이는 빼고. */
export function courseSteps(games: Array<{ id: string; title: string; url: string }>): CourseStep[] {
  return games
    .filter((g) => COUNTED.indexOf(g.id) >= 0)
    .map((g) => ({ id: g.id, title: g.title, url: g.url, done: doneToday(g.id) }));
}

/** 놀이 목록 한 벌. 여러 자리(코스 줄·첫 화면)가 부르므로 한 화면에서 한 번만 받아 온다. */
let gamesOnce: Promise<Array<{ id: string; title: string; url: string; emoji?: string }>> | null = null;
export function courseGames(): Promise<Array<{ id: string; title: string; url: string; emoji?: string }>> {
  if (!gamesOnce) {
    gamesOnce = fetch('/apps/karmolab/data/games.json')
      .then((r) => r.json())
      .then((j: { games: Array<{ id: string; title: string; url: string; emoji?: string }> }) => j.games || [])
      .catch(() => []);
  }
  return gamesOnce;
}

/**
 * 오늘 끝낸 칸을 **계정에** 옮겨 적는다 (TASK-KL-194).
 *
 * 왜 필요한가: 연속일은 여기(브라우저) 안에만 있었다 — 폰으로 열면 0일, 기록을 지우면 0일.
 * 한 번의 청소로 사라지는 자리는 아무도 안 쌓는다. 판정은 그대로 여기가 한다(각 놀이의 저장을
 * 읽는 쪽이 정본). 서버는 날짜만 받아 적는다 — 판정을 서버로 옮기면 같은 규칙이 두 벌이 된다.
 *
 * 같은 칸을 두 번 보내지 않는다(하루 단위로 기억). 로그인 안 했거나 서버가 죽었으면
 * **아무 일도 안 일어난다** — 놀이는 그대로 굴러가고 연속일만 이 브라우저 것으로 남는다.
 */
const PUSHED_KEY = 'karmolab_course_pushed';

export function pushCourseSlots(steps: CourseStep[]): void {
  const base = (window as any).KarmoAccount?.apiBase;
  if (!base) return;
  const today = courseDay();
  let box: { day?: string; slots?: string[] } = READ(PUSHED_KEY) || {};
  if (box.day !== today) box = { day: today, slots: [] };
  const sent = box.slots || [];
  const fresh = steps.filter((s) => s.done && sent.indexOf(s.id) < 0);
  if (!fresh.length) return;
  for (const step of fresh) {
    sent.push(step.id);
    fetch(base + '/kl/today/done', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slot: step.id }),
    }).catch(() => {
      /* 서버가 없어도 놀이는 그대로다 */
    });
  }
  try {
    localStorage.setItem(PUSHED_KEY, JSON.stringify({ day: today, slots: sent }));
  } catch {
    /* 사생활 모드 — 다음에 한 번 더 보낸다(서버가 같은 칸을 두 번 세지 않는다) */
  }
}

/**
 * 오늘 도장 + 연속 일수. `stamp` 가 참일 때만 오늘을 적는다 —
 * 놀이 안에서 부를 때는 세기만 하고, 도장은 코스를 보여 주는 자리(놀이터)가 찍는다.
 */
export function courseRun(stamp: boolean): number {
  let box: { days?: string[] } = {};
  try {
    box = JSON.parse(localStorage.getItem('karmolab_course') || '{}');
  } catch {
    box = {};
  }
  const days: string[] = Array.isArray(box.days) ? box.days : [];
  const today = courseDay();
  if (stamp && days[days.length - 1] !== today) {
    days.push(today);
    if (days.length > 400) days.splice(0, days.length - 400);
    try {
      localStorage.setItem('karmolab_course', JSON.stringify({ days }));
    } catch {
      /* 못 남겨도 오늘 화면은 맞다 */
    }
  }
  let run = 0;
  const cur = new Date(Date.now() + 9 * 3600e3);
  for (;;) {
    const d = `${cur.getUTCFullYear()}. ${cur.getUTCMonth() + 1}. ${cur.getUTCDate()}.`;
    if (days.indexOf(d) < 0) break;
    run++;
    cur.setUTCDate(cur.getUTCDate() - 1);
  }
  return run;
}

/**
 * 한 판을 끝낸 자리에 붙이는 줄 — 「오늘 남은 놀이」와 거기로 가는 단추.
 * 남은 것이 없으면 완주를 말한다. 목록을 못 받으면 아무것도 안 붙인다(빈 상자 X).
 *
 * **보이고 말고는 이 함수가 정한다.** 부르는 쪽이 먼저 켜 두면, 할 말이 없어 그냥 돌아갈 때
 * 빈 띠만 덩그러니 남는다(코스 밖 놀이에서 실제로 그랬다).
 */
export function mountCourseNext(slot: HTMLElement, meId: string): void {
  courseGames()
    .then((games) => {
      const j = { games };
      if (!slot.isConnected) return;
      const steps = courseSteps(j.games);
      /* 한 판이 끝난 자리 = 「오늘 뭘 했나」가 방금 바뀐 자리다. 계정에 옮겨 적는 것도 여기서
         한다 — 첫 화면에만 두면 놀고 나서 첫 화면에 안 들르는 사람은 영영 안 쌓인다. */
      pushCourseSlots(steps);
      if (!steps.some((s) => s.id === meId)) return; // 코스 밖의 놀이는 코스를 말하지 않는다
      const left = steps.filter((s) => !s.done && s.id !== meId);
      const meDone = steps.every((s) => s.done);

      if (meDone) {
        slot.hidden = false;
        slot.innerHTML = `<span class="pc-tag">오늘의 코스</span><span>셋 다 끝냈습니다 — ${courseRun(
          true
        )}일 연속</span>`;
        return;
      }
      if (!left.length) return; // 남은 것이 나뿐 — 할 말이 없다
      slot.hidden = false;
      const next = left[0];
      const emoji = (j.games.filter((g) => g.id === next.id)[0] || {}).emoji || '';
      slot.innerHTML =
        `<span class="pc-tag">오늘의 코스</span>` +
        `<span>${left.length}개 남았습니다</span>` +
        `<a class="pc-go" href="${next.url}">${emoji} ${next.title} 하러 가기 →</a>`;
      const go = slot.querySelector<HTMLAnchorElement>('.pc-go')!;
      if (next.url.indexOf('/karmolab/#') === 0) {
        go.addEventListener('click', (e) => {
          e.preventDefault();
          Toolbox.switchPage(next.url.split('#')[1]);
        });
      }
    })
    .catch(() => {
      /* 목록을 못 받으면 이 줄만 없다 */
    });
}
