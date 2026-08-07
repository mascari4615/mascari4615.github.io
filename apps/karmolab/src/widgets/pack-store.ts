/**
 * 내 표 (TASK-KL-089) — 놀이의 재료를 사람이 만든다.
 *
 * 지금까지 놀이의 세계는 셋뿐이었다(포켓몬·롤·원신). 재미의 뿌리는 놀이 방식이 아니라
 * **표**인데 그 표를 우리만 만들 수 있었다 — 좋아하는 것이 그 셋이 아니면 할 게 없다.
 * 표를 사람이 만들 수 있게 하면 놀이 수가 그대로 곱해진다.
 *
 * 표의 모양은 **이미 쓰는 것과 같다**(`/daily/data/*.json`): 칸 정의 + 항목들.
 * 그래야 우리 표와 남의 표를 놀이가 구분 없이 먹는다 — 새 모양을 만들면 그날부터 갈라진다.
 *
 * 어디에 사나: 이 브라우저(localStorage). 서버가 없으니 남에게 줄 때는 **주소에 담아** 준다
 * (유령 타자 대결이 먼저 쓴 방식이다 — 만료가 없는 게 서버 없음의 강점이다).
 */
export interface PackField {
  key: string;
  label: string;
  kind: 'number' | 'set' | 'category';
  unit?: string;
}
export interface PackItem {
  name: string;
  img?: string;
  [k: string]: string | string[] | number | undefined;
}
export interface Pack {
  id: string;
  title: string;
  emoji: string;
  fields: PackField[];
  items: PackItem[];
}

const KEY = 'karmolab_packs';

export function loadPacks(): Pack[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function savePacks(list: Pack[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false; // 사생활 모드거나 자리가 없다 — 부르는 쪽이 말해 준다
  }
}

export function putPack(p: Pack): boolean {
  const list = loadPacks();
  const i = list.findIndex((x) => x.id === p.id);
  if (i >= 0) list[i] = p;
  else list.push(p);
  return savePacks(list);
}

export function dropPack(id: string): void {
  savePacks(loadPacks().filter((p) => p.id !== id));
}

export function getPack(id: string): Pack | null {
  return loadPacks().filter((p) => p.id === id)[0] || null;
}

/**
 * 붙여넣기 한 판으로 표를 만든다.
 *
 * 사람은 이미 표를 갖고 있다 — 스프레드시트에. 거기서 긁어 오면 탭으로 나뉜 글이 되고,
 * 그게 이 놀이의 가장 짧은 입구다. 첫 줄은 칸 이름, 첫 칸은 이름, `그림` 칸이 있으면 그림.
 * 칸의 종류는 값을 보고 정한다 — 숫자만 있으면 숫자, 쉼표가 있으면 여럿, 나머지는 하나.
 */
export function parseTable(text: string): { fields: PackField[]; items: PackItem[]; problems: string[] } {
  const problems: string[] = [];
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.indexOf('\t') >= 0 ? l.split('\t') : l.split(',')).map((c) => c.trim()));
  if (rows.length < 2) {
    problems.push('첫 줄에 칸 이름, 그 아래에 항목을 한 줄씩 넣어 주세요.');
    return { fields: [], items: [], problems };
  }
  const head = rows[0];
  const body = rows.slice(1).filter((r) => r[0]);
  if (!body.length) problems.push('항목이 하나도 없습니다.');

  const fields: PackField[] = [];
  const imgAt = head.findIndex((h) => /^(그림|이미지|img|image)$/i.test(h));
  head.forEach((label, i) => {
    if (i === 0 || i === imgAt) return; // 첫 칸은 이름, 그림 칸은 칸이 아니다
    const vals = body.map((r) => (r[i] || '').trim()).filter(Boolean);
    if (!vals.length) return;
    const allNum = vals.every((v) => v !== '' && !isNaN(Number(v)));
    const anySet = vals.some((v) => v.indexOf(',') >= 0 || v.indexOf('·') >= 0);
    fields.push({
      key: 'f' + i,
      label: label || `칸 ${i}`,
      kind: allNum ? 'number' : anySet ? 'set' : 'category'
    });
  });
  if (!fields.length) problems.push('이름 말고 견줄 칸이 하나는 있어야 합니다 (예: 종류·나이·키).');

  const seen = new Set<string>();
  const items: PackItem[] = [];
  for (const r of body) {
    const name = (r[0] || '').trim();
    if (!name || seen.has(name)) continue; // 같은 이름 둘은 놀이가 못 가른다
    seen.add(name);
    const it: PackItem = { name };
    if (imgAt >= 0 && r[imgAt]) it.img = r[imgAt].trim();
    for (const f of fields) {
      const i = Number(f.key.slice(1));
      const raw = (r[i] || '').trim();
      if (!raw) continue;
      it[f.key] = f.kind === 'number' ? Number(raw) : f.kind === 'set' ? raw.split(/[,·]/).map((s) => s.trim()).filter(Boolean) : raw;
    }
    items.push(it);
  }
  if (items.length < 4) problems.push('항목이 넷은 넘어야 놀이가 됩니다.');
  return { fields, items, problems };
}

/* ── 남에게 주기 ────────────────────────────────
 * 서버가 없으니 표 자체를 주소에 싣는다. 유니코드를 그대로 base64 에 넣을 수 없어서
 * 한 번 바이트로 편 뒤에 담는다(이걸 안 하면 한글 표가 통째로 깨진다). */
export function packToCode(p: Pack): string {
  const json = JSON.stringify({ t: p.title, e: p.emoji, f: p.fields, i: p.items });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function codeToPack(code: string): Pack | null {
  try {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const j = JSON.parse(new TextDecoder().decode(bytes));
    if (!j || !Array.isArray(j.i) || !Array.isArray(j.f)) return null;
    return { id: 'p' + Date.now().toString(36), title: String(j.t || '받은 표'), emoji: String(j.e || '🎲'), fields: j.f, items: j.i };
  } catch {
    return null;
  }
}
