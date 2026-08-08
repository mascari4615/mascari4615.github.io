/**
 * 오늘의 판 (TASK-KL-194) — 첫 화면에서 **매일 달라지는 자리**.
 *
 * 왜 있나: 「오늘의 코스」(KL-089)는 이미 돌고 있었다 — 놀이 다섯 중 오늘 뭘 했는지 세고,
 * 다 하면 며칠 연속인지도 말한다. 그런데 그것이 **놀이터 안에만** 있었다. 놀이터로 들어간
 * 사람만 보는 코스는 「다시 올 이유」가 되지 못한다. 첫 화면에 없으면 이 사이트는 160개짜리
 * 도구함이지 매일 오는 곳이 아니다.
 *
 * 그래서 새 놀이를 만들지 않았다. 이미 도는 셈을 **보이는 자리로 옮기고**, 연속일을 계정에
 * 붙이고(`/kl/today`), 완주를 밖으로 내보내는 단추 하나를 달았다.
 *
 * 왜 첫 화면 묶음(`home-page.ts`)에 안 넣었나: 넣어 봤고 부팅 JS 천장(40KB gz)을 넘었다.
 * 이 자리는 어차피 놀이 목록을 받아야 채워지므로 첫 그림 뒤에 와도 된다 —
 * `home-page` 가 `Toolbox.ensureScript('root/today')` 로 데려온다.
 *
 * 판정은 **여기가 안 한다**: 「오늘 뭘 했나」는 각 놀이의 저장을 읽는 `play-course` 가 정본이고,
 * 서버는 그 날짜를 계정에 옮겨 적기만 한다. 셋 중 하나라도 자기 판정을 따로 만들면 그날부터
 * 첫 화면·놀이터·서버가 서로 다른 날을 말한다.
 */
import { courseGames, courseSteps, courseRun, pushCourseSlots, type CourseStep } from './widgets/play-course';

declare const Toolbox: { switchPage: (id: string) => void };

const escapeHtml = (value: unknown): string =>
    String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/**
 * 서버에서 계정에 붙은 것만 받아 온다 — 연속일·오늘 완주한 사람 수.
 *
 * 로그인 안 했거나 서버가 죽었으면 조용히 없는 셈 친다. 오늘의 판은 노트북 한 대에
 * 묶이면 안 된다 — 그 자리가 첫 화면의 단일 장애점이 된다.
 */
async function fromServer(): Promise<{ signedIn: boolean; run: number; crowd: number } | null> {
    const base = (window as any).KarmoAccount?.apiBase;
    if (!base) return null;
    try {
        const response = await fetch(base + '/kl/today', { credentials: 'include' });
        if (!response.ok) return null;
        const data = await response.json();
        return {
            signedIn: !!(data.me && data.me.signedIn),
            run: Number(data.me && data.me.run) || 0,
            crowd: Number(data.crowd && data.crowd.finished) || 0,
        };
    } catch {
        return null;
    }
}

async function mount(slot: HTMLElement): Promise<void> {
    const games = await courseGames();
    if (!games.length || !slot.isConnected) return;
    const steps: CourseStep[] = courseSteps(games);
    if (!steps.length) return;

    /* 첫 화면에 들른 김에 밀린 것을 옮겨 적는다 — 로그인하기 전에 논 칸도 여기서 간다. */
    pushCourseSlots(steps);

    const done = steps.filter((s) => s.done).length;
    const all = done === steps.length;
    const emojiOf = (id: string): string => (games.filter((g) => g.id === id)[0] || {}).emoji || '';

    /* 도장은 완주한 그 자리(놀이터)가 찍는다 — 여기서는 세기만 한다(`false`). */
    let run = courseRun(false);
    let crowd = 0;
    const server = await fromServer();
    /* 연속일을 두 곳에서 셈하지 않는다: 로그인했으면 서버 수가 이긴다. 폰과 PC 가 다른 수를
       말하면 그 수는 아무 뜻이 없다. 로그인 안 했으면 이 브라우저 수를 쓴다. */
    if (server && server.signedIn) run = server.run;
    if (server) crowd = server.crowd;
    if (!slot.isConnected) return;

    const chips = steps
        .map(
            (step) =>
                `<a class="lt-chip${step.done ? ' is-done' : ''}" href="${escapeHtml(step.url)}" data-go="${escapeHtml(
                    step.id
                )}">${escapeHtml(emojiOf(step.id))} ${escapeHtml(step.title)}</a>`
        )
        .join('');

    /* 연속일은 **2일부터** 말한다 — 첫날의 「1일 연속」은 축하가 아니라 셈이 켜졌다는 통보다.
       완주한 사람 수도 0이면 그 줄이 없다: 「오늘 0명」은 북적임이 아니라 죽은 화면이다. */
    const streak = run >= 2 ? `<span class="lt-run">🔥 ${run}일 연속</span>` : '';
    const line = all ? '오늘 다 끝냈습니다' : `${done} / ${steps.length}` + (done ? ' — 조금만 더' : '');
    const others = crowd > 0 ? `<span class="lt-crowd">오늘 ${crowd}명 완주</span>` : '';
    const brag = all ? '<button type="button" class="lt-brag" data-brag>자랑하기</button>' : '';

    slot.innerHTML =
        `<div class="lt-head"><span class="lt-tag">오늘의 판</span>` +
        `<span class="lt-count">${line}</span>${streak}${others}${brag}</div>` +
        `<div class="lt-chips">${chips}</div>`;

    /* 앱 안의 화면은 새로 고치지 않고 그 자리에서 넘어간다 (주소는 정적 페이지에도 살아 있게 둔다). */
    slot.querySelectorAll<HTMLAnchorElement>('[data-go]').forEach((link) => {
        const url = link.getAttribute('href') || '';
        if (url.indexOf('/karmolab/#') !== 0) return;
        link.addEventListener('click', (event) => {
            event.preventDefault();
            Toolbox.switchPage(url.split('#')[1]);
        });
    });

    const bragButton = slot.querySelector<HTMLButtonElement>('[data-brag]');
    if (bragButton) {
        bragButton.addEventListener('click', async () => {
            /* 자랑은 **밖으로** 나가야 유입이 된다. 폰은 공유 창, PC 는 복사 —
               없는 기능을 있는 척하지 않는다(복사도 막히면 막혔다고 말한다). */
            const text =
                `KarmoLab 오늘의 판 ${steps.length}판 완주` +
                (run >= 2 ? ` · ${run}일 연속` : '') +
                '\nhttps://blog.mascari4615.com/karmolab/#play';
            try {
                if ((navigator as any).share) {
                    await (navigator as any).share({ text });
                    return;
                }
                await navigator.clipboard.writeText(text);
                bragButton.textContent = '복사했습니다';
            } catch {
                bragButton.textContent = '복사가 막혀 있습니다';
            }
        });
    }
}

(window as any).KarmoToday = { mount };
