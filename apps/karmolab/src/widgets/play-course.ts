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
const COUNTED = ['daily', 'higher', 'quest'];

/** 놀이 목록(games.json)을 받아 오늘 상태를 붙여 돌려준다. 셀 줄 모르는 놀이는 빼고. */
export function courseSteps(games: Array<{ id: string; title: string; url: string }>): CourseStep[] {
  return games
    .filter((g) => COUNTED.indexOf(g.id) >= 0)
    .map((g) => ({ id: g.id, title: g.title, url: g.url, done: doneToday(g.id) }));
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
  fetch('/apps/karmolab/data/games.json')
    .then((r) => r.json())
    .then((j: { games: Array<{ id: string; title: string; url: string; emoji?: string }> }) => {
      if (!slot.isConnected) return;
      const steps = courseSteps(j.games);
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
