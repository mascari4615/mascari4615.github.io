/**
 * 숨긴 것 (TASK-KL-196 D) — 「이거 어떻게 찾았어?」가 성립하는 자리.
 *
 * 왜 있나: 사이트가 **눌러야만 반응한다**. 누르라고 만든 것 말고는 아무 일도 안 일어나니
 * 둘러볼 이유가 없다. 숨긴 것은 「여기 아직 내가 모르는 게 있다」를 만든다 — 도구 160개를
 * 다 쓴 사람에게도 남는 것이 생긴다.
 *
 * 규칙 셋 (이걸 깨면 숨긴 것이 아니라 성가신 것이 된다):
 *  1. **평소 쓰는 길을 안 막는다.** 어떤 비밀도 도구·놀이·글쓰기 도중에 끼어들지 않는다.
 *     (입력칸에 글을 치는 중이면 코나미 코드도 안 센다.)
 *  2. **찾으면 곧바로 말해 준다.** 조용히 켜 두면 찾은 줄도 모른다.
 *  3. **못 찾은 것도 개수는 보여 준다.** 몇 개가 남았는지 모르면 찾을 마음이 안 든다.
 *     다만 **무엇인지는 안 알려 준다** — 이름을 다 적어 두면 그건 숨긴 것이 아니라 목록이다.
 *
 * 저장: 이 브라우저(`karmolab_secrets`) + 로그인했으면 계정에도(`/kl/me/secrets`).
 * 도감과 같은 성질이다 — 로그인해야 생기는 것이 아니라, 로그인하면 따라온다.
 */
import { t, loadNamespace } from './lib/i18n';

/* 이 파일은 위젯이 아니라 **셸·라이브러리**다 — 아무도 말 묶음을 챙겨 주지 않으므로 스스로 받는다.
   빌드는 브라우저 밖에서도 이 파일을 읽으므로 document 가 있을 때만 부른다. */
if (typeof document !== 'undefined') void loadNamespace('secrets');
export interface SecretDef {
    id: string;
    /** 찾은 뒤 보이는 이름. 못 찾았으면 이 이름도 안 보인다. */
    title: string;
    /** 찾은 뒤 보이는 한 줄 — 「어떻게 찾는 것이었나」. */
    how: string;
}

/**
 * 숨긴 것 목록 — **여기 한 벌만** 있다. 화면(비밀 도감)도 이 표를 읽는다.
 * 개수를 두 곳에 적으면 「5개 중 3개」가 그날부터 거짓이 된다.
 */
export const SECRETS: SecretDef[] = [
    { id: 'konami', title: t('secrets.t01', undefined, '코나미'), how: '↑↑↓↓←→←→ B A' },
    { id: 'logo', title: t('secrets.t02', undefined, '로고를 계속 누름'), how: t('secrets.t03', undefined, '머리띠의 KarmoLab 을 일곱 번') },
    { id: 'console', title: t('secrets.t04', undefined, '콘솔 인사'), how: t('secrets.t05', undefined, '개발자 도구를 열고 karmo() 를 침') },
    { id: 'collector', title: t('secrets.t06', undefined, '수집가'), how: t('secrets.t07', undefined, '도감 스무 칸') },
    { id: 'owl', title: t('secrets.t08', undefined, '새벽 세 시'), how: t('secrets.t09', undefined, '새벽 3~5시에 다녀감') }
];

const KEY = 'karmolab_secrets';

/** 이 브라우저가 찾은 것. */
export function foundLocal(): string[] {
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : [];
    } catch {
        return [];
    }
}

function saveLocal(ids: string[]): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(ids));
    } catch {
        /* 사생활 모드 — 찾은 것은 이 화면에서만 산다 */
    }
}

/** 계정에도 남긴다. 로그인 안 했거나 서버가 없으면 아무 일도 안 일어난다. */
function push(id: string): void {
    const base = (window as any).KarmoAccount?.apiBase;
    if (!base) return;
    void fetch(base + '/kl/me/secrets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id })
    }).catch(() => {
        /* 못 남겨도 이 브라우저에는 남아 있다 */
    });
}

/**
 * 하나 찾았다. 이미 찾은 것이면 **아무 일도 안 일어난다** — 같은 축하가 두 번 뜨면
 * 그건 축하가 아니라 알림이다.
 */
