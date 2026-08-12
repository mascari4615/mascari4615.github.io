/**
 * 선반(foundry) 말 붙이기 — 만든 것을 올리고, 남이 쓴 것을 본다 (TASK-KL-254)
 *
 * 도구는 「어디에 담기나」를 몰라야 한다. 지금은 노트북이 받지만 나중에 다른 데로 옮겨도
 * 도구 쪽 코드는 이 파일만 보면 되게 가둔다(서버 쪽도 같은 이유로 드라이버 뒤에 있다).
 *
 * ★ 올리기에는 열쇠가 든다. 브라우저에 열쇠를 박아 둘 수는 없으므로 **쓰는 사람이 자기 것을
 *   넣어 둔다**(이 브라우저에만 남는다). 열쇠가 없으면 올리기 단추를 아예 안 보여 준다 —
 *   눌렀다가 「권한 없음」을 보는 것보다 낫다. 보는 것은 누구나 되므로 열쇠가 없어도 열린다.
 */

const TOKEN_KEY = 'karmolab_foundry_token';
const BASE_KEY = 'karmolab_foundry_base';
const DEFAULT_BASE = 'https://laptop.mascari4615.com';

export interface FoundryItem {
  id: string;
  tool: string;
  title: string;
  mime: string;
  bytes: number;
  recipe?: Record<string, unknown>;
  license: string;
  createdAt: number;
  url: string;
}

export const foundryBase = (): string => {
  try {
    return localStorage.getItem(BASE_KEY) || DEFAULT_BASE;
  } catch {
    return DEFAULT_BASE;   // 사생활 보호 모드 등 — 저장소가 막혀도 보는 것은 되어야 한다
  }
};

export const foundryToken = (): string => {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
};

export const setFoundryToken = (token: string): void => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 저장 못 해도 이번 판은 돈다 */
  }
};

export const canUpload = (): boolean => foundryToken().length > 0;

/** 바이트 → base64. 큰 것도 한 번에 넘기면 브라우저가 멈추므로 잘라서 붙인다. */
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    out += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(out);
}

export interface UploadInput {
  tool: string;
  title: string;
  mime: string;
  bytes: Uint8Array;
  /** 다시 열 수 있게 하는 설정 — 이게 있어야 남이 「이대로 열기」를 누를 수 있다. */
  recipe?: Record<string, unknown>;
}

export async function uploadToFoundry(input: UploadInput): Promise<FoundryItem> {
  const token = foundryToken();
  if (!token) throw new Error('선반 열쇠가 없다 — 설정에서 넣어라');
  const response = await fetch(`${foundryBase()}/foundry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      tool: input.tool,
      title: input.title,
      mime: input.mime,
      data: toBase64(input.bytes),
      recipe: input.recipe
    })
  });
  const body = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; item?: FoundryItem };
  if (!response.ok || !body.ok || !body.item) {
    // 서버가 적어 준 이유를 그대로 올린다 — 「실패」만 보이면 고칠 수가 없다.
    throw new Error(body.error || `선반이 안 받았다 (${response.status})`);
  }
  return { ...body.item, url: `${foundryBase()}${body.item.url ?? '/foundry/' + body.item.id}` };
}

export async function listFoundry(query: { tool?: string; limit?: number } = {}): Promise<{
  items: FoundryItem[]; total: number; tools: Record<string, number>;
}> {
  const params = new URLSearchParams();
  if (query.tool) params.set('tool', query.tool);
  if (query.limit) params.set('limit', String(query.limit));
  const suffix = params.toString() ? `?${params}` : '';
  const response = await fetch(`${foundryBase()}/foundry${suffix}`);
  if (!response.ok) throw new Error(`선반을 못 읽었다 (${response.status})`);
  const body = await response.json() as { items?: FoundryItem[]; total?: number; tools?: Record<string, number> };
  const base = foundryBase();
  return {
    items: (body.items ?? []).map((item) => ({ ...item, url: base + (item.url ?? '/foundry/' + item.id) })),
    total: body.total ?? 0,
    tools: body.tools ?? {}
  };
}
