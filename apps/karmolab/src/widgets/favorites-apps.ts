/**
 * 즐겨찾기 앱. 설치된 프로그램 열기 (TASK-KL-330).
 *
 * **웹과 앱이 할 수 있는 일이 다르다.**
 * - 데스크톱(Tauri): 레지스트리를 읽어 *실제로* 설치된 것만 고르게 하고, 실행도 직접 한다.
 * - 브라우저: 설치 여부를 알 방법이 없다. 스킴 열거 API 가 지문채취 벡터라 전부 닫혔고
 *   `registerProtocolHandler` 에는 조회가 없다. 그래서 웹은 **아래 목록에서 골라 담는**
 *   선언형이다(자기 PC 는 자기가 안다). 미등록 스킴은 눌러도 조용히 아무 일이 없으므로,
 *   누른 뒤 창이 안 떴으면 `watchLaunch` 가 안 열렸어요를 알려 준다.
 *
 * 아이콘은 기존 즐겨찾기와 같은 Simple Icons CDN 을 쓴다.
 */
import { invoke, isDesktop } from '../tauri-bridge';

export type AppCatalogEntry = {
    /** URI 스킴 (`discord`). 웹에서 열 수 있는 유일한 통로다. */
    scheme: string;
    label: string;
    /** Simple Icons slug. 없으면 첫 글자 동그라미로 그린다. */
    icon?: string;
};

/**
 * 웹에서 고를 수 있는 앱. **스킴이 확실한 것만** 적는다. 여기 잘못 적으면 눌러도
 * 아무 일이 없는 칸이 생기고, 사용자는 자기 PC 를 의심하게 된다.
 * (데스크톱에서는 이 목록을 안 쓴다. 레지스트리에서 실물을 읽는다.)
 */
export const APP_CATALOG: AppCatalogEntry[] = [
    { scheme: 'discord', label: 'Discord', icon: 'discord' },
    { scheme: 'slack', label: 'Slack', icon: 'slack' },
    { scheme: 'vscode', label: 'VS Code', icon: 'visualstudiocode' },
    { scheme: 'steam', label: 'Steam', icon: 'steam' },
    { scheme: 'spotify', label: 'Spotify', icon: 'spotify' },
    { scheme: 'notion', label: 'Notion', icon: 'notion' },
    { scheme: 'obsidian', label: 'Obsidian', icon: 'obsidian' },
    { scheme: 'figma', label: 'Figma', icon: 'figma' },
    { scheme: 'zoommtg', label: 'Zoom', icon: 'zoom' },
    { scheme: 'unityhub', label: 'Unity Hub', icon: 'unity' },
    { scheme: 'github-windows', label: 'GitHub Desktop', icon: 'github' },
    { scheme: 'tg', label: 'Telegram', icon: 'telegram' },
    { scheme: 'kakaoopen', label: 'KakaoTalk', icon: 'kakaotalk' },
    { scheme: 'com.epicgames.launcher', label: 'Epic Games', icon: 'epicgames' },
    { scheme: 'itch', label: 'itch.io', icon: 'itchdotio' },
    { scheme: 'claude-cli', label: 'Claude Code', icon: 'anthropic' }
];

/** 첫 글자 동그라미. Simple Icons 에 없는 앱(레지스트리에서 주운 것들)용. */
export function letterIcon(label: string): string {
    const ch = (label.trim()[0] || '?').toUpperCase();
    return (
        'data:image/svg+xml,' +
        encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' +
                '<rect width="48" height="48" rx="12" fill="#3f3f46"/>' +
                '<text x="24" y="32" font-family="sans-serif" font-size="24" font-weight="600" ' +
                'text-anchor="middle" fill="#e4e4e7">' +
                ch.replace(/[<>&]/g, '') +
                '</text></svg>'
        )
    );
}

const bySchemeCache = new Map<string, AppCatalogEntry>(APP_CATALOG.map((a) => [a.scheme, a]));

/** 스킴으로 카탈로그 항목 찾기 (아이콘, 이름 예쁘게 만들 때). */
export function catalogOf(scheme: string | undefined): AppCatalogEntry | undefined {
    return scheme ? bySchemeCache.get(scheme.toLowerCase()) : undefined;
}

/** 앱 아이콘 URL. 카탈로그에 있으면 로고, 없으면 첫 글자. */
export function appIconUrl(scheme: string | undefined, label: string): string {
    const slug = catalogOf(scheme)?.icon;
    return slug ? `https://cdn.simpleicons.org/${slug}` : letterIcon(label);
}

export type LaunchSpec = { scheme?: string; exec?: string; args?: string[] };

/** 데스크톱이 레지스트리에서 읽어 온 실물 한 칸. */
export type InstalledApp = { scheme: string; label: string; exec: string };

/** 이 PC 에 등록된 앱 목록 (데스크톱 전용). 웹에서는 빈 배열. */
export async function listInstalled(): Promise<InstalledApp[]> {
    if (!isDesktop()) return [];
    try {
        return await invoke<InstalledApp[]>('app_list_installed');
    } catch (_) {
        return [];
    }
}

/**
 * 이 항목이 이 PC 에 있는가. **데스크톱만 답할 수 있다**. 웹에서는 항상 `null`(모름).
 * `false` 와 `null` 을 구분하는 것이 요점이다: 웹에서 회색 뱃지를 달면
 * 설치 안 됨이라는 *거짓말* 이 된다.
 */
export async function checkInstalled(spec: LaunchSpec): Promise<boolean | null> {
    if (!isDesktop()) return null;
    try {
        return await invoke<boolean>('app_check', { spec });
    } catch (_) {
        return null;
    }
}

/**
 * 앱 열기. 데스크톱은 Tauri 가 직접 실행하고, 웹은 스킴으로 넘긴다.
 * 웹에서 못 여는 경우(스킴 없음)는 던진다. 조용히 삼키면 눌러도 아무 일이 없다.
 */
export async function launchApp(spec: LaunchSpec): Promise<void> {
    if (isDesktop()) {
        await invoke<void>('app_launch', { spec });
        return;
    }
    if (!spec.scheme) throw new Error('web-no-scheme');
    const s = spec.scheme.includes(':') ? spec.scheme : `${spec.scheme}://`;
    // `location.href` 로 넘긴다. 새 창(`window.open`)은 열리든 안 열리든 빈 탭이 남는다.
    window.location.href = s;
}

/**
 * 웹에서 열렸나를 짐작한다. 확신은 못 한다. 브라우저가 안 알려 준다.
 *
 * 등록된 스킴이면 브라우저가 확인창을 띄우거나 앱으로 넘어가면서 이 창이 **흐려진다**.
 * 미등록이면 아무 일도 없어 계속 또렷하다. 그 차이만 본다. 오답이 있을 수 있으므로
 * 안 열렸다가 아니라 안 열렸으면 ... 하고 *물어보는* 말로만 쓴다.
 *
 * @returns 흐려졌으면 true (= 열린 것 같다)
 */
export function watchLaunch(ms = 1500): Promise<boolean> {
    if (isDesktop()) return Promise.resolve(true);
    return new Promise((resolve) => {
        let done = false;
        const finish = (opened: boolean): void => {
            if (done) return;
            done = true;
            window.removeEventListener('blur', onBlur);
            document.removeEventListener('visibilitychange', onHide);
            resolve(opened);
        };
        const onBlur = (): void => finish(true);
        const onHide = (): void => {
            if (document.hidden) finish(true);
        };
        window.addEventListener('blur', onBlur);
        document.addEventListener('visibilitychange', onHide);
        setTimeout(() => finish(false), ms);
    });
}
