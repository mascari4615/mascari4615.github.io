/**
 * JSON 에서 TypeScript 선언을 만든다 (TASK-KL-257 — 화면 안에 있던 알맹이를 밖으로)
 *
 * 이 로직은 원래 위젯 파일 안에 있었다. 화면 안에 있으면 **주소로도, 에이전트로도 못 부른다** —
 * 그게 `src/core/` 가 존재하는 이유다. 작업대로 옮기면서 알맹이를 여기로 내린다.
 *
 * 배열은 **모든 원소를 합쳐** 본다: 한쪽에만 있는 칸은 옵셔널(`?`)이 된다. 그래야 표본 한 줄만
 * 보고 만든 타입이 실제 자료에서 터지지 않는다.
 *
 * 일부러 안 하는 것: 유니온(`string | number`)은 `unknown` 으로 접는다 — 섞인 배열에서
 * 조합을 다 펼치면 사람이 못 읽는 타입이 나온다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'json2ts',
  ops: {
    types: {
      desc: 'Turn a JSON sample into TypeScript interface declarations. Arrays are merged, so fields missing in some elements become optional.',
      in: { text: 'string', name: 'string?' },
      out: 'string'
    }
  }
};

type Shape = { kind: string; fields?: Record<string, { shape: Shape; optional: boolean }>; of?: Shape };

function shapeOf(value: unknown): Shape {
  if (value === null) return { kind: 'null' };
  if (Array.isArray(value)) {
    if (!value.length) return { kind: 'array', of: { kind: 'unknown' } };
    return { kind: 'array', of: value.map(shapeOf).reduce(merge) };
  }
  if (typeof value === 'object') {
    const fields: Record<string, { shape: Shape; optional: boolean }> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      fields[key] = { shape: shapeOf(item), optional: false };
    }
    return { kind: 'object', fields };
  }
  return { kind: typeof value };
}

/** 두 모양을 합친다 — 한쪽에만 있는 칸은 옵셔널이 된다. */
function merge(a: Shape, b: Shape): Shape {
  if (a.kind === 'null') return b.kind === 'null' ? a : { ...b, kind: b.kind };
  if (b.kind === 'null') return a;
  if (a.kind !== b.kind) return { kind: 'unknown' };
  if (a.kind === 'array') return { kind: 'array', of: merge(a.of ?? { kind: 'unknown' }, b.of ?? { kind: 'unknown' }) };
  if (a.kind !== 'object') return a;
  const fields: Record<string, { shape: Shape; optional: boolean }> = {};
  const keys = new Set([...Object.keys(a.fields ?? {}), ...Object.keys(b.fields ?? {})]);
  for (const key of keys) {
    const left = a.fields?.[key];
    const right = b.fields?.[key];
    if (left && right) fields[key] = { shape: merge(left.shape, right.shape), optional: left.optional || right.optional };
    else fields[key] = { shape: (left ?? right)!.shape, optional: true };
  }
  return { kind: 'object', fields };
}

function safeKey(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

function render(shape: Shape, name: string, out: string[], seen: Set<string>): string {
  if (shape.kind === 'object') {
    let typeName = name;
    let n = 2;
    while (seen.has(typeName)) typeName = name + n++;
    seen.add(typeName);
    const lines: string[] = [`export interface ${typeName} {`];
    for (const [key, field] of Object.entries(shape.fields ?? {})) {
      const child = render(field.shape, key.charAt(0).toUpperCase() + key.slice(1).replace(/[^\w]/g, ''), out, seen);
      lines.push(`  ${safeKey(key)}${field.optional ? '?' : ''}: ${child};`);
    }
    lines.push('}');
    out.push(lines.join('\n'));
    return typeName;
  }
  if (shape.kind === 'array') return `${render(shape.of ?? { kind: 'unknown' }, name.replace(/s$/, '') || 'Item', out, seen)}[]`;
  if (shape.kind === 'null') return 'null';
  if (shape.kind === 'unknown') return 'unknown';
  return shape.kind;
}

/** 몇 개를 만들었는지까지 돌려준다 — 상태 줄이 「인터페이스 3개」라고 말할 수 있어야 한다. */
export function toTypes(json: string, name = 'Root'): { code: string; interfaces: number } {
  const data: unknown = JSON.parse(json);
  const safeName = (name || 'Root').replace(/[^\w]/g, '') || 'Root';
  const blocks: string[] = [];
  const top = render(shapeOf(data), safeName, blocks, new Set());
  const code =
    (blocks.length ? blocks.reverse().join('\n\n') : `export type ${safeName} = ${top};`) +
    (blocks.length && top !== safeName ? `\n\nexport type ${safeName} = ${top};` : '');
  return { code, interfaces: blocks.length || 1 };
}

export const run: ToolRunner = (op, args) => {
  if (op === 'types') return toTypes(String(args.text ?? ''), args.name === undefined ? undefined : String(args.name)).code;
  throw new Error('json2ts: 모르는 연산 ' + op);
};
