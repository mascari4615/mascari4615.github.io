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

/** `'boolean?'` → `'boolean'` 처럼 물음표를 뗀다. */
export function baseType(t: FieldType): 'string' | 'number' | 'boolean' {
  return t.endsWith('?') ? (t.slice(0, -1) as 'string' | 'number' | 'boolean') : (t as 'string' | 'number' | 'boolean');
}

export function isOptional(t: FieldType): boolean {
  return t.endsWith('?');
}