export function findSecret(id: string): boolean {
    const def = SECRETS.find((secret) => secret.id === id);
    if (!def) return false;
    const found = foundLocal();
    if (found.indexOf(id) >= 0) return false;
    found.push(id);
    saveLocal(found);
    push(id);
    const left = SECRETS.length - found.length;
    (window as any).Toolbox?.showToast?.(
        `숨긴 것을 찾았다 — ${def.title}` + (left > 0 ? ` (${left}개 남음)` : t('secrets.t10'))
    );
    return true;
}

/* ── 찾는 길 ────────────────────────────────────────────────────────────── */

/** 글을 치는 중인가. 도구를 쓰는 손 위에 비밀이 끼어들면 안 된다. */
function typing(): boolean {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function watchKonami(): void {
    const CODE = [
        'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
        'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
        'b', 'a'
    ];
    let at = 0;
    window.addEventListener('keydown', (event) => {
        if (typing()) return;
        const want = CODE[at];
        const got = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        // 틀리면 처음으로. 단, **첫 글자와 같으면 거기서 다시 센다** — 안 그러면
        // ↑↑↑↓↓… 처럼 한 번 더 누른 사람이 영영 못 넣는다.
        at = got === want ? at + 1 : got === CODE[0] ? 1 : 0;
        if (at === CODE.length) {
            at = 0;
            findSecret('konami');
        }
    });
}

function watchLogo(): void {
    const logo = document.querySelector('.header-logo-text') || document.querySelector('.header-logo');
    if (!logo) return;
    let hits = 0;
    let last = 0;
    logo.addEventListener('click', () => {
        const now = Date.now();
        // 이어서 눌러야 한다 — 하루에 걸쳐 일곱 번 누른 것은 「계속 누른 것」이 아니다.
        hits = now - last < 900 ? hits + 1 : 1;
        last = now;
        if (hits >= 7) {
            hits = 0;
            findSecret('logo');
        }
    });
}

function installConsoleHello(): void {
    /* 콘솔을 여는 사람에게만 보이는 인사. 여는 순간을 알 방법은 없으므로(그걸 알아내는
       수법들은 전부 브라우저를 속이는 짓이다) **한 번 찍어 두고** 부르면 답한다. */
    try {
        console.log(
            t('secrets.t11'),
            'font-weight:700;color:#a99bf5',
            'color:inherit',
            'font-family:monospace;color:#2aa9a0',
            'color:inherit'
        );
    } catch {
        /* 콘솔이 없는 환경 */
    }
    (window as any).karmo = function karmo(): string {
        findSecret('console');
        const found = foundLocal().length;
        return t('secrets.found', { n: found, total: SECRETS.length });
    };
}

function checkCollector(): void {
    try {
        const stamps = JSON.parse(localStorage.getItem('karmolab_stamps') || '{}');
        if (Object.keys(stamps).length >= 20) findSecret('collector');
    } catch {
        /* 도장이 없으면 아직 아니다 */
    }
}

function checkOwl(): void {
    // KST 기준. 브라우저 시간대를 그대로 쓰면 다른 나라 사람에게는 다른 시각이 된다.
    const hour = new Date(Date.now() + 9 * 3600e3).getUTCHours();
    if (hour >= 3 && hour < 5) findSecret('owl');
}

/**
 * 계정이 찾아 둔 것을 이 브라우저로 가져온다 — 폰에서 찾은 것이 PC 도감에도 보이게.
 * 못 닿으면 아무 일도 안 일어난다(이 브라우저 것만 보인다).
 */
export async function syncSecrets(): Promise<string[]> {
    const base = (window as any).KarmoAccount?.apiBase;
    if (!base) return foundLocal();
    try {
        const response = await fetch(base + '/kl/me/secrets', { credentials: 'include' });
        if (!response.ok) return foundLocal();
        const data = await response.json();
        const server: string[] = Array.isArray(data.found) ? data.found : [];
        const merged = foundLocal();
        let grew = false;
        for (const id of server) {
            if (SECRETS.some((secret) => secret.id === id) && merged.indexOf(id) < 0) {
                merged.push(id);
                grew = true;
            }
        }
        /* 여기서는 축하하지 않는다 — 예전에 찾은 것을 다른 기기에서 처음 불러온 것뿐이다.
           그 자리에서 찾은 것처럼 알리면 축하가 값싸진다. */
        if (grew) saveLocal(merged);
        return merged;
    } catch {
        return foundLocal();
    }
}

let installed = false;

export function installSecrets(): void {
    if (installed) return;
    installed = true;
    watchKonami();
    watchLogo();
    installConsoleHello();
    checkCollector();
    checkOwl();
}

(window as any).KarmoSecrets = { install: installSecrets, found: foundLocal, all: SECRETS, find: findSecret, sync: syncSecrets };
