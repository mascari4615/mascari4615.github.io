/**
 * 자랑 카드 — **브라우저가 그린다** (TASK-KL-195).
 *
 * 왜 서버가 안 그리나: 카드에는 내 숫자가 박힌다(완주 판 수·연속일·날짜). 미리 찍어 둘 수
 * 없으니 누군가 그 자리에서 그려야 하는데, 서버(노트북)에는 그림 라이브러리도 한글 글꼴 보장도
 * 없다. 반면 **보는 사람의 브라우저에는 둘 다 이미 있다** — 이 앱이 쓰는 그 글꼴 그대로.
 * 서버가 그리려면 native 묶음(sharp·resvg)을 얹어야 하고, 그건 노트북 한 대에 얹는 무게치고는
 * 얻는 것이 없다.
 *
 * 화풍 = 포스터(밝은 바탕 + 거대 세리프). 도구(격자)·놀이(오로라) 카드와 **일부러 다르다**:
 * 자랑 카드는 남의 피드에서 우리 카드끼리가 아니라 **남들 글 사이에서** 튀어야 한다.
 * 어두운 카드 열 장 사이의 밝은 한 장이 그 자리다.
 *
 * 만든 그림은 셋 중 하나로 나간다 (앞의 것부터 되는 대로):
 *   ① 폰의 공유 창에 **그림 자체**를 얹는다 (`navigator.share({files})`) — 링크보다 강하다
 *   ② 서버에 올리고 그 그림을 얼굴로 쓰는 **공유 주소**를 복사 (`/kl/b/<그림>`)
 *   ③ 둘 다 막히면 글자만 복사 — 없는 기능을 있는 척하지 않는다
 */
import { t, loadNamespace } from './lib/i18n';

/* 위젯이 아니라 셸·라이브러리 — 아무도 말 묶음을 챙겨 주지 않으므로 스스로 받는다.
   빌드는 브라우저 밖에서도 읽으므로 document 가 있을 때만. */
if (typeof document !== 'undefined') void loadNamespace('bragcard');
const WIDTH = 1200;
const HEIGHT = 630;

export interface BragFacts {
    /** 오늘 끝낸 판 수 / 전체. */
    done: number;
    total: number;
    /** 연속일. 1일이면 안 적는다(첫날의 「1일 연속」은 축하가 아니다). */
    run: number;
}

/** 오늘 날짜 한 줄 (KST). 카드에 날짜가 없으면 언제 것인지 영영 모른다. */
function dayLabel(): string {
    const k = new Date(Date.now() + 9 * 3600e3);
    return `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}.`;
}

/**
 * 글꼴이 **오기 전에** 그리면 폴백 글꼴로 찍힌다 — 그림은 되돌릴 수 없으므로 기다린다.
 * 못 기다려도 그리기는 한다(글꼴만 다르다). 여기서 멈추면 자랑 자체가 사라진다.
 */
async function readyFonts(): Promise<void> {
    try {
        const fonts = (document as any).fonts;
        if (!fonts) return;
        await Promise.all([fonts.load('900 112px KarmoSerif'), fonts.load('700 32px KarmoSans'), fonts.ready]);
    } catch {
        /* 글꼴 없이 그린다 */
    }
}

export async function drawBragCard(facts: BragFacts): Promise<Blob | null> {
    await readyFonts();
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 바탕 + 왼쪽 띠
    ctx.fillStyle = '#f2f2ee';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const bar = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    bar.addColorStop(0, '#6d5bd0');
    bar.addColorStop(1, '#2aa9a0');
    ctx.fillStyle = bar;
    ctx.fillRect(0, 0, 78, HEIGHT);

    ctx.save();
    ctx.translate(39, HEIGHT - 40);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#f2f2ee';
    ctx.font = '700 20px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('KARMOLAB', 0, 7);
    ctx.restore();

    const left = 150;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // 머리말
    ctx.fillStyle = '#6d5bd0';
    ctx.font = '700 26px ui-monospace, Consolas, monospace';
    ctx.fillText(t('bragcard.t01'), left, 132);

    // 본문 — 큰 숫자가 주인공이다. 「5판 완주」가 한눈에 안 들어오면 자랑이 아니다.
    ctx.fillStyle = '#16151f';
    ctx.font = '900 116px KarmoSerif, Georgia, serif';
    ctx.fillText(t('bragcard.done', { n: facts.done }), left, 268);

    if (facts.run >= 2) {
        ctx.fillStyle = '#6d5bd0';
        ctx.font = '900 72px KarmoSerif, Georgia, serif';
        ctx.fillText(t('bragcard.run', { n: facts.run }), left, 372);
    }

    ctx.fillStyle = '#57546b';
    ctx.font = '400 30px KarmoSans, "Malgun Gothic", sans-serif';
    ctx.fillText(t('bragcard.line', { day: dayLabel(), n: facts.done }), left, facts.run >= 2 ? 442 : 356);

    // 발
    ctx.fillStyle = '#2aa9a0';
    ctx.beginPath();
    ctx.arc(left + 7, HEIGHT - 76, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16151f';
    ctx.font = '700 28px KarmoSans, "Malgun Gothic", sans-serif';
    ctx.fillText('KarmoLab · blog.mascari4615.com/karmolab', left + 28, HEIGHT - 67);

    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

/** 자랑 한 번 — 그림을 만들어 나갈 수 있는 가장 강한 길로 내보낸다. 화면에 쓸 말을 돌려준다. */
export async function shareBrag(facts: BragFacts): Promise<string> {
    const text =
        t('bragcard.share', { n: facts.done }) + (facts.run >= 2 ? ' · ' + t('bragcard.run', { n: facts.run }) : '');
    const blob = await drawBragCard(facts);
    const nav = navigator as any;

    // ① 그림 자체를 공유 (폰). 링크 미리보기를 기다릴 필요가 없다.
    if (blob && nav.share && nav.canShare) {
        try {
            const file = new File([blob], 'karmolab-today.png', { type: 'image/png' });
            if (nav.canShare({ files: [file] })) {
                await nav.share({ files: [file], text });
                return t('bragcard.t02');
            }
        } catch {
            /* 사람이 취소했거나 막혔다 — 아래로 내려간다 */
        }
    }

    // ② 올리고 공유 주소를 복사 — 그 주소가 이 그림을 얼굴로 쓴다.
    const base = (window as any).KarmoAccount?.apiBase;
    if (blob && base) {
        try {
            const data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
            });
            const response = await fetch(base + '/kl/uploads', {
                method: 'POST',
                credentials: 'include',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ data }),
            });
            if (response.ok) {
                const saved = await response.json();
                const link = `${base}/kl/b/${saved.id}?run=${facts.run}&done=${facts.done}`;
                await navigator.clipboard.writeText(`${text}\n${link}`);
                return t('bragcard.t03');
            }
        } catch {
            /* 로그인 안 했거나 서버가 없다 — 글자만이라도 내보낸다 */
        }
    }

    // ③ 글자만.
    try {
        await navigator.clipboard.writeText(`${text}\nhttps://blog.mascari4615.com/karmolab/play/`);
        return t('bragcard.t04');
    } catch {
        return t('bragcard.t05');
    }
}
