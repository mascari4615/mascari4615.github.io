/**
 * 결과를 그림으로 (TASK-KL-196 F).
 *
 * 왜 있나: 계산기 마흔 몇 개가 좋은 답을 내놓는데, 그 답이 **밖으로 나가는 길이 없다**.
 * 사람은 결국 화면을 캡처해서 보낸다 — 브라우저 탭·주소창·광고가 같이 찍힌 채로.
 *
 * 도구마다 배선을 안 늘린다: 계산기들은 이미 **같은 모양**으로 답을 그린다
 * (`.cc-stat` 칸 + `.tool-list-row` 줄, 각각 44·47개 도구). 그 모양을 읽어서 카드를 만든다 —
 * 도구는 한 줄도 안 고치고 참여한다(도구 SDK 와 같은 생각: 문턱은 이미 있는 것이어야 한다).
 * 아무 DOM 이나 추측해 긁지 않는다. **우리가 정한 우리 모양**만 읽는다.
 *
 * 화풍 = 자랑 카드와 같은 포스터(밝은 바탕 + 큰 세리프). 남의 피드에서 튀어야 하는 것은 같다.
 */
const WIDTH = 1200;
const HEIGHT = 630;

export interface CardRow {
    key: string;
    value: string;
}

export interface CardData {
    tool: string;
    /** 제일 큰 값 하나 (없으면 첫 칸). */
    headline: string;
    headlineLabel: string;
    rows: CardRow[];
}

const tidy = (raw: string | null | undefined): string => String(raw ?? '').replace(/\s+/g, ' ').trim();

/**
 * 지금 보이는 도구 화면에서 답을 읽는다. 못 읽으면 `null` — 그때는 단추를 안 만든다
 * (눌러도 아무 일 없는 단추가 제일 나쁘다).
 */
export function readResult(page: HTMLElement, toolTitle: string): CardData | null {
    const stats = Array.from(page.querySelectorAll('.cc-stat')).map((el) => ({
        key: tidy(el.querySelector('.cc-stat-label')?.textContent),
        value: tidy(el.querySelector('.cc-stat-value')?.textContent),
        primary: el.classList.contains('cc-stat-primary')
    }));
    const rows = Array.from(page.querySelectorAll('.tool-list-row')).map((el) => ({
        key: tidy(el.querySelector('.tool-list-key')?.textContent),
        value: tidy(el.querySelector('.tool-list-val')?.textContent)
    }));
    const filled = stats.filter((s) => s.value && s.value !== '—');
    if (!filled.length) return null;
    const head = filled.find((s) => s.primary) ?? filled[0];

    /* 큰 숫자는 칸이 아니라 **한가운데**에 있다(`.tool-display`) — 체질량지수의 「22.9」가
       거기 산다. 그걸 안 보면 카드의 주인공이 「정상」 같은 분류 글자가 되어, 정작 사람이
       물어본 값이 카드에 없다. 있으면 그것이 주인공이고, 분류는 아래 줄로 내려간다. */
    const display = tidy(page.querySelector('.tool-display')?.textContent);
    const useDisplay = !!display && display !== '—';
    const rest = [
        ...(useDisplay ? [head] : []).map((s) => ({ key: s.key, value: s.value })),
        ...filled.filter((s) => s !== head),
        ...rows.filter((r) => r.key && r.value)
    ];
    return {
        tool: toolTitle,
        headline: useDisplay ? display : head.value,
        headlineLabel: head.key,
        // 여섯 줄이면 카드가 찬다. 더 넣으면 글자를 줄여야 하고, 줄인 카드는 아무도 안 읽는다.
        rows: rest.slice(0, 6)
    };
}

async function readyFonts(): Promise<void> {
    try {
        const fonts = (document as any).fonts;
        if (!fonts) return;
        await Promise.all([fonts.load('900 92px KarmoSerif'), fonts.load('700 30px KarmoSans'), fonts.ready]);
    } catch {
        /* 글꼴 없이 그린다 */
    }
}

