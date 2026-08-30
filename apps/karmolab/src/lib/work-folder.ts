/**
 * 작업 폴더. 소스를 받아 둔 곳. **이 값의 정본은 여기 하나다** (TASK-KL-332).
 *
 * 무엇에 쓰나: 부품 굽기(설치), 개발 서버 띄우기(서버 모니터), 저장소 안 파일 읽기.
 * 전부 이 컴퓨터의 어디에 소스가 있나를 알아야 도는 일이다.
 *
 * 왜 한 곳으로 모았나: 여태 이 값은 **서버 모니터 위젯 안에만** 살았다. 그래서 설치
 * 위젯에서 설치를 누르면 저장소 루트를 먼저 설정하세요가 떴다. 무엇을 어디서
 * 해야 하는지는 안 적힌 채로(조수님 실측 2026-08-19). 값 하나를 두 화면이 각자 들고
 * 있으면 반드시 한쪽이 모르는 상태가 된다.
 *
 * Rust 쪽(`localdev_*`)은 이 값을 **메모리에만** 들고 있어서 앱을 끄면 잊는다. 그래서
 * 오래 남는 자리는 이쪽(pref)이고, 쓰기 전에 늘 Rust 로 밀어 넣는다.
 */
import { isDesktop, invoke } from '../tauri-bridge';

/** 옛 이름 그대로 둔다. 이름을 바꾸면 이미 넣어 둔 사람의 값이 사라진다. */
export const WORK_FOLDER_PREF = 'karmolab_repo_root';

/** 이 폴더가 맞는지 가리는 표. 저장소 안에 반드시 있는 파일. */
const MARKER = 'apps/karmolab/package.json';

/** 사람이 적어 둔 값 (없으면 빈 글). */
export function savedWorkFolder(): string {
    return (Toolbox.getPref?.(WORK_FOLDER_PREF, '') ?? '').trim();
}

/**
 * 지금 쓸 수 있는 작업 폴더. 없으면 `null`.
 *
 * ① Rust 가 이미 들고 있으면 그것 ② 없으면 적어 둔 값을 밀어 넣고 그것 ③ 둘 다 없으면 null.
 */
export async function currentWorkFolder(): Promise<string | null> {
    if (!isDesktop()) return null;
    try {
        const now = (await invoke('localdev_get_repo_root')) as string | null;
        if (now) return now;
    } catch {
        return null;
    }
    const saved = savedWorkFolder();
    if (!saved) return null;
    try {
        await invoke('localdev_set_repo_root', { path: saved });
        return ((await invoke('localdev_get_repo_root')) as string | null) ?? null;
    } catch {
        return null;
    }
}

/**
 * 작업 폴더를 정한다. 맞는 폴더가 아니면 **정하지 않고** 왜인지 돌려준다.
 *
 * 눌러 보고 알게 되는 실패를 없애는 자리다. 틀린 경로를 넣으면 그 자리에서 말한다.
 */
export async function setWorkFolder(path: string): Promise<{ ok: true; path: string } | { ok: false; why: string }> {
    const p = path.trim();
    if (!p) return { ok: false, why: '경로가 비어 있다' };
    if (!isDesktop()) return { ok: false, why: '데스크톱 앱에서만 정할 수 있다' };
    try {
        await invoke('localdev_set_repo_root', { path: p });
    } catch (e) {
        return { ok: false, why: e instanceof Error ? e.message : String(e) };
    }
    /* 폴더가 있다와 그 소스가 맞다는 다르다. 표가 되는 파일을 실제로 읽어 본다 . 
       한 칸 위를 골랐거나 딴 저장소를 골랐으면 여기서 걸린다. */
    try {
        await invoke('repofile_read', { relPath: MARKER });
    } catch {
        return { ok: false, why: `그 안에 ${MARKER} 이 없다. 소스를 받아 둔 폴더가 맞나` };
    }
    Toolbox.setPref?.(WORK_FOLDER_PREF, p);
    return { ok: true, path: p };
}

/**
 * 기계가 짐작한 작업 폴더. 못 짐작하면 `null`.
 *
 * 대개 기계가 알 수 있는 값이다. 개발 판이면 실행 파일이 저장소 안에 있고, 깔아 쓰는
 * 판이면 집 폴더 아래 흔한 자리에 있다. 그걸 사람에게 물어보는 것은 물어볼 필요 없는
 * 것을 묻는 일이다.
 *
 * **채우기만 한다.** 정하는 것은 사람이 누른다. 짐작이 틀렸는데 조용히 정해 버리면
 * 엉뚱한 폴더에서 굽는다.
 */
export async function guessWorkFolder(): Promise<string | null> {
    if (!isDesktop()) return null;
    try {
        return ((await invoke('localdev_guess_repo_root')) as string | null) ?? null;
    } catch {
        // 옛 판 앱에는 이 커맨드가 없다. 없다고 화면이 죽을 이유는 아니다.
        return null;
    }
}

/**
 * 폴더 고르기 창. 못 열면 `null`. 그때는 사람이 손으로 적는다.
 *
 * 경로를 손으로 치는 것은 오타가 나기 쉽고, 오타는 눌렀는데 안 된다로만 보인다.
 */
export async function pickWorkFolder(): Promise<string | null> {
    try {
        const dialog = (globalThis as unknown as { __TAURI__?: { dialog?: { open?: (o: unknown) => Promise<unknown> } } })
            .__TAURI__?.dialog?.open;
        if (!dialog) return null;
        const got = await dialog({ directory: true, multiple: false, title: '작업 폴더 고르기' });
        return typeof got === 'string' ? got : null;
    } catch {
        return null;
    }
}
