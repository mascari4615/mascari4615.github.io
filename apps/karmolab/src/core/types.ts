/**
 * 알맹이가 자기를 설명하는 형식 (S1)
 *
 * 여기 적은 모양대로 각 `core/<id>.ts` 가 `spec` 을 내놓는다. 그 하나에서
 * 주소 파라미터·MCP 도구 설명·문서가 전부 파생된다 — 그래서 **손으로 두 번 적는 자리가 없다**.
 *
 * 타입 표기는 일부러 문자열 몇 개로 좁혔다. 스키마 라이브러리를 하나 들이면 그 무게가
 * 화면으로도 따라 나간다(번들 예산, KL-128). 우리가 필요한 건 「이 칸은 글자냐 숫자냐,
 * 없어도 되냐」 정도다.
 */

/** 값의 종류. 뒤에 `?` 를 붙이면 「없어도 된다」. */
export type FieldType =
  | 'string'
  | 'string?'
  | 'number'
  | 'number?'
  | 'boolean'
  | 'boolean?';

export interface OpSpec {
  /** 이 연산이 뭘 하는지 한 줄. MCP 도구 설명으로 그대로 나간다. */
  desc: string;
  /** 받는 값들. 열쇠 = 주소 파라미터 이름이 된다. */
  in: Record<string, FieldType>;
  /** 내놓는 값의 종류. */
  out: 'string' | 'number' | 'boolean';
}

export interface ToolSpec {
  /** 위젯 id 와 같아야 한다. 검사가 대조한다. */
  id: string;
  ops: Record<string, OpSpec>;
}

/**
 * 「이 도구를 이름으로 불러 달라」는 창구. 각 알맹이가 `spec` 과 짝으로 내놓는다.
 *
 * 왜 필요하냐: 주소 호출도 MCP 도 **연산 이름을 문자열로** 받는다(`op=encode`). 그때 어떤 함수를
 * 부를지 부르는 쪽이 알고 있으면, 알맹이가 바뀔 때마다 부르는 쪽 세 군데를 같이 고쳐야 한다 —
 * 그러다 하나를 빠뜨리면 조용히 안 되는 도구가 생긴다. 그래서 **알맹이가 자기 창구를 갖는다.**
 *
 * `deps` = 알맹이가 스스로 못 하는 것(예: 해시 계산기). 필요 없는 도구는 안 본다.
 */
export type ToolRunner = (
  op: string,
  args: Record<string, unknown>,
  deps?: Record<string, unknown>
) => string | number | boolean | Promise<string | number | boolean>;

/** `'boolean?'` → `'boolean'` 처럼 물음표를 뗀다. */
export function baseType(t: FieldType): 'string' | 'number' | 'boolean' {
  return t.endsWith('?') ? (t.slice(0, -1) as 'string' | 'number' | 'boolean') : (t as 'string' | 'number' | 'boolean');
}

export function isOptional(t: FieldType): boolean {
  return t.endsWith('?');
}
