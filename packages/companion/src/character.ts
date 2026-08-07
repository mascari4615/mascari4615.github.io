import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

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

/**
 * 한 폴더 안의 인격들을 전부 읽는다.
 *
 * 인격은 고정이 아니다 — 파일을 하나 더 넣으면 그만큼 후보가 는다. 누구로 있을지는
 * 코드가 아니라 폴더가 정한다.
 */
export function loadCharacters(folder: string): Character[] {
  if (existsSync(folder) === false) return [];
  return readdirSync(folder)
    .filter((f) => f.endsWith('.md'))
    .map((f) => loadCharacter(join(folder, f)))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}