export async function drawResultCard(data: CardData): Promise<Blob | null> {
    await readyFonts();
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#f2f2ee';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const bar = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    bar.addColorStop(0, '#6d5bd0');
    bar.addColorStop(1, '#2aa9a0');
    ctx.fillStyle = bar;
    ctx.fillRect(0, 0, 78, HEIGHT);

    const left = 140;
    ctx.textAlign = 'left';

    ctx.fillStyle = '#6d5bd0';
    ctx.font = '700 26px ui-monospace, Consolas, monospace';
    ctx.fillText(data.tool, left, 108);

    ctx.fillStyle = '#57546b';
    ctx.font = '400 28px KarmoSans, "Malgun Gothic", sans-serif';
    ctx.fillText(data.headlineLabel, left, 168);

    ctx.fillStyle = '#16151f';
    ctx.font = '900 96px KarmoSerif, Georgia, serif';
    /* 큰 값이 카드를 넘으면 **글자를 줄인다**. 줄바꿈하면 한 값이 두 덩이로 보인다
       (화면 쪽에서 이미 겪은 것과 같은 함정이다). */
    let size = 96;
    while (size > 44 && ctx.measureText(data.headline).width > WIDTH - left - 90) {
        size -= 4;
        ctx.font = `900 ${size}px KarmoSerif, Georgia, serif`;
    }
    ctx.fillText(data.headline, left, 268);

    let y = 340;
    for (const row of data.rows) {
        ctx.fillStyle = '#8b8798';
        ctx.font = '400 24px KarmoSans, "Malgun Gothic", sans-serif';
        ctx.fillText(row.key, left, y);
        ctx.fillStyle = '#16151f';
        ctx.font = '700 26px KarmoSans, "Malgun Gothic", sans-serif';
        const value = row.value.length > 26 ? row.value.slice(0, 25) + '…' : row.value;
        ctx.fillText(value, left + 360, y);
        y += 44;
        if (y > HEIGHT - 110) break;
    }

    ctx.fillStyle = '#2aa9a0';
    ctx.beginPath();
    ctx.arc(left + 7, HEIGHT - 68, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16151f';
    ctx.font = '700 26px KarmoSans, "Malgun Gothic", sans-serif';
    ctx.fillText('KarmoLab · blog.mascari4615.com/karmolab', left + 28, HEIGHT - 60);

    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

/** 그림을 밖으로. 폰이면 공유 창, 아니면 내려받기 — 없는 기능을 있는 척하지 않는다. */
async function shareOrSave(blob: Blob, name: string): Promise<string> {
    const nav = navigator as any;
    const file = new File([blob], `${name}.png`, { type: 'image/png' });
    if (nav.share && nav.canShare?.({ files: [file] })) {
        try {
            await nav.share({ files: [file] });
            return '공유했습니다';
        } catch {
            /* 취소했거나 막혔다 — 내려받기로 */
        }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return '내려받았습니다';
}

export async function save(page: HTMLElement, toolTitle: string, toolId: string): Promise<string> {
    const data = readResult(page, toolTitle);
    if (!data) return '아직 결과가 없어요';
    const blob = await drawResultCard(data);
    if (!blob) return '그림을 못 만들었어요';
    return shareOrSave(blob, `karmolab-${toolId}`);
}

/**
 * 답 칸 아래에 단추를 붙인다. **답이 실제로 있을 때만** 붙는다 — 답은 사람이 값을 넣은
 * 뒤에 생기므로, 화면을 열자마자 재면 늘 「아직 없다」라 단추가 영영 안 붙는다.
 * 그래서 칸이 생기는 것을 한 번만 지켜본다(붙으면 곧바로 그만둔다).
 */
export function attach(page: HTMLElement, toolTitle: string, toolId: string): void {
    /* **화면을 매번 다시 집는다.** 도구 화면은 그리는 도중에 통째로 갈아 끼워질 수 있어서,
       처음 받은 노드를 붙들고 지켜보면 이미 문서에서 떨어져 나간 것을 보게 된다 —
       그러면 칸이 생겨도 영영 안 걸린다(실측: 단추가 안 붙었다).
       그래서 지켜보는 것은 문서 전체, 찾는 것은 「지금 활성인 화면」이다. */
    const host = (): HTMLElement | null =>
        (document.querySelector('.tool-page.active') as HTMLElement | null) ?? (page.isConnected ? page : null);

    const put = (): boolean => {
        const now = host();
        if (!now) return false;
        if (now.querySelector('.tool-card-btn')) return true;
        const stats = now.querySelector('.cc-stats') || now.querySelector('.cc-stat')?.parentElement;
        if (!stats) return false;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tool-card-btn';
        button.textContent = '🖼 그림으로 저장';
        button.addEventListener('click', async () => {
            button.disabled = true;
            try {
                const said = await save(now, toolTitle, toolId);
                (window as any).Toolbox?.showToast?.(said);
            } catch {
                (window as any).Toolbox?.showToast?.('그림을 못 만들었어요');
            } finally {
                button.disabled = false;
            }
        });
        stats.insertAdjacentElement('afterend', button);
        return true;
    };

    if (put()) return;
    const eye = new MutationObserver(() => {
        if (put()) eye.disconnect();
    });
    eye.observe(document.body, { childList: true, subtree: true });
    // 오래 지켜보지 않는다 — 이 화면에 답 칸이 없으면 그냥 없는 것이다.
    setTimeout(() => eye.disconnect(), 60000);
}

(window as any).KarmoResultCard = { save, attach, readResult, draw: drawResultCard };
