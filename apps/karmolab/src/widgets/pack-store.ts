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
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    problems.push('첫 줄에 칸 이름, 그 아래에 항목을 한 줄씩 넣어 주세요.');
    return { fields: [], items: [], problems };
  }
  // 탭이 있으면 탭으로 나눈다(스프레드시트에서 긁으면 그렇다). 아니면 쉼표.
  const tabbed = lines[0].indexOf('\t') >= 0;
  const rows = lines.map((l) => (tabbed ? l.split('\t').map((c) => c.trim()) : splitCsv(l)));

  const head = rows[0];
  const body = rows.slice(1).filter((r) => r[0]);
  if (!body.length) problems.push('항목이 하나도 없습니다.');

  const fields: PackField[] = [];
  const imgAt = head.findIndex((h) => /^(그림|이미지|img|image)$/i.test(h));
  head.forEach((label, i) => {
    if (i === 0 || i === imgAt) return; // 첫 칸은 이름, 그림 칸은 칸이 아니다
    const vals = body.map((r) => (r[i] || '').trim()).filter(Boolean);
    if (!vals.length) return;
    const num = vals.map(numberish);
    const allNum = num.every((n) => n !== null);
    const anySet = vals.some((v) => v.indexOf(',') >= 0 || v.indexOf('·') >= 0);
    // 「1.2m」처럼 단위를 붙여 적는 게 사람의 기본값이다 — 단위는 떼어 칸의 것으로 삼는다.
    const unit = allNum ? (num.find((n) => n && n.unit)?.unit ?? '') : '';
    fields.push({
      key: 'f' + i,
      label: label || `칸 ${i}`,
      kind: allNum ? 'number' : anySet ? 'set' : 'category',
      ...(unit ? { unit } : {})
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
      if (f.kind === 'number') {
        const n = numberish(raw);
        if (n) it[f.key] = n.value;
      } else if (f.kind === 'set') {
        it[f.key] = raw.split(/[,·]/).map((x) => x.trim()).filter(Boolean);
      } else {
        it[f.key] = raw;
      }
    }
    items.push(it);
  }
  if (items.length < 4) problems.push('항목이 넷은 넘어야 놀이가 됩니다.');
  return { fields, items, problems };
}

/**
 * 쉼표로 나누되 **따옴표 안의 쉼표는 값의 일부**다.
 * 엑셀·구글 시트에서 CSV 로 내보내면 「"개, 큰개"」 처럼 나오는데, 그냥 쉼표로 자르면
 * 값이 한 칸씩 밀리고 이름에 따옴표가 남는다(실측: 이름이 「"멍멍이"」 로 저장됐다).
 */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'; // 값 안의 따옴표는 두 번 적는 것이 규약이다
          i++;
        } else inQ = false;
      } else cur += c;
      continue;
    }
    if (c === '"') inQ = true;
    else if (c === ',') {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/**
 * 「3」·「1.2m」·「5 kg」·「12개」를 숫자로 읽는다. 숫자가 아니면 null.
 * 사람은 단위를 붙여 적는다 — 그걸 글자로 취급하면 「높은 쪽 고르기」에서 그 칸이 통째로 빠진다.
 */
function numberish(v: string): { value: number; unit: string } | null {
  const m = /^(-?\d+(?:[.,]\d+)?)\s*([^\d\s].*)?$/.exec(v.trim());
  if (!m) return null;
  const value = Number(m[1].replace(',', '.'));
  if (!isFinite(value)) return null;
  return { value, unit: (m[2] || '').trim() };
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
