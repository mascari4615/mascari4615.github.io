import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

import type { Character } from './types';

/**
 * 인격을 파일 하나에서 읽는다.
 *
 * 형식은 아주 얕게만 정했다 — 맨 위 `---` 블록의 `name:` 과 나머지 본문. 본문은 가공
 * 없이 그대로 두뇌에 넘어간다. 인격을 코드가 아니라 글로 고칠 수 있게 하려는 것이다.
 */
export function loadCharacter(path: string): Character {
  const raw = readFileSync(path, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  const body = (match ? raw.slice(match[0].length) : raw).trim();
  const nameLine = match ? /^name:\s*(.+)$/m.exec(match[1]) : null;
  const name = nameLine?.[1]?.trim() || basename(path, extname(path));
  return { name, instruction: body };
}
