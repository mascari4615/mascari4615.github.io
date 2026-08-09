/**
 * 주소로 도구를 부른다 (S1 — 흡수계획 06 P1)
 *
 * 왜 있나: 도구 129장이 전부 「열어서 손으로 넣어야」만 쓸 수 있었다. 계산해 놓고 남에게
 * 보내려면 결과를 복사해 붙이는 수밖에 없었고, 「이 값으로 다시 열어 봐」가 불가능했다.
 * 주소에 실으면 세 가지가 한꺼번에 열린다:
 *   ① 사람 — 계산 상태를 **링크로 공유**
 *   ② 도구끼리 — 앞 도구 결과를 뒤 도구 주소로 넘김 (작업대의 전송 형식)
 *   ③ AI — 에이전트가 링크만으로 우리 도구를 씀
 *
 * 규약:
 *   /karmolab/t/<id>/?op=<연산>&<칸이름>=<값>
 * 칸 이름은 `core/<id>.ts` 의 `spec.ops[op].in` 열쇠를 **그대로** 쓴다. 여기에 따로 적지 않는다.
 *
 * 조용히 틀리지 않게: `op` 가 없으면 `null`(그냥 평소대로 열림), `op` 가 있는데 잘못됐으면
 * `error` 를 담아 돌려준다 — 위젯이 상태줄에 그대로 보여 주면 된다. 말없이 무시하지 않는다.
 */
import { baseType, isOptional, type FieldType, type ToolSpec } from '../core/types';

export type ArgValue = string | number | boolean;

export interface Invocation {
  op: string;
  args: Record<string, ArgValue>;
  /** `&out=raw` — 결과만 보고 싶다는 표시. 화면을 간소하게 그릴 때 쓴다. */
  raw: boolean;
  /** 뭔가 잘못됐으면 사람이 읽을 수 있는 한 줄. 성공이면 없다. */
  error?: string;
}

function coerce(name: string, type: FieldType, rawValue: string): ArgValue {
  switch (baseType(type)) {
    case 'number': {
      const n = Number(rawValue);
      if (Number.isNaN(n)) throw new Error(`${name} 은 숫자여야 하는데 「${rawValue}」 가 왔습니다`);
      return n;
    }
    case 'boolean':
      // 주소에 `&urlSafe` 만 적은 경우(값 없음)도 「켬」으로 본다 — 손으로 링크를 쓸 때 자연스럽다.
      if (rawValue === '' || rawValue === '1' || rawValue === 'true') return true;
      if (rawValue === '0' || rawValue === 'false') return false;
      throw new Error(`${name} 은 true/false 여야 하는데 「${rawValue}」 가 왔습니다`);
    default:
      return rawValue;
  }
}

/**
 * 지금 주소에서 「무엇을 하라」를 읽는다.
 * @param search 안 주면 지금 페이지 주소를 쓴다 (시험할 땐 직접 넣는다).
 */
export function readInvocation(spec: ToolSpec, search?: string): Invocation | null {
  const params = new URLSearchParams(search ?? (typeof location === 'undefined' ? '' : location.search));
  const op = params.get('op');
  if (op === null) return null;

  const raw = params.get('out') === 'raw';
  const opSpec = spec.ops[op];
  if (opSpec === undefined) {
    const known = Object.keys(spec.ops).join(' · ');
    return { op, args: {}, raw, error: `이 도구에 「${op}」 는 없습니다. 있는 것: ${known}` };
  }

  const args: Record<string, ArgValue> = {};
  for (const [name, type] of Object.entries(opSpec.in)) {
    const value = params.get(name);
    if (value === null) {
      if (isOptional(type) === false) return { op, args, raw, error: `「${name}」 값이 빠졌습니다` };
      continue;
    }
    try {
      args[name] = coerce(name, type, value);
    } catch (e) {
      return { op, args, raw, error: (e as Error).message };
    }
  }
  return { op, args, raw };
}

/**
 * 반대로 — 지금 상태를 링크로 만든다.
 * `spec` 에 없는 칸을 넣으면 던진다. 조용히 빠뜨리면 받는 쪽에서 「값이 빠졌다」로 보여 원인을 못 찾는다.
 */
export function buildToolUrl(
  spec: ToolSpec,
  op: string,
  args: Record<string, ArgValue>,
  options: { base?: string; raw?: boolean } = {}
): string {
  const opSpec = spec.ops[op];
  if (opSpec === undefined) throw new Error(`「${op}」 는 ${spec.id} 에 없는 연산입니다`);

  const params = new URLSearchParams();
  params.set('op', op);
  for (const [name, value] of Object.entries(args)) {
    if (name in opSpec.in === false) throw new Error(`「${name}」 는 ${spec.id}.${op} 에 없는 칸입니다`);
    params.set(name, String(value));
  }
  if (options.raw === true) params.set('out', 'raw');

  const base = options.base ?? `/karmolab/t/${spec.id}/`;
  return `${base}?${params.toString()}`;
}
