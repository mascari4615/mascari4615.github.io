/**
 * 붙여넣은 것이 **무엇인지 알아본다** (TASK-KL-263)
 *
 * JSON Crack 은 붙여넣기만 하면 JSON, CSV, YAML, XML 을 알아서 가른다. JSON Hero 는 값 하나까지
 * 보고 이건 URL, 날짜, 색, base64 그림이라고 말해 준다. 우리 데이터 도구는 열둘인데,
 * 사람은 **자기가 든 것이 뭔지 이미 안다**. 열둘을 다 읽게 할 이유가 없다.
 *
 * 그래서 붙여넣은 순간 갈래를 짚고, 그 갈래에 맞는 할 일을 앞에 띄운다. **짚는 것뿐**이라
 * 틀려도 나머지가 그대로 눌린다. 잘못 짚어서 못 하게 되는 일이 없어야 한다.
 *
 * 순서가 곧 규칙이다: **좁은 것부터** 본다. JWT 는 base64 이기도 하고 base64 는 그냥 글자이기도
 * 해서, 넓은 것을 먼저 물으면 좁은 것이 영영 안 잡힌다.
 */

export type DataKind =
  | 'json'
  | 'jwt'
  | 'base64'
  | 'url'
  | 'csv'
  | 'hex'
  | 'epoch'
  | 'uuid'
  | 'cron'
  | 'text';

export interface Sniffed {
  kind: DataKind;
  /** 사람에게 보일 한 마디. JSON 이네요, 키 12개 */
  why: string;
  /** 곁들일 셈 (키 개수, 줄 수 등) */
  detail?: string;
}

const B64 = /^[A-Za-z0-9+/\-_]+={0,2}$/;

export function sniff(raw: string): Sniffed {
  const v = raw.trim();
  if (!v) return { kind: 'text', why: '' };

  /* ① JSON. 괄호로 시작하면 물어본다. 보이는 것이 아니라 **파서가 판정한다** */
  if (/^[[{]/.test(v)) {
    try {
      const parsed = JSON.parse(v) as unknown;
      const n = Array.isArray(parsed)
        ? parsed.length
        : parsed && typeof parsed === 'object'
          ? Object.keys(parsed as object).length
          : 0;
      return {
        kind: 'json',
        why: 'JSON',
        detail: Array.isArray(parsed) ? `${n}칸` : `키 ${n}개`
      };
    } catch {
      /* 깨진 JSON 도 JSON 이다. 오히려 보기 좋게 가 가장 필요한 순간이다 */
      return { kind: 'json', why: 'JSON (깨진 데가 있습니다)' };
    }
  }

  /* ② JWT. 점 두 개로 갈린 세 토막, 앞머리가 열리면 확실하다 */
  const parts = v.split('.');
  if (parts.length === 3 && parts.every((p) => p && B64.test(p))) {
    try {
      const head = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/'))) as { alg?: string };
      if (head && typeof head === 'object') return { kind: 'jwt', why: 'JWT', detail: head.alg || '' };
    } catch {
      /* 세 토막이지만 안 열린다. JWT 가 아니다 */
    }
  }

  /* ③ URL */
  if (/^https?:\/\/\S+$/i.test(v)) {
    try {
      const u = new URL(v);
      const q = [...u.searchParams.keys()].length;
      return { kind: 'url', why: 'URL', detail: q ? `물음표 뒤 ${q}개` : u.hostname };
    } catch {
      /* 주소처럼 보였을 뿐 */
    }
  }

  /* ④ UUID, ⑤ 시각(초/밀리초). 짧고 확실한 것들 */
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    return { kind: 'uuid', why: 'UUID' };
  }
  if (/^\d{10}$|^\d{13}$/.test(v)) {
    const ms = v.length === 13 ? Number(v) : Number(v) * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime()) && d.getUTCFullYear() > 1990 && d.getUTCFullYear() < 2200) {
      return { kind: 'epoch', why: '시각(숫자)', detail: d.toISOString().slice(0, 10) };
    }
  }

  /* ⑥ 크론. 다섯(또는 여섯) 토막인데 별, 숫자, 슬래시만 있다 */
  const f = v.split(/\s+/);
  if ((f.length === 5 || f.length === 6) && f.every((x) => /^[\d*/,\-?LW#]+$/.test(x))) {
    return { kind: 'cron', why: '크론 식' };
  }

  /* ⑦ CSV. 줄이 여럿이고 **칸 수가 고르다**. 쉼표만 보면 그냥 글도 걸린다 */
  const lines = v.split(/\r?\n/).filter((x) => x.trim());
  if (lines.length >= 2) {
    for (const sep of [',', '\t', ';']) {
      const counts = lines.slice(0, 8).map((l) => l.split(sep).length);
      if (counts[0] >= 2 && counts.every((c) => c === counts[0])) {
        return {
          kind: 'csv',
          why: sep === '\t' ? '탭으로 나뉜 표' : '표(CSV)',
          detail: `${counts[0]}칸, ${lines.length}줄`
        };
      }
    }
  }

  /* ⑧ 16진수 덩어리. 해시일 때가 많다 */
  if (/^[0-9a-f]{32}$|^[0-9a-f]{40}$|^[0-9a-f]{64}$/i.test(v)) {
    const bits = { 32: 'MD5', 40: 'SHA-1', 64: 'SHA-256' }[v.length as 32 | 40 | 64];
    return { kind: 'hex', why: '해시 값', detail: bits };
  }

  /* ⑨ base64. 가장 넓다. 그래서 **맨 끝**이다 */
  if (v.length >= 16 && v.length % 4 === 0 && B64.test(v)) {
    return { kind: 'base64', why: 'Base64' };
  }

  return { kind: 'text', why: '' };
}
