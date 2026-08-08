/**
 * 말로 부리기 — 고르는 쪽 (TASK-KL-196 E).
 *
 * 팔레트에서 **누를 때만** 온다. 이름으로 못 찾은 자리에서 「하려는 일」을 서버에 보내면
 * 서버가 도구를 하나 고른다(목록 정본 = 사이트, 고르는 것 = 서버의 AI).
 *
 * 왜 팔레트 묶음에 안 넣었나: 첫 화면 부팅 JS 가 이미 천장(40KB gz)에 닿아 있다.
 * 눌러 본 사람만 받으면 되는 것을 모두가 받을 이유가 없다.
 *
 * 못 하면 못 한다고 말한다 — 자격이 없거나 못 고르면 그렇게 적는다. 억지로 아무 도구나
 * 내밀면 다음부터 이 자리는 아무도 안 누른다.
 */
interface AskArgs {
    host: HTMLElement;
    q: string;
    close: () => void;
    byId: (id: string) => { title: string } | undefined;
    esc: (s: string) => string;
    /** 화면을 옮기는 손잡이는 **넘겨받는다** — `window.Toolbox` 는 없다(셸의 지역 이름이다).
        전역으로 짐작하고 불렀다가 누른 순간 죽었다(검사가 잡았다). */
    go: (id: string) => void;
}

/** 이미 고른 물음 — 같은 물음을 두 번 묻지 않는다(서버도 안 두들긴다). */
const answered = new Map<string, string>();

async function run(args: AskArgs): Promise<void> {
    const { host, q, close, byId, esc } = args;
    const base = (window as any).KarmoAccount?.apiBase;
    const button = host.querySelector<HTMLButtonElement>('.kp-ask');
    let picked: { toolId: string; why?: string } | null = null;
    let line = '';
    try {
        const response = await fetch(base + '/kl/route', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ q })
        });
        const data = await response.json();
        if (data && data.ready && data.pick) picked = data.pick;
        else if (data && data.ready) line = '알맞은 도구를 못 찾았어요.';
        else line = '지금은 말로 찾기를 못 해요.';
    } catch {
        line = '지금은 말로 찾기를 못 해요.';
    }
    if (!host.isConnected) return;
    if (button) button.remove();

    if (picked) {
        answered.set(q, picked.toolId);
        const entry = byId(picked.toolId);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'kp-ask-hit';
        row.innerHTML =
            '<b>' + esc(entry ? entry.title : picked.toolId) + '</b>' +
            (picked.why ? '<span>' + esc(picked.why) + '</span>' : '');
        row.addEventListener('click', () => {
            close();
            args.go(picked!.toolId);
        });
        host.insertBefore(row, host.querySelector('.kp-empty-link'));
        return;
    }

    const note = document.createElement('p');
    note.className = 'kp-ask-none';
    note.textContent = line;
    host.insertBefore(note, host.querySelector('.kp-empty-link'));
}

(window as any).KarmoAsk = { run, known: (q: string): string | undefined => answered.get(q) };
